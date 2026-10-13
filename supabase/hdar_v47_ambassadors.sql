-- v47 : programme ambassadeurs (promo de rue). Les ambassadeurs ne voient jamais d'identités, seulement des compteurs.
create table if not exists hdar.ambassadors (user_id text primary key, code text unique not null, active boolean not null default true,
  codes_per_week int not null default 10, max_days int not null default 3, max_boost_h int not null default 24, max_hearts int not null default 20,
  per_signup_cents int not null default 200, partner_pct numeric not null default 20, partner_months int not null default 3,
  note text, created_at timestamptz not null default now(), revoked_at timestamptz);
create table if not exists hdar.amb_signups (user_id text primary key, amb text not null references hdar.ambassadors(user_id) on delete cascade, created_at timestamptz not null default now());
create index if not exists amb_signups_amb on hdar.amb_signups (amb, created_at);
create table if not exists hdar.amb_payouts (id bigserial primary key, amb text not null references hdar.ambassadors(user_id) on delete cascade,
  amount_cents int not null, period_from date, period_to date, note text, paid_at timestamptz not null default now());
alter table hdar.gift_codes add column if not exists amb text;
alter table hdar.places add column if not exists amb text, add column if not exists claim_token text unique, add column if not exists claimed_at timestamptz,
  add column if not exists promo text, add column if not exists promo_status text;
alter table hdar.ambassadors enable row level security; alter table hdar.amb_signups enable row level security; alter table hdar.amb_payouts enable row level security;

-- stats agrégées d'un ambassadeur sur une période (aucune identité)
create or replace function hdar.amb_stats(a hdar.ambassadors, p_from timestamptz, p_to timestamptz) returns jsonb language sql stable security definer set search_path to '' as $$
  with su as (select s.user_id, s.created_at, coalesce(pf.photo_status = 'approved', false) ok from hdar.amb_signups s left join hdar.profiles pf on pf.user_id = s.user_id
              where s.amb = a.user_id and s.created_at >= p_from and s.created_at < p_to),
       pl as (select * from hdar.places where amb = a.user_id),
       urev as (select coalesce(sum(y.amount_cents - y.refunded_cents), 0) c from hdar.payments y join hdar.amb_signups s on s.user_id = y.user_id
              where s.amb = a.user_id and y.place_id is null and y.created_at >= p_from and y.created_at < p_to),
       prev as (select coalesce(sum(y.amount_cents - y.refunded_cents), 0) c, coalesce(sum(y.amount_cents - y.refunded_cents) filter (where y.kind = 'listing'
                  and y.created_at < coalesce(p.claimed_at, p.created_at) + make_interval(months => a.partner_months)), 0) comm_base
              from hdar.payments y join pl p on p.id = y.place_id where y.created_at >= p_from and y.created_at < p_to)
  select jsonb_build_object(
    'signups', (select count(*) from su), 'validated', (select count(*) from su where ok),
    'codes_created', (select count(*) from hdar.gift_codes where amb = a.user_id and created_at >= p_from and created_at < p_to),
    'codes_redeemed', (select count(*) from hdar.gift_code_uses u join hdar.gift_codes g on g.code = u.code where g.amb = a.user_id and u.at >= p_from and u.at < p_to),
    'places', (select count(*) from pl where created_at >= p_from and created_at < p_to),
    'places_claimed', (select count(*) from pl where claimed_at is not null),
    'places_active', (select count(*) from pl where partner_until > now()),
    'revenue_users', (select c from urev), 'revenue_partners', (select c from prev),
    'commission', (select count(*) from su where ok) * a.per_signup_cents + round((select comm_base from prev) * a.partner_pct / 100),
    'paid', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id and paid_at >= p_from and paid_at < p_to)) $$;
revoke all on function hdar.amb_stats(hdar.ambassadors, timestamptz, timestamptz) from public, anon, authenticated;

