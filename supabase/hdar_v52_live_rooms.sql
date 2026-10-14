-- v52 : Live à plusieurs (salons LiveKit) dans le Live existant.
create table if not exists hdar.live_settings (id int primary key default 1 check (id = 1),
  free_requests_day int not null default 1, month_minutes_cap int not null default 5000, concurrent_cap int not null default 100, stage_max int not null default 4, enabled boolean not null default true);
insert into hdar.live_settings (id) values (1) on conflict do nothing;
create table if not exists hdar.live_rooms (id uuid primary key default gen_random_uuid(), host text not null, created_at timestamptz not null default now(),
  ended_at timestamptz, killed boolean not null default false);
create index if not exists live_rooms_open_idx on hdar.live_rooms (created_at) where ended_at is null;
create table if not exists hdar.live_room_members (room uuid not null references hdar.live_rooms(id) on delete cascade, user_id text not null,
  role text not null default 'viewer' check (role in ('viewer','stage')), lat double precision, lng double precision,
  joined_at timestamptz not null default now(), seen_at timestamptz not null default now(), left_at timestamptz, primary key (room, user_id));
create index if not exists live_room_members_user_idx on hdar.live_room_members (user_id) where left_at is null;
create table if not exists hdar.live_join_requests (id bigserial primary key, room uuid not null references hdar.live_rooms(id) on delete cascade,
  user_id text not null, from_id text not null, kind text not null check (kind in ('request','invite')),
  status text not null default 'pending' check (status in ('pending','accepted','refused','cancelled')), created_at timestamptz not null default now());
create index if not exists live_join_requests_room_idx on hdar.live_join_requests (room, status);
create index if not exists live_join_requests_user_idx on hdar.live_join_requests (user_id, status);
create table if not exists hdar.live_room_messages (id bigserial primary key, room uuid not null references hdar.live_rooms(id) on delete cascade,
  from_id text not null, kind text not null default 'msg' check (kind in ('msg','react','sys')), body text not null, hidden boolean not null default false, at timestamptz not null default now());
create index if not exists live_room_messages_room_idx on hdar.live_room_messages (room, id);
create table if not exists hdar.live_bans (host text not null, user_id text not null, until timestamptz not null, primary key (host, user_id));
create table if not exists hdar.live_group_usage (id bigserial primary key, room uuid, user_id text, minutes numeric not null, at timestamptz not null default now());
alter table hdar.live_settings enable row level security; alter table hdar.live_rooms enable row level security;
alter table hdar.live_room_members enable row level security; alter table hdar.live_join_requests enable row level security;
alter table hdar.live_room_messages enable row level security; alter table hdar.live_bans enable row level security;
alter table hdar.live_group_usage enable row level security;
-- minutes Live à plusieurs aussi journalisées dans live_events (outcome 'group', ms = durée)
alter table hdar.live_events drop constraint if exists live_events_outcome_check;
alter table hdar.live_events add constraint live_events_outcome_check check (outcome in ('video','failed','abandon','timeout','group'));

-- ferme une présence et comptabilise ses minutes
create or replace function hdar.room_member_close(p_room uuid, p_user text) returns void language plpgsql security definer set search_path to '' as $$
declare j timestamptz; z timestamptz;
begin
  update hdar.live_room_members set left_at = least(now(), seen_at + interval '30 seconds') where room = p_room and user_id = p_user and left_at is null returning joined_at, left_at into j, z;
  if j is not null then
    insert into hdar.live_group_usage (room, user_id, minutes) values (p_room, p_user, round(extract(epoch from (z - j)) / 60.0, 2));
    insert into hdar.live_events (outcome, ms, ice) values ('group', least(extract(epoch from (z - j)) * 1000, 2000000000)::int, 'unknown');
  end if;
end $$;

-- ménage : présences fantômes (> 30 s), salons sans personne à l'image, chat > 24 h (RGPD)
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
  update hdar.live_join_requests set status = 'cancelled' where status = 'pending' and created_at < now() - interval '2 minutes';
  delete from hdar.live_room_messages where at < now() - interval '24 hours';
  delete from hdar.live_join_requests where created_at < now() - interval '1 day';
  delete from hdar.live_bans where until < now();
  delete from hdar.live_rooms where ended_at < now() - interval '1 day';
  delete from hdar.live_group_usage where at < now() - interval '400 days';
end $$;

