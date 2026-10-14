-- v53 : candidatures ambassadeur (page /ambassadeur → « Je postule »), sélection par l'admin.
-- RGPD : données minimales (motivation, ville, audience facultative, façon de promouvoir), aucun email stocké ;
-- candidatures refusées supprimées après 6 mois, acceptées : texte effacé après 6 mois (statut conservé).
create table if not exists hdar.amb_applications (
  id bigserial primary key,
  user_id text not null,
  motivation text not null check (length(motivation) between 20 and 800),
  city text not null check (length(city) between 2 and 80),
  audience text check (length(audience) <= 300),
  promote text not null check (length(promote) between 10 and 600),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'refused')),
  admin_note text check (length(admin_note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  mailed_at timestamptz
);
create unique index if not exists amb_applications_one_pending on hdar.amb_applications (user_id) where status = 'pending';
create index if not exists amb_applications_user on hdar.amb_applications (user_id, created_at desc);
alter table hdar.amb_applications enable row level security;
revoke all on hdar.amb_applications from public, anon, authenticated;
revoke all on sequence hdar.amb_applications_id_seq from public, anon, authenticated;

create or replace function hdar.amb_apply_purge() returns void language sql security definer set search_path to '' as $$
  delete from hdar.amb_applications where status = 'refused' and decided_at < now() - interval '6 months';
  update hdar.amb_applications set motivation = '(effacé)', city = '—', audience = null, promote = '(effacé)', admin_note = null
    where status = 'accepted' and decided_at < now() - interval '6 months' and motivation <> '(effacé)';
$$;
revoke all on function hdar.amb_apply_purge() from public, anon, authenticated;

-- état pour la page /ambassadeur
create or replace function public.hdar_amb_apply_status() returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'profile', exists (select 1 from hdar.profiles where user_id = hdar.self_id() and profile_at is not null),
    'ambassador', exists (select 1 from hdar.ambassadors where user_id = hdar.self_id() and active),
    'application', (select jsonb_build_object('status', status, 'at', created_at, 'decided_at', decided_at,
        'note', case when status <> 'pending' then admin_note end)
      from hdar.amb_applications where user_id = hdar.self_id() order by created_at desc limit 1)) $$;

create or replace function public.hdar_amb_apply(p_motivation text, p_city text, p_audience text, p_promote text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); last hdar.amb_applications; m text := btrim(coalesce(p_motivation, '')); c text := btrim(coalesce(p_city, ''));
  a text := nullif(btrim(coalesce(p_audience, '')), ''); p text := btrim(coalesce(p_promote, '')); r hdar.amb_applications;
begin
  if s is null or not exists (select 1 from hdar.profiles where user_id = s and profile_at is not null) then raise exception 'Crée d''abord ton profil pour postuler'; end if;
  if exists (select 1 from hdar.ambassadors where user_id = s and active) then raise exception 'Tu es déjà ambassadeur 🎯'; end if;
  select * into last from hdar.amb_applications where user_id = s order by created_at desc limit 1;
  if last.status = 'pending' then raise exception 'Ta candidature est déjà en cours d''examen'; end if;
  if last.status = 'refused' and last.decided_at > now() - interval '30 days' then raise exception 'Tu pourras repostuler 30 jours après la réponse'; end if;
  if length(m) < 20 then raise exception 'Dis-nous en un peu plus sur ta motivation (20 caractères min.)'; end if;
  if length(c) < 2 then raise exception 'Indique ta ville'; end if;
  if length(p) < 10 then raise exception 'Explique comment tu ferais connaître hdar (10 caractères min.)'; end if;
  perform hdar.rate_check(s, 'amb_apply', 3, interval '1 day');
  insert into hdar.amb_applications (user_id, motivation, city, audience, promote)
    values (s, left(m, 800), left(c, 80), left(a, 300), left(p, 600)) returning * into r;
  return jsonb_build_object('status', r.status, 'at', r.created_at);
end $$;

