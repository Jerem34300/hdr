-- v52c : nouveau principe — une personne diffuse (« Inviter »), les spectateurs regardent seulement.
-- Le partenaire 1:1 reste en privé (P2P) et n'est jamais envoyé au salon. Plus de passage « à l'image ».
alter table hdar.live_settings add column if not exists viewer_cap int not null default 6;
alter table hdar.live_settings add column if not exists viewer_cap_premium int not null default 12;
drop function if exists public.hdar_room_request(uuid);
drop function if exists public.hdar_room_decide(bigint, boolean);
drop function if exists public.hdar_room_invite(uuid, text);
drop function if exists public.hdar_room_invites();
drop function if exists public.hdar_room_invite_answer(bigint, boolean, float8, float8);
drop function if exists public.hdar_room_step_down(uuid);
drop function if exists hdar.room_promote(uuid, text);
drop function if exists public.hdar_room_open(text, float8, float8);
drop table if exists hdar.live_join_requests;

create or replace function hdar.room_gc() returns void language plpgsql security definer set search_path to '' as $$
declare m record;
begin
  for m in select room, user_id from hdar.live_room_members where left_at is null and seen_at < now() - interval '30 seconds' limit 200 loop
    perform hdar.room_member_close(m.room, m.user_id);
  end loop;
  update hdar.live_rooms r set ended_at = now() where ended_at is null and created_at < now() - interval '20 seconds'
    and not exists (select 1 from hdar.live_room_members x where x.room = r.id and x.role = 'stage' and x.left_at is null);
  for m in select x.room, x.user_id from hdar.live_room_members x join hdar.live_rooms r on r.id = x.room where r.ended_at is not null and x.left_at is null limit 200 loop
    perform hdar.room_member_close(m.room, m.user_id);
  end loop;
  delete from hdar.live_room_messages where at < now() - interval '24 hours';
  delete from hdar.live_bans where until < now();
  delete from hdar.live_rooms where ended_at < now() - interval '1 day';
  delete from hdar.live_group_usage where at < now() - interval '400 days';
end $$;

create or replace function hdar.room_cap(p_room uuid) returns int language sql stable security definer set search_path to '' as $$
  select case when hdar.is_premium(r.host) then s.viewer_cap_premium else s.viewer_cap end from hdar.live_rooms r, hdar.live_settings s where r.id = p_room and s.id = 1;
$$;
create or replace function hdar.room_viewers(p_room uuid) returns int language sql stable security definer set search_path to '' as $$
  select count(*)::int from hdar.live_room_members where room = p_room and role = 'viewer' and left_at is null;
$$;

-- « Inviter » : j'ouvre ma diffusion aux gens qui font défiler le Live
create or replace function public.hdar_room_open(p_lat float8 default null, p_lng float8 default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r uuid; la float8; lo float8; o uuid;
begin
  perform hdar.live_require(s);
  perform hdar.rate_check(s, 'room_open', 10, interval '10 minutes');
  perform hdar.room_gc();
  select x.room into r from hdar.live_room_members x join hdar.live_rooms lr on lr.id = x.room where x.user_id = s and x.role = 'stage' and x.left_at is null and lr.ended_at is null limit 1;
  if r is not null then return jsonb_build_object('room', r); end if;
  if hdar.room_full() then raise exception 'room_full: Live à plusieurs complet, réessaie plus tard'; end if;
  select x.la, x.lo into la, lo from hdar.room_pos(p_lat, p_lng, s) x;
  if la is null then raise exception 'live_nopos: active ta position'; end if;
  for o in select room from hdar.live_room_members where user_id = s and left_at is null loop perform hdar.room_member_close(o, s); end loop;
  insert into hdar.live_rooms (host) values (s) returning id into r;
  insert into hdar.live_room_members (room, user_id, role, lat, lng) values (r, s, 'stage', la, lo);
  return jsonb_build_object('room', r);
end $$;

create or replace function public.hdar_room_feed(p_lat float8 default null, p_lng float8 default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); la float8; lo float8;
begin
  perform hdar.live_require(s);
  perform hdar.room_gc();
  select x.la, x.lo into la, lo from hdar.room_pos(p_lat, p_lng, s) x;
  if la is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'host', r.host, 'pseudo', p.pseudo, 'viewers', hdar.room_viewers(r.id), 'cap', hdar.room_cap(r.id)) order by r.created_at desc)
    from hdar.live_rooms r left join hdar.profiles p on p.user_id = r.host
    where r.ended_at is null and not r.killed and r.host <> s and not hdar.is_blocked(s, r.host)
      and not exists (select 1 from hdar.live_bans b where b.host = r.host and b.user_id = s and b.until > now())
      and (hdar.room_viewers(r.id) < hdar.room_cap(r.id) or exists (select 1 from hdar.live_room_members x where x.room = r.id and x.user_id = s and x.left_at is null))
      and not hdar.room_tooclose(r.id, la, lo, s)), '[]'::jsonb);
end $$;

