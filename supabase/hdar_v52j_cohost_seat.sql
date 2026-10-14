CREATE OR REPLACE FUNCTION public.hdar_room_join(p_room uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); r hdar.live_rooms; la float8; lo float8; role text; o uuid; co boolean;
begin
  perform hdar.live_require(s);
  perform hdar.rate_check(s, 'room_join', 60, interval '1 minute');
  perform hdar.room_gc();
  select * into r from hdar.live_rooms where id = p_room;
  if r.id is null or r.ended_at is not null or r.killed then raise exception 'room_gone: ce Live est terminé'; end if;
  if r.host = s then
    update hdar.live_room_members set seen_at = now() where room = p_room and user_id = s and left_at is null returning live_room_members.role into role;
    if role is null then raise exception 'room_gone: ce Live est terminé'; end if;
    return jsonb_build_object('room', p_room, 'role', 'stage', 'identity', s, 'pseudo', (select pseudo from hdar.profiles where user_id = s));
  end if;
  if exists (select 1 from hdar.live_bans b where b.host = r.host and b.user_id = s and b.until > now()) then raise exception 'room_banned: tu ne peux plus entrer dans les Lives de cette personne aujourd''hui'; end if;
  if hdar.is_blocked(s, r.host) then raise exception 'room_gone: ce Live n''est pas disponible'; end if;
  -- partenaire actuel du 1:1 du diffuseur : co-diffuseur, ne prend pas de place spectateur
  co := exists (select 1 from hdar.live_queue q where (q.user_id = r.host and q.peer_id = s) or (q.user_id = s and q.peer_id = r.host));
  select x.la, x.lo into la, lo from hdar.room_pos(p_lat, p_lng, s) x;
  if la is null then raise exception 'live_nopos: active ta position'; end if;
  if not co and hdar.room_tooclose(p_room, la, lo, s) then raise exception 'live_tooclose: vous êtes trop proches pour le Live'; end if;
  perform 1 from hdar.live_rooms where id = p_room for update;
  if not exists (select 1 from hdar.live_room_members x where x.room = p_room and x.user_id = s and x.left_at is null) then
    if not co and hdar.room_viewers(p_room) >= hdar.room_cap(p_room) then raise exception 'room_viewers_full: ce Live est complet'; end if;
    if hdar.room_full() then raise exception 'room_full: Live à plusieurs complet, réessaie plus tard'; end if;
    for o in select room from hdar.live_room_members where user_id = s and left_at is null and room <> p_room loop perform hdar.room_member_close(o, s); end loop;
    delete from hdar.live_room_members where room = p_room and user_id = s;
    insert into hdar.live_room_members (room, user_id, role, lat, lng) values (p_room, s, case when co then 'co' else 'viewer' end, la, lo);
  else
    update hdar.live_room_members set seen_at = now(), lat = la, lng = lo, role = case when co then 'co' else live_room_members.role end where room = p_room and user_id = s;
  end if;
  return jsonb_build_object('room', p_room, 'role', case when co then 'co' else 'viewer' end, 'identity', s, 'pseudo', (select pseudo from hdar.profiles where user_id = s));
end $function$;