create or replace function public.hdar_admin_amb_applications(p_key text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  perform hdar.amb_apply_purge();
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'user_id', x.user_id, 'pseudo', coalesce(pf.pseudo, 'Sans pseudo'), 'age', pf.age,
      'photo_ok', coalesce(pf.photo_status = 'approved', false), 'motivation', x.motivation, 'city', x.city, 'audience', x.audience, 'promote', x.promote,
      'status', x.status, 'note', x.admin_note, 'at', x.created_at, 'decided_at', x.decided_at,
      'already_amb', exists (select 1 from hdar.ambassadors a where a.user_id = x.user_id and a.active))
    order by (x.status = 'pending') desc, coalesce(x.decided_at, x.created_at) desc)
    from (select * from hdar.amb_applications where status = 'pending' or decided_at > now() - interval '60 days' order by created_at desc limit 200) x
    left join hdar.profiles pf on pf.user_id = x.user_id), '[]'::jsonb);
end $$;

-- Accepter = donne le rôle (sans toucher un ambassadeur existant) ; il devra signer le contrat v2 dans /ambassadeur.
create or replace function public.hdar_admin_amb_apply_decide(p_key text, p_id bigint, p_accept boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r hdar.amb_applications; c text; n text := nullif(btrim(left(coalesce(p_note, ''), 300)), '');
begin
  perform hdar.admin_check(p_key);
  update hdar.amb_applications set status = case when p_accept then 'accepted' else 'refused' end, admin_note = n, decided_at = now()
    where id = p_id and status = 'pending' returning * into r;
  if r.id is null then raise exception 'Candidature introuvable ou déjà traitée'; end if;
  if p_accept then
    if not exists (select 1 from hdar.ambassadors where user_id = r.user_id) then
      loop c := upper(substr(md5(gen_random_uuid()::text), 1, 6)); exit when not exists (select 1 from hdar.ambassadors where code = c); end loop;
      insert into hdar.ambassadors (user_id, code) values (r.user_id, c);
    elsif not exists (select 1 from hdar.ambassadors where user_id = r.user_id and active) then
      update hdar.ambassadors set active = true, revoked_at = null where user_id = r.user_id;
    end if;
    insert into hdar.user_notices (user_id, title, body) values (r.user_id, 'Candidature ambassadeur acceptée 🎯',
      'Bienvenue ! Ouvre Profil › Espace ambassadeur (hdar.chat/ambassadeur) pour lire et signer ton contrat, puis récupérer ton code.' || coalesce(' Mot de hdar : ' || n, ''));
  else
    insert into hdar.user_notices (user_id, title, body) values (r.user_id, 'Candidature ambassadeur',
      'Merci pour ta candidature. Elle n''a pas été retenue pour le moment ; tu pourras repostuler dans 30 jours.' || coalesce(' Mot de hdar : ' || n, ''));
  end if;
  insert into hdar.admin_audit (admin_uid, action, detail)
    values (auth.uid(), 'amb_apply', jsonb_build_object('id', r.id, 'user', r.user_id, 'accept', p_accept));
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;

-- réservé à l'edge function (service role) : email du compte confirmé, une seule fois par décision
create or replace function public.hdar_amb_apply_mail_info(p_id bigint) returns jsonb language plpgsql security definer set search_path to '' as $$
declare r hdar.amb_applications; e text; ps text;
begin
  update hdar.amb_applications set mailed_at = now() where id = p_id and status <> 'pending' and mailed_at is null returning * into r;
  if r.id is null then return null; end if;
  select u.email, p.pseudo into e, ps from hdar.profiles p left join auth.users u on u.id = p.auth_user_id and u.email_confirmed_at is not null where p.user_id = r.user_id;
  return jsonb_build_object('email', e, 'pseudo', ps, 'status', r.status, 'note', r.admin_note);
end $$;

revoke all on function public.hdar_amb_apply_status(), public.hdar_amb_apply(text, text, text, text), public.hdar_admin_amb_applications(text),
  public.hdar_admin_amb_apply_decide(text, bigint, boolean, text), public.hdar_amb_apply_mail_info(bigint) from public, anon, authenticated;
grant execute on function public.hdar_amb_apply_status(), public.hdar_amb_apply(text, text, text, text), public.hdar_admin_amb_applications(text),
  public.hdar_admin_amb_apply_decide(text, bigint, boolean, text) to authenticated;
grant execute on function public.hdar_amb_apply_mail_info(bigint) to service_role;