create or replace function hdar.room_pos(p_lat float8, p_lng float8, s text, out la float8, out lo float8) language plpgsql stable security definer set search_path to '' as $$
begin
  if p_lat between -90 and 90 and p_lng between -180 and 180 then la := round(p_lat * 200) / 200; lo := round(p_lng * 200) / 200; end if;
  if la is null then select round(lat * 200) / 200, round(lng * 200) / 200 into la, lo from hdar.profiles where user_id = s; end if;
end $$;

-- règle des 2 km : vrai si quelqu'un à l'image est à 2 km ou moins (ou position inconnue)
create or replace function hdar.room_tooclose(p_room uuid, la float8, lo float8, s text) returns boolean language sql stable security definer set search_path to '' as $$
  select la is null or exists (select 1 from hdar.live_room_members x where x.room = p_room and x.left_at is null and x.role = 'stage' and x.user_id <> s
    and (x.lat is null or hdar.live_km(la, lo, x.lat, x.lng) <= 2));
$$;

create or replace function hdar.room_usage() returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'month_minutes', round(coalesce((select sum(minutes) from hdar.live_group_usage where at >= date_trunc('month', now())), 0)
       + coalesce((select sum(extract(epoch from (now() - joined_at)) / 60.0) from hdar.live_room_members where left_at is null), 0)),
    'concurrent', (select count(*) from hdar.live_room_members where left_at is null),
    'rooms', (select count(*) from hdar.live_rooms where ended_at is null),
    'cap_minutes', (select month_minutes_cap from hdar.live_settings where id = 1),
    'cap_concurrent', (select concurrent_cap from hdar.live_settings where id = 1));
$$;

create or replace function hdar.room_full() returns boolean language sql stable security definer set search_path to '' as $$
  select not st.enabled or (u->>'month_minutes')::numeric >= st.month_minutes_cap or (u->>'concurrent')::int >= st.concurrent_cap
  from hdar.live_settings st, hdar.room_usage() u where st.id = 1;
$$;

create or replace function hdar.room_stage_check(p_room uuid, s text) returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not exists (select 1 from hdar.live_room_members where room = p_room and user_id = s and role = 'stage' and left_at is null) then
    raise exception 'room_notstage: réservé aux personnes à l''image';
  end if;
end $$;

-- 1:1 -> salon. Le partenaire passe aussi à l'image (signal live-room).
create or replace function public.hdar_room_open(p_with text, p_lat float8 default null, p_lng float8 default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r uuid; w text := lower(left(coalesce(p_with, ''), 80)); la float8; lo float8; wla float8; wlo float8;
begin
  perform hdar.live_require(s);
  perform hdar.require_premium(s);
  perform hdar.rate_check(s, 'room_open', 10, interval '10 minutes');
  perform hdar.room_gc();
  if hdar.room_full() then raise exception 'room_full: Live à plusieurs complet, réessaie plus tard'; end if;
  select x.la, x.lo into la, lo from hdar.room_pos(p_lat, p_lng, s) x;
  if la is null then raise exception 'live_nopos: active ta position'; end if;
  -- quitte un éventuel autre salon
  for r in select room from hdar.live_room_members where user_id = s and left_at is null loop perform hdar.room_member_close(r, s); end loop;
  insert into hdar.live_rooms (host) values (s) returning id into r;
  insert into hdar.live_room_members (room, user_id, role, lat, lng) values (r, s, 'stage', la, lo);
  if w <> '' and exists (select 1 from hdar.live_queue where user_id = s and peer_id = w) then
    select lat, lng into wla, wlo from hdar.live_queue where user_id = w;
    insert into hdar.live_room_members (room, user_id, role, lat, lng) values (r, w, 'stage', wla, wlo) on conflict do nothing;
    insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (w, s, 'live-room', r::text);
  end if;
  delete from hdar.live_queue where user_id in (s, w);
  return jsonb_build_object('room', r);
end $$;

-- fil : salons ouverts visibles pour moi (règle des 2 km, bans, blocages)
create or replace function public.hdar_room_feed(p_lat float8 default null, p_lng float8 default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); la float8; lo float8;
begin
  perform hdar.live_require(s);
  perform hdar.room_gc();
  select x.la, x.lo into la, lo from hdar.room_pos(p_lat, p_lng, s) x;
  if la is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'host', r.host, 'pseudo', p.pseudo,
      'stage', (select count(*) from hdar.live_room_members x where x.room = r.id and x.role = 'stage' and x.left_at is null),
      'viewers', (select count(*) from hdar.live_room_members x where x.room = r.id and x.role = 'viewer' and x.left_at is null)) order by r.created_at desc)
    from hdar.live_rooms r left join hdar.profiles p on p.user_id = r.host
    where r.ended_at is null and not r.killed
      and not exists (select 1 from hdar.live_bans b where b.host = r.host and b.user_id = s and b.until > now())
      and not exists (select 1 from hdar.live_room_members x where x.room = r.id and x.left_at is null and x.role = 'stage' and (x.user_id = s or hdar.is_blocked(s, x.user_id)))
      and not hdar.room_tooclose(r.id, la, lo, s)), '[]'::jsonb);
