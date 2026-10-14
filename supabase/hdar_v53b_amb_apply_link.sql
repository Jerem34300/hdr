-- v53b : email obligatoire (consentement RGPD) + lien de signature sécurisé (jeton à usage unique, 7 jours, lié au candidat)
alter table hdar.amb_applications add column if not exists email text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column if not exists consent_at timestamptz, add column if not exists invite_token text;
alter table hdar.amb_invites add column if not exists for_user text;

create or replace function hdar.amb_apply_purge() returns void language sql security definer set search_path to '' as $$
  delete from hdar.amb_applications where status = 'refused' and decided_at < now() - interval '6 months';
  update hdar.amb_applications set motivation = '(effacé)', city = '—', audience = null, promote = '(effacé)', admin_note = null, email = null
    where status = 'accepted' and decided_at < now() - interval '6 months' and motivation <> '(effacé)';
$$;

drop function if exists public.hdar_amb_apply(text, text, text, text);
create or replace function public.hdar_amb_apply(p_motivation text, p_city text, p_audience text, p_promote text, p_email text, p_consent boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); last hdar.amb_applications; m text := btrim(coalesce(p_motivation, '')); c text := btrim(coalesce(p_city, ''));
  a text := nullif(btrim(coalesce(p_audience, '')), ''); p text := btrim(coalesce(p_promote, '')); e text := lower(btrim(coalesce(p_email, ''))); r hdar.amb_applications;
begin
  if s is null or not exists (select 1 from hdar.profiles where user_id = s and profile_at is not null) then raise exception 'Crée d''abord ton profil pour postuler'; end if;
  if exists (select 1 from hdar.ambassadors where user_id = s and active) then raise exception 'Tu es déjà ambassadeur 🎯'; end if;
  select * into last from hdar.amb_applications where user_id = s order by created_at desc limit 1;
  if last.status = 'pending' then raise exception 'Ta candidature est déjà en cours d''examen'; end if;
  if last.status = 'accepted' then raise exception 'Ta candidature est déjà acceptée : regarde tes emails pour signer ton contrat'; end if;
  if last.status = 'refused' and last.decided_at > now() - interval '30 days' then raise exception 'Tu pourras repostuler 30 jours après la réponse'; end if;
  if length(m) < 20 then raise exception 'Dis-nous en un peu plus sur ta motivation (20 caractères min.)'; end if;
  if length(c) < 2 then raise exception 'Indique ta ville'; end if;
  if length(p) < 10 then raise exception 'Explique comment tu ferais connaître hdar (10 caractères min.)'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 254 then raise exception 'Email invalide'; end if;
  if p_consent is not true then raise exception 'Coche la case de consentement pour l''email'; end if;
  perform hdar.rate_check(s, 'amb_apply', 3, interval '1 day');
  insert into hdar.amb_applications (user_id, motivation, city, audience, promote, email, consent_at)
    values (s, left(m, 800), left(c, 80), left(a, 300), left(p, 600), e, now()) returning * into r;
  return jsonb_build_object('status', r.status, 'at', r.created_at);
end $$;

