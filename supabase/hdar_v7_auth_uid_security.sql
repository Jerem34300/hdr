-- hdar v7 — Sécurité : identité dérivée de auth.uid() (Supabase Anonymous Sign-ins)
-- NE PAS appliquer sans relecture. Prérequis : Anonymous sign-ins activé.
-- * hdar.identities lie auth.uid() à l'id hdar historique (text uuid)
-- * profiles.auth_user_id (miroir, unique)
-- * tous les hdar_* ignorent p_self et utilisent hdar.self_id()
-- * hdar.admin_check(p_key) ignore la clé : auth.uid() doit être dans hdar.admins
-- * coordonnées renvoyées arrondies (~110 m) ; EXECUTE retiré à anon
begin;

create table if not exists hdar.identities (
  auth_user_id uuid primary key,
  user_id text not null unique,
  created_at timestamptz not null default now()
);
alter table hdar.profiles add column if not exists auth_user_id uuid unique;
create table if not exists hdar.admins (
  auth_user_id uuid primary key,
  note text,
  created_at timestamptz not null default now()
);

create or replace function hdar.self_id() returns text
language plpgsql stable set search_path = '' as $$
declare u uuid := auth.uid(); s text;
begin
  if u is null then raise exception 'Non connecté'; end if;
  select i.user_id into s from hdar.identities i where i.auth_user_id = u;
  if s is null then raise exception 'Identité non liée'; end if;
  return hdar.check_id(s); -- garde la vérification des bannissements
end $$;

create or replace function hdar.round_coord(v double precision) returns double precision
language sql immutable set search_path = '' as $$
  select case when v is null then null else round(v::numeric, 3)::double precision end
$$;

