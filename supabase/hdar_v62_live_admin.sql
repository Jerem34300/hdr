-- v62 : « en ligne » dans un salon = vu dans le salon dans les 5 dernières minutes (et non plus
-- seulement l'écran ouvert à la seconde près), heure du dernier message du quartier pour trier la
-- liste des discussions, et onglet admin « En direct » (qui est connecté, où, qui écrit en privé à qui).
-- Applied as migration hdar_v62_live_admin.

create or replace function hdar.room_people(p_room text, s text, p_lat double precision, p_lng double precision) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'pseudo', coalesce(nullif(p.pseudo, ''), r.pseudo),
      'profile', p.profile_at is not null, 'mine', r.user_id = s,
      'photo', p.photo is not null and p.photo_status = 'approved',
      'ago', extract(epoch from now() - r.seen_at)::int)
      order by r.user_id = s desc, r.seen_at > now() - interval '1 minute' desc, (p.profile_at is not null) desc,
        (p.photo is not null and p.photo_status = 'approved') desc, r.seen_at desc), '[]'::jsonb)
  from (select * from hdar.room_presence r
        where r.room = p_room and r.seen_at > now() - interval '5 minutes'
          and (p_room <> 'area' or (abs(r.lat - p_lat) < 0.03 and abs(r.lng - p_lng) < 0.045))
          and not hdar.is_blocked(s, r.user_id)
        order by r.seen_at desc limit 200) r
  left join hdar.profiles p on p.user_id = r.user_id and p.profile_at is not null
    and not exists (select 1 from hdar.bans b where b.user_id = r.user_id and b.active);
$$;
revoke execute on function hdar.room_people(text, text, double precision, double precision) from public, anon, authenticated;

create or replace function public.hdar_rooms_online(p_lat double precision default null, p_lng double precision default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return jsonb_build_object(
    'area', case when p_lat is null or p_lng is null then 0 else (select count(*) from hdar.room_presence r
      where r.room = 'area' and r.seen_at > now() - interval '5 minutes' and r.user_id <> s
        and abs(r.lat - p_lat) < 0.03 and abs(r.lng - p_lng) < 0.045 and not hdar.is_blocked(s, r.user_id)) end,
    'area_last', case when p_lat is null or p_lng is null then null else (select max(a.created_at) from hdar.area_messages a
      where a.created_at > now() - interval '24 hours' and not a.removed
        and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045 and not hdar.is_blocked(s, a.from_id)) end,
    'salons', coalesce((select jsonb_object_agg(substr(x.room, 7), x.n) from (
      select r.room, count(*) as n from hdar.room_presence r
      where r.room like 'salon:%' and r.seen_at > now() - interval '5 minutes' and r.user_id <> s
        and not hdar.is_blocked(s, r.user_id)
      group by r.room) x), '{}'::jsonb));
end $$;

-- Admin « En direct » : connectés (appli ouverte ces 5 dernières minutes), où ils sont, et messages
-- privés des dernières 24 h (qui écrit à qui, combien, quand — pas le contenu).
create or replace function public.hdar_admin_live(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'online', coalesce((select jsonb_agg(x order by x ->> 'last' desc) from (
      select jsonb_build_object('id', d.id, 'pseudo', coalesce(p.pseudo, 'Anonyme'), 'profile', p.profile_at is not null,
        'photo', p.photo is not null and p.photo_status = 'approved', 'city', coalesce(p.city, d.city),
        'platform', d.platform, 'pwa', d.pwa, 'last', d.last_seen, 'first', d.first_seen, 'sessions', d.sessions,
        'on_map', coalesce(p.visible_until > now(), false),
        'banned', exists (select 1 from hdar.bans b where b.user_id = d.id and b.active),
        'rooms', coalesce((select jsonb_agg(case when r.room = 'area' then 'Chat du quartier'
                   else coalesce((select x.name from hdar.salons x where x.id::text = substr(r.room, 7)), 'Salon') end)
                 from hdar.room_presence r where r.user_id = d.id and r.seen_at > now() - interval '5 minutes'), '[]'::jsonb),
        'pm_24h', (select count(*) from hdar.live_messages m where m.from_id = d.id and m.created_at > now() - interval '24 hours'),
        'salon_24h', (select count(*) from hdar.salon_messages m where m.from_id = d.id and m.created_at > now() - interval '24 hours'),
        'area_24h', (select count(*) from hdar.area_messages m where m.from_id = d.id and m.created_at > now() - interval '24 hours')) x
      from hdar.devices d left join hdar.profiles p on p.user_id = d.id
      where d.last_seen > now() - interval '5 minutes'
      order by d.last_seen desc limit 300) q), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(x order by jsonb_array_length(x -> 'people') desc) from (
      select jsonb_build_object('room', r.room,
        'name', case when r.room = 'area' then 'Chat du quartier'
                else coalesce((select x.name from hdar.salons x where x.id::text = substr(r.room, 7)), 'Salon') end,
        'emoji', case when r.room = 'area' then '📍' else (select x.emoji from hdar.salons x where x.id::text = substr(r.room, 7)) end,
        'people', jsonb_agg(jsonb_build_object('id', r.user_id, 'pseudo', coalesce(p.pseudo, r.pseudo), 'at', r.seen_at) order by r.seen_at desc)) x
      from hdar.room_presence r left join hdar.profiles p on p.user_id = r.user_id
      where r.seen_at > now() - interval '5 minutes'
      group by r.room) q), '[]'::jsonb),
    'pm', coalesce((select jsonb_agg(x order by x ->> 'last' desc) from (
      select jsonb_build_object('a', split_part(t.thread_id, ':', 1), 'b', split_part(t.thread_id, ':', 2),
        'a_pseudo', coalesce((select p.pseudo from hdar.profiles p where p.user_id = split_part(t.thread_id, ':', 1)), 'Anonyme'),
        'b_pseudo', coalesce((select p.pseudo from hdar.profiles p where p.user_id = split_part(t.thread_id, ':', 2)), 'Anonyme'),
        'n', t.n, 'a_n', t.a_n, 'last', t.last, 'first', t.first) x
      from (select m.thread_id, count(*) n, count(*) filter (where m.from_id = split_part(m.thread_id, ':', 1)) a_n,
              max(m.created_at) last, min(m.created_at) first
            from hdar.live_messages m where m.created_at > now() - interval '24 hours'
            group by m.thread_id order by max(m.created_at) desc limit 200) t) q), '[]'::jsonb));
end $$;
revoke all on function public.hdar_admin_live(text) from public, anon;
grant execute on function public.hdar_admin_live(text) to authenticated;