create or replace function public.hdar_admin_amb_apply_decide(p_key text, p_id bigint, p_accept boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r hdar.amb_applications; t text; n text := nullif(btrim(left(coalesce(p_note, ''), 300)), ''); already boolean;
begin
  perform hdar.admin_check(p_key);
  update hdar.amb_applications set status = case when p_accept then 'accepted' else 'refused' end, admin_note = n, decided_at = now()
    where id = p_id and status = 'pending' returning * into r;
  if r.id is null then raise exception 'Candidature introuvable ou déjà traitée'; end if;
  already := exists (select 1 from hdar.ambassadors where user_id = r.user_id and active);
  if p_accept then
    if not already then
      t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      insert into hdar.amb_invites (token, note, for_user) values (t, 'candidature #' || r.id, r.user_id);
      update hdar.amb_applications set invite_token = t where id = r.id;
    end if;
    insert into hdar.user_notices (user_id, title, body) values (r.user_id, 'Candidature ambassadeur acceptée 🎯',
      'Bienvenue ! Tu vas recevoir un email de contact@hdar.chat avec ton lien personnel pour lire et signer ton contrat (valable 7 jours). Ensuite tu auras ton code et tes outils.' || coalesce(' Mot de hdar : ' || n, ''));
  else
    insert into hdar.user_notices (user_id, title, body) values (r.user_id, 'Candidature ambassadeur',
      'Merci pour ta candidature. Elle n''a pas été retenue pour le moment ; tu pourras repostuler dans 30 jours.' || coalesce(' Mot de hdar : ' || n, ''));
  end if;
  insert into hdar.admin_audit (admin_uid, action, detail) values (auth.uid(), 'amb_apply', jsonb_build_object('id', r.id, 'user', r.user_id, 'accept', p_accept));
  return jsonb_build_object('id', r.id, 'status', case when p_accept then 'accepted' else 'refused' end);
end $$;

-- service role : infos d'envoi (une fois). Refus : l'email est effacé dès l'envoi (minimisation).
create or replace function public.hdar_amb_apply_mail_info(p_id bigint) returns jsonb language plpgsql security definer set search_path to '' as $$
declare r hdar.amb_applications; ps text;
begin
  update hdar.amb_applications set mailed_at = now() where id = p_id and status <> 'pending' and mailed_at is null returning * into r;
  if r.id is null then return null; end if;
  if r.status = 'refused' then update hdar.amb_applications set email = null where id = r.id; end if;
  select pseudo into ps from hdar.profiles where user_id = r.user_id;
  return jsonb_build_object('email', r.email, 'pseudo', ps, 'status', r.status, 'note', r.admin_note, 'token', r.invite_token,
    'expires_at', (select expires_at from hdar.amb_invites where token = r.invite_token));
end $$;
revoke all on function public.hdar_amb_apply_mail_info(bigint) from public, anon, authenticated;
grant execute on function public.hdar_amb_apply_mail_info(bigint) to service_role;

-- le jeton lié à un candidat ne marche que pour lui
create or replace function public.hdar_amb_invite_info(p_token text) returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('valid', exists (select 1 from hdar.amb_invites where token = p_token and used_by is null and expires_at > now()
        and (for_user is null or for_user = hdar.self_id())),
    'photo_ok', exists (select 1 from hdar.profiles where user_id = hdar.self_id() and photo_status = 'approved')) $$;

create or replace function public.hdar_amb_sign(p_user text, p_token text, p_name text, p_version text, p_ip_hash text, p_ua text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c text; r hdar.amb_contracts;
begin
  if not exists (select 1 from hdar.profiles where user_id = p_user and photo_status = 'approved') then raise exception 'Il faut un profil avec une photo validée'; end if;
  if length(btrim(coalesce(p_name, ''))) < 4 or btrim(p_name) !~ '\s' then raise exception 'Saisis ton nom et prénom complets'; end if;
  if not exists (select 1 from hdar.ambassadors where user_id = p_user and active) then
    update hdar.amb_invites set used_by = p_user, used_at = now() where token = p_token and used_by is null and expires_at > now() and (for_user is null or for_user = p_user);
    if not found then raise exception 'Invitation invalide, expirée ou déjà utilisée'; end if;
    loop c := upper(substr(md5(gen_random_uuid()::text), 1, 6)); exit when not exists (select 1 from hdar.ambassadors where code = c); end loop;
    insert into hdar.ambassadors (user_id, code) values (p_user, c) on conflict (user_id) do update set active = true, revoked_at = null;
  end if;
  insert into hdar.amb_contracts (user_id, version, full_name, ip_hash, user_agent) values (p_user, p_version, left(btrim(p_name), 120), p_ip_hash, left(p_ua, 300)) returning * into r;
  update hdar.ambassadors set terms_at = r.accepted_at, contract_version = p_version where user_id = p_user;
  return jsonb_build_object('id', r.id, 'name', r.full_name, 'version', r.version, 'at', r.accepted_at, 'ip_hash', r.ip_hash,
    'code', (select code from hdar.ambassadors where user_id = p_user));
end $$;

-- email du contrat : celui du compte confirmé, sinon celui de la candidature acceptée
create or replace function public.hdar_amb_whoami() returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('user_id', p.user_id, 'photo_ok', p.photo_status = 'approved',
    'email', coalesce((select u.email from auth.users u where u.id = p.auth_user_id and u.email_confirmed_at is not null),
      (select x.email from hdar.amb_applications x where x.user_id = p.user_id and x.status = 'accepted' order by x.decided_at desc limit 1)))
  from hdar.profiles p where p.user_id = hdar.self_id() $$;

-- liste admin des contrats signés
create or replace function public.hdar_admin_amb_contracts(p_key text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'pseudo', coalesce(pf.pseudo, 'Sans pseudo'), 'name', c.full_name, 'version', c.version, 'at', c.accepted_at, 'code', a.code) order by c.accepted_at desc)
    from hdar.amb_contracts c left join hdar.profiles pf on pf.user_id = c.user_id left join hdar.ambassadors a on a.user_id = c.user_id), '[]'::jsonb);
end $$;

revoke all on function public.hdar_amb_apply(text, text, text, text, text, boolean), public.hdar_admin_amb_apply_decide(text, bigint, boolean, text), public.hdar_admin_amb_contracts(text) from public, anon;
grant execute on function public.hdar_amb_apply(text, text, text, text, text, boolean), public.hdar_admin_amb_apply_decide(text, bigint, boolean, text), public.hdar_admin_amb_contracts(text) to authenticated;