-- attribution (le nouveau profil, dans les 7 jours après sa création, une seule fois)
create or replace function public.hdar_amb_attach(p_code text) returns boolean language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ambassadors;
begin
  select * into a from hdar.ambassadors where code = upper(btrim(p_code)) and active;
  if a.user_id is null or a.user_id = s or exists (select 1 from hdar.amb_signups where user_id = s) then return false; end if;
  if exists (select 1 from hdar.profiles where user_id = s and created_at < now() - interval '7 days') then return false; end if;
  insert into hdar.amb_signups (user_id, amb) values (s, a.user_id);
  return true;
end $$;

create or replace function public.hdar_amb_me() returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ambassadors; wk int;
begin
  select * into a from hdar.ambassadors where user_id = s and active;
  if a.user_id is null then return null; end if;
  select count(*) into wk from hdar.gift_codes where amb = s and created_at > now() - interval '7 days';
  return jsonb_build_object('code', a.code, 'codes_per_week', a.codes_per_week, 'codes_left', greatest(a.codes_per_week - wk, 0),
    'max_days', a.max_days, 'max_boost_h', a.max_boost_h, 'max_hearts', a.max_hearts,
    'per_signup_cents', a.per_signup_cents, 'partner_pct', a.partner_pct, 'partner_months', a.partner_months,
    'month', hdar.amb_stats(a, date_trunc('month', now()), now() + interval '1 second'),
    'total', hdar.amb_stats(a, '-infinity', now() + interval '1 second'),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'amount', amount, 'used', uses >= max_uses, 'expires_at', expires_at) order by created_at desc)
        from (select * from hdar.gift_codes where amb = s order by created_at desc limit 20) g), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'claimed', claimed_at is not null, 'active', coalesce(partner_until > now(), false),
        'token', case when claimed_at is null then claim_token end, 'promo', promo, 'promo_status', promo_status) order by created_at desc) from hdar.places where amb = s), '[]'::jsonb));
end $$;

create or replace function public.hdar_amb_code_create(p_kind text, p_amount int) returns text language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ambassadors; c text; mx int;
begin
  select * into a from hdar.ambassadors where user_id = s and active;
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
  if not exists (select 1 from hdar.ambassadors where user_id = s and active) then raise exception 'Réservé aux ambassadeurs'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then raise exception 'Nom requis'; end if;
  if (select count(*) from hdar.places where amb = s and created_at > now() - interval '1 day') >= 20 then raise exception 'Trop de fiches aujourd''hui'; end if;
  insert into hdar.places (kind, name, description, lat, lng, source, status, partner, submitted_by, contact, amb, claim_token, promo, promo_status)
  values (coalesce(p_kind, 'bar'), left(btrim(p_name), 80), left(p_description, 1000), p_lat, p_lng, 'ambassador', 'pending', true, s, left(p_contact, 200), s, t,
          nullif(left(btrim(coalesce(p_promo, '')), 300), ''), case when nullif(btrim(coalesce(p_promo, '')), '') is not null then 'pending' end)
  returning places.id into id;
  return jsonb_build_object('id', id, 'token', t);
end $$;

create or replace function public.hdar_place_claim(p_token text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.places;
begin
  select * into p from hdar.places where claim_token = p_token and claimed_at is null for update;
  if p.id is null then raise exception 'Lien invalide ou déjà utilisé'; end if;
  if p.amb = s then raise exception 'L''ambassadeur ne peut pas réclamer sa propre fiche'; end if;
  update hdar.places set owner_id = s, claimed_at = now(), claim_token = null where id = p.id;
  return jsonb_build_object('id', p.id, 'name', p.name, 'promo', case when p.promo_status = 'approved' then p.promo end);
end $$;
create or replace function public.hdar_place_claim_info(p_token text) returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('name', name, 'kind', kind, 'promo', case when promo_status = 'approved' then promo end) from hdar.places where claim_token = p_token and claimed_at is null $$;

-- admin
create or replace function public.hdar_admin_amb_search(p_key text, p_q text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'pseudo', pseudo, 'amb', exists (select 1 from hdar.ambassadors a where a.user_id = p.user_id and a.active)))
    from (select * from hdar.profiles where pseudo ilike '%' || btrim(p_q) || '%' order by updated_at desc nulls last limit 15) p), '[]'::jsonb);
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
    per_signup_cents = coalesce((p_rules->>'per_signup_cents')::int, per_signup_cents), partner_pct = coalesce((p_rules->>'partner_pct')::numeric, partner_pct),
    partner_months = coalesce((p_rules->>'partner_months')::int, partner_months), note = coalesce(p_rules->>'note', note)
  where user_id = p_user;
