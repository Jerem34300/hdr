-- v52b : les personnes à l'image d'un Live à plusieurs comptent aussi « en Live » (bouton « Rejoindre son live »)
create or replace function public.hdar_live_ids() returns text[] language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select user_id u from hdar.live_queue where seen_at > now() - interval '15 seconds'
    union select x.user_id from hdar.live_room_members x join hdar.live_rooms r on r.id = x.room
      where x.left_at is null and x.role = 'stage' and x.seen_at > now() - interval '15 seconds' and r.ended_at is null) z;
$$;
