-- Tests v52 (tout est annulé : le bloc se termine par une exception)
do $t$
declare a text := '00000000-0000-4000-8000-0000000000a1'; b text := '00000000-0000-4000-8000-0000000000b1'; c text := '00000000-0000-4000-8000-0000000000c1'; d text := '00000000-0000-4000-8000-0000000000d1';
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  out text := ''; r uuid; j jsonb; req bigint; ok boolean;
  procedure_as text;
begin
  insert into auth.users (id, aud, role) values (ua,'authenticated','authenticated'),(ub,'authenticated','authenticated'),(uc,'authenticated','authenticated'),(ud,'authenticated','authenticated');
  insert into hdar.identities (auth_user_id, user_id) values (ua,a),(ub,b),(uc,c),(ud,d);
  insert into hdar.profiles (user_id, pseudo, lat, lng, age, photo, photo_status, profile_at, auth_user_id) values
    (a,'TestA',43.61,3.88,30,'x','approved',now(),ua),(b,'TestB',48.85,2.35,31,'x','approved',now(),ub),
    (c,'TestC',45.76,4.83,32,'x','approved',now(),uc),(d,'TestD',43.612,3.881,33,'x','approved',now(),ud);
  insert into hdar.live_terms (user_id, version) values (a,1),(b,1),(c,1),(d,1);
  -- A et B en 1:1
  insert into hdar.live_queue (user_id, peer_id, role, lat, lng) values (a,b,'offer',43.61,3.88),(b,a,'answer',48.85,2.35);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  begin perform public.hdar_room_open(b); out := out || 'FAIL open sans hdar+; '; exception when others then out := out || case when sqlerrm like 'premium_required%' then 'ok open non-premium refusé; ' else 'FAIL '||sqlerrm||'; ' end; end;
  insert into hdar.premium (user_id, until) values (a, now() + interval '1 day');
  r := (public.hdar_room_open(b, 43.61, 3.88)->>'room')::uuid;
  out := out || case when (select count(*) from hdar.live_room_members where room=r and role='stage')=2 then 'ok open 1:1->salon 2 à l''image; ' else 'FAIL stage; ' end;
  out := out || case when exists (select 1 from hdar.rtc_signals where to_id=b and kind='live-room' and payload=r::text) then 'ok signal live-room; ' else 'FAIL signal; ' end;
  -- C (Lyon) voit le salon ; D (à 200 m de A) ne le voit pas
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  j := public.hdar_room_feed(45.76, 4.83);
  out := out || case when j @> jsonb_build_array(jsonb_build_object('room', r)) then 'ok C voit le salon; ' else 'FAIL feed C '||j::text||'; ' end;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role','authenticated')::text, true);
  j := public.hdar_room_feed(43.612, 3.881);
  out := out || case when not (j @> jsonb_build_array(jsonb_build_object('room', r))) then 'ok D (<2 km) ne voit pas; ' else 'FAIL feed D; ' end;
  begin perform public.hdar_room_join(r, 43.612, 3.881); out := out || 'FAIL D join; '; exception when others then out := out || case when sqlerrm like 'live_tooclose%' then 'ok D join refusé 2 km; ' else 'FAIL '||sqlerrm||'; ' end; end;
  -- C entre comme spectateur, chatte, filtre
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  j := public.hdar_room_join(r, 45.76, 4.83);
  out := out || case when j->>'role'='viewer' then 'ok C spectateur; ' else 'FAIL join C; ' end;
  perform public.hdar_room_say(r, 'salut 🔥');
  begin perform public.hdar_room_say(r, 'appelle 06 12 34 56 78'); out := out || 'FAIL filtre tel; '; exception when others then out := out || 'ok filtre tel; '; end;
  begin perform public.hdar_room_say(r, 'moi@exemple.fr'); out := out || 'FAIL filtre mail; '; exception when others then out := out || 'ok filtre mail; '; end;
  perform public.hdar_room_say(r, '🥵', 'react');
  -- demande : 1/jour gratuit
  perform public.hdar_room_request(r);
  req := (select id from hdar.live_join_requests where room=r and user_id=c and kind='request');
  j := public.hdar_room_state(r, 0);
  out := out || case when jsonb_array_length(j->'msgs')=2 and (j->'requests')='[]'::jsonb and (j->>'viewers')::int=1 then 'ok état spectateur (2 msgs, pas de liste des demandes); ' else 'FAIL state C '||j::text||'; ' end;
  -- A accepte
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  j := public.hdar_room_state(r, 0);
  out := out || case when jsonb_array_length(j->'requests')=1 then 'ok A voit la demande; ' else 'FAIL req list; ' end;
  perform public.hdar_room_decide(req, true);
  out := out || case when (select role from hdar.live_room_members where room=r and user_id=c)='stage' then 'ok C à l''image; ' else 'FAIL accept; ' end;
  -- retirer de l'image puis 2e demande refusée (gratuit)
  perform public.hdar_room_remove(r, c, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  begin perform public.hdar_room_request(r); out := out || 'FAIL 2e demande; '; exception when others then out := out || case when sqlerrm like 'premium_required%' then 'ok 2e demande gratuite refusée; ' else 'FAIL '||sqlerrm||'; ' end; end;
  -- C (spectateur) ne peut pas expulser
  begin perform public.hdar_room_remove(r, b, true); out := out || 'FAIL viewer kick; '; exception when others then out := out || 'ok spectateur ne peut pas expulser; '; end;
  -- invitation de C par B
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  perform public.hdar_room_invite(r, c);
  begin perform public.hdar_room_invite(r, d); out := out || 'FAIL invite D proche; '; exception when others then out := out || case when sqlerrm like 'live_tooclose%' then 'ok invitation D refusée 2 km; ' else 'FAIL '||sqlerrm||'; ' end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  j := public.hdar_room_invites();
  req := (j->0->>'id')::bigint;
  perform public.hdar_room_invite_answer(req, true, 45.76, 4.83);
  out := out || case when (select role from hdar.live_room_members where room=r and user_id=c)='stage' then 'ok invitation acceptée; ' else 'FAIL invite accept; ' end;
  -- kick par A : ban 24 h
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform public.hdar_room_remove(r, c, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  j := public.hdar_room_state(r, 0);
  out := out || case when (j->>'gone')::boolean and (j->>'banned')::boolean then 'ok C expulsé + banni; ' else 'FAIL kick state '||j::text||'; ' end;
  begin perform public.hdar_room_join(r, 45.76, 4.83); out := out || 'FAIL rejoin banni; '; exception when others then out := out || 'ok rejoin refusé (ban 24 h); '; end;
  -- quota
  update hdar.live_settings set concurrent_cap = 2;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role','authenticated')::text, true);
  delete from hdar.live_bans; 
  begin perform public.hdar_room_join(r, 45.0, 5.5); out := out || 'FAIL quota; '; exception when others then out := out || case when sqlerrm like 'room_full%' then 'ok complet refusé; ' else 'FAIL '||sqlerrm||'; ' end; end;
  update hdar.live_settings set concurrent_cap = 100;
  -- départ : minutes logguées, salon fermé quand plus personne à l'image
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform public.hdar_room_leave(r);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  perform public.hdar_room_leave(r);
  update hdar.live_rooms set created_at = now() - interval '1 minute' where id = r; perform hdar.room_gc();
  out := out || case when (select ended_at is not null from hdar.live_rooms where id=r) then 'ok salon fermé; ' else 'FAIL end; ' end;
  out := out || case when (select count(*) from hdar.live_group_usage where room=r) >= 3 then 'ok minutes logguées; ' else 'FAIL usage; ' end;
  -- admin refusé pour non-admin
  begin perform public.hdar_admin_live_rooms(''); out := out || 'FAIL admin; '; exception when others then out := out || 'ok admin refusé; '; end;
  raise exception 'TESTS: %', out;
end $t$;
