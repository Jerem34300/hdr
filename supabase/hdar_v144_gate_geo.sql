-- v144 : arrivées à l'écran 18+ par pays et langue (agrégats horaires uniquement).
-- Aucune IP, aucun identifiant, aucune position : uniquement un code pays ISO-2
-- (en-tête Netlify / équivalent, lu côté serveur) et une langue de navigateur sur 2 lettres.
-- La table hdar.gate_hourly (totaux déjà en place) continue d'être alimentée.

create table if not exists hdar.gate_geo_hourly (
  hour timestamptz not null,
  kind text not null,
  country text not null,
  lang text not null,
  n int not null default 0,
  primary key (hour, kind, country, lang)
);
alter table hdar.gate_geo_hourly enable row level security;
revoke all on hdar.gate_geo_hourly from public, anon, authenticated;

-- Même signature qu'avant (p_country et p_lang facultatifs) : les anciens appels ne cassent pas.
drop function if exists public.hdar_gate(text);
create or replace function public.hdar_gate(p_kind text, p_country text default null, p_lang text default null)
returns void language plpgsql security definer set search_path to '' as $$
declare
  k text := p_kind;
  cc text := upper(coalesce(nullif(trim(p_country), ''), 'ZZ'));
  lg text := lower(coalesce(nullif(trim(p_lang), ''), 'zz'));
begin
  if k not in ('gate_view', 'gate_check', 'gate_click', 'gate_verified', 'gate_enter', 'gate_error', 'gate_captcha_fail') then
    return;
  end if;
  if cc !~ '^[A-Z]{2}$' then cc := 'ZZ'; end if;
  if lg !~ '^[a-z]{2}$' then lg := 'zz'; end if;

  insert into hdar.gate_hourly as g (hour, kind, n)
  values (date_trunc('hour', now()), k, 1)
  on conflict (hour, kind) do update set n = g.n + 1;

  insert into hdar.gate_geo_hourly as x (hour, kind, country, lang, n)
  values (date_trunc('hour', now()), k, cc, lg, 1)
  on conflict (hour, kind, country, lang) do update set n = x.n + 1;
end $$;
revoke all on function public.hdar_gate(text, text, text) from public;
grant execute on function public.hdar_gate(text, text, text) to anon, authenticated;

-- Agrégats pour l'admin (même clé que les autres vues admin). Jamais de ligne individuelle.
create or replace function public.hdar_admin_gate_geo(p_key text, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 400);
  since timestamptz := now() - make_interval(days => d);
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'days', d,
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('k', country, 'n', n) order by n desc)
      from (
        select country, sum(n)::int as n
        from hdar.gate_geo_hourly
        where hour > since and kind = 'gate_view'
        group by country
        order by 2 desc
        limit 40
      ) q
    ), '[]'::jsonb),
    'langs', coalesce((
      select jsonb_agg(jsonb_build_object('k', lang, 'n', n) order by n desc)
      from (
        select lang, sum(n)::int as n
        from hdar.gate_geo_hourly
        where hour > since and kind = 'gate_view'
        group by lang
        order by 2 desc
        limit 20
      ) q
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.hdar_admin_gate_geo(text, int) from public;
grant execute on function public.hdar_admin_gate_geo(text, int) to anon, authenticated;

-- Même rétention que gate_hourly (400 jours), dans la purge déjà planifiée.
create or replace function hdar.salons_purge() returns void
language sql security definer set search_path = '' as $$
  delete from hdar.salon_messages where created_at < now() - interval '24 hours';
  update hdar.salons set removed = true where not official and not removed and last_at < now() - interval '48 hours';
  delete from hdar.device_steps where last_at < now() - interval '400 days';
  delete from hdar.gate_hourly where hour < now() - interval '400 days';
  delete from hdar.gate_geo_hourly where hour < now() - interval '400 days';
$$;
revoke execute on function hdar.salons_purge() from public, anon, authenticated;
