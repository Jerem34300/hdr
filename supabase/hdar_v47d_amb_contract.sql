-- v47d : contrat ambassadeur signé électroniquement (nom saisi, version, date, IP hachée)
create table if not exists hdar.amb_contracts (id bigserial primary key, user_id text not null, version text not null, full_name text not null,
  accepted_at timestamptz not null default now(), ip_hash text, user_agent text);
create index if not exists amb_contracts_user on hdar.amb_contracts (user_id, accepted_at desc);
alter table hdar.amb_contracts enable row level security;
alter table hdar.ambassadors add column if not exists contract_version text;

-- l'acceptation ne passe plus que par la fonction Edge hdar-amb-contract (signature enregistrée)
revoke execute on function public.hdar_amb_accept(text) from authenticated;

create or replace function public.hdar_amb_whoami() returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('user_id', p.user_id, 'photo_ok', p.photo_status = 'approved',
    'email', (select u.email from auth.users u where u.id = p.auth_user_id and u.email_confirmed_at is not null))
  from hdar.profiles p where p.user_id = hdar.self_id() $$;
revoke all on function public.hdar_amb_whoami() from public, anon; grant execute on function public.hdar_amb_whoami() to authenticated;

create or replace function public.hdar_amb_sign(p_user text, p_token text, p_name text, p_version text, p_ip_hash text, p_ua text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c text; r hdar.amb_contracts;
begin
  if not exists (select 1 from hdar.profiles where user_id = p_user and photo_status = 'approved') then raise exception 'Il faut un profil avec une photo validée'; end if;
  if length(btrim(coalesce(p_name, ''))) < 4 or btrim(p_name) !~ '\s' then raise exception 'Saisis ton nom et prénom complets'; end if;
  if not exists (select 1 from hdar.ambassadors where user_id = p_user and active) then
    update hdar.amb_invites set used_by = p_user, used_at = now() where token = p_token and used_by is null and expires_at > now();
    if not found then raise exception 'Invitation invalide, expirée ou déjà utilisée'; end if;
    loop c := upper(substr(md5(gen_random_uuid()::text), 1, 6)); exit when not exists (select 1 from hdar.ambassadors where code = c); end loop;
    insert into hdar.ambassadors (user_id, code) values (p_user, c) on conflict (user_id) do update set active = true, revoked_at = null;
  end if;
  insert into hdar.amb_contracts (user_id, version, full_name, ip_hash, user_agent) values (p_user, p_version, left(btrim(p_name), 120), p_ip_hash, left(p_ua, 300)) returning * into r;
  update hdar.ambassadors set terms_at = r.accepted_at, contract_version = p_version where user_id = p_user;
  return jsonb_build_object('id', r.id, 'name', r.full_name, 'version', r.version, 'at', r.accepted_at, 'ip_hash', r.ip_hash,
    'code', (select code from hdar.ambassadors where user_id = p_user));
end $$;
create or replace function public.hdar_amb_contract_get(p_user text) returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', c.id, 'name', c.full_name, 'version', c.version, 'at', c.accepted_at, 'ip_hash', c.ip_hash, 'code', a.code)
  from hdar.amb_contracts c left join hdar.ambassadors a on a.user_id = c.user_id where c.user_id = p_user order by c.accepted_at desc limit 1 $$;
revoke all on function public.hdar_amb_sign(text, text, text, text, text, text), public.hdar_amb_contract_get(text) from public, anon, authenticated;
grant execute on function public.hdar_amb_sign(text, text, text, text, text, text), public.hdar_amb_contract_get(text) to service_role;

-- contrôle admin appelable par la fonction Edge (clé admin transmise par l'admin connecté)
create or replace function public.hdar_admin_amb_contract_ok(p_key text) returns boolean language plpgsql security definer set search_path to '' as $$
begin perform hdar.admin_check(p_key); return true; end $$;
revoke all on function public.hdar_admin_amb_contract_ok(text) from public, anon; grant execute on function public.hdar_admin_amb_contract_ok(text) to authenticated;

create or replace function public.hdar_amb_me() returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ambassadors; wk int; tot jsonb;
begin
  select * into a from hdar.ambassadors where user_id = s and active;
  if a.user_id is null then return null; end if;
  if a.terms_at is null then return jsonb_build_object('needs_terms', true); end if;
  select count(*) into wk from hdar.gift_codes where amb = s and created_at > now() - interval '7 days';
  tot := hdar.amb_stats(a, '-infinity', now() + interval '1 second');
  return jsonb_build_object('code', a.code, 'codes_per_week', a.codes_per_week, 'codes_left', greatest(a.codes_per_week - wk, 0),
    'max_days', a.max_days, 'max_boost_h', a.max_boost_h, 'max_hearts', a.max_hearts,
    'per_signup_cents', a.per_signup_cents, 'partner_pct', a.partner_pct, 'partner_months', a.partner_months, 'user_pct', a.user_pct, 'user_months', a.user_months,
    'bonus_cents', a.bonus_cents, 'bonus_at', a.bonus_at, 'min_payout_cents', a.min_payout_cents,
    'paid_total', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = s and status = 'paid'),
    'connect', case when a.stripe_account is null then 'none' when a.payouts_enabled then 'ready' else 'pending' end, 'paused', a.paused, 'contract', (select jsonb_build_object('version', version, 'at', accepted_at, 'name', full_name) from hdar.amb_contracts where user_id = s order by accepted_at desc limit 1),
    'month', hdar.amb_stats(a, date_trunc('month', now()), now() + interval '1 second'), 'total', tot,
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'amount', amount, 'used', uses >= max_uses, 'expires_at', expires_at) order by created_at desc)
        from (select * from hdar.gift_codes where amb = s order by created_at desc limit 20) g), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'claimed', claimed_at is not null, 'active', coalesce(partner_until > now(), false),
        'token', case when claimed_at is null then claim_token end, 'promo', promo, 'promo_status', promo_status) order by created_at desc) from hdar.places where amb = s), '[]'::jsonb));
end $$;

create or replace function public.hdar_admin_ambs(p_key text, p_from timestamptz default '-infinity', p_to timestamptz default null) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'revoked_at' || jsonb_build_object('pseudo', coalesce(pf.pseudo, 'Sans pseudo'),
      'stats', hdar.amb_stats(a, coalesce(p_from, '-infinity'), coalesce(p_to, now() + interval '1 second')),
      'paid_total', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id and status = 'paid'),
      'due_total', hdar.amb_due(a), 'contract', (select jsonb_build_object('version', version, 'at', accepted_at, 'name', full_name) from hdar.amb_contracts c where c.user_id = a.user_id order by accepted_at desc limit 1),
      'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount', amount_cents, 'from', period_from, 'to', period_to, 'note', note, 'at', paid_at, 'status', status, 'error', error) order by paid_at desc) from hdar.amb_payouts where amb = a.user_id), '[]'::jsonb),
      'promos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'promo', promo, 'status', promo_status)) from hdar.places where amb = a.user_id and promo is not null), '[]'::jsonb))
    order by a.active desc, a.created_at) from hdar.ambassadors a left join hdar.profiles pf on pf.user_id = a.user_id), '[]'::jsonb);
end $$;
