-- hdar v74d — FIRST : 5000 abonnements à vie, répartis par région au prorata de la population (INSEE, 1er janv. 2024,
-- Outre-mer = Guadeloupe + Martinique + Guyane + La Réunion + Mayotte). Plus de plafond par ville. Additif
-- (contrainte de rang élargie 1000 → 5000, ville toujours enregistrée sans plafond).
create table if not exists hdar.first_quotas (
  region text primary key,
  name text not null,
  quota int not null check (quota >= 0),
  pop_m numeric not null
);
alter table hdar.first_quotas enable row level security;
revoke all on hdar.first_quotas from anon, authenticated;
insert into hdar.first_quotas (region, name, quota, pop_m) values
  ('ile-de-france', 'Île-de-France', 908, 12.42),
  ('auvergne-rhone-alpes', 'Auvergne-Rhône-Alpes', 603, 8.24),
  ('nouvelle-aquitaine', 'Nouvelle-Aquitaine', 451, 6.16),
  ('occitanie', 'Occitanie', 451, 6.16),
  ('hauts-de-france', 'Hauts-de-France', 438, 5.99),
  ('grand-est', 'Grand Est', 407, 5.57),
  ('provence-alpes-cote-d-azur', 'Provence-Alpes-Côte d''Azur', 379, 5.18),
  ('pays-de-la-loire', 'Pays de la Loire', 288, 3.93),
  ('bretagne', 'Bretagne', 252, 3.45),
  ('normandie', 'Normandie', 243, 3.32),
  ('bourgogne-franche-comte', 'Bourgogne-Franche-Comté', 203, 2.78),
  ('centre-val-de-loire', 'Centre-Val de Loire', 188, 2.57),
  ('outre-mer', 'Outre-mer', 163, 2.23),
  ('corse', 'Corse', 26, 0.36)
on conflict (region) do update set name = excluded.name, quota = excluded.quota, pop_m = excluded.pop_m;

alter table hdar.founders add column if not exists region text;
create index if not exists founders_region_idx on hdar.founders (region);
alter table hdar.founders drop constraint if exists founders_rank_check;
alter table hdar.founders add constraint founders_rank_check check (rank between 1 and 5000);

create or replace function public.hdar_first_remaining() returns int
language sql stable security definer set search_path to '' as $$ select greatest(0, (select sum(quota) from hdar.first_quotas) - (select count(*) from hdar.founders))::int $$;

-- Ville enregistrée (badge optionnel), sans plafond.
create or replace function hdar.founder_city_trg() returns trigger language plpgsql security definer set search_path to '' as $$
declare c text;
begin
  select city into c from hdar.profiles where user_id = new.user_id;
  if hdar.city_key(c) is not null then new.city := left(btrim(split_part(c, ',', 1)), 60); new.city_key := hdar.city_key(c); end if;
  return new;
end $$;

-- Teaser public : abonnements à vie restants dans la région.
create or replace function public.hdar_first_region(p_region text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('region', q.region, 'name', q.name, 'quota', q.quota,
    'remaining', greatest(0, q.quota - (select count(*) from hdar.founders f where f.region = q.region))::int,
    'global', public.hdar_first_remaining())
  from hdar.first_quotas q where q.region = lower(btrim(coalesce(p_region, ''))) $$;
revoke all on function public.hdar_first_region(text) from public;
grant execute on function public.hdar_first_region(text) to anon, authenticated;

create or replace function public.hdar_first_redeem(p_code text, p_region text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int; r int; c text; q hdar.first_quotas; used int;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'first_redeem', 10, interval '1 hour');
  if upper(btrim(coalesce(p_code, ''))) <> 'FIRST' then raise exception 'Code invalide'; end if;
  select * into q from hdar.first_quotas where region = lower(btrim(coalesce(p_region, '')));
  if q.region is null then raise exception 'Région inconnue : active ta position ou choisis ta ville'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_first'));
  select rank into r from hdar.founders where user_id = s;
  if r is not null then raise exception 'Tu es déjà Membre FIRST (n° %)', r; end if;
  select count(*) into used from hdar.founders where region = q.region;
  if used >= q.quota then raise exception 'Plus d''abonnement à vie offert en % 😢 Partage le bon plan à tes potes d''ailleurs !', q.name; end if;
  select count(*) into n from hdar.founders;
  if n >= (select sum(quota) from hdar.first_quotas) then raise exception 'Les places FIRST sont toutes parties 😢'; end if;
  insert into hdar.founders (user_id, rank, region) values (s, n + 1, q.region) returning city into c;
  insert into hdar.premium as pm (user_id, until, status) values (s, '2999-12-31', 'founder')
    on conflict (user_id) do update set until = '2999-12-31', status = case when pm.stripe_subscription is null then 'founder' else pm.status end, updated_at = now();
  perform hdar.founder_refill(s);
  return jsonb_build_object('rank', n + 1, 'remaining', public.hdar_first_remaining(), 'city', c, 'region', q.name,
    'region_remaining', q.quota - used - 1,
    'title', 'Bienvenue dans hdar+ 🎉', 'body', 'Membre FIRST n° ' || (n + 1) || ' : hdar+ à vie, boosts et cœurs offerts.');
end $$;
revoke all on function public.hdar_first_redeem(text, text) from public, anon;
grant execute on function public.hdar_first_redeem(text, text) to authenticated;

-- Ancienne signature (et « J'ai un code ») : la région est requise.
create or replace function public.hdar_first_redeem(p_code text) returns jsonb
language sql security definer set search_path to '' as $$ select public.hdar_first_redeem(p_code, null::text) $$;

create or replace function public.hdar_first_me() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); f hdar.founders; pb timestamptz; ab timestamptz;
begin
  select * into f from hdar.founders where user_id = s;
  if f.user_id is null then return jsonb_build_object('founder', false, 'remaining', public.hdar_first_remaining()); end if;
  perform hdar.founder_refill(s);
  select max(at) into pb from hdar.founder_boosts where user_id = s and kind = 'profile';
  select max(at) into ab from hdar.founder_boosts where user_id = s and kind = 'ad';
  return jsonb_build_object('founder', true, 'rank', f.rank, 'city', f.city, 'region', (select name from hdar.first_quotas where region = f.region),
    'remaining', public.hdar_first_remaining(), 'profile_boost_at', pb + interval '24 hours', 'ad_boost_at', ab + interval '7 days');
end $$;

create or replace function public.hdar_admin_first_stats(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object('redeemed', (select count(*) from hdar.founders), 'total', (select sum(quota) from hdar.first_quotas),
    'remaining', public.hdar_first_remaining(),
    'today', (select count(*) from hdar.founders where at > now() - interval '24 hours'),
    'profile_boosts', (select count(*) from hdar.founder_boosts where kind = 'profile'),
    'ad_boosts', (select count(*) from hdar.founder_boosts where kind = 'ad'),
    'regions', (select jsonb_agg(jsonb_build_object('region', q.name, 'quota', q.quota,
        'used', (select count(*) from hdar.founders f where f.region = q.region)) order by q.quota desc) from hdar.first_quotas q));
end $$;
