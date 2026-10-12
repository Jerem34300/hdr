-- hdar v10 — modération de la photo principale + arrondi des coordonnées du profil
alter table hdar.profiles add column if not exists photo_status text
  check (photo_status in ('pending', 'approved'));
alter table hdar.profiles add column if not exists photo_changed_at timestamptz;
update hdar.profiles set photo_status = 'approved' where photo is not null and photo_status is null;

-- Toute nouvelle photo principale passe en attente ; l'album n'est pas modéré.
create or replace function hdar.photo_moderation_trg() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.photo is null then
    new.photo_status := null;
  elsif tg_op = 'INSERT' or new.photo is distinct from old.photo then
    new.photo_status := 'pending';
    new.photo_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_photo_moderation on hdar.profiles;
create trigger profiles_photo_moderation before insert or update of photo on hdar.profiles
  for each row execute function hdar.photo_moderation_trg();
revoke execute on function hdar.photo_moderation_trg() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hdar_profile_get(p_self text, p_id text)
 RETURNS TABLE(id text, pseudo text, age integer, bio text, tags text, desires text, photo text, online boolean, lat double precision, lng double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  o text := lower(left(coalesce(p_id, ''), 80));
begin
  if hdar.is_blocked(s, o) then return; end if;
  return query
    select p.user_id, p.pseudo, p.age, p.bio, p.tags, p.desires,
      case when p.user_id = s or p.photo_status = 'approved' then p.photo end,
      coalesce(p.visible_until > now(), false),
      case when p.visible_until > now() then hdar.round_coord(p.lat) end,
      case when p.visible_until > now() then hdar.round_coord(p.lng) end
    from hdar.profiles p where p.user_id = o;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_profile_extras(p_self text, p_id text)
 RETURNS TABLE(album jsonb, voice text, voice_sec integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  o text := lower(left(coalesce(p_id, ''), 80));
begin
  if hdar.is_blocked(s, o) then return; end if;
  return query select
    case when p.user_id <> s and coalesce(p.photo_status, '') <> 'approved' and p.photo is not null
              and jsonb_typeof(p.album) = 'array' and p.album ->> 0 = p.photo
         then p.album - 0 else p.album end,
    p.voice, p.voice_sec from hdar.profiles p where p.user_id = o;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_area_feed(p_self text, p_lat double precision, p_lng double precision)
 RETURNS TABLE(id uuid, from_id text, pseudo text, body text, at text, mine boolean, lat double precision, lng double precision, photo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  if p_lat is null or p_lng is null then return; end if;
  return query
    select m.id, m.from_id, m.pseudo, m.body, m.created_at::text, m.from_id = s, hdar.round_coord(m.lat), hdar.round_coord(m.lng),
      exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved')
    from (
      select * from hdar.area_messages a
      where a.created_at > now() - interval '24 hours'
        and not a.removed
        and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045
        and not hdar.is_blocked(s, a.from_id)
      order by a.created_at desc
      limit 150
    ) m
    order by m.created_at asc;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_favorites(p_self text)
 RETURNS TABLE(id text, pseudo text, live boolean, photo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return query
    select f.fav_id, coalesce(p.pseudo, 'Anonyme'),
      coalesce(p.visible_until > now() and p.lat is not null, false),
      (p.photo is not null and p.photo_status = 'approved')
    from hdar.favorites f
    left join hdar.profiles p on p.user_id = f.fav_id
    where f.user_id = s and not hdar.is_blocked(s, f.fav_id)
    order by f.created_at desc;
end $function$;

create or replace function public.hdar_admin_photos(p_key text)
returns table (id text, pseudo text, photo text, at text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return query
    select p.user_id, p.pseudo, p.photo, coalesce(p.photo_changed_at, p.profile_at)::text
    from hdar.profiles p
    where p.photo is not null and p.photo_status = 'pending'
    order by p.photo_changed_at nulls first
    limit 100;
end $$;

create or replace function public.hdar_admin_photo_review(p_key text, p_id text, p_ok boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare o text := lower(left(coalesce(p_id, ''), 80));
begin
  perform hdar.admin_check(p_key);
  if p_ok then
    update hdar.profiles set photo_status = 'approved' where user_id = o and photo is not null;
  else
    update hdar.profiles
      set album = case when jsonb_typeof(album) = 'array' and album ->> 0 = photo then album - 0 else album end,
          photo = null
      where user_id = o;
  end if;
end $$;

revoke execute on function public.hdar_admin_photos(text), public.hdar_admin_photo_review(text, text, boolean) from public, anon;
grant execute on function public.hdar_admin_photos(text), public.hdar_admin_photo_review(text, text, boolean) to authenticated;