-- Liaison : un auth.uid() <-> un id hdar. L'id appareil historique n'est
-- réclamable qu'une fois (premier arrivé) ; sinon un nouvel id est créé.
create or replace function public.hdar_claim(p_device text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid(); s text;
begin
  if u is null then raise exception 'Non connecté'; end if;
  select i.user_id into s from hdar.identities i where i.auth_user_id = u;
  if s is not null then return s; end if;
  if p_device ~* '^[0-9a-f-]{36}$'
     and not exists (select 1 from hdar.identities i where i.user_id = lower(p_device)) then
    s := lower(p_device);
  else
    s := gen_random_uuid()::text;
  end if;
  insert into hdar.identities (auth_user_id, user_id) values (u, s);
  update hdar.profiles set auth_user_id = u where user_id = s;
  return s;
end $$;

create or replace function hdar.admin_check(p_key text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from hdar.admins a where a.auth_user_id = auth.uid()) then
    raise exception 'Accès refusé';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.hdar_admin_area(p_key text)
 RETURNS TABLE(id uuid, from_id text, pseudo text, body text, at text, removed boolean, lat double precision, lng double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.admin_check(p_key);
  return query
    select a.id, a.from_id, a.pseudo, a.body, a.created_at::text, a.removed, a.lat, a.lng
    from hdar.area_messages a order by a.created_at desc limit 100;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_ban(p_key text, p_id text, p_reason text, p_ban boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o text := lower(left(coalesce(p_id, ''), 80));
begin
  perform hdar.admin_check(p_key);
  if p_ban then
    insert into hdar.bans (user_id, reason, active) values (o, left(coalesce(p_reason, ''), 200), true)
    on conflict (user_id) do update set reason = excluded.reason, at = now(), active = true;
    update hdar.profiles set visible_until = now() where user_id = o;
    update hdar.area_messages set removed = true where from_id = o;
    update hdar.spots set closes_at = now() where creator_id = o and closes_at > now();
    update hdar.live_reports set handled_at = now() where target_id = o and handled_at is null;
  else
    update hdar.bans set active = false where user_id = o;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_banned(p_key text)
 RETURNS TABLE(user_id text, pseudo text, reason text, at text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.admin_check(p_key);
  return query
    select b.user_id, coalesce(p.pseudo, 'Anonyme'), b.reason, b.at::text
    from hdar.bans b left join hdar.profiles p on p.user_id = b.user_id
    where b.active order by b.at desc limit 200;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_dismiss(p_key text, p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.admin_check(p_key);
  update hdar.live_reports set handled_at = now() where target_id = lower(p_id) and handled_at is null;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_hide_area(p_key text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.admin_check(p_key);
  update hdar.area_messages set removed = true where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_reports(p_key text, p_all boolean)
 RETURNS TABLE(target_id text, pseudo text, photo text, reports bigint, reasons text, last_at text, banned boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.admin_check(p_key);
  return query
    select r.target_id, coalesce(p.pseudo, 'Anonyme'), p.photo, count(*),
      string_agg(distinct nullif(r.reason, ''), ' Â· '), max(r.created_at)::text,
      exists (select 1 from hdar.bans b where b.user_id = r.target_id and b.active)
    from hdar.live_reports r left join hdar.profiles p on p.user_id = r.target_id
    where p_all or r.handled_at is null
    group by r.target_id, p.pseudo, p.photo
    order by max(r.created_at) desc
    limit 200;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_stats(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
  perform hdar.admin_check(p_key);
  select jsonb_build_object(
    'active_now', (select count(*) from hdar.devices where last_seen > now() - interval '5 minutes'),
    'visible_now', (select count(*) from hdar.profiles where visible_until > now()),
    'visitors_today', (select count(*) from hdar.daily_visits where day = current_date),
    'sessions_today', (select coalesce(sum(sessions), 0) from hdar.daily_visits where day = current_date),
    'visitors_7d', (select count(distinct device) from hdar.daily_visits where day > current_date - 7),
    'visitors_30d', (select count(distinct device) from hdar.daily_visits where day > current_date - 30),
    'devices_total', (select count(*) from hdar.devices),
    'profiles_total', (select count(*) from hdar.profiles where profile_at is not null),
    'profiles_new_today', (select count(*) from hdar.profiles where profile_at is not null and created_at::date = current_date),
    'profiles_with_photo', (select count(*) from hdar.profiles where photo is not null),
    'pm_today', (select count(*) from hdar.live_messages where created_at::date = current_date),
    'pm_7d', (select count(*) from hdar.live_messages where created_at > now() - interval '7 days'),
    'conversations_today', (select count(distinct thread_id) from hdar.live_messages where created_at::date = current_date),
    'chatters_today', (select count(distinct from_id) from hdar.live_messages where created_at::date = current_date),
    'photos_today', (select count(*) from hdar.live_messages where kind = 'image' and created_at::date = current_date),
    'voices_today', (select count(*) from hdar.live_messages where kind = 'audio' and created_at::date = current_date),
    'calls_today', (select count(*) from hdar.rtc_signals where kind = 'offer' and created_at::date = current_date),
    'area_today', (select count(*) from hdar.area_messages where created_at::date = current_date),
    'area_writers_today', (select count(distinct from_id) from hdar.area_messages where created_at::date = current_date),
    'spots_open', (select count(*) from hdar.spots where closes_at > now()),
    'spot_msgs_today', (select count(*) from hdar.spot_messages where created_at::date = current_date),
    'reports_open', (select count(*) from hdar.live_reports where handled_at is null),
    'bans', (select count(*) from hdar.bans),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'visitors', (select count(*) from hdar.daily_visits v where v.day = d::date),
        'new_profiles', (select count(*) from hdar.profiles p where p.profile_at is not null and p.created_at::date = d::date),
        'messages', (select count(*) from hdar.live_messages m where m.created_at::date = d::date)
          + (select count(*) from hdar.area_messages a where a.created_at::date = d::date)
      ) order by d)
      from generate_series(current_date - 13, current_date, interval '1 day') d
    )
  ) into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_user(p_key text, p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o text := lower(left(coalesce(p_id, ''), 80));
  r jsonb;
begin
  perform hdar.admin_check(p_key);
  select jsonb_build_object(
    'id', o,
    'profile', (select jsonb_build_object('pseudo', p.pseudo, 'age', p.age, 'bio', p.bio, 'tags', p.tags,
                 'album', p.album, 'voice', p.voice, 'created_at', p.created_at, 'online', p.visible_until > now())
                from hdar.profiles p where p.user_id = o),
    'device', (select jsonb_build_object('first_seen', d.first_seen, 'last_seen', d.last_seen, 'sessions', d.sessions)
               from hdar.devices d where d.id = o),
    'banned', (select jsonb_build_object('reason', b.reason, 'at', b.at) from hdar.bans b where b.user_id = o and b.active),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
                  'reporter', coalesce(rp.pseudo, 'Anonyme'), 'reporter_id', r.reporter_id,
                  'reason', r.reason, 'at', r.created_at, 'handled', r.handled_at is not null) order by r.created_at desc), '[]'::jsonb)
                from hdar.live_reports r left join hdar.profiles rp on rp.user_id = r.reporter_id
                where r.target_id = o),
    'sent_to_reporters', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        select distinct on (m.id) jsonb_build_object('to', coalesce(tp.pseudo, 'Anonyme'), 'kind', m.kind, 'body', m.body,
               'media', case when m.kind = 'image' then m.media end, 'at', m.created_at) x
        from hdar.live_messages m
        join hdar.live_reports r on r.target_id = o and m.thread_id = hdar.thread_of(o, r.reporter_id)
        left join hdar.profiles tp on tp.user_id = r.reporter_id
        where m.from_id = o
        order by m.id, m.created_at desc limit 40) s),
    'area_messages', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'at', a.created_at,
                        'removed', a.removed) order by a.created_at desc), '[]'::jsonb)
                      from (select * from hdar.area_messages where from_id = o order by created_at desc limit 30) a),
    'stats', jsonb_build_object(
      'pm_sent', (select count(*) from hdar.live_messages where from_id = o),
      'people_contacted', (select count(distinct thread_id) from hdar.live_messages where from_id = o),
      'blocked_by', (select count(*) from hdar.live_blocks where blocked_id = o))
  ) into r;
  return r;
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
      exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null)
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

