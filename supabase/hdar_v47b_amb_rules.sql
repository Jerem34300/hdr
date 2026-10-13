-- v47b : règles par défaut + anti-fraude, onboarding sur invitation, charte, infos de paiement (admin uniquement)
alter table hdar.ambassadors alter column per_signup_cents set default 50, alter column partner_pct set default 25, alter column partner_months set default 3,
  add column if not exists user_pct numeric not null default 20, add column if not exists user_months int not null default 6,
  add column if not exists bonus_cents int not null default 2000, add column if not exists bonus_at int not null default 50,
  add column if not exists min_payout_cents int not null default 2000, add column if not exists terms_at timestamptz;
update hdar.ambassadors set per_signup_cents = 50, partner_pct = 25 where terms_at is null and per_signup_cents = 200;
create table if not exists hdar.amb_invites (token text primary key, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '7 days',
  used_by text, used_at timestamptz, note text);
create table if not exists hdar.amb_payout_info (user_id text primary key references hdar.ambassadors(user_id) on delete cascade, full_name text not null, iban text not null, siret text not null, updated_at timestamptz not null default now());
alter table hdar.amb_invites enable row level security; alter table hdar.amb_payout_info enable row level security;

create or replace function hdar.amb_stats(a hdar.ambassadors, p_from timestamptz, p_to timestamptz) returns jsonb language sql stable security definer set search_path to '' as $$
  with su as (select s.user_id, s.created_at,
                coalesce(pf.photo_status = 'approved' and s.created_at < now() - interval '7 days'
                  and greatest(pf.updated_at, pf.visible_until) >= s.created_at + interval '7 days', false) ok
              from hdar.amb_signups s left join hdar.profiles pf on pf.user_id = s.user_id
              where s.amb = a.user_id and s.created_at >= p_from and s.created_at < p_to),
       pl as (select * from hdar.places where amb = a.user_id),
       urev as (select coalesce(sum(y.amount_cents - y.refunded_cents - round(y.amount_cents * 0.015 + 25)), 0) c,
                  coalesce(sum(y.amount_cents - y.refunded_cents - round(y.amount_cents * 0.015 + 25)) filter (where y.created_at < s.created_at + make_interval(months => a.user_months)), 0) base
              from hdar.payments y join hdar.amb_signups s on s.user_id = y.user_id
              where s.amb = a.user_id and y.place_id is null and y.created_at >= p_from and y.created_at < p_to),
       prev as (select coalesce(sum(y.amount_cents - y.refunded_cents - round(y.amount_cents * 0.015 + 25)), 0) c,
                  coalesce(sum(y.amount_cents - y.refunded_cents - round(y.amount_cents * 0.015 + 25)) filter (where y.kind = 'listing'
                  and y.created_at < coalesce(p.claimed_at, p.created_at) + make_interval(months => a.partner_months)), 0) base
              from hdar.payments y join pl p on p.id = y.place_id where y.created_at >= p_from and y.created_at < p_to),
       bon as (select count(*) n from (select date_trunc('month', created_at) from su where ok group by 1 having count(*) >= a.bonus_at) m)
  select jsonb_build_object(
    'signups', (select count(*) from su), 'validated', (select count(*) from su where ok),
    'codes_created', (select count(*) from hdar.gift_codes where amb = a.user_id and created_at >= p_from and created_at < p_to),
    'codes_redeemed', (select count(*) from hdar.gift_code_uses u join hdar.gift_codes g on g.code = u.code where g.amb = a.user_id and u.at >= p_from and u.at < p_to),
    'places', (select count(*) from pl where created_at >= p_from and created_at < p_to),
    'places_claimed', (select count(*) from pl where claimed_at is not null),
    'places_active', (select count(*) from pl where partner_until > now()),
    'revenue_users', (select c from urev), 'revenue_partners', (select c from prev), 'bonuses', (select n from bon),
    'commission', greatest(0, (select count(*) from su where ok) * a.per_signup_cents + round((select base from urev) * a.user_pct / 100)
                  + round((select base from prev) * a.partner_pct / 100) + (select n from bon) * a.bonus_cents),
    'paid', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id and paid_at >= p_from and paid_at < p_to)) $$;
revoke all on function hdar.amb_stats(hdar.ambassadors, timestamptz, timestamptz) from public, anon, authenticated;