end $$;

-- salon où se trouve quelqu'un (pour « Rejoindre son live » depuis un profil)
create or replace function public.hdar_room_of(p_user text) returns uuid language sql stable security definer set search_path to '' as $$
  select x.room from hdar.live_room_members x join hdar.live_rooms r on r.id = x.room
  where x.user_id = lower(p_user) and x.left_at is null and x.role = 'stage' and r.ended_at is null and not r.killed and hdar.self_id() is not null limit 1;
$$;

-- entrer comme spectateur (ou reprendre sa place) ; renvoie le rôle pour le jeton LiveKit
create or replace function public.hdar_room_join(p_room uuid, p_lat float8 default null, p_lng float8 default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r hdar.live_rooms; la float8; lo float8; role text; o uuid;
begin
  perform hdar.live_require(s);
  perform hdar.rate_check(s, 'room_join', 60, interval '1 minute');
  perform hdar.room_gc();
  select * into r from hdar.live_rooms where id = p_room;
  if r.id is null or r.ended_at is not null or r.killed then raise exception 'room_gone: ce Live est terminé'; end if;
  if exists (select 1 from hdar.live_bans b where b.host = r.host and b.user_id = s and b.until > now()) then raise exception 'room_banned: tu ne peux plus entrer dans les Lives de cette personne aujourd''hui'; end if;
  if exists (select 1 from hdar.live_room_members x where x.room = p_room and x.left_at is null and x.role = 'stage' and hdar.is_blocked(s, x.user_id)) then raise exception 'room_gone: ce Live n''est pas disponible'; end if;
  select x.la, x.lo into la, lo from hdar.room_pos(p_lat, p_lng, s) x;
  if la is null then raise exception 'live_nopos: active ta position'; end if;
  if hdar.room_tooclose(p_room, la, lo, s) then raise exception 'live_tooclose: vous êtes trop proches pour le Live'; end if;
  select x.role into role from hdar.live_room_members x where x.room = p_room and x.user_id = s and x.left_at is null;
  if role is null then
    if hdar.room_full() then raise exception 'room_full: Live à plusieurs complet, réessaie plus tard'; end if;
    for o in select room from hdar.live_room_members where user_id = s and left_at is null and room <> p_room loop perform hdar.room_member_close(o, s); end loop;
    delete from hdar.live_room_members where room = p_room and user_id = s;
    insert into hdar.live_room_members (room, user_id, role, lat, lng) values (p_room, s, 'viewer', la, lo);
    role := 'viewer';
  else
    update hdar.live_room_members set seen_at = now(), lat = la, lng = lo where room = p_room and user_id = s;
  end if;
  delete from hdar.live_queue where user_id = s;
  return jsonb_build_object('room', p_room, 'role', role, 'identity', s, 'pseudo', (select pseudo from hdar.profiles where user_id = s));
end $$;

-- état du salon (sondé ~1,5 s) : présence, rôles, demandes, chat
create or replace function public.hdar_room_state(p_room uuid, p_after bigint default 0) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); role text; r hdar.live_rooms;
begin
  update hdar.live_room_members set seen_at = now() where room = p_room and user_id = s and left_at is null returning live_room_members.role into role;
  select * into r from hdar.live_rooms where id = p_room;
  if role is null or r.ended_at is not null or r.killed then
    return jsonb_build_object('gone', true, 'banned', exists (select 1 from hdar.live_bans b where b.host = r.host and b.user_id = s and b.until > now()));
  end if;
  return jsonb_build_object('role', role, 'host', r.host,
    'stage', coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'pseudo', p.pseudo, 'premium', hdar.is_premium(x.user_id)) order by x.joined_at)
       from hdar.live_room_members x left join hdar.profiles p on p.user_id = x.user_id where x.room = p_room and x.role = 'stage' and x.left_at is null), '[]'),
    'viewers', (select count(*) from hdar.live_room_members x where x.room = p_room and x.role = 'viewer' and x.left_at is null),
    'viewer_list', case when role = 'stage' then coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'pseudo', p.pseudo)) from (select * from hdar.live_room_members x where x.room = p_room and x.role = 'viewer' and x.left_at is null order by joined_at desc limit 50) x left join hdar.profiles p on p.user_id = x.user_id), '[]') else '[]' end,
    'requests', case when role = 'stage' then coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'user', q.user_id, 'pseudo', p.pseudo, 'premium', hdar.is_premium(q.user_id)) order by hdar.is_premium(q.user_id) desc, q.id)
       from hdar.live_join_requests q left join hdar.profiles p on p.user_id = q.user_id where q.room = p_room and q.kind = 'request' and q.status = 'pending'), '[]') else '[]' end,
    'my_request', (select status from hdar.live_join_requests where room = p_room and user_id = s and kind = 'request' order by id desc limit 1),
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.from_id, 'pseudo', p.pseudo, 'kind', m.kind, 'body', m.body) order by m.id)
       from (select * from hdar.live_room_messages m where m.room = p_room and m.id > p_after and not m.hidden and not hdar.is_blocked(s, m.from_id) order by id desc limit 40) m
       left join hdar.profiles p on p.user_id = m.from_id), '[]'));