CREATE OR REPLACE FUNCTION public.hdar_area_hide(p_self text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update hdar.area_messages set removed = true where id = p_id and from_id = hdar.self_id();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_area_send(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  b text := left(trim(coalesce(p_body, '')), 300);
begin
  if b = '' then return; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position inconnue';
  end if;
  if (select count(*) from hdar.area_messages where from_id = s and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Trop de messages, patiente un peu';
  end if;
  -- Position is rounded (~500 m) so a message never reveals where someone is.
  insert into hdar.area_messages (from_id, pseudo, lat, lng, body)
  values (s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'),
          round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision, b);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_block(p_self text, p_other text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  o text := lower(left(coalesce(p_other, ''), 80));
begin
  if o = '' or o = s then return; end if;
  insert into hdar.live_blocks values (s, o), (o, s) on conflict do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_conversation_hide(p_self text, p_other text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  o text := lower(left(coalesce(p_other, ''), 80));
begin
  if o = '' or o = s then return; end if;
  insert into hdar.hidden_threads (user_id, other_id, hidden_at) values (s, o, now())
  on conflict (user_id, other_id) do update set hidden_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_conversations(p_self text)
 RETURNS TABLE(other_id text, pseudo text, last_kind text, last_body text, last_at text, last_mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return query
    select c.other, coalesce(p.pseudo, 'Anonyme'), c.kind, c.body, c.created_at::text, c.from_id = s
    from (
      select distinct on (m.thread_id)
        case when split_part(m.thread_id, ':', 1) = s then split_part(m.thread_id, ':', 2)
             else split_part(m.thread_id, ':', 1) end as other,
        m.kind, m.body, m.created_at, m.from_id
      from hdar.live_messages m
      where split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s
      order by m.thread_id, m.created_at desc
    ) c
    left join hdar.profiles p on p.user_id = c.other
    left join hdar.hidden_threads h on h.user_id = s and h.other_id = c.other
    where not hdar.is_blocked(s, c.other)
      and (h.hidden_at is null or c.created_at > h.hidden_at)
    order by c.created_at desc
    limit 100;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_get_media(p_self text, p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return (
    select m.media from hdar.live_messages m
    where m.id = p_id
      and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_go_dark(p_self text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update hdar.profiles set visible_until = now() where user_id = hdar.self_id();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_hit(p_self text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  prev timestamptz;
  fresh boolean;
begin
  select d.last_seen into prev from hdar.devices d where d.id = s;
  fresh := prev is null or prev < now() - interval '30 minutes';
  insert into hdar.devices (id) values (s)
  on conflict (id) do update set last_seen = now(),
    sessions = hdar.devices.sessions + case when fresh then 1 else 0 end;
  insert into hdar.daily_visits (day, device) values (current_date, s)
  on conflict (day, device) do update set
    sessions = hdar.daily_visits.sessions + case when fresh then 1 else 0 end;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_list_live(p_self text)
 RETURNS TABLE(id text, pseudo text, lat double precision, lng double precision, desires text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return query
    select p.user_id, p.pseudo, hdar.round_coord(p.lat), hdar.round_coord(p.lng), p.desires
    from hdar.profiles p
    where p.visible_until > now()
      and p.user_id <> s
      and p.lat is not null
      and not hdar.is_blocked(s, p.user_id)
    limit 500;
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
  return query select p.album, p.voice, p.voice_sec from hdar.profiles p where p.user_id = o;
end $function$;

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
    select p.user_id, p.pseudo, p.age, p.bio, p.tags, p.desires, p.photo,
      coalesce(p.visible_until > now(), false),
      case when p.visible_until > now() then p.lat end,
      case when p.visible_until > now() then p.lng end
    from hdar.profiles p where p.user_id = o;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_profile_save(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photos jsonb, p_voice text, p_voice_sec integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  ps text := coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme');
  kept jsonb := '[]'::jsonb;
  item jsonb;
  v text := nullif(p_voice, '');
begin
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) = 'array' then
    for item in select * from jsonb_array_elements(p_photos) loop
      exit when jsonb_array_length(kept) >= 5;
      if jsonb_typeof(item) = 'string'
         and item #>> '{}' ~ '^data:image/(jpeg|png|webp);base64,'
         and length(item #>> '{}') <= 400000 then
        kept := kept || jsonb_build_array(item);
      end if;
    end loop;
  end if;
  if v is not null and (v !~ '^data:audio/(webm|ogg|mp4|mpeg|aac|x-m4a)[^,]*;base64,' or length(v) > 300000) then
    v := null;
  end if;
  insert into hdar.profiles (user_id, pseudo, age, bio, tags, photo, album, voice, voice_sec, profile_at)
  values (s, ps, case when p_age between 18 and 99 then p_age end, left(coalesce(p_bio, ''), 300),
          left(coalesce(p_tags, ''), 200), kept ->> 0, kept, v,
          case when v is not null then least(10, greatest(1, coalesce(p_voice_sec, 1))) end, now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, age = excluded.age, bio = excluded.bio, tags = excluded.tags,
    photo = excluded.photo, album = excluded.album, voice = excluded.voice,
    voice_sec = excluded.voice_sec, profile_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_profile_set(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  ps text := coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme');
  ph text := nullif(p_photo, '');
begin
  if ph is not null and (ph !~ '^data:image/(jpeg|png|webp);base64,' or length(ph) > 400000) then
    ph := null;
  end if;
  insert into hdar.profiles (user_id, pseudo, age, bio, tags, photo, profile_at)
  values (s, ps, case when p_age between 18 and 99 then p_age end, left(coalesce(p_bio, ''), 300),
          left(coalesce(p_tags, ''), 200), ph, now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, age = excluded.age, bio = excluded.bio,
    tags = excluded.tags, photo = excluded.photo, profile_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_pulse(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_desires text, p_hours integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  ps text := coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme');
  h int := least(12, greatest(1, coalesce(p_hours, 3)));
  la double precision;
  lo double precision;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return;
  end if;
  la := round(p_lat * 500) / 500;
  lo := round(p_lng * 500) / 500;
  insert into hdar.profiles (user_id, pseudo, lat, lng, desires, visible_until, updated_at)
  values (s, ps, la, lo, left(coalesce(p_desires, ''), 80), now() + make_interval(hours => h), now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, lat = excluded.lat, lng = excluded.lng,
    desires = excluded.desires, visible_until = excluded.visible_until, updated_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_read_thread(p_self text, p_with text)
 RETURNS TABLE(id uuid, from_id text, body text, at text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  w text := lower(left(coalesce(p_with, ''), 80));
begin
  if w = '' or w = s then return; end if;
  return query
    select m.id, m.from_id, m.body, m.created_at::text
    from (
      select * from hdar.live_messages
      where thread_id = hdar.thread_of(s, w)
      order by created_at desc
      limit 200
    ) m
    order by m.created_at asc;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_report(p_self text, p_other text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  o text := lower(left(coalesce(p_other, ''), 80));
begin
  if o = '' or o = s then return; end if;
  insert into hdar.live_reports (reporter_id, target_id) values (s, o);
  insert into hdar.live_blocks values (s, o), (o, s) on conflict do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_report_reason(p_self text, p_other text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  o text := lower(left(coalesce(p_other, ''), 80));
begin
  if o = '' or o = s then return; end if;
  if (select count(*) from hdar.live_reports where reporter_id = s and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de signalements, patiente un peu';
  end if;
  insert into hdar.live_reports (reporter_id, target_id, reason)
  values (s, o, left(coalesce(p_reason, ''), 200));
  insert into hdar.live_blocks values (s, o), (o, s) on conflict do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_send(p_self text, p_to text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  t text := lower(left(coalesce(p_to, ''), 80));
  b text := left(trim(coalesce(p_body, '')), 500);
begin
  if t = '' or b = '' or t = s then return; end if;
  if hdar.is_blocked(s, t) then return; end if;
  -- Light flood guard: at most 30 messages per sender per minute.
  if (select count(*) from hdar.live_messages
      where from_id = s and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de messages, patiente un peu';
  end if;
  insert into hdar.live_messages (thread_id, from_id, body) values (hdar.thread_of(s, t), s, b);
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
  d int := least(60, greatest(1, coalesce(p_duration, 1)));
begin
  if t = '' or t = s then return; end if;
  if p_kind = 'image' then
    if p_media !~ '^data:image/(jpeg|png|webp);base64,' or length(p_media) > 700000 then
      raise exception 'Photo invalide ou trop lourde';
    end if;
    d := null;
  elsif p_kind = 'audio' then
    if p_media !~ '^data:audio/(webm|ogg|mp4|mpeg|aac|x-m4a)[^,]*;base64,' or length(p_media) > 1600000 then
      raise exception 'Vocal invalide ou trop long';
    end if;
  else
    raise exception 'Type de message invalide';
  end if;
  if hdar.is_blocked(s, t) then return; end if;
  perform hdar.flood_check(s);
  insert into hdar.live_messages (thread_id, from_id, body, kind, media, duration)
  values (hdar.thread_of(s, t), s, '', p_kind, p_media, d);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_signal_poll(p_self text, p_after bigint)
 RETURNS TABLE(id bigint, from_id text, pseudo text, kind text, payload text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return query
    select r.id, r.from_id, coalesce(p.pseudo, 'Anonyme'), r.kind, r.payload
    from hdar.rtc_signals r left join hdar.profiles p on p.user_id = r.from_id
    where r.to_id = s and r.id > coalesce(p_after, 0) and r.created_at > now() - interval '45 seconds'
    order by r.id
    limit 20;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_signal_send(p_self text, p_to text, p_kind text, p_payload text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  t text := hdar.check_id(p_to);
begin
  if t = s or p_kind not in ('offer', 'answer', 'hangup') then return; end if;
  if length(coalesce(p_payload, '')) > 20000 then raise exception 'Signal trop gros'; end if;
  if hdar.is_blocked(s, t) then return; end if;
  if (select count(*) from hdar.rtc_signals where from_id = s and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop d''appels, patiente un peu';
  end if;
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (t, s, p_kind, coalesce(p_payload, ''));
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_spot_close(p_self text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  update hdar.spots set closes_at = now() where id = p_id and creator_id = s and closes_at > now();
  return found;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_spot_create(p_self text, p_title text, p_hours integer, p_lat double precision, p_lng double precision, p_pseudo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  ti text := left(trim(coalesce(p_title, '')), 40);
  h int := least(12, greatest(1, coalesce(p_hours, 3)));
  new_id uuid;
begin
  if length(ti) < 2 then raise exception 'Titre trop court'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position invalide';
  end if;
  if (select count(*) from hdar.spots where creator_id = s and closes_at > now()) >= 5 then
    raise exception 'Tu as déjà 5 lieux ouverts';
  end if;
  insert into hdar.spots (creator_id, title, lat, lng, closes_at)
  values (s, ti, p_lat, p_lng, now() + make_interval(hours => h))
  returning id into new_id;
  insert into hdar.spot_messages (spot_id, from_id, pseudo, body)
  values (new_id, s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'), 'Lieu ouvert.');
  return new_id;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_spot_list(p_self text, p_lat double precision, p_lng double precision)
 RETURNS TABLE(id uuid, title text, lat double precision, lng double precision, closes_at text, mine boolean, members bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return query
    select sp.id, sp.title, hdar.round_coord(sp.lat), hdar.round_coord(sp.lng), sp.closes_at::text, sp.creator_id = s,
      (select count(distinct m.from_id) from hdar.spot_messages m where m.spot_id = sp.id)
    from hdar.spots sp
    where sp.closes_at > now()
      and (sp.creator_id = s or (
        abs(sp.lat - coalesce(p_lat, sp.lat)) < 1 and abs(sp.lng - coalesce(p_lng, sp.lng)) < 1.5
        and not hdar.is_blocked(s, sp.creator_id)))
    order by sp.created_at desc
    limit 200;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_spot_messages(p_self text, p_id uuid)
 RETURNS TABLE(id uuid, from_id text, pseudo text, body text, at text, mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return query
    select m.id, m.from_id, m.pseudo, m.body, m.created_at::text, m.from_id = s
    from (
      select * from hdar.spot_messages sm
      where sm.spot_id = p_id
        and not sm.removed
        and exists (select 1 from hdar.spots sp where sp.id = p_id and sp.closes_at > now())
        and not hdar.is_blocked(s, sm.from_id)
      order by sm.created_at desc
      limit 200
    ) m
    order by m.created_at asc;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_spot_msg_hide(p_self text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  update hdar.spot_messages m set removed = true
  where m.id = p_id
    and (m.from_id = s or exists (select 1 from hdar.spots sp where sp.id = m.spot_id and sp.creator_id = s));
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

CREATE OR REPLACE FUNCTION public.hdar_thread(p_self text, p_with text)
 RETURNS TABLE(id uuid, from_id text, body text, at text, kind text, duration integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  w text := lower(left(coalesce(p_with, ''), 80));
  since timestamptz;
begin
  if w = '' or w = s then return; end if;
  select h.hidden_at into since from hdar.hidden_threads h where h.user_id = s and h.other_id = w;
  return query
    select m.id, m.from_id, m.body, m.created_at::text, m.kind, m.duration
    from (
      select * from hdar.live_messages lm
      where lm.thread_id = hdar.thread_of(s, w)
        and (since is null or lm.created_at > since)
      order by lm.created_at desc
      limit 200
    ) m
    order by m.created_at asc;
end $function$;

-- Droits
revoke execute on function public.hdar_admin_area(p_key text) from public, anon;
grant execute on function public.hdar_admin_area(p_key text) to authenticated;
revoke execute on function public.hdar_admin_ban(p_key text, p_id text, p_reason text, p_ban boolean) from public, anon;
grant execute on function public.hdar_admin_ban(p_key text, p_id text, p_reason text, p_ban boolean) to authenticated;
revoke execute on function public.hdar_admin_banned(p_key text) from public, anon;
grant execute on function public.hdar_admin_banned(p_key text) to authenticated;
revoke execute on function public.hdar_admin_dismiss(p_key text, p_id text) from public, anon;
grant execute on function public.hdar_admin_dismiss(p_key text, p_id text) to authenticated;
revoke execute on function public.hdar_admin_hide_area(p_key text, p_id uuid) from public, anon;
grant execute on function public.hdar_admin_hide_area(p_key text, p_id uuid) to authenticated;
revoke execute on function public.hdar_admin_reports(p_key text, p_all boolean) from public, anon;
grant execute on function public.hdar_admin_reports(p_key text, p_all boolean) to authenticated;
revoke execute on function public.hdar_admin_stats(p_key text) from public, anon;
grant execute on function public.hdar_admin_stats(p_key text) to authenticated;
revoke execute on function public.hdar_admin_user(p_key text, p_id text) from public, anon;
grant execute on function public.hdar_admin_user(p_key text, p_id text) to authenticated;
revoke execute on function public.hdar_area_feed(p_self text, p_lat double precision, p_lng double precision) from public, anon;
grant execute on function public.hdar_area_feed(p_self text, p_lat double precision, p_lng double precision) to authenticated;
revoke execute on function public.hdar_area_hide(p_self text, p_id uuid) from public, anon;
grant execute on function public.hdar_area_hide(p_self text, p_id uuid) to authenticated;
revoke execute on function public.hdar_area_send(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_body text) from public, anon;
grant execute on function public.hdar_area_send(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_body text) to authenticated;
revoke execute on function public.hdar_block(p_self text, p_other text) from public, anon;
grant execute on function public.hdar_block(p_self text, p_other text) to authenticated;
revoke execute on function public.hdar_conversation_hide(p_self text, p_other text) from public, anon;
grant execute on function public.hdar_conversation_hide(p_self text, p_other text) to authenticated;
revoke execute on function public.hdar_conversations(p_self text) from public, anon;
grant execute on function public.hdar_conversations(p_self text) to authenticated;
revoke execute on function public.hdar_get_media(p_self text, p_id uuid) from public, anon;
grant execute on function public.hdar_get_media(p_self text, p_id uuid) to authenticated;
revoke execute on function public.hdar_go_dark(p_self text) from public, anon;
grant execute on function public.hdar_go_dark(p_self text) to authenticated;
revoke execute on function public.hdar_hit(p_self text) from public, anon;
grant execute on function public.hdar_hit(p_self text) to authenticated;
revoke execute on function public.hdar_list_live(p_self text) from public, anon;
grant execute on function public.hdar_list_live(p_self text) to authenticated;
revoke execute on function public.hdar_profile_extras(p_self text, p_id text) from public, anon;
grant execute on function public.hdar_profile_extras(p_self text, p_id text) to authenticated;
revoke execute on function public.hdar_profile_get(p_self text, p_id text) from public, anon;
grant execute on function public.hdar_profile_get(p_self text, p_id text) to authenticated;
revoke execute on function public.hdar_profile_save(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photos jsonb, p_voice text, p_voice_sec integer) from public, anon;
grant execute on function public.hdar_profile_save(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photos jsonb, p_voice text, p_voice_sec integer) to authenticated;
revoke execute on function public.hdar_profile_set(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photo text) from public, anon;
grant execute on function public.hdar_profile_set(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photo text) to authenticated;
revoke execute on function public.hdar_pulse(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_desires text, p_hours integer) from public, anon;
grant execute on function public.hdar_pulse(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_desires text, p_hours integer) to authenticated;
revoke execute on function public.hdar_read_thread(p_self text, p_with text) from public, anon;
grant execute on function public.hdar_read_thread(p_self text, p_with text) to authenticated;
revoke execute on function public.hdar_report(p_self text, p_other text) from public, anon;
grant execute on function public.hdar_report(p_self text, p_other text) to authenticated;
revoke execute on function public.hdar_report_reason(p_self text, p_other text, p_reason text) from public, anon;
grant execute on function public.hdar_report_reason(p_self text, p_other text, p_reason text) to authenticated;
revoke execute on function public.hdar_send(p_self text, p_to text, p_body text) from public, anon;
grant execute on function public.hdar_send(p_self text, p_to text, p_body text) to authenticated;
revoke execute on function public.hdar_send_media(p_self text, p_to text, p_kind text, p_media text, p_duration integer) from public, anon;
grant execute on function public.hdar_send_media(p_self text, p_to text, p_kind text, p_media text, p_duration integer) to authenticated;
revoke execute on function public.hdar_signal_poll(p_self text, p_after bigint) from public, anon;
grant execute on function public.hdar_signal_poll(p_self text, p_after bigint) to authenticated;
revoke execute on function public.hdar_signal_send(p_self text, p_to text, p_kind text, p_payload text) from public, anon;
grant execute on function public.hdar_signal_send(p_self text, p_to text, p_kind text, p_payload text) to authenticated;
revoke execute on function public.hdar_spot_close(p_self text, p_id uuid) from public, anon;
grant execute on function public.hdar_spot_close(p_self text, p_id uuid) to authenticated;
revoke execute on function public.hdar_spot_create(p_self text, p_title text, p_hours integer, p_lat double precision, p_lng double precision, p_pseudo text) from public, anon;
grant execute on function public.hdar_spot_create(p_self text, p_title text, p_hours integer, p_lat double precision, p_lng double precision, p_pseudo text) to authenticated;
revoke execute on function public.hdar_spot_list(p_self text, p_lat double precision, p_lng double precision) from public, anon;
grant execute on function public.hdar_spot_list(p_self text, p_lat double precision, p_lng double precision) to authenticated;
revoke execute on function public.hdar_spot_messages(p_self text, p_id uuid) from public, anon;
grant execute on function public.hdar_spot_messages(p_self text, p_id uuid) to authenticated;
revoke execute on function public.hdar_spot_msg_hide(p_self text, p_id uuid) from public, anon;
grant execute on function public.hdar_spot_msg_hide(p_self text, p_id uuid) to authenticated;
revoke execute on function public.hdar_spot_send(p_self text, p_id uuid, p_pseudo text, p_body text) from public, anon;
grant execute on function public.hdar_spot_send(p_self text, p_id uuid, p_pseudo text, p_body text) to authenticated;
revoke execute on function public.hdar_thread(p_self text, p_with text) from public, anon;
grant execute on function public.hdar_thread(p_self text, p_with text) to authenticated;

revoke execute on function public.hdar_claim(text) from public, anon;
grant execute on function public.hdar_claim(text) to authenticated;
revoke execute on function hdar.self_id(), hdar.admin_check(text) from public, anon, authenticated;

commit;

-- Nommer un admin (remplacer par l'auth.uid affiché en bas de /admin) :
-- insert into hdar.admins (auth_user_id, note) values ('<UUID>', 'moi');
