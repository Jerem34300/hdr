-- hdar v11 — partage de position exacte dans un chat privé (action explicite, expirable)
alter table hdar.live_messages drop constraint if exists live_messages_kind_check;
alter table hdar.live_messages add constraint live_messages_kind_check
  check (kind = any (array['text', 'image', 'audio', 'location']));

-- p_minutes : 15, 60 ou 0 (sans expiration). Body = "lat,lng" ; masqué après expiration.
create or replace function public.hdar_send_location(p_self text, p_to text, p_lat double precision, p_lng double precision, p_minutes integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  s text := hdar.self_id();
  t text := lower(left(coalesce(p_to, ''), 80));
  mins int := case when p_minutes in (0, 15, 60) then p_minutes else 60 end;
begin
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
end $$;
revoke execute on function public.hdar_send_location(text, text, double precision, double precision, integer) from public, anon;
grant execute on function public.hdar_send_location(text, text, double precision, double precision, integer) to authenticated;

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
    select m.id, m.from_id, case when m.kind = 'location' and m.duration > 0 and m.created_at + make_interval(mins => m.duration) < now() then '' else m.body end, m.created_at::text, m.kind, m.duration
    from (
      select * from hdar.live_messages lm
      where lm.thread_id = hdar.thread_of(s, w)
        and (since is null or lm.created_at > since)
      order by lm.created_at desc
      limit 200
    ) m
    order by m.created_at asc;
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
    select m.id, m.from_id, case when m.kind = 'location' then '' else m.body end, m.created_at::text
    from (
      select * from hdar.live_messages
      where thread_id = hdar.thread_of(s, w)
      order by created_at desc
      limit 200
    ) m
    order by m.created_at asc;
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
    select c.other, coalesce(p.pseudo, 'Anonyme'), c.kind, case when c.kind = 'location' then '' else c.body end, c.created_at::text, c.from_id = s
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