-- entrer comme spectateur (places limitées, vérifié ici, appelé par hdar-live-token) ; l'hôte reprend sa diffusion
create or replace function public.hdar_room_join(p_room uuid, p_lat float8 default null, p_lng float8 default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r hdar.live_rooms; la float8; lo float8; role text; o uuid;
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
  select x.la, x.lo into la, lo from hdar.room_pos(p_lat, p_lng, s) x;
  if la is null then raise exception 'live_nopos: active ta position'; end if;
  if hdar.room_tooclose(p_room, la, lo, s) then raise exception 'live_tooclose: vous êtes trop proches pour le Live'; end if;
  perform 1 from hdar.live_rooms where id = p_room for update; -- sérialise les places
  if not exists (select 1 from hdar.live_room_members x where x.room = p_room and x.user_id = s and x.left_at is null) then
    if hdar.room_viewers(p_room) >= hdar.room_cap(p_room) then raise exception 'room_viewers_full: ce Live est complet'; end if;
    if hdar.room_full() then raise exception 'room_full: Live à plusieurs complet, réessaie plus tard'; end if;
    for o in select room from hdar.live_room_members where user_id = s and left_at is null and room <> p_room loop perform hdar.room_member_close(o, s); end loop;
    delete from hdar.live_room_members where room = p_room and user_id = s;
    insert into hdar.live_room_members (room, user_id, role, lat, lng) values (p_room, s, 'viewer', la, lo);
  else
    update hdar.live_room_members set seen_at = now(), lat = la, lng = lo where room = p_room and user_id = s;
  end if;
  return jsonb_build_object('room', p_room, 'role', 'viewer', 'identity', s, 'pseudo', (select pseudo from hdar.profiles where user_id = s));
end $$;

create or replace function public.hdar_room_state(p_room uuid, p_after bigint default 0) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); role text; r hdar.live_rooms;
begin
  update hdar.live_room_members set seen_at = now() where room = p_room and user_id = s and left_at is null returning live_room_members.role into role;
  select * into r from hdar.live_rooms where id = p_room;
  if role is null or r.ended_at is not null or r.killed then
    return jsonb_build_object('gone', true, 'banned', exists (select 1 from hdar.live_bans b where b.host = r.host and b.user_id = s and b.until > now()));
  end if;
  return jsonb_build_object('role', role, 'host', r.host, 'host_pseudo', (select pseudo from hdar.profiles where user_id = r.host),
    'host_premium', hdar.is_premium(r.host), 'viewers', hdar.room_viewers(p_room), 'cap', hdar.room_cap(p_room),
    'viewer_list', case when role = 'stage' then coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'pseudo', p.pseudo)) from (select * from hdar.live_room_members x where x.room = p_room and x.role = 'viewer' and x.left_at is null order by joined_at desc limit 50) x left join hdar.profiles p on p.user_id = x.user_id), '[]') else '[]' end,
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.from_id, 'pseudo', p.pseudo, 'kind', m.kind, 'body', m.body) order by m.id)
       from (select * from hdar.live_room_messages m where m.room = p_room and m.id > p_after and not m.hidden and not hdar.is_blocked(s, m.from_id) order by id desc limit 40) m
       left join hdar.profiles p on p.user_id = m.from_id), '[]'));
end $$;

-- l'hôte fait sortir un spectateur (p_kick : banni 24 h de ses Lives)
create or replace function public.hdar_room_remove(p_room uuid, p_user text, p_kick boolean) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); u text := lower(left(coalesce(p_user, ''), 80));
begin
  if not exists (select 1 from hdar.live_rooms where id = p_room and host = s) then raise exception 'room_nothost: réservé à la personne qui diffuse'; end if;
  if u = s then raise exception 'room_self: impossible sur toi-même'; end if;
  if p_kick then insert into hdar.live_bans (host, user_id, until) values (s, u, now() + interval '24 hours') on conflict (host, user_id) do update set until = excluded.until; end if;
  perform hdar.room_member_close(p_room, u);
  return jsonb_build_object('identity', u, 'action', 'kick');
end $$;

create or replace function public.hdar_admin_live_settings(p_key text, p_free int, p_minutes int, p_concurrent int, p_enabled boolean, p_cap int default null, p_cap_premium int default null) returns void language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.live_settings set month_minutes_cap = coalesce(greatest(p_minutes, 0), month_minutes_cap),
    concurrent_cap = coalesce(greatest(p_concurrent, 0), concurrent_cap), enabled = coalesce(p_enabled, enabled),
    viewer_cap = coalesce(least(greatest(p_cap, 1), 100), viewer_cap), viewer_cap_premium = coalesce(least(greatest(p_cap_premium, 1), 100), viewer_cap_premium) where id = 1;
end $$;
drop function if exists public.hdar_admin_live_settings(text, int, int, int, boolean);

create or replace function public.hdar_admin_live_rooms(p_key text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  perform hdar.room_gc();
  return jsonb_build_object('usage', hdar.room_usage(), 'settings', (select to_jsonb(s) from hdar.live_settings s where id = 1),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'host', p.pseudo, 'since', r.created_at, 'viewers', hdar.room_viewers(r.id), 'cap', hdar.room_cap(r.id),
      'msgs', (select count(*) from hdar.live_room_messages m where m.room = r.id)) order by r.created_at desc)
      from hdar.live_rooms r left join hdar.profiles p on p.user_id = r.host where r.ended_at is null), '[]'));
end $$;
