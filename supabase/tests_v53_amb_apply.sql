-- Tests v53 (annulés par l'exception finale)
do $t$
declare a text := '00000000-0000-4000-8000-0000000053a1'; b text := '00000000-0000-4000-8000-0000000053b1'; n text := '00000000-0000-4000-8000-0000000053c1';
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); un uuid := gen_random_uuid(); uadm uuid := gen_random_uuid();
  out text := ''; j jsonb; ida bigint; idb bigint; tok text; s jsonb;
begin
  insert into auth.users (id, aud, role) select x, 'authenticated','authenticated' from unnest(array[ua,ub,un,uadm]) x;
  insert into hdar.identities (auth_user_id, user_id) values (ua,a),(ub,b),(un,n),(uadm,'00000000-0000-4000-8000-0000000053d1');
  insert into hdar.admins (auth_user_id) values (uadm);
  insert into hdar.profiles (user_id, pseudo, age, photo, photo_status, profile_at, auth_user_id) values
    (a,'AppA',30,'x','approved',now(),ua),(b,'AppB',31,'x','approved',now(),ub),(n,'NoProf',32,null,null,null,un);
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role','authenticated')::text, true);
  begin perform public.hdar_amb_apply('je veux aider hdar à grandir ici', 'Lyon', null, 'Instagram et soirées', 'n@x.fr', true); out := out || 'FAIL sans profil; ';
  exception when others then out := out || 'ok sans profil refusé; '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  begin perform public.hdar_amb_apply('je veux aider hdar à grandir ici', 'Lyon', null, 'Instagram et soirées', 'pasunmail', true); out := out || 'FAIL email; '; exception when others then out := out || 'ok email invalide; '; end;
  begin perform public.hdar_amb_apply('je veux aider hdar à grandir ici', 'Lyon', null, 'Instagram et soirées', 'a@x.fr', false); out := out || 'FAIL consent; '; exception when others then out := out || 'ok consentement requis; '; end;
  perform public.hdar_amb_apply('je veux aider hdar à grandir ici', 'Lyon', '@lyonnight 2k', 'Instagram et soirées', 'A@X.fr', true);
  begin perform public.hdar_amb_apply('je veux aider hdar à grandir ici', 'Lyon', null, 'Instagram et soirées', 'a@x.fr', true); out := out || 'FAIL double; '; exception when others then out := out || 'ok une seule candidature en cours; '; end;
  s := public.hdar_amb_apply_status();
  out := out || case when s->'application'->>'status' = 'pending' and not (s ? 'email') and s::text not like '%a@x.fr%' then 'ok statut sans email; ' else 'FAIL status '||s::text||'; ' end;
  begin perform public.hdar_admin_amb_applications(''); out := out || 'FAIL admin; '; exception when others then out := out || 'ok liste admin refusée aux non-admins; '; end;
  begin perform count(*) from hdar.amb_applications; out := out || case when current_user = 'postgres' then 'info table (superuser); ' else '' end; exception when others then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  perform public.hdar_amb_apply('envie de faire découvrir hdar à mes potes', 'Nice', null, 'bouche à oreille', 'b@x.fr', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uadm, 'role','authenticated')::text, true);
  j := public.hdar_admin_amb_applications('');
  out := out || case when jsonb_array_length(j) >= 2 and j::text not like '%a@x.fr%' then 'ok admin liste (sans email); ' else 'FAIL list; ' end;
  select id into ida from hdar.amb_applications where user_id = a; select id into idb from hdar.amb_applications where user_id = b;
  perform public.hdar_admin_amb_apply_decide('', ida, true, 'Bienvenue !');
  perform public.hdar_admin_amb_apply_decide('', idb, false, null);
  begin perform public.hdar_admin_amb_apply_decide('', ida, false); out := out || 'FAIL redecide; '; exception when others then out := out || 'ok décision unique; '; end;
  out := out || case when not exists (select 1 from hdar.ambassadors where user_id = a) then 'ok pas de rôle avant signature; ' else 'FAIL role early; ' end;
  out := out || case when (select count(*) from hdar.user_notices where user_id in (a,b)) = 2 then 'ok notifs in-app acceptation + refus; ' else 'FAIL notices; ' end;
  j := public.hdar_amb_apply_mail_info(ida); tok := j->>'token';
  out := out || case when j->>'email' = 'a@x.fr' and length(tok) = 64 and public.hdar_amb_apply_mail_info(ida) is null then 'ok mail acceptation (jeton, 1 envoi); ' else 'FAIL mailinfo '||coalesce(j::text,'null')||'; ' end;
  j := public.hdar_amb_apply_mail_info(idb);
  out := out || case when j->>'status'='refused' and (select email from hdar.amb_applications where id = idb) is null then 'ok refus : email effacé après envoi; ' else 'FAIL refuse mail; ' end;
  -- B (refusé) ne peut pas utiliser le jeton de A
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  out := out || case when not (public.hdar_amb_invite_info(tok)->>'valid')::boolean then 'ok jeton lié au candidat (info); ' else 'FAIL info B; ' end;
  begin perform public.hdar_amb_sign(b, tok, 'Bob Martin', 'v2', null, 'test'); out := out || 'FAIL B signe; '; exception when others then out := out || 'ok B ne peut pas signer avec le jeton de A; '; end;
  -- expiration
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  update hdar.amb_invites set expires_at = now() - interval '1 minute' where token = tok;
  out := out || case when not (public.hdar_amb_invite_info(tok)->>'valid')::boolean then 'ok jeton expiré invalide; ' else 'FAIL exp info; ' end;
  begin perform public.hdar_amb_sign(a, tok, 'Alice Durand', 'v2', null, 'test'); out := out || 'FAIL exp sign; '; exception when others then out := out || 'ok signature refusée si expiré; '; end;
  update hdar.amb_invites set expires_at = now() + interval '7 days' where token = tok;
  out := out || case when (public.hdar_amb_invite_info(tok)->>'valid')::boolean then 'ok jeton valide pour A; ' else 'FAIL info A; ' end;
  j := public.hdar_amb_sign(a, tok, 'Alice Durand', 'v2', null, 'test');
  out := out || case when j->>'version'='v2' and length(j->>'code')=6 and (public.hdar_amb_me()->>'code') = j->>'code' then 'ok contrat v2 signé, code + espace actifs; ' else 'FAIL sign '||j::text||'; ' end;
  out := out || case when (public.hdar_amb_whoami()->>'email') = 'a@x.fr' then 'ok email du contrat = candidature; ' else 'FAIL whoami; ' end;
  -- usage unique : retirer le rôle puis réessayer le jeton
  update hdar.ambassadors set active = false where user_id = a;
  begin perform public.hdar_amb_sign(a, tok, 'Alice Durand', 'v2', null, 'test'); out := out || 'FAIL reuse; '; exception when others then out := out || 'ok jeton à usage unique; '; end;
  update hdar.ambassadors set active = true where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', uadm, 'role','authenticated')::text, true);
  out := out || case when public.hdar_admin_amb_contracts('') @> jsonb_build_array(jsonb_build_object('user_id', a, 'version', 'v2')) then 'ok contrat dans la liste admin; ' else 'FAIL admin contracts; ' end;
  raise exception 'TESTS: %', out;
end $t$;
