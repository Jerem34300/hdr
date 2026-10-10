-- Applied as migrations hdar_media_columns, hdar_media_functions, hdar_calls, hdar_spots.
-- No DROP/DELETE: places are closed and spot messages hidden instead of removed.

-- Media messages (photo / voice) ------------------------------------------
alter table hdar.live_messages
  add column if not exists kind text not null default 'text' check (kind in ('text', 'image', 'audio')),
  add column if not exists media text,
  add column if not exists duration int;

-- New name instead of changing hdar_read_thread's return type (that would need a DROP).
create or replace function public.hdar_thread(p_self text, p_with text)
returns table (id uuid, from_id text, body text, at text, kind text, duration int)
language plpgsql stable security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  w text := lower(left(coalesce(p_with, ''), 80));
begin
  if w = '' or w = s then return; end if;
  return query
    select m.id, m.from_id, m.body, m.created_at::text, m.kind, m.duration
    from (
      select * from hdar.live_messages
      where thread_id = hdar.thread_of(s, w)
      order by created_at desc
      limit 200
    ) m
    order by m.created_at asc;
end $$;

create or replace function hdar.flood_check(s text) returns void
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from hdar.live_messages
      where from_id = s and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de messages, patiente un peu';
  end if;
end $$;

create or replace function public.hdar_send_media(
  p_self text, p_to text, p_kind text, p_media text, p_duration int
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
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
end $$;

create or replace function public.hdar_get_media(p_self text, p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  -- Only the two people in the conversation can load its media.
  return (
    select m.media from hdar.live_messages m
    where m.id = p_id
      and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s)
  );
end $$;

-- Video call signaling (WebRTC offer / answer / hangup) --------------------
create table if not exists hdar.rtc_signals (
  id bigserial primary key,
  to_id text not null,
  from_id text not null,
  kind text not null check (kind in ('offer', 'answer', 'hangup')),
  payload text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists rtc_signals_to_idx on hdar.rtc_signals (to_id, id);
alter table hdar.rtc_signals enable row level security;

create or replace function public.hdar_signal_send(p_self text, p_to text, p_kind text, p_payload text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  t text := hdar.check_id(p_to);
begin
  if t = s or p_kind not in ('offer', 'answer', 'hangup') then return; end if;
  if length(coalesce(p_payload, '')) > 20000 then raise exception 'Signal trop gros'; end if;
  if hdar.is_blocked(s, t) then return; end if;
  if (select count(*) from hdar.rtc_signals where from_id = s and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop d''appels, patiente un peu';
  end if;
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (t, s, p_kind, coalesce(p_payload, ''));
end $$;

-- Cursor-based: the client passes the last id it has seen (0 on first poll).
create or replace function public.hdar_signal_poll(p_self text, p_after bigint)
returns table (id bigint, from_id text, pseudo text, kind text, payload text)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  return query
    select r.id, r.from_id, coalesce(p.pseudo, 'Anonyme'), r.kind, r.payload
    from hdar.rtc_signals r left join hdar.profiles p on p.user_id = r.from_id
    where r.to_id = s and r.id > coalesce(p_after, 0) and r.created_at > now() - interval '45 seconds'
    order by r.id
    limit 20;
end $$;

-- Shared places (lieux) ------------------------------------------------------
create table if not exists hdar.spots (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null,
  title text not null,
  lat double precision not null,
  lng double precision not null,
  closes_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists spots_open_idx on hdar.spots (closes_at);

create table if not exists hdar.spot_messages (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references hdar.spots (id),
  from_id text not null,
  pseudo text not null,
  body text not null,
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists spot_messages_spot_idx on hdar.spot_messages (spot_id, created_at);

alter table hdar.spots enable row level security;
alter table hdar.spot_messages enable row level security;

create or replace function public.hdar_spot_create(
  p_self text, p_title text, p_hours int, p_lat double precision, p_lng double precision, p_pseudo text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
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
end $$;

create or replace function public.hdar_spot_list(p_self text, p_lat double precision, p_lng double precision)
returns table (id uuid, title text, lat double precision, lng double precision, closes_at text, mine boolean, members bigint)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  return query
    select sp.id, sp.title, sp.lat, sp.lng, sp.closes_at::text, sp.creator_id = s,
      (select count(distinct m.from_id) from hdar.spot_messages m where m.spot_id = sp.id)
    from hdar.spots sp
    where sp.closes_at > now()
      and (sp.creator_id = s or (
        abs(sp.lat - coalesce(p_lat, sp.lat)) < 1 and abs(sp.lng - coalesce(p_lng, sp.lng)) < 1.5
        and not hdar.is_blocked(s, sp.creator_id)))
    order by sp.created_at desc
    limit 200;
end $$;

-- Deleting a place closes it immediately: it disappears for everyone.
create or replace function public.hdar_spot_close(p_self text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  update hdar.spots set closes_at = now() where id = p_id and creator_id = s and closes_at > now();
  return found;
end $$;

create or replace function public.hdar_spot_messages(p_self text, p_id uuid)
returns table (id uuid, from_id text, pseudo text, body text, at text, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
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
end $$;

create or replace function public.hdar_spot_send(p_self text, p_id uuid, p_pseudo text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
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
end $$;

-- The author or the place's creator may hide a message.
create or replace function public.hdar_spot_msg_hide(p_self text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  update hdar.spot_messages m set removed = true
  where m.id = p_id
    and (m.from_id = s or exists (select 1 from hdar.spots sp where sp.id = m.spot_id and sp.creator_id = s));
end $$;

-- Permissions ----------------------------------------------------------------
revoke execute on function hdar.flood_check(text) from public, anon, authenticated;
revoke execute on function
  public.hdar_thread(text, text),
  public.hdar_send_media(text, text, text, text, int), public.hdar_get_media(text, uuid),
  public.hdar_signal_send(text, text, text, text), public.hdar_signal_poll(text, bigint),
  public.hdar_spot_create(text, text, int, double precision, double precision, text),
  public.hdar_spot_list(text, double precision, double precision), public.hdar_spot_close(text, uuid),
  public.hdar_spot_messages(text, uuid), public.hdar_spot_send(text, uuid, text, text),
  public.hdar_spot_msg_hide(text, uuid)
  from public, authenticated;
grant execute on function
  public.hdar_thread(text, text),
  public.hdar_send_media(text, text, text, text, int), public.hdar_get_media(text, uuid),
  public.hdar_signal_send(text, text, text, text), public.hdar_signal_poll(text, bigint),
  public.hdar_spot_create(text, text, int, double precision, double precision, text),
  public.hdar_spot_list(text, double precision, double precision), public.hdar_spot_close(text, uuid),
  public.hdar_spot_messages(text, uuid), public.hdar_spot_send(text, uuid, text, text),
  public.hdar_spot_msg_hide(text, uuid)
  to anon;