-- l'espace n'est utilisable qu'après acceptation de la charte
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
    'paid_total', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = s),
    'has_payout_info', exists (select 1 from hdar.amb_payout_info where user_id = s),
    'month', hdar.amb_stats(a, date_trunc('month', now()), now() + interval '1 second'), 'total', tot,
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'amount', amount, 'used', uses >= max_uses, 'expires_at', expires_at) order by created_at desc)
        from (select * from hdar.gift_codes where amb = s order by created_at desc limit 20) g), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'claimed', claimed_at is not null, 'active', coalesce(partner_until > now(), false),
        'token', case when claimed_at is null then claim_token end, 'promo', promo, 'promo_status', promo_status) order by created_at desc) from hdar.places where amb = s), '[]'::jsonb));
end $$;

create or replace function public.hdar_amb_invite_info(p_token text) returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('valid', exists (select 1 from hdar.amb_invites where token = p_token and used_by is null and expires_at > now()),
    'photo_ok', exists (select 1 from hdar.profiles where user_id = hdar.self_id() and photo_status = 'approved')) $$;

-- invitation (une fois) ou rôle déjà donné par l'admin : charte + infos de paiement
create or replace function public.hdar_amb_accept(p_token text, p_name text, p_iban text, p_siret text) returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c text; iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')); siret text := regexp_replace(coalesce(p_siret, ''), '\s', '', 'g');
begin
  if not exists (select 1 from hdar.profiles where user_id = s and photo_status = 'approved') then raise exception 'Il faut un profil avec une photo validée'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null or iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' or siret !~ '^[0-9]{14}$' then
    raise exception 'Nom, IBAN ou SIRET (14 chiffres) invalide'; end if;
  if not exists (select 1 from hdar.ambassadors where user_id = s and active) then
    update hdar.amb_invites set used_by = s, used_at = now() where token = p_token and used_by is null and expires_at > now();
    if not found then raise exception 'Invitation invalide, expirée ou déjà utilisée'; end if;
    loop c := upper(substr(md5(gen_random_uuid()::text), 1, 6)); exit when not exists (select 1 from hdar.ambassadors where code = c); end loop;
    insert into hdar.ambassadors (user_id, code) values (s, c) on conflict (user_id) do update set active = true, revoked_at = null;
  end if;
  update hdar.ambassadors set terms_at = now() where user_id = s;
  insert into hdar.amb_payout_info (user_id, full_name, iban, siret) values (s, left(btrim(p_name), 120), iban, siret)
    on conflict (user_id) do update set full_name = excluded.full_name, iban = excluded.iban, siret = excluded.siret, updated_at = now();
end $$;

create or replace function public.hdar_admin_amb_invite(p_key text, p_note text default null) returns text language plpgsql security definer set search_path to '' as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  perform hdar.admin_check(p_key);
  insert into hdar.amb_invites (token, note) values (t, left(p_note, 200));
  return t;
end $$;

create or replace function public.hdar_admin_amb_set(p_key text, p_user text, p_active boolean, p_rules jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path to '' as $$
declare c text;
begin
  perform hdar.admin_check(p_key);
  if not exists (select 1 from hdar.profiles where user_id = p_user) then raise exception 'Profil introuvable'; end if;
  loop c := upper(substr(md5(gen_random_uuid()::text), 1, 6)); exit when not exists (select 1 from hdar.ambassadors where code = c); end loop;
  insert into hdar.ambassadors (user_id, code) values (p_user, c) on conflict (user_id) do nothing;
  update hdar.ambassadors set active = p_active, revoked_at = case when p_active then null else now() end,
    codes_per_week = coalesce((p_rules->>'codes_per_week')::int, codes_per_week), max_days = coalesce((p_rules->>'max_days')::int, max_days),
    max_boost_h = coalesce((p_rules->>'max_boost_h')::int, max_boost_h), max_hearts = coalesce((p_rules->>'max_hearts')::int, max_hearts),
    per_signup_cents = coalesce((p_rules->>'per_signup_cents')::int, per_signup_cents),
    user_pct = coalesce((p_rules->>'user_pct')::numeric, user_pct), user_months = coalesce((p_rules->>'user_months')::int, user_months),
    partner_pct = coalesce((p_rules->>'partner_pct')::numeric, partner_pct), partner_months = coalesce((p_rules->>'partner_months')::int, partner_months),
    bonus_cents = coalesce((p_rules->>'bonus_cents')::int, bonus_cents), bonus_at = coalesce((p_rules->>'bonus_at')::int, bonus_at),
    min_payout_cents = coalesce((p_rules->>'min_payout_cents')::int, min_payout_cents), note = coalesce(p_rules->>'note', note)
  where user_id = p_user;
end $$;

create or replace function public.hdar_admin_ambs(p_key text, p_from timestamptz default '-infinity', p_to timestamptz default null) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'revoked_at' || jsonb_build_object('pseudo', coalesce(pf.pseudo, 'Sans pseudo'),
      'stats', hdar.amb_stats(a, coalesce(p_from, '-infinity'), coalesce(p_to, now() + interval '1 second')),
      'paid_total', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id),
      'due_total', (hdar.amb_stats(a, '-infinity', now() + interval '1 second')->>'commission')::int - (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id),
      'payout_info', (select jsonb_build_object('name', full_name, 'iban', iban, 'siret', siret) from hdar.amb_payout_info where user_id = a.user_id),
      'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount', amount_cents, 'from', period_from, 'to', period_to, 'note', note, 'at', paid_at) order by paid_at desc) from hdar.amb_payouts where amb = a.user_id), '[]'::jsonb),
      'promos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'promo', promo, 'status', promo_status)) from hdar.places where amb = a.user_id and promo is not null), '[]'::jsonb))
    order by a.active desc, a.created_at) from hdar.ambassadors a left join hdar.profiles pf on pf.user_id = a.user_id), '[]'::jsonb);
