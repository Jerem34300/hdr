-- hdar v8 — anti-spam côté serveur (limites par utilisateur et par fenêtre)
create table if not exists hdar.rate_limits (
  user_id text not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket)
);
alter table hdar.rate_limits enable row level security;

create or replace function hdar.rate_check(p_user text, p_bucket text, p_max int, p_window interval)
returns void language plpgsql volatile set search_path = '' as $$
declare h int;
begin
  insert into hdar.rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning hits into h;
  if h > p_max then raise exception 'Doucement : trop de messages, réessaie dans un instant'; end if;
end $$;
revoke execute on function hdar.rate_check(text, text, int, interval) from public, anon, authenticated;


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
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
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
  perform hdar.rate_check(s, 'pulse', 12, interval '1 minute');
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
  perform hdar.rate_check(s, 'msg', 20, interval '1 minute');
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
  perform hdar.rate_check(s, 'msg', 20, interval '1 minute');
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
  perform hdar.rate_check(s, 'signal', 120, interval '1 minute');
  if t = s or p_kind not in ('offer', 'answer', 'hangup') then return; end if;
  if length(coalesce(p_payload, '')) > 20000 then raise exception 'Signal trop gros'; end if;
  if hdar.is_blocked(s, t) then return; end if;
  if (select count(*) from hdar.rtc_signals where from_id = s and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop d''appels, patiente un peu';
  end if;
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (t, s, p_kind, coalesce(p_payload, ''));
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
  perform hdar.rate_check(s, 'spot', 5, interval '1 hour');
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
