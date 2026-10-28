-- hdar v96 — Vidéos : annonces (60 s), profil (60 s), pages de lieux (60 s), tous les chats
-- (salons, quartier, chats de lieux, DM : 3 min, avec le son).
-- Les vidéos sont compressées dans le navigateur (≈720p, ≈1,2 Mbit/s) puis stockées dans hdar-media
-- (<auth.uid>/<fichier>), jamais en data: inline. Vignette (poster) = même chemin + « .jpg ».
-- Contrôles serveur : type MIME réel du fichier stocké, poids (40 Mo chat, 16 Mo annonce/profil),
-- durée plafonnée (180 s chat, 60 s annonce/profil). Le bucket garde sa limite de 50 Mo par fichier.

-- 1) Fichier possédé + poids maximum (vidéo).
create or replace function hdar.own_media(p_path text, p_kind text)
 returns text language plpgsql stable security definer set search_path to '' as $function$
declare u uuid := auth.uid(); m text; sz bigint;
begin
  if u is null or p_path is null or p_path !~ ('^' || u::text || '/[A-Za-z0-9._-]{8,80}$') then
    raise exception 'Fichier invalide';
  end if;
  select o.metadata->>'mimetype', nullif(o.metadata->>'size', '')::bigint into m, sz
  from storage.objects o where o.bucket_id = 'hdar-media' and o.name = p_path;
  if m is null then raise exception 'Fichier introuvable'; end if;
  if (p_kind = 'image' and m not like 'image/%') or (p_kind = 'video' and m not like 'video/%')
     or (p_kind = 'audio' and m not like 'audio/%') or p_kind not in ('image','video','audio') then
    raise exception 'Type de fichier invalide';
  end if;
  if p_kind = 'video' and coalesce(sz, 0) > 40 * 1024 * 1024 then raise exception 'Vidéo trop lourde'; end if;
  return p_path;
end $function$;

-- Vidéo courte (annonce / profil) : 16 Mo max.
create or replace function hdar.own_short_video(p_path text) returns text
language plpgsql stable security definer set search_path to '' as $$
declare p text := hdar.own_media(p_path, 'video'); sz bigint;
begin
  select nullif(o.metadata->>'size', '')::bigint into sz from storage.objects o where o.bucket_id = 'hdar-media' and o.name = p;
  if coalesce(sz, 0) > 16 * 1024 * 1024 then raise exception 'Vidéo trop lourde (60 s max)'; end if;
  return p;
end $$;

-- 2) Annonces : jusqu'à 2 vidéos de 60 s.
alter table hdar.ads add column if not exists videos text[] not null default '{}',
  add column if not exists video_secs int[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_videos_max') then
    alter table hdar.ads add constraint ads_videos_max check (cardinality(videos) <= 2);
  end if;
end $$;

create or replace function hdar.ad_json(a hdar.ads, s text, p_city text, p_region text)
 returns jsonb language sql stable set search_path to '' as $function$
  select jsonb_build_object('id', a.id, 'user_id', a.user_id, 'pseudo', a.pseudo, 'title', a.title, 'body', a.body,
    'category', a.category, 'region', a.region, 'city', a.city, 'city_slug', a.city_slug, 'photos', to_jsonb(a.photos),
    'videos', to_jsonb(a.videos), 'video_secs', to_jsonb(a.video_secs),
    'created_at', a.created_at, 'expires_at', a.expires_at, 'mine', a.user_id = s, 'premium', a.premium,
    'lat', a.lat, 'lng', a.lng, 'tags', to_jsonb(a.tags),
    'boost_scope', case when a.boost_until > now() then a.boost_scope end,
    'boost_until', case when a.boost_until > now() then a.boost_until end)
$function$;

drop function if exists public.hdar_ad_create(text, text, text, text, text, text, integer, text[], double precision, double precision, text[]);
create or replace function public.hdar_ad_create(p_title text, p_body text, p_category text, p_region text, p_city text,
  p_city_slug text, p_hours integer, p_photos text[], p_lat double precision default null, p_lng double precision default null,
  p_tags text[] default null, p_videos text[] default null, p_video_secs int[] default null)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare s text := hdar.self_id(); ps text; ph text[] := '{}'; vi text[] := '{}'; vs int[] := '{}'; x text; i int; nid uuid; prem boolean;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'ad', 6, interval '1 hour');
  prem := hdar.is_premium(s);
  if p_hours not in (24, 72, 168) and not (prem and p_hours in (336, 720)) then
    raise exception '%', case when p_hours in (336, 720) then 'premium_required: 14 et 30 jours sont réservés à hdar+' else 'Durée invalide' end;
  end if;
  if (select count(*) from hdar.ads where user_id = s and expires_at > now()) >= hdar.ad_limit(s) then
    raise exception '%', case when prem then 'Tu as déjà 10 annonces en ligne : supprimes-en une d''abord'
      else 'Tu as déjà 3 annonces en ligne : supprimes-en une, ou passe à hdar+ pour en avoir 10' end;
  end if;
  if coalesce(cardinality(p_photos), 0) > 3 then raise exception '3 photos maximum'; end if;
  if coalesce(cardinality(p_videos), 0) > 2 then raise exception '2 vidéos maximum'; end if;
  if coalesce(cardinality(p_tags), 0) > 5 then raise exception '5 tags maximum'; end if;
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Position invalide';
  end if;
  foreach x in array coalesce(p_photos, '{}') loop ph := ph || hdar.own_media(x, 'image'); end loop;
  for i in 1 .. coalesce(cardinality(p_videos), 0) loop
    if coalesce(p_video_secs[i], 0) > 60 then raise exception 'Vidéo trop longue (60 s max)'; end if;
    vi := vi || hdar.own_short_video(p_videos[i]);
    vs := vs || greatest(1, coalesce(p_video_secs[i], 1));
  end loop;
  select pseudo into ps from hdar.profiles where user_id = s;
  insert into hdar.ads (user_id, pseudo, title, body, category, region, city, city_slug, photos, videos, video_secs, expires_at, lat, lng, premium, tags)
  values (s, left(ps, 24), left(btrim(coalesce(p_title, '')), 60), left(btrim(coalesce(p_body, '')), 1000), lower(p_category),
    lower(p_region), left(btrim(coalesce(p_city, '')), 60), lower(left(p_city_slug, 60)), ph, vi, vs, now() + make_interval(hours => p_hours),
    hdar.ad_fuzz(p_lat), hdar.ad_fuzz(p_lng), prem, hdar.ad_tags_clean(p_tags))
  returning id into nid;
  return nid;