end $$;

create or replace function hdar.chat_clean(t text) returns text language plpgsql immutable set search_path to '' as $$
declare b text := btrim(left(coalesce(t, ''), 200));
begin
  -- pas d'e-mail ni de numéro de téléphone dans le chat
  if b ~* '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\s*(\.|dot)\s*[a-z]{2,}' then raise exception 'chat_filter: pas d''e-mail dans le chat'; end if;
  if regexp_replace(b, '[\s.\-()/]', '', 'g') ~ '(\+|00)?\d{9,}' then raise exception 'chat_filter: pas de numéro de téléphone dans le chat'; end if;
  return b;
end $$;

create or replace function public.hdar_room_say(p_room uuid, p_body text, p_kind text default 'msg') returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); b text;
begin
  if not exists (select 1 from hdar.live_room_members where room = p_room and user_id = s and left_at is null) then raise exception 'room_gone: tu n''es plus dans ce Live'; end if;
  if p_kind = 'react' then
    perform hdar.rate_check(s, 'room_react', 40, interval '1 minute');
    if p_body not in ('🔥','❤️','😏') then return; end if; b := p_body;
  else
    perform hdar.rate_check(s, 'room_say', 20, interval '1 minute');
    b := hdar.chat_clean(p_body); if b = '' then return; end if;
  end if;
  insert into hdar.live_room_messages (room, from_id, kind, body) values (p_room, s, case when p_kind = 'react' then 'react' else 'msg' end, b);
end $$;

-- demander à passer à l'image : 1 par jour gratuit (réglable), illimité et prioritaire avec hdar+
create or replace function public.hdar_room_request(p_room uuid) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int;
begin
  if not exists (select 1 from hdar.live_room_members where room = p_room and user_id = s and role = 'viewer' and left_at is null) then raise exception 'room_gone: entre d''abord dans le Live'; end if;
  if exists (select 1 from hdar.live_join_requests where room = p_room and user_id = s and status = 'pending') then return jsonb_build_object('ok', true); end if;
  perform hdar.rate_check(s, 'room_request', 10, interval '10 minutes');
  if not hdar.is_premium(s) then
    select count(*) into n from hdar.live_join_requests where user_id = s and from_id = s and kind = 'request' and created_at > now() - interval '24 hours';
    if n >= (select free_requests_day from hdar.live_settings where id = 1) then raise exception 'premium_required: 1 demande par jour en gratuit, illimité avec hdar+'; end if;
  end if;
  insert into hdar.live_join_requests (room, user_id, from_id, kind) values (p_room, s, s, 'request');
  return jsonb_build_object('ok', true);
end $$;

create or replace function hdar.room_promote(p_room uuid, p_user text) returns void language plpgsql security definer set search_path to '' as $$
begin
  if (select count(*) from hdar.live_room_members where room = p_room and role = 'stage' and left_at is null) >= (select stage_max from hdar.live_settings where id = 1) then
    raise exception 'room_stagefull: déjà 4 personnes à l''image';
  end if;
  update hdar.live_room_members set role = 'stage', seen_at = now() where room = p_room and user_id = p_user and left_at is null;
  if not found then raise exception 'room_gone: cette personne est partie'; end if;
