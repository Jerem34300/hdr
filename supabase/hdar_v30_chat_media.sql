-- hdar v30 — Médias dans les chats (photos, vidéos, vocaux) via Supabase Storage
-- Bucket privé hdar-media (50 Mo max), chemin <auth.uid()>/<fichier>, lecture par URL signée
-- autorisée seulement si on a le droit de voir le message qui référence le fichier.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hdar-media', 'hdar-media', false, 52428800,
  array['image/jpeg','image/webp','image/png','video/mp4','video/webm','video/quicktime',
        'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table hdar.live_messages drop constraint if exists live_messages_kind_check;
alter table hdar.live_messages add constraint live_messages_kind_check
  check (kind = any (array['text','image','audio','location','video']));

alter table hdar.area_messages  add column if not exists kind text not null default 'text',
  add column if not exists media text, add column if not exists duration int;
alter table hdar.place_messages add column if not exists kind text not null default 'text',
  add column if not exists media text, add column if not exists duration int;
alter table hdar.spot_messages  add column if not exists kind text not null default 'text',
  add column if not exists media text, add column if not exists duration int;

create table if not exists hdar.media_reports (
  scope text not null, msg_id uuid not null, user_id text not null,
  created_at timestamptz not null default now(), handled boolean not null default false,
  primary key (scope, msg_id, user_id));
alter table hdar.media_reports enable row level security;
revoke all on hdar.media_reports from anon, authenticated;

-- Valide un chemin storage envoyé par le client : doit appartenir à l'appelant et exister.
create or replace function hdar.own_media(p_path text, p_kind text) returns text
language plpgsql stable security definer set search_path to '' as $$
declare u uuid := auth.uid(); m text;
begin
  if u is null or p_path is null or p_path !~ ('^' || u::text || '/[A-Za-z0-9._-]{8,80}$') then
    raise exception 'Fichier invalide';
  end if;
  select o.metadata->>'mimetype' into m from storage.objects o where o.bucket_id = 'hdar-media' and o.name = p_path;
  if m is null then raise exception 'Fichier introuvable'; end if;
  if (p_kind = 'image' and m not like 'image/%') or (p_kind = 'video' and m not like 'video/%')
     or (p_kind = 'audio' and m not like 'audio/%') or p_kind not in ('image','video','audio') then
    raise exception 'Type de fichier invalide';
  end if;
  return p_path;
end $$;

create or replace function public.hdar_can_read_media(p_name text) returns boolean
language plpgsql stable security definer set search_path to '' as $$
declare s text;
begin
  if auth.uid() is null then return false; end if;
  begin s := hdar.self_id(); exception when others then s := null; end;
  if split_part(p_name, '/', 1) = auth.uid()::text then return true; end if;
  if exists (select 1 from hdar.admins a where a.auth_user_id = auth.uid()) then return true; end if;
  return (s is not null and exists (select 1 from hdar.live_messages m where m.media = 'sb:' || p_name
            and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s)))
    or exists (select 1 from hdar.area_messages a where a.media = p_name and not a.removed and a.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.place_messages p where p.media = p_name and not p.removed and p.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.spot_messages p where p.media = p_name and not p.removed);
end $$;
revoke execute on function public.hdar_can_read_media(text) from public, anon;
grant execute on function public.hdar_can_read_media(text) to authenticated;

drop function if exists hdar.can_read_media(text) cascade;
drop policy if exists "hdar media upload" on storage.objects;
create policy "hdar media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'hdar-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "hdar media read" on storage.objects;
create policy "hdar media read" on storage.objects for select to authenticated
  using (bucket_id = 'hdar-media' and public.hdar_can_read_media(name));

