-- v123 : étapes de la nouvelle entrée (anti-robot intégré au bouton Entrer) + comparaison avant/après.
-- Compteurs horaires sans identifiant (aucune donnée personnelle).

create or replace function public.hdar_gate(p_kind text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if p_kind in ('gate_view', 'gate_check', 'gate_click', 'gate_verified', 'gate_enter', 'gate_error', 'gate_captcha_fail') then
    insert into hdar.gate_hourly as g (hour, kind, n) values (date_trunc('hour', now()), p_kind, 1)
    on conflict (hour, kind) do update set n = g.n + 1;
  end if;
end $$;

-- Avant / après la nouvelle entrée (repère : 01/11 10:00 heure de Paris, entrée corrigée en ligne depuis 09:39) sur des durées égales,
-- + nombre de profils en position choisie (simple total).
create or replace function public.hdar_admin_gate_compare(p_key text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare cut timestamptz := '2026-11-01 09:00:00+00'; span interval;
begin
  perform hdar.admin_check(p_key);
  span := least(now() - cut, interval '30 days');
  return jsonb_build_object(
    'cutoff', cut,
    'span_h', round(extract(epoch from span) / 3600),
    'before', coalesce((select jsonb_object_agg(kind, n) from (select h.kind, sum(h.n) n from hdar.gate_hourly h where h.hour >= cut - span and h.hour < cut group by 1) q), '{}'::jsonb),
    'after', coalesce((select jsonb_object_agg(kind, n) from (select h.kind, sum(h.n) n from hdar.gate_hourly h where h.hour >= cut group by 1) q), '{}'::jsonb),
    'chosen', (select count(*) from hdar.pos_meta where chosen));
end $$;
revoke execute on function public.hdar_admin_gate_compare(text) from public;
grant execute on function public.hdar_admin_gate_compare(text) to anon, authenticated;