end $$;

create or replace function public.hdar_room_decide(p_req bigint, p_accept boolean) returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); q hdar.live_join_requests;
begin
  select * into q from hdar.live_join_requests where id = p_req and kind = 'request' and status = 'pending' for update;
  if q.id is null then return; end if;
  perform hdar.room_stage_check(q.room, s);
  if p_accept then perform hdar.room_promote(q.room, q.user_id); end if;
  update hdar.live_join_requests set status = case when p_accept then 'accepted' else 'refused' end where id = p_req;
end $$;

-- inviter quelqu'un à l'image (spectateur, favori, conversation récente)
create or replace function public.hdar_room_invite(p_room uuid, p_user text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); u text := lower(left(coalesce(p_user, ''), 80)); ps text; la float8; lo float8; r hdar.live_rooms;
begin
  perform hdar.room_stage_check(p_room, s);
  perform hdar.rate_check(s, 'room_invite', 20, interval '10 minutes');
  select * into r from hdar.live_rooms where id = p_room;
  if u = s or hdar.is_blocked(s, u) or exists (select 1 from hdar.live_bans b where b.host = r.host and b.user_id = u and b.until > now()) then raise exception 'room_invite: invitation impossible'; end if;
  if not exists (select 1 from hdar.profiles where user_id = u and photo_status = 'approved' and age between 18 and 99) then raise exception 'room_invite: cette personne n''a pas de profil validé pour le Live'; end if;
  select lat, lng into la, lo from hdar.live_room_members where room = p_room and user_id = u and left_at is null;
  if la is null then select x.la, x.lo into la, lo from hdar.room_pos(null, null, u) x; end if;
  if hdar.room_tooclose(p_room, la, lo, u) then raise exception 'live_tooclose: vous êtes trop proches pour le Live'; end if;
  if exists (select 1 from hdar.live_join_requests where room = p_room and user_id = u and kind = 'invite' and status = 'pending') then return jsonb_build_object('ok', true); end if;
  insert into hdar.live_join_requests (room, user_id, from_id, kind) values (p_room, u, s, 'invite');
  select pseudo into ps from hdar.profiles where user_id = s;
  perform hdar.push_to(u, 'call', 'room-' || p_room, interval '10 minutes', jsonb_build_object('type', 'call',
    'title', coalesce(ps, 'Quelqu''un') || ' t''invite dans son Live', 'body', 'Touche pour passer à l''image avec eux', 'tag', 'room-' || p_room, 'url', '/live?room=' || p_room));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hdar_room_invites() returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'room', q.room, 'from', q.from_id, 'pseudo', p.pseudo) order by q.id desc)
    from hdar.live_join_requests q join hdar.live_rooms r on r.id = q.room left join hdar.profiles p on p.user_id = q.from_id
    where q.user_id = s and q.kind = 'invite' and q.status = 'pending' and q.created_at > now() - interval '2 minutes' and r.ended_at is null and not r.killed), '[]');
end $$;

create or replace function public.hdar_room_invite_answer(p_req bigint, p_accept boolean, p_lat float8 default null, p_lng float8 default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); q hdar.live_join_requests;
begin
  select * into q from hdar.live_join_requests where id = p_req and user_id = s and kind = 'invite' and status = 'pending' for update;
  if q.id is null then raise exception 'room_gone: invitation expirée'; end if;
  update hdar.live_join_requests set status = case when p_accept then 'accepted' else 'refused' end where id = p_req;
  if not p_accept then return jsonb_build_object('ok', true); end if;
  perform public.hdar_room_join(q.room, p_lat, p_lng);
  perform hdar.room_promote(q.room, s);
  return jsonb_build_object('room', q.room);
end $$;

