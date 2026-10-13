-- v36 — Live : âge obligatoire ; ids des personnes dans le Live (pastille sur la carte) ; région générale (cache).
create or replace function hdar.live_require(s text) returns void
language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.require_profile(s);
  if not exists (select 1 from hdar.profiles where user_id = s and photo_status = 'approved' and photo is not null) then
    raise exception 'live_photo: le Live est réservé aux profils avec une photo validée';
  end if;
  if not exists (select 1 from hdar.profiles where user_id = s and age between 18 and 99) then
    raise exception 'live_age: indique ton âge dans ton profil pour entrer dans le Live';
  end if;
  if not exists (select 1 from hdar.live_terms where user_id = s and version >= 1) then
    raise exception 'live_terms: accepte les règles du Live';
  end if;
end $$;

create or replace function public.hdar_live_ids() returns text[]
language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(user_id), '{}') from hdar.live_queue where seen_at > now() - interval '15 seconds';
$$;
revoke all on function public.hdar_live_ids() from public;
grant execute on function public.hdar_live_ids() to anon, authenticated;

-- Région générale (« Hérault, France ») : cache par case de 0,1°. Jamais de coordonnées vers le client.
create table if not exists hdar.geo_cache (k text primary key, label text, at timestamptz not null default now());
alter table hdar.geo_cache enable row level security;
revoke all on hdar.geo_cache from public, anon, authenticated;

create or replace function public.hdar_region_key(p_id text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select case when p.lat is null then null else jsonb_build_object(
    'k', round(p.lat::numeric, 1) || ',' || round(p.lng::numeric, 1),
    'lat', round(p.lat::numeric, 1), 'lng', round(p.lng::numeric, 1),
    'label', (select label from hdar.geo_cache g where g.k = round(p.lat::numeric, 1) || ',' || round(p.lng::numeric, 1))) end
  from hdar.profiles p where p.user_id = lower(p_id);
$$;
revoke all on function public.hdar_region_key(text) from public, anon, authenticated;
grant execute on function public.hdar_region_key(text) to service_role;

create or replace function public.hdar_region_store(p_k text, p_label text) returns void
language sql security definer set search_path to '' as $$
  insert into hdar.geo_cache (k, label) values (p_k, left(p_label, 80)) on conflict (k) do update set label = excluded.label, at = now();
$$;
revoke all on function public.hdar_region_store(text, text) from public, anon, authenticated;
grant execute on function public.hdar_region_store(text, text) to service_role;
