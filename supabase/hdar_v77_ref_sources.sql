-- hdar v77 — Provenance des liens partenaires (?ref=xxx) : visites agrégées par jour et par ref,
-- profils créés par ref, onglet admin « Provenance ». Additif.
-- RGPD : aucune IP, aucun appareil dans les visites (simple compteur jour × ref) ; le lien profil → ref
-- est supprimé avec le profil (on delete cascade).

create table if not exists hdar.ref_daily (
  day date not null, -- jour à Paris
  ref text not null check (ref ~ '^[a-z0-9_-]{1,32}$'),
  visits int not null default 0,
  primary key (day, ref)
);
alter table hdar.ref_daily enable row level security;
revoke all on hdar.ref_daily from anon, authenticated;

create table if not exists hdar.profile_refs (
  user_id text primary key references hdar.profiles (user_id) on delete cascade,
  ref text not null check (ref ~ '^[a-z0-9_-]{1,32}$'),
  at timestamptz not null default now()
);
create index if not exists profile_refs_ref_idx on hdar.profile_refs (ref, at);
alter table hdar.profile_refs enable row level security;
revoke all on hdar.profile_refs from anon, authenticated;

-- Une visite (le navigateur n'appelle qu'une fois par jour et par ref). Aucune donnée personnelle.
create or replace function public.hdar_ref_visit(p_ref text) returns void
language plpgsql security definer set search_path to '' as $$
declare r text := lower(left(trim(coalesce(p_ref, '')), 32)); u uuid := auth.uid(); today date := (now() at time zone 'Europe/Paris')::date;
begin
  if r !~ '^[a-z0-9_-]{1,32}$' then return; end if;
  -- Anti-gonflage : 30 appels / heure par session, et pas plus de 200 refs nouvelles par jour.
  if u is not null then perform hdar.rate_check('refv:' || u::text, 'ref_visit', 30, interval '1 hour'); end if;
  if not exists (select 1 from hdar.ref_daily where day = today and ref = r)
     and (select count(*) from hdar.ref_daily where day = today) >= 200 then return; end if;
  insert into hdar.ref_daily as d (day, ref, visits) values (today, r, 1)
  on conflict (day, ref) do update set visits = d.visits + 1;
end $$;
revoke all on function public.hdar_ref_visit(text) from public, anon;
grant execute on function public.hdar_ref_visit(text) to authenticated;

-- Rattache la ref au profil créé (une seule fois, première ref gagnante).
create or replace function public.hdar_ref_profile(p_ref text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r text := lower(left(trim(coalesce(p_ref, '')), 32)); n int;
begin
  if r !~ '^[a-z0-9_-]{1,32}$' then return false; end if;
  if not exists (select 1 from hdar.profiles p where p.user_id = s and p.profile_at is not null and p.auth_user_id = auth.uid()) then
    raise exception 'Profil pas encore créé';
  end if;
  insert into hdar.profile_refs (user_id, ref) values (s, r) on conflict (user_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.hdar_ref_profile(text) from public, anon;
grant execute on function public.hdar_ref_profile(text) to authenticated;

-- Admin « Provenance » : visites, profils créés, conversion par ref, par jour et au total.
create or replace function public.hdar_admin_refs(p_key text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 400); since date := (now() at time zone 'Europe/Paris')::date - (d - 1);
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'days', d,
    'total', coalesce((select jsonb_agg(t order by t.visits desc, t.ref) from (
        select coalesce(v.ref, p.ref) ref, coalesce(v.n, 0) visits, coalesce(p.n, 0) profiles,
               case when coalesce(v.n, 0) > 0 then round(100.0 * coalesce(p.n, 0) / v.n, 1) end conv
        from (select ref, sum(visits)::int n from hdar.ref_daily where day >= since group by ref) v
        full join (select ref, count(*)::int n from hdar.profile_refs where (at at time zone 'Europe/Paris')::date >= since group by ref) p on p.ref = v.ref) t), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(t order by t.day desc, t.visits desc) from (
        select coalesce(v.day, p.day) as day, coalesce(v.ref, p.ref) ref, coalesce(v.n, 0) visits, coalesce(p.n, 0) profiles,
               case when coalesce(v.n, 0) > 0 then round(100.0 * coalesce(p.n, 0) / v.n, 1) end conv
        from (select day, ref, visits n from hdar.ref_daily where day >= since) v
        full join (select (at at time zone 'Europe/Paris')::date as day, ref, count(*)::int n from hdar.profile_refs
                   where (at at time zone 'Europe/Paris')::date >= since group by 1, 2) p on p.ref = v.ref and p.day = v.day) t), '[]'::jsonb));
end $$;
revoke all on function public.hdar_admin_refs(text, int) from public, anon;
grant execute on function public.hdar_admin_refs(text, int) to authenticated;