-- retirer de l'image ou expulser (24 h des Lives de l'hôte). Renvoie l'action LiveKit à exécuter.
create or replace function public.hdar_room_remove(p_room uuid, p_user text, p_kick boolean) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); u text := lower(left(coalesce(p_user, ''), 80)); h text;
begin
  perform hdar.room_stage_check(p_room, s);
  select host into h from hdar.live_rooms where id = p_room;
  if u = s then raise exception 'room_self: impossible sur toi-même'; end if;
  if u = h and s <> h and p_kick then raise exception 'room_host: on ne peut pas expulser l''hôte'; end if;
  if p_kick then
    insert into hdar.live_bans (host, user_id, until) values (h, u, now() + interval '24 hours') on conflict (host, user_id) do update set until = excluded.until;
    perform hdar.room_member_close(p_room, u);
  else
    update hdar.live_room_members set role = 'viewer' where room = p_room and user_id = u and left_at is null;
  end if;
  return jsonb_build_object('identity', u, 'action', case when p_kick then 'kick' else 'demote' end);
end $$;

create or replace function public.hdar_room_step_down(p_room uuid) returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin update hdar.live_room_members set role = 'viewer' where room = p_room and user_id = s and left_at is null; end $$;

create or replace function public.hdar_room_leave(p_room uuid) returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.room_member_close(p_room, s);
  update hdar.live_join_requests set status = 'cancelled' where room = p_room and user_id = s and status = 'pending';
  perform hdar.room_gc();
end $$;

create or replace function public.hdar_room_report_msg(p_msg bigint, p_reason text) returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); f text;
begin
  select from_id into f from hdar.live_room_messages where id = p_msg;
  if f is null or f = s then return; end if;
  perform public.hdar_report_reason(s, f, 'Live à plusieurs (chat) — ' || left(coalesce(p_reason, ''), 150));
  update hdar.live_room_messages set hidden = true where id = p_msg;
end $$;

-- admin
create or replace function public.hdar_admin_live_rooms(p_key text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  perform hdar.room_gc();
  return jsonb_build_object('usage', hdar.room_usage(), 'settings', (select to_jsonb(s) from hdar.live_settings s where id = 1),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('room', r.id, 'host', p.pseudo, 'since', r.created_at,
      'stage', (select count(*) from hdar.live_room_members x where x.room = r.id and x.role = 'stage' and x.left_at is null),
      'viewers', (select count(*) from hdar.live_room_members x where x.room = r.id and x.role = 'viewer' and x.left_at is null),
      'msgs', (select count(*) from hdar.live_room_messages m where m.room = r.id)) order by r.created_at desc)
      from hdar.live_rooms r left join hdar.profiles p on p.user_id = r.host where r.ended_at is null), '[]'));
end $$;
create or replace function public.hdar_admin_room_kill(p_key text, p_room uuid) returns void language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.live_rooms set killed = true, ended_at = now() where id = p_room;
  perform hdar.room_gc();
end $$;
create or replace function public.hdar_admin_live_settings(p_key text, p_free int, p_minutes int, p_concurrent int, p_enabled boolean) returns void language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.live_settings set free_requests_day = coalesce(greatest(p_free, 0), free_requests_day), month_minutes_cap = coalesce(greatest(p_minutes, 0), month_minutes_cap),
    concurrent_cap = coalesce(greatest(p_concurrent, 0), concurrent_cap), enabled = coalesce(p_enabled, enabled) where id = 1;
end $$;
-- webhook LiveKit (service_role uniquement)
create or replace function public.hdar_room_webhook(p_event text, p_room uuid, p_user text) returns void language plpgsql security definer set search_path to '' as $$
begin
  if p_event = 'participant_left' and p_user is not null then perform hdar.room_member_close(p_room, lower(p_user)); end if;
  if p_event = 'room_finished' then update hdar.live_rooms set ended_at = coalesce(ended_at, now()) where id = p_room; end if;
  perform hdar.room_gc();
end $$;
revoke all on function public.hdar_room_webhook(text, uuid, text) from public, anon, authenticated;
grant execute on function public.hdar_room_webhook(text, uuid, text) to service_role;

-- ménage du chat (24 h) toutes les 10 min, comme les autres purges
do $$ begin perform cron.schedule('hdar-room-gc', '*/5 * * * *', 'select hdar.room_gc()'); exception when others then null; end $$;
-- config LiveKit pour les fonctions edge (secrets dans Vault, jamais dans git) — service_role uniquement
create or replace function public.hdar_livekit_config() returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('url', (select decrypted_secret from vault.decrypted_secrets where name = 'livekit_url'),
    'key', (select decrypted_secret from vault.decrypted_secrets where name = 'livekit_api_key'),
    'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'livekit_api_secret'));
$$;
revoke all on function public.hdar_livekit_config() from public, anon, authenticated;
grant execute on function public.hdar_livekit_config() to service_role;

