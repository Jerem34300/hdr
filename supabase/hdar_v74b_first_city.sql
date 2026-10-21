-- hdar v74b — Places fondateur par ville (en plus des 1000) : 50 par ville. Additif.
-- La ville vient de profiles.city (approximative, serveur). Au-delà de 50, on reste fondateur (global) sans badge de ville.
alter table hdar.founders add column if not exists city text, add column if not exists city_key text;
create index if not exists founders_city_idx on hdar.founders (city_key);

create or replace function hdar.city_key(c text) returns text language sql immutable set search_path to '' as $$
  select nullif(regexp_replace(lower(translate(btrim(split_part(coalesce(c, ''), ',', 1)),
    'ÀÂÄÁÃÉÈÊËÎÏÍÌÔÖÓÒÕÛÜÚÙÇàâäáãéèêëîïíìôöóòõûüúùç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', '-', 'g'), '') $$;

-- Teaser public (avant profil) : places fondateur restantes et membres dans la ville. Comptes seulement.
create or replace function public.hdar_first_city(p_city text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select case when hdar.city_key(p_city) is null then null else jsonb_build_object(
    'city', left(btrim(split_part(p_city, ',', 1)), 60),
    'remaining', greatest(0, 50 - (select count(*) from hdar.founders where city_key = hdar.city_key(p_city)))::int,
    'members', (select count(*) from hdar.profiles where hdar.city_key(city) = hdar.city_key(p_city))::int,
    'global', public.hdar_first_remaining()) end $$;
revoke all on function public.hdar_first_city(text) from public;
grant execute on function public.hdar_first_city(text) to anon, authenticated;
revoke all on function hdar.city_key(text) from public, anon, authenticated;

-- Après chaque inscription FIRST : enregistre la ville (si encore < 50 fondateurs dans cette ville).
create or replace function hdar.founder_city_trg() returns trigger language plpgsql security definer set search_path to '' as $$
declare c text; k text;
begin
  select city into c from hdar.profiles where user_id = new.user_id;
  k := hdar.city_key(c);
  if k is not null then
    perform pg_advisory_xact_lock(hashtext('hdar_first_city:' || k));
    if (select count(*) from hdar.founders where city_key = k) < 50 then
      new.city := left(btrim(split_part(c, ',', 1)), 60); new.city_key := k;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists founder_city on hdar.founders;
create trigger founder_city before insert on hdar.founders for each row execute function hdar.founder_city_trg();
revoke all on function hdar.founder_city_trg() from public, anon, authenticated;

-- hdar_first_me / redeem renvoient aussi la ville.
create or replace function public.hdar_first_me() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); f hdar.founders; pb timestamptz; ab timestamptz;
begin
  select * into f from hdar.founders where user_id = s;
  if f.user_id is null then return jsonb_build_object('founder', false, 'remaining', public.hdar_first_remaining()); end if;
  perform hdar.founder_refill(s);
  select max(at) into pb from hdar.founder_boosts where user_id = s and kind = 'profile';
  select max(at) into ab from hdar.founder_boosts where user_id = s and kind = 'ad';
  return jsonb_build_object('founder', true, 'rank', f.rank, 'city', f.city, 'remaining', public.hdar_first_remaining(),
    'profile_boost_at', pb + interval '24 hours', 'ad_boost_at', ab + interval '7 days');
end $$;

create or replace function public.hdar_first_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int; r int; c text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'first_redeem', 10, interval '1 hour');
  if upper(btrim(coalesce(p_code, ''))) <> 'FIRST' then raise exception 'Code invalide'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_first'));
  select rank into r from hdar.founders where user_id = s;
  if r is not null then raise exception 'Tu es déjà membre fondateur (n° %)', r; end if;
  select count(*) into n from hdar.founders;
  if n >= 1000 then raise exception 'Les 1000 places fondateur sont parties 😢'; end if;
  insert into hdar.founders (user_id, rank) values (s, n + 1) returning city into c;
  insert into hdar.premium as pm (user_id, until, status) values (s, '2999-12-31', 'founder')
    on conflict (user_id) do update set until = '2999-12-31', status = case when pm.stripe_subscription is null then 'founder' else pm.status end, updated_at = now();
  perform hdar.founder_refill(s);
  return jsonb_build_object('rank', n + 1, 'remaining', 1000 - n - 1, 'city', c,
    'title', 'Bienvenue dans hdar+ 🎉', 'body', 'Membre fondateur n° ' || (n + 1) || coalesce(' · ' || c, '') || ' : hdar+ à vie, boosts et cœurs offerts.');
end $$;