end $function$;

-- 3) Profil : jusqu'à 3 vidéos de 60 s. Une vidéo signalée par le contrôle NSFW reste visible
--    pour son auteur seulement, en attente de l'admin (même règle que la photo principale).
create table if not exists hdar.profile_videos (
  path text primary key,
  user_id text not null,
  duration int not null check (duration between 1 and 60),
  flag text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists profile_videos_user on hdar.profile_videos (user_id, created_at);
alter table hdar.profile_videos enable row level security;

create or replace function public.hdar_profile_video_add(p_path text, p_duration int, p_flag text default null)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'pvideo', 6, interval '1 hour');
  if coalesce(p_duration, 0) > 60 then raise exception 'Vidéo trop longue (60 s max)'; end if;
  if (select count(*) from hdar.profile_videos where user_id = s) >= 3 then raise exception '3 vidéos maximum'; end if;
  p := hdar.own_short_video(p_path);
  insert into hdar.profile_videos (path, user_id, duration, flag)
  values (p, s, greatest(1, coalesce(p_duration, 1)), nullif(left(coalesce(p_flag, ''), 80), ''))
  on conflict (path) do nothing;
end $$;

create or replace function public.hdar_profile_video_remove(p_path text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  delete from hdar.profile_videos where path = p_path and user_id = hdar.self_id();
end $$;

create or replace function public.hdar_profile_videos(p_user text)
returns table(path text, duration int, pending boolean) language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); u text := lower(left(coalesce(p_user, ''), 80));
begin
  if u = '' then u := s; end if;
  if u <> s and hdar.is_blocked(s, u) then return; end if;
  return query select v.path, v.duration, (v.flag is not null and not v.approved)
    from hdar.profile_videos v
    where v.user_id = u and (u = s or v.flag is null or v.approved)
    order by v.created_at;
end $$;

create or replace function public.hdar_admin_profile_videos(p_key text)
returns table(path text, user_id text, duration int, flag text, created_at timestamptz)
language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return query select v.path, v.user_id, v.duration, v.flag, v.created_at from hdar.profile_videos v
    where v.flag is not null and not v.approved order by v.created_at desc limit 200;
end $$;

