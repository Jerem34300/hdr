-- Tests v52c (annulés par l'exception finale)
do $t$
declare a text := '00000000-0000-4000-8000-0000000000a1'; b text := '00000000-0000-4000-8000-0000000000b1'; c text := '00000000-0000-4000-8000-0000000000c1'; d text := '00000000-0000-4000-8000-0000000000d1'; e text := '00000000-0000-4000-8000-0000000000e1';
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  out text := ''; r uuid; j jsonb;
begin
  insert into auth.users (id, aud, role) select x, 'authenticated','authenticated' from unnest(array[ua,ub,uc,ud,ue]) x;
  insert into hdar.identities (auth_user_id, user_id) values (ua,a),(ub,b),(uc,c),(ud,d),(ue,e);
  insert into hdar.profiles (user_id, pseudo, lat, lng, age, photo, photo_status, profile_at, auth_user_id) values
    (a,'TestA',43.61,3.88,30,'x','approved',now(),ua),(b,'TestB',48.85,2.35,31,'x','approved',now(),ub),
    (c,'TestC',45.76,4.83,32,'x','approved',now(),uc),(d,'TestD',43.612,3.881,33,'x','approved',now(),ud),(e,'TestE',44.84,-0.58,34,'x',null,now(),ue);
  insert into hdar.live_terms (user_id, version) values (a,1),(b,1),(c,1),(d,1),(e,1);
  update hdar.profiles set photo_status = 'pending' where user_id = e;
  insert into hdar.live_queue (user_id, peer_id, role, lat, lng) values (a,b,'offer',43.61,3.88),(b,a,'answer',48.85,2.35);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  r := (public.hdar_room_open(43.61, 3.88)->>'room')::uuid;
  out := out || case when (select count(*) from hdar.live_room_members where room=r)=1 and exists (select 1 from hdar.live_queue where user_id=a and peer_id=b) then 'ok Inviter : salon avec l''hôte seul, 1:1 intact; ' else 'FAIL open; ' end;
  out := out || case when (public.hdar_room_open(43.61,3.88)->>'room')::uuid = r then 'ok réouverture idempotente; ' else 'FAIL reopen; ' end;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role','authenticated')::text, true);
  out := out || case when not (public.hdar_room_feed(43.612,3.881) @> jsonb_build_array(jsonb_build_object('room', r))) then 'ok D (<2 km) ne voit pas; ' else 'FAIL feed D; ' end;
  begin perform public.hdar_room_join(r, 43.612, 3.881); out := out || 'FAIL D join; '; exception when others then out := out || case when sqlerrm like 'live_tooclose%' then 'ok D join refusé 2 km; ' else 'FAIL '||sqlerrm||'; ' end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ue, 'role','authenticated')::text, true);
  begin perform public.hdar_room_join(r, 44.84, -0.58); out := out || 'FAIL E sans photo; '; exception when others then out := out || case when sqlerrm like 'live_photo%' then 'ok sans photo validée refusé; ' else 'FAIL '||sqlerrm||'; ' end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  out := out || case when public.hdar_room_feed(45.76,4.83) @> jsonb_build_array(jsonb_build_object('room', r, 'cap', 6)) then 'ok C voit le salon (6 places); ' else 'FAIL feed C; ' end;
  j := public.hdar_room_join(r, 45.76, 4.83);
  out := out || case when j->>'role'='viewer' then 'ok C spectateur; ' else 'FAIL join C; ' end;
  perform public.hdar_room_say(r, 'salut 🔥'); perform public.hdar_room_say(r, '🔥', 'react');
  begin perform public.hdar_room_say(r, 'mon 06.12.34.56.78'); out := out || 'FAIL tel; '; exception when others then out := out || 'ok filtre tel; '; end;
  begin perform public.hdar_room_say(r, 'ecris moi a b.c@mail.com'); out := out || 'FAIL mail; '; exception when others then out := out || 'ok filtre mail; '; end;
  -- places : cap 1
  update hdar.live_settings set viewer_cap = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  out := out || case when not (public.hdar_room_feed(48.85,2.35) @> jsonb_build_array(jsonb_build_object('room', r))) then 'ok salon plein sauté dans le fil; ' else 'FAIL full feed; ' end;
  begin perform public.hdar_room_join(r, 48.85, 2.35); out := out || 'FAIL full join; '; exception when others then out := out || case when sqlerrm like 'room_viewers_full%' then 'ok complet refusé; ' else 'FAIL '||sqlerrm||'; ' end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  perform public.hdar_room_leave(r);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  j := public.hdar_room_join(r, 48.85, 2.35);
  out := out || case when j->>'role'='viewer' then 'ok place libérée reprise; ' else 'FAIL slot; ' end;
  begin perform public.hdar_room_remove(r, c, true); out := out || 'FAIL viewer kick; '; exception when others then out := out || 'ok spectateur ne peut pas expulser; '; end;
  update hdar.live_settings set viewer_cap = 6;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  j := public.hdar_room_state(r, 0);
  out := out || case when (j->>'viewers')::int=1 and jsonb_array_length(j->'viewer_list')=1 and jsonb_array_length(j->'msgs')=2 then 'ok état hôte; ' else 'FAIL host state '||j::text||'; ' end;
  perform public.hdar_room_remove(r, b, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  j := public.hdar_room_state(r, 0);
  out := out || case when (j->>'gone')::boolean and (j->>'banned')::boolean then 'ok B expulsé + banni 24 h; ' else 'FAIL kick; ' end;
  begin perform public.hdar_room_join(r, 48.85, 2.35); out := out || 'FAIL rejoin; '; exception when others then out := out || 'ok retour refusé; '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform public.hdar_room_leave(r);
  update hdar.live_rooms set created_at = now() - interval '1 minute' where id = r; perform hdar.room_gc();
  out := out || case when (select ended_at is not null from hdar.live_rooms where id=r) then 'ok salon fermé au départ de l''hôte; ' else 'FAIL end; ' end;
  out := out || case when (select count(*) from hdar.live_group_usage where room=r) >= 3 and exists (select 1 from hdar.live_events where outcome='group') then 'ok minutes logguées (live_events group); ' else 'FAIL usage; ' end;
  begin perform public.hdar_admin_live_rooms(''); out := out || 'FAIL admin; '; exception when others then out := out || 'ok admin refusé aux non-admins; '; end;
  raise exception 'TESTS: %', out;
end $t$;