-- DM : vidéo (et photo caméra) via storage ; les anciens data: URL restent acceptés.
CREATE OR REPLACE FUNCTION public.hdar_send_media(p_self text, p_to text, p_kind text, p_media text, p_duration integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  s text := hdar.self_id();
  t text := lower(left(coalesce(p_to, ''), 80));
  d int := least(60, greatest(1, coalesce(p_duration, 1)));
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

-- Chats publics : envoi d'un média
create or replace function public.hdar_area_send_media(p_lat double precision, p_lng double precision, p_pseudo text, p_kind text, p_path text, p_duration int)
returns void language plpgsql security definer set search_path to '' as $$
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
  values (s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'),
          round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision, '',
          p_kind, p, case when p_kind = 'image' then null else least(60, greatest(1, coalesce(p_duration, 1))) end);
end $$;

create or replace function public.hdar_spot_send_media(p_id uuid, p_pseudo text, p_kind text, p_path text, p_duration int)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  if not exists (select 1 from hdar.spots where id = p_id and closes_at > now()) then raise exception 'Ce lieu est fermé'; end if;
  insert into hdar.spot_messages (spot_id, from_id, pseudo, body, kind, media, duration)
  values (p_id, s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'), '',
          p_kind, p, case when p_kind = 'image' then null else least(60, greatest(1, coalesce(p_duration, 1))) end);
end $$;

create or replace function public.hdar_place_send_media(p_id uuid, p_kind text, p_path text, p_duration int, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); pl hdar.places; ps text; p text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  select * into pl from hdar.places x where x.id = p_id and x.status = 'approved'
    and (not x.partner or coalesce(x.partner_until > now(), false));
  if pl.id is null then raise exception 'Lieu introuvable'; end if;
  if p_lat is null or p_lng is null or hdar.km(p_lat, p_lng, pl.lat, pl.lng) > 2 then
    raise exception 'Tu dois être à moins de 2 km du lieu pour écrire';
  end if;
  select coalesce(nullif(btrim(x.pseudo), ''), 'Anonyme') into ps from hdar.profiles x where x.user_id = s;
  insert into hdar.place_messages (place_id, from_id, pseudo, body, kind, media, duration)
  values (p_id, s, coalesce(ps, 'Anonyme'), '', p_kind, p,
          case when p_kind = 'image' then null else least(60, greatest(1, coalesce(p_duration, 1))) end);
end $$;

-- Signalement d'un média public : masqué automatiquement à 3 signalements.
create or replace function public.hdar_media_report(p_scope text, p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int;
begin
  if s is null or p_scope not in ('area','place','spot') then raise exception 'Signalement invalide'; end if;
  perform hdar.rate_check(s, 'report', 10, interval '10 minutes');
  insert into hdar.media_reports (scope, msg_id, user_id) values (p_scope, p_id, s) on conflict do nothing;
  select count(*) into n from hdar.media_reports where scope = p_scope and msg_id = p_id;
  if n >= 3 then
    if p_scope = 'area' then update hdar.area_messages set removed = true where id = p_id;
    elsif p_scope = 'place' then update hdar.place_messages set removed = true where id = p_id;
    else update hdar.spot_messages set removed = true where id = p_id; end if;
  end if;
end $$;

-- Lecture des médias publics (sidecar : les fils existants ne changent pas de signature)
create or replace function public.hdar_room_media(p_scope text, p_ids uuid[])
returns table(id uuid, kind text, media text, duration int)
language plpgsql stable security definer set search_path to '' as $$
begin
  if p_scope = 'area' then
    return query select a.id, a.kind, a.media, a.duration from hdar.area_messages a where a.id = any(p_ids) and a.media is not null and not a.removed;
  elsif p_scope = 'place' then
    return query select a.id, a.kind, a.media, a.duration from hdar.place_messages a where a.id = any(p_ids) and a.media is not null and not a.removed;
  elsif p_scope = 'spot' then
    return query select a.id, a.kind, a.media, a.duration from hdar.spot_messages a where a.id = any(p_ids) and a.media is not null and not a.removed;
  end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['public.hdar_area_send_media(double precision,double precision,text,text,text,integer)',
    'public.hdar_spot_send_media(uuid,text,text,text,integer)',
    'public.hdar_place_send_media(uuid,text,text,integer,double precision,double precision)',
    'public.hdar_media_report(text,uuid)','public.hdar_room_media(text,uuid[])'] loop
    execute 'revoke execute on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end $$;