end $$;

create or replace function public.hdar_admin_ambs(p_key text, p_from timestamptz default '-infinity', p_to timestamptz default null) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'pseudo', coalesce(pf.pseudo, 'Sans pseudo'), 'code', a.code, 'active', a.active,
      'codes_per_week', a.codes_per_week, 'max_days', a.max_days, 'max_boost_h', a.max_boost_h, 'max_hearts', a.max_hearts,
      'per_signup_cents', a.per_signup_cents, 'partner_pct', a.partner_pct, 'partner_months', a.partner_months, 'note', a.note,
      'stats', hdar.amb_stats(a, coalesce(p_from, '-infinity'), coalesce(p_to, now() + interval '1 second')),
      'paid_total', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id),
      'due_total', (hdar.amb_stats(a, '-infinity', now() + interval '1 second')->>'commission')::int - (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id),
      'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount', amount_cents, 'from', period_from, 'to', period_to, 'note', note, 'at', paid_at) order by paid_at desc) from hdar.amb_payouts where amb = a.user_id), '[]'::jsonb),
      'promos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'promo', promo, 'status', promo_status)) from hdar.places where amb = a.user_id and promo is not null), '[]'::jsonb))
    order by a.active desc, a.created_at) from hdar.ambassadors a left join hdar.profiles pf on pf.user_id = a.user_id), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_amb_payout(p_key text, p_user text, p_cents int, p_from date, p_to date, p_note text) returns void language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  if p_cents <= 0 then raise exception 'Montant invalide'; end if;
  insert into hdar.amb_payouts (amb, amount_cents, period_from, period_to, note) values (p_user, p_cents, p_from, p_to, left(p_note, 200));
end $$;

create or replace function public.hdar_admin_amb_promo(p_key text, p_place uuid, p_status text) returns void language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  if p_status not in ('approved', 'refused') then raise exception 'Statut invalide'; end if;
  update hdar.places set promo_status = p_status where id = p_place and promo is not null;
end $$;

revoke all on function public.hdar_amb_attach(text), public.hdar_amb_me(), public.hdar_amb_code_create(text, int),
  public.hdar_amb_place_create(text, text, text, double precision, double precision, text, text), public.hdar_place_claim(text), public.hdar_place_claim_info(text),
  public.hdar_admin_amb_search(text, text), public.hdar_admin_amb_set(text, text, boolean, jsonb), public.hdar_admin_ambs(text, timestamptz, timestamptz),
  public.hdar_admin_amb_payout(text, text, int, date, date, text), public.hdar_admin_amb_promo(text, uuid, text) from public, anon;
grant execute on function public.hdar_amb_attach(text), public.hdar_amb_me(), public.hdar_amb_code_create(text, int),
  public.hdar_amb_place_create(text, text, text, double precision, double precision, text, text), public.hdar_place_claim(text), public.hdar_place_claim_info(text),
  public.hdar_admin_amb_search(text, text), public.hdar_admin_amb_set(text, text, boolean, jsonb), public.hdar_admin_ambs(text, timestamptz, timestamptz),
  public.hdar_admin_amb_payout(text, text, int, date, date, text), public.hdar_admin_amb_promo(text, uuid, text) to authenticated;