create or replace function public.hdar_admin_profile_video_set(p_key text, p_path text, p_ok boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  if p_ok then update hdar.profile_videos set approved = true where path = p_path;
  else delete from hdar.profile_videos where path = p_path; end if;
end $$;


-- 3b) Lieux : jusqu'à 3 vidéos de 60 s sur la page du lieu (gérées par le propriétaire / pro).
create table if not exists hdar.place_videos (
  path text primary key,
  place_id uuid not null,
  duration int not null check (duration between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists place_videos_place on hdar.place_videos (place_id, created_at);
alter table hdar.place_videos enable row level security;

create or replace function public.hdar_place_video_add(p_place uuid, p_path text, p_duration int)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p text;
begin
  if not exists (select 1 from hdar.places x where x.id = p_place and (x.owner_id = s or hdar.is_admin_user(s))) then
    raise exception 'Seul le propriétaire du lieu peut ajouter une vidéo';
  end if;
  perform hdar.rate_check(s, 'plvideo', 6, interval '1 hour');
  if coalesce(p_duration, 0) > 60 then raise exception 'Vidéo trop longue (60 s max)'; end if;
  if (select count(*) from hdar.place_videos where place_id = p_place) >= 3 then raise exception '3 vidéos maximum'; end if;
  p := hdar.own_short_video(p_path);
  insert into hdar.place_videos (path, place_id, duration) values (p, p_place, greatest(1, coalesce(p_duration, 1)))
  on conflict (path) do nothing;
end $$;

create or replace function public.hdar_place_video_remove(p_place uuid, p_path text)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  delete from hdar.place_videos v using hdar.places x
  where v.path = p_path and v.place_id = p_place and x.id = p_place and (x.owner_id = s or hdar.is_admin_user(s));
end $$;

create or replace function public.hdar_place_videos(p_place uuid)
returns table(path text, duration int) language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); pl hdar.places;
begin
  select * into pl from hdar.places where id = p_place;
  if pl.id is null or (not hdar.place_visible(pl) and pl.owner_id is distinct from s) then return; end if;
  return query select v.path, v.duration from hdar.place_videos v where v.place_id = p_place order by v.created_at;
end $$;

-- 4) Signalement d'une vidéo (ou de tout média) : va dans la file des signalements existante.
create or replace function public.hdar_media_report(p_path text, p_reason text default '')
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text;
begin
  select i.user_id into o from hdar.identities i where i.auth_user_id::text = split_part(coalesce(p_path, ''), '/', 1);
  if o is null or o = s then return; end if;
  if (select count(*) from hdar.live_reports where reporter_id = s and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de signalements, patiente un peu';
  end if;
  insert into hdar.live_reports (reporter_id, target_id, reason)
  values (s, o, left('Vidéo signalée (' || p_path || ') ' || coalesce(p_reason, ''), 200));
end $$;

-- 5) Lecture (URL signée) : vidéos d'annonces / de profil + vignettes.
create or replace function public.hdar_can_read_media(p_name text)
 returns boolean language plpgsql stable security definer set search_path to '' as $function$
declare s text;
begin
  if auth.uid() is null then return false; end if;
  -- Vignette d'une vidéo : mêmes droits que la vidéo.
  if p_name ~ '\.(mp4|webm|mov)\.jpg$' then return public.hdar_can_read_media(left(p_name, -4)); end if;
  begin s := hdar.self_id(); exception when others then s := null; end;
  if split_part(p_name, '/', 1) = auth.uid()::text then return true; end if;
  if exists (select 1 from hdar.admins a where a.auth_user_id = auth.uid()) then return true; end if;
  return (s is not null and exists (select 1 from hdar.live_messages m where m.media = 'sb:' || p_name
            and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s)))
    or exists (select 1 from hdar.area_messages a where a.media = p_name and not a.removed and a.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.place_messages p where p.media = p_name and not p.removed and p.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.spot_messages p where p.media = p_name and not p.removed)
    or exists (select 1 from hdar.salon_messages m join hdar.salons sa on sa.id = m.salon_id
               where m.media = p_name and not m.removed and not sa.removed and m.created_at > now() - interval '24 hours')
    or (s is not null and exists (select 1 from hdar.ads d where (p_name = any(d.photos) or p_name = any(d.videos))
                                  and not d.hidden and d.expires_at > now()))
    or (s is not null and exists (select 1 from hdar.profile_videos v where v.path = p_name
                                  and (v.flag is null or v.approved) and not hdar.is_blocked(s, v.user_id)))
    or exists (select 1 from hdar.place_videos v join hdar.places x on x.id = v.place_id
               where v.path = p_name and hdar.place_visible(x));
end $function$;

