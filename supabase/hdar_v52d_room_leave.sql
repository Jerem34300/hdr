-- v52d : hdar_room_leave sans les demandes (supprimées en v52c)
create or replace function public.hdar_room_leave(p_room uuid) returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.room_member_close(p_room, s);
  perform hdar.room_gc();
end $$;
