-- v38 — Récupération de profil : par email facultatif (OTP Supabase Auth, côté client) + outil admin de rattachement
-- avec journal. (Le code de récupération a été abandonné : objets supprimés ci-dessous.)
drop function if exists public.hdar_recovery_new();
drop function if exists public.hdar_recovery_status();
drop function if exists public.hdar_recovery_confirm();
drop function if exists public.hdar_recovery_restore(text);
drop function if exists hdar.recovery_hash(text);
drop table if exists hdar.recovery;
drop table if exists hdar.recovery_attempts;
create table if not exists hdar.admin_audit (id bigserial primary key, admin_uid uuid, action text not null, detail jsonb, at timestamptz not null default now());
alter table hdar.admin_audit enable row level security;
revoke all on hdar.admin_audit from public, anon, authenticated;

create or replace function hdar.profile_payload(p_user text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'bio', p.bio, 'tags', p.tags,
    'photos', coalesce(p.album, case when p.photo is not null then jsonb_build_array(p.photo) else '[]'::jsonb end),
    'voice', p.voice, 'voice_sec', p.voice_sec, 'note', p.note, 'iam', p.iam, 'seeking', p.seeking,
    'has_profile', p.profile_at is not null)
  from hdar.profiles p where p.user_id = p_user;
$$;
revoke all on function hdar.profile_payload(text) from public, anon, authenticated;

-- Déplace l'identité p_old (profil) vers la session p_auth ; l'ancienne session perd son accès.
create or replace function hdar.transfer_identity(p_old text, p_auth uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare cur text; old_auth uuid;
begin
  select user_id into cur from hdar.identities where auth_user_id = p_auth;
  if cur = p_old then return; end if;
  if cur is not null then
    if exists (select 1 from hdar.profiles where user_id = cur and profile_at is not null) then
      raise exception 'Cette session a déjà son propre profil';
    end if;
    delete from hdar.identities where auth_user_id = p_auth;
    delete from hdar.profiles where user_id = cur and profile_at is null;
  end if;
  select auth_user_id into old_auth from hdar.identities where user_id = p_old;
  delete from hdar.identities where user_id = p_old;
  insert into hdar.identities (auth_user_id, user_id) values (p_auth, p_old);
  update hdar.profiles set auth_user_id = p_auth where user_id = p_old;
  -- Un profil d'admin garde ses droits (et donc hdar+ gratuit) sur sa nouvelle session.
  if old_auth is not null and exists (select 1 from hdar.admins where auth_user_id = old_auth) then
    insert into hdar.admins (auth_user_id, note) values (p_auth, 'transfert de profil') on conflict do nothing;
  end if;
  if old_auth is not null and old_auth <> p_auth then
    delete from auth.refresh_tokens where user_id::text = old_auth::text;
    delete from auth.sessions where user_id = old_auth;
  end if;
end $$;
revoke all on function hdar.transfer_identity(text, uuid) from public, anon, authenticated;

-- Profil complet de la session (après connexion par email sur un nouvel appareil).
create or replace function public.hdar_my_profile_full() returns jsonb
language sql stable security definer set search_path to '' as $$
  select hdar.profile_payload(hdar.self_id());
$$;
revoke all on function public.hdar_my_profile_full() from public, anon;
grant execute on function public.hdar_my_profile_full() to authenticated;

-- Support : rattache le profil « pseudo » à la session du profil vide p_target (ID support, 8 premiers caractères acceptés).
create or replace function public.hdar_admin_reattach(p_key text, p_pseudo text, p_target text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare src text; n int; tgt text; ta uuid;
begin
  perform hdar.admin_check(p_key);
  select count(*), min(user_id) into n, src from hdar.profiles where lower(pseudo) = lower(btrim(p_pseudo)) and profile_at is not null;
  if n = 0 then raise exception 'Aucun profil avec ce pseudo'; end if;
  if n > 1 then raise exception '% profils avec ce pseudo : précise avec l''ID support du profil d''origine', n; end if;
  select i.user_id, i.auth_user_id into tgt, ta from hdar.identities i where i.user_id like lower(btrim(p_target)) || '%' limit 2;
  if ta is null then raise exception 'ID support introuvable'; end if;
  perform hdar.transfer_identity(src, ta);
  insert into hdar.admin_audit (admin_uid, action, detail)
    values (auth.uid(), 'reattach', jsonb_build_object('pseudo', p_pseudo, 'profile', src, 'to_session', ta, 'from_target', tgt));
  return jsonb_build_object('ok', true, 'profile', src);
end $$;
revoke all on function public.hdar_admin_reattach(text, text, text) from public, anon;
grant execute on function public.hdar_admin_reattach(text, text, text) to authenticated;