-- 6) Purge des orphelins : garder vidéos d'annonces / de profil et vignettes dont la vidéo existe.
create or replace function public.hdar_media_orphans(p_limit integer default 500)
 returns table(name text) language sql stable security definer set search_path to '' as $function$
  select o.name from storage.objects o
  where o.bucket_id = 'hdar-media' and o.created_at < now() - interval '2 hours'
    and not (o.name ~ '\.(mp4|webm|mov)\.jpg$' and exists (
      select 1 from storage.objects v where v.bucket_id = 'hdar-media' and v.name = left(o.name, -4)))
    and not exists (select 1 from hdar.live_messages m where m.media = 'sb:' || o.name
      and not (
        exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 1) and h.other_id = split_part(m.thread_id, ':', 2) and h.hidden_at > m.created_at)
        and exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 2) and h.other_id = split_part(m.thread_id, ':', 1) and h.hidden_at > m.created_at)))
    and not exists (select 1 from hdar.area_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.place_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.salon_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.spot_messages a where a.media = o.name and not a.removed
      and exists (select 1 from hdar.spots s where s.id = a.spot_id))
    and not exists (select 1 from hdar.ads d where (o.name = any(d.photos) or o.name = any(d.videos)) and d.expires_at > now() - interval '7 days')
    and not exists (select 1 from hdar.profile_videos v where v.path = o.name)
    and not exists (select 1 from hdar.place_videos v where v.path = o.name)
  limit greatest(1, least(p_limit, 1000));
$function$;

-- 7) Durée vidéo des messages : 3 min (vocaux toujours 60 s).

CREATE OR REPLACE FUNCTION public.hdar_area_send_media(p_lat double precision, p_lng double precision, p_pseudo text, p_kind text, p_path text, p_duration integer)
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
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position inconnue';
  end if;
  insert into hdar.area_messages (from_id, pseudo, lat, lng, body, kind, media, duration)
  values (s, hdar.display_name(s),
          round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision, '',
          p_kind, p, case when p_kind = 'image' then null else least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1))) end);
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
  if not hdar.is_admin_user(s) and (p_lat is null or p_lng is null or hdar.km(p_lat, p_lng, pl.lat, pl.lng) > 2) then
    raise exception 'Tu dois être à moins de 2 km du lieu pour écrire';
  end if;
  select coalesce(nullif(btrim(x.pseudo), ''), 'Anonyme') into ps from hdar.profiles x where x.user_id = s;
  insert into hdar.place_messages (place_id, from_id, pseudo, body, kind, media, duration)
  values (p_id, s, coalesce(ps, 'Anonyme'), '', p_kind, p,
          case when p_kind = 'image' then null else least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1))) end);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_salon_send_media(p_id uuid, p_kind text, p_path text, p_duration integer, p_reply uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); p text; ps text;
begin
  perform hdar.require_profile(s);
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  if not exists (select 1 from hdar.salons x where x.id = p_id and not x.removed) then raise exception 'Ce salon est fermé'; end if;
  perform hdar.rate_check(s, 'salon', 12, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  select nullif(pr.pseudo, '') into ps from hdar.profiles pr where pr.user_id = s;
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body, kind, media, duration, reply_to)
  values (p_id, s, coalesce(ps, hdar.discreet_name(s)), '', p_kind, p,
          case when p_kind = 'image' then null else least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1))) end,
          (select r.id from hdar.salon_messages r where r.id = p_reply and r.salon_id = p_id));
  update hdar.salons set last_at = now() where id = p_id;
  perform hdar.bump_msg('salon');
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

CREATE OR REPLACE FUNCTION public.hdar_send_media(p_self text, p_to text, p_kind text, p_media text, p_duration integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  t text := lower(left(coalesce(p_to, ''), 80));
  d int := least(case when p_kind = 'video' then 180 else 60 end, greatest(1, coalesce(p_duration, 1)));
  med text := p_media;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'msg', 20, interval '1 minute');
  if t = '' or t = s then return; end if;
  if med like 'sb:%' then
    perform hdar.rate_check(s, 'media', 8, interval '1 minute');
    med := 'sb:' || hdar.own_media(substr(med, 4), p_kind);
    if p_kind = 'image' then d := null; end if;
  elsif p_kind = 'image' then
    if med !~ '^data:image/(jpeg|png|webp);base64,' or length(med) > 700000 then
      raise exception 'Photo invalide ou trop lourde';
    end if;
    d := null;
  elsif p_kind = 'audio' then
    if med !~ '^data:audio/(webm|ogg|mp4|mpeg|aac|x-m4a)[^,]*;base64,' or length(med) > 1600000 then
      raise exception 'Vocal invalide ou trop long';
    end if;
  else
    raise exception 'Type de message invalide';
  end if;
  if hdar.is_blocked(s, t) then return; end if;
  perform hdar.flood_check(s);
  insert into hdar.live_messages (thread_id, from_id, body, kind, media, duration)
  values (hdar.thread_of(s, t), s, '', p_kind, med, d);
end $function$;
grant execute on function public.hdar_profile_video_add(text,int,text), public.hdar_profile_video_remove(text), public.hdar_profile_videos(text), public.hdar_media_report(text,text),
  public.hdar_place_video_add(uuid,text,int), public.hdar_place_video_remove(uuid,text), public.hdar_place_videos(uuid) to authenticated;
