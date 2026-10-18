-- v63 : pouvoirs de modération dans l'appli pour les comptes admin (hdar.admins) — écrire dans
-- n'importe quel chat de lieu sans limite de distance, retirer n'importe quel message (salons,
-- quartier, lieux) — et médias visibles dans l'admin, même retirés.
-- Applied as migration hdar_v63_admin_moderation.

create or replace function public.hdar_am_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(hdar.is_admin_user(hdar.self_id()), false);
$$;

create or replace function public.hdar_area_hide(p_self text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  update hdar.area_messages set removed = true where id = p_id and (from_id = s or hdar.is_admin_user(s));
end $$;

create or replace function public.hdar_place_hide(p_msg uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  update hdar.place_messages set removed = true where id = p_msg and (from_id = s or hdar.is_admin_user(s));
end $$;

create or replace function public.hdar_salon_hide(p_msg uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  update hdar.salon_messages m set removed = true
  where m.id = p_msg and (m.from_id = s or hdar.is_admin_user(s)
    or exists (select 1 from hdar.salons x where x.id = m.salon_id and x.creator_id = s));
end $$;

create or replace function public.hdar_place_send(p_id uuid, p_body text, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); b text := left(btrim(coalesce(p_body, '')), 240); pl hdar.places; ps text;
begin
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  if b = '' then return; end if;
  select * into pl from hdar.places p where p.id = p_id and p.status = 'approved'
    and (not p.partner or coalesce(p.partner_until > now(), false));
  if pl.id is null then raise exception 'Lieu introuvable'; end if;
  if not hdar.is_admin_user(s) then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Active ta position pour écrire ici';
    end if;
    if hdar.km(p_lat, p_lng, pl.lat, pl.lng) > 2 then
      raise exception 'Tu dois être à moins de 2 km du lieu pour écrire';
    end if;
  end if;
  select coalesce(nullif(btrim(p.pseudo), ''), 'Anonyme') into ps from hdar.profiles p where p.user_id = s;
  insert into hdar.place_messages (place_id, from_id, pseudo, body) values (p_id, s, coalesce(ps, 'Anonyme'), b);
end $$;

create or replace function public.hdar_place_send_media(p_id uuid, p_kind text, p_path text, p_duration integer, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); pl hdar.places; ps text; p text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  select * into pl from hdar.places x where x.id = p_id and x.status = 'approved'
    and (not x.partner or coalesce(x.partner_until > now(), false));
  if pl.id is null then raise exception 'Lieu introuvable'; end if;
  if not hdar.is_admin_user(s) and (p_lat is null or p_lng is null or hdar.km(p_lat, p_lng, pl.lat, pl.lng) > 2) then
    raise exception 'Tu dois être à moins de 2 km du lieu pour écrire';
  end if;
  select coalesce(nullif(btrim(x.pseudo), ''), 'Anonyme') into ps from hdar.profiles x where x.user_id = s;
  insert into hdar.place_messages (place_id, from_id, pseudo, body, kind, media, duration)
  values (p_id, s, coalesce(ps, 'Anonyme'), '', p_kind, p,
          case when p_kind = 'image' then null else least(60, greatest(1, coalesce(p_duration, 1))) end);
end $$;

-- Média d'un message pour l'admin, même retiré.
create or replace function public.hdar_admin_media(p_key text, p_scope text, p_id uuid)
returns table(id uuid, kind text, media text, duration integer, removed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  if p_scope = 'area' then
    return query select a.id, a.kind, a.media, a.duration, a.removed from hdar.area_messages a where a.id = p_id and a.media is not null;
  elsif p_scope = 'place' then
    return query select a.id, a.kind, a.media, a.duration, a.removed from hdar.place_messages a where a.id = p_id and a.media is not null;
  elsif p_scope = 'spot' then
    return query select a.id, a.kind, a.media, a.duration, a.removed from hdar.spot_messages a where a.id = p_id and a.media is not null;
  elsif p_scope = 'salon' then
    return query select a.id, a.kind, a.media, a.duration, a.removed from hdar.salon_messages a where a.id = p_id and a.media is not null;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['hdar_am_admin()', 'hdar_area_hide(text, uuid)', 'hdar_place_hide(uuid)', 'hdar_salon_hide(uuid)',
    'hdar_place_send(uuid, text, double precision, double precision)',
    'hdar_place_send_media(uuid, text, text, integer, double precision, double precision)',
    'hdar_admin_media(text, text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
