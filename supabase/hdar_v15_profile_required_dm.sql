-- hdar v15 — messages privés réservés aux personnes ayant créé leur profil (photo facultative)
create or replace function hdar.require_profile(p_user text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from hdar.profiles p where p.user_id = p_user and p.profile_at is not null) then
    raise exception 'Crée ton profil pour envoyer un message privé';
  end if;
end $$;
revoke execute on function hdar.require_profile(text) from public, anon, authenticated;


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
  perform hdar.require_profile(s);
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
  perform hdar.require_profile(s);
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

CREATE OR REPLACE FUNCTION public.hdar_send_location(p_self text, p_to text, p_lat double precision, p_lng double precision, p_minutes integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  t text := lower(left(coalesce(p_to, ''), 80));
  mins int := case when p_minutes in (0, 15, 60) then p_minutes else 60 end;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'msg', 20, interval '1 minute');
  perform hdar.rate_check(s, 'location', 10, interval '1 hour');
  if t = '' or t = s then return; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position invalide';
  end if;
  if hdar.is_blocked(s, t) then return; end if;
  perform hdar.flood_check(s);
  insert into hdar.live_messages (thread_id, from_id, body, kind, media, duration)
  values (hdar.thread_of(s, t), s, round(p_lat::numeric, 6)::text || ',' || round(p_lng::numeric, 6)::text,
          'location', null, mins);
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
  if p_kind = 'offer' then perform hdar.require_profile(s); end if;
  perform hdar.rate_check(s, 'signal', 120, interval '1 minute');
  if t = s or p_kind not in ('offer', 'answer', 'hangup') then return; end if;
  if length(coalesce(p_payload, '')) > 20000 then raise exception 'Signal trop gros'; end if;
  if hdar.is_blocked(s, t) then return; end if;
  if (select count(*) from hdar.rtc_signals where from_id = s and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop d''appels, patiente un peu';
  end if;
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (t, s, p_kind, coalesce(p_payload, ''));
end $function$;

