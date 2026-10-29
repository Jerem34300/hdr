-- Rollback v104 (appliqué le 30/10) : définitions d'avant v104 (v63, v96, v8, v96). Les helpers et *_send2 de v104 restent (inutilisés).

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

CREATE OR REPLACE FUNCTION public.hdar_place_send_media(p_id uuid, p_kind text, p_path text, p_duration integer, p_lat double precision, p_lng double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          case when p_kind = 'image' then null else least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1))) end);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_spot_send(p_self text, p_id uuid, p_pseudo text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  b text := left(trim(coalesce(p_body, '')), 240);
begin
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  if b = '' then return; end if;
  if not exists (select 1 from hdar.spots where id = p_id and closes_at > now()) then
    raise exception 'Ce lieu est fermé';
  end if;
  if (select count(*) from hdar.spot_messages where from_id = s and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de messages, patiente un peu';
  end if;
  insert into hdar.spot_messages (spot_id, from_id, pseudo, body)
  values (p_id, s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'), b);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_spot_send_media(p_id uuid, p_pseudo text, p_kind text, p_path text, p_duration integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); p text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  if not exists (select 1 from hdar.spots where id = p_id and closes_at > now()) then raise exception 'Ce lieu est fermé'; end if;
  insert into hdar.spot_messages (spot_id, from_id, pseudo, body, kind, media, duration)
  values (p_id, s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'), '',
          p_kind, p, case when p_kind = 'image' then null else least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1))) end);
end $function$;