end $$;

-- un ambassadeur doit avoir accepté la charte pour agir
create or replace function hdar.amb_ok(s text) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from hdar.ambassadors where user_id = s and active and terms_at is not null) $$;
revoke all on function public.hdar_amb_invite_info(text), public.hdar_amb_accept(text, text, text, text), public.hdar_admin_amb_invite(text, text) from public, anon;
grant execute on function public.hdar_amb_invite_info(text), public.hdar_amb_accept(text, text, text, text), public.hdar_admin_amb_invite(text, text) to authenticated;

create or replace function public.hdar_amb_code_create(p_kind text, p_amount int) returns text language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ambassadors; c text; mx int;
begin
  select * into a from hdar.ambassadors where user_id = s and active and terms_at is not null;
  if a.user_id is null then raise exception 'Réservé aux ambassadeurs'; end if;
  mx := case p_kind when 'premium' then a.max_days when 'boost' then a.max_boost_h when 'hearts' then a.max_hearts end;
  if mx is null then raise exception 'Type inconnu'; end if;
  if p_amount < 1 or p_amount > mx then raise exception 'Maximum autorisé : %', mx; end if;
  if (select count(*) from hdar.gift_codes where amb = s and created_at > now() - interval '7 days') >= a.codes_per_week then raise exception 'Limite de codes de la semaine atteinte'; end if;
  loop
    c := 'A' || upper(substr(md5(gen_random_uuid()::text), 1, 7));
    exit when not exists (select 1 from hdar.gift_codes where code = c);
  end loop;
  insert into hdar.gift_codes (code, kind, amount, max_uses, uses, expires_at, note, amb) values (c, p_kind, p_amount, 1, 0, now() + interval '30 days', 'Ambassadeur ' || a.code, s);
  return c;
end $$;

create or replace function public.hdar_amb_place_create(p_kind text, p_name text, p_description text, p_lat double precision, p_lng double precision, p_contact text, p_promo text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); t text := replace(gen_random_uuid()::text, '-', ''); id uuid;
begin
  if not hdar.amb_ok(s) then raise exception 'Réservé aux ambassadeurs'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then raise exception 'Nom requis'; end if;
  if (select count(*) from hdar.places where amb = s and created_at > now() - interval '1 day') >= 20 then raise exception 'Trop de fiches aujourd''hui'; end if;
  insert into hdar.places (kind, name, description, lat, lng, source, status, partner, submitted_by, contact, amb, claim_token, promo, promo_status)
  values (coalesce(p_kind, 'bar'), left(btrim(p_name), 80), left(p_description, 1000), p_lat, p_lng, 'ambassador', 'pending', true, s, left(p_contact, 200), s, t,
          nullif(left(btrim(coalesce(p_promo, '')), 300), ''), case when nullif(btrim(coalesce(p_promo, '')), '') is not null then 'pending' end)
  returning places.id into id;
  return jsonb_build_object('id', id, 'token', t);
end $$;
