-- v104 : règle de distance pour écrire dans les chats de lieux, appliquée côté serveur pour tout le monde.
--   gares / métro / arrêts (kind station, metro, bus) : 300 m · aéroports : 1 km · autres lieux : 1 km
--   lieux éphémères (spots) : 1 km (le créateur du spot peut toujours écrire)
--   Il faut un profil (require_profile) et une position. Plus de passe-droit de distance pour les admins
--   (la modération, c'est supprimer : inchangé). Chat du quartier (3 km de lecture, message posé à ta position),
--   salons à bord, généraux, pays, régions : inchangés.
create or replace function hdar.place_write_km(p_kind text) returns double precision
language sql immutable set search_path to '' as $$
  select case when p_kind in ('station', 'metro', 'bus', 'tram') then 0.3 else 1.0 end
$$;
create or replace function hdar.place_write_check(p_kind text, p_plat double precision, p_plng double precision, p_lat double precision, p_lng double precision)
returns void language plpgsql stable set search_path to '' as $$
declare lim double precision := hdar.place_write_km(p_kind);
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Active ta position pour écrire ici';
  end if;
  if hdar.km(p_lat, p_lng, p_plat, p_plng) > lim then
    raise exception '%', case when lim < 1 then 'Tu dois être à moins de ' || round(lim * 1000)::int || ' m du lieu pour écrire'
                              else 'Tu dois être à moins de ' || lim::int || ' km du lieu pour écrire' end;
  end if;
end $$;
revoke all on function hdar.place_write_check(text, double precision, double precision, double precision, double precision) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hdar_place_send(p_id uuid, p_body text, p_lat double precision, p_lng double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); b text := left(btrim(coalesce(p_body, '')), 240); pl hdar.places; ps text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  if b = '' then return; end if;
  select * into pl from hdar.places p where p.id = p_id and p.status = 'approved'
    and (not p.partner or coalesce(p.partner_until > now(), false));
  if pl.id is null then raise exception 'Lieu introuvable'; end if;
  perform hdar.place_write_check(pl.kind, pl.lat, pl.lng, p_lat, p_lng);
  select coalesce(nullif(btrim(p.pseudo), ''), 'Anonyme') into ps from hdar.profiles p where p.user_id = s;
  insert into hdar.place_messages (place_id, from_id, pseudo, body) values (p_id, s, coalesce(ps, 'Anonyme'), b);
end $function$;

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
  perform hdar.place_write_check(pl.kind, pl.lat, pl.lng, p_lat, p_lng);
  select coalesce(nullif(btrim(x.pseudo), ''), 'Anonyme') into ps from hdar.profiles x where x.user_id = s;
  insert into hdar.place_messages (place_id, from_id, pseudo, body, kind, media, duration)
  values (p_id, s, coalesce(ps, 'Anonyme'), '', p_kind, p,
          case when p_kind = 'image' then null else least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1))) end);
end $function$;

-- Spots : nouvelles fonctions avec position ; les anciennes refusent (appli à recharger).
create or replace function public.hdar_spot_send2(p_id uuid, p_pseudo text, p_body text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); b text := left(trim(coalesce(p_body, '')), 240); sp hdar.spots;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  if b = '' then return; end if;
  select * into sp from hdar.spots x where x.id = p_id and x.closes_at > now();
  if sp.id is null then raise exception 'Ce lieu est fermé'; end if;
  if sp.creator_id is distinct from s then perform hdar.place_write_check('spot', sp.lat, sp.lng, p_lat, p_lng); end if;
  insert into hdar.spot_messages (spot_id, from_id, pseudo, body)
  values (p_id, s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'), b);
end $$;
create or replace function public.hdar_spot_send_media2(p_id uuid, p_pseudo text, p_kind text, p_path text, p_duration integer, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p text; sp hdar.spots;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  select * into sp from hdar.spots x where x.id = p_id and x.closes_at > now();
  if sp.id is null then raise exception 'Ce lieu est fermé'; end if;
  if sp.creator_id is distinct from s then perform hdar.place_write_check('spot', sp.lat, sp.lng, p_lat, p_lng); end if;
  insert into hdar.spot_messages (spot_id, from_id, pseudo, body, kind, media, duration)
  values (p_id, s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'), '',
          p_kind, p, case when p_kind = 'image' then null else least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1))) end);
end $$;
create or replace function public.hdar_spot_send(p_self text, p_id uuid, p_pseudo text, p_body text)
returns void language plpgsql security definer set search_path to '' as $$
begin raise exception 'Recharge hdar pour écrire ici (mise à jour)'; end $$;
create or replace function public.hdar_spot_send_media(p_id uuid, p_pseudo text, p_kind text, p_path text, p_duration integer)
returns void language plpgsql security definer set search_path to '' as $$
begin raise exception 'Recharge hdar pour écrire ici (mise à jour)'; end $$;
grant execute on function public.hdar_spot_send2(uuid, text, text, double precision, double precision) to authenticated;
grant execute on function public.hdar_spot_send_media2(uuid, text, text, text, integer, double precision, double precision) to authenticated;
