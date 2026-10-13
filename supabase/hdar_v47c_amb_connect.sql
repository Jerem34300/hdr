-- v47c : versements automatiques via Stripe Connect Express (aucun IBAN stocké chez hdar)
drop function if exists public.hdar_amb_accept(text, text, text, text);
drop table if exists hdar.amb_payout_info;
alter table hdar.ambassadors add column if not exists stripe_account text unique, add column if not exists payouts_enabled boolean not null default false,
  add column if not exists paused boolean not null default false, add column if not exists hold_next boolean not null default false;
alter table hdar.amb_payouts add column if not exists status text not null default 'paid', add column if not exists stripe_transfer text unique, add column if not exists error text;

-- charte acceptée (l'IBAN, l'identité et le SIRET sont collectés par Stripe Connect)
create or replace function public.hdar_amb_accept(p_token text) returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c text;
begin
  if not exists (select 1 from hdar.profiles where user_id = s and photo_status = 'approved') then raise exception 'Il faut un profil avec une photo validée'; end if;
  if not exists (select 1 from hdar.ambassadors where user_id = s and active) then
    update hdar.amb_invites set used_by = s, used_at = now() where token = p_token and used_by is null and expires_at > now();
    if not found then raise exception 'Invitation invalide, expirée ou déjà utilisée'; end if;
    loop c := upper(substr(md5(gen_random_uuid()::text), 1, 6)); exit when not exists (select 1 from hdar.ambassadors where code = c); end loop;
    insert into hdar.ambassadors (user_id, code) values (s, c) on conflict (user_id) do update set active = true, revoked_at = null;
  end if;
  update hdar.ambassadors set terms_at = now() where user_id = s;
end $$;
revoke all on function public.hdar_amb_accept(text) from public, anon; grant execute on function public.hdar_amb_accept(text) to authenticated;

-- lu par la fonction Edge avec le jeton de l'utilisateur
create or replace function public.hdar_amb_connect_self() returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('user_id', user_id, 'code', code, 'account', stripe_account) from hdar.ambassadors where user_id = hdar.self_id() and active and terms_at is not null $$;
revoke all on function public.hdar_amb_connect_self() from public, anon; grant execute on function public.hdar_amb_connect_self() to authenticated;

-- service_role uniquement
create or replace function public.hdar_amb_set_account(p_user text, p_account text) returns void language sql security definer set search_path to '' as $$
  update hdar.ambassadors set stripe_account = p_account where user_id = p_user and stripe_account is null $$;
create or replace function public.hdar_amb_account_status(p_account text, p_enabled boolean) returns void language sql security definer set search_path to '' as $$
  update hdar.ambassadors set payouts_enabled = p_enabled where stripe_account = p_account $$;
create or replace function hdar.amb_due(a hdar.ambassadors) returns int language sql stable security definer set search_path to '' as $$
  select (hdar.amb_stats(a, '-infinity', now() + interval '1 second')->>'commission')::int
       - (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id and status in ('paid', 'pending'))::int $$;
create or replace function public.hdar_amb_payout_batch() returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb := '[]'::jsonb; a hdar.ambassadors; d int;
begin
  for a in select * from hdar.ambassadors where active and not paused and terms_at is not null loop
    d := hdar.amb_due(a);
    if d < a.min_payout_cents then continue; end if;
    if a.hold_next then
      update hdar.ambassadors set hold_next = false where user_id = a.user_id;
      insert into hdar.amb_payouts (amb, amount_cents, period_to, note, status) values (a.user_id, d, current_date, 'Versement suspendu par l''admin', 'held');
      continue;
    end if;
    if a.stripe_account is null or not a.payouts_enabled then
      insert into hdar.amb_payouts (amb, amount_cents, period_to, note, status, error) values (a.user_id, d, current_date, 'Compte Stripe non prêt', 'failed', 'connect_not_ready');
      continue;
    end if;
    r := r || jsonb_build_object('user_id', a.user_id, 'account', a.stripe_account, 'cents', d);
  end loop;
  return r;
end $$;
create or replace function public.hdar_amb_payout_record(p_user text, p_cents int, p_transfer text, p_status text, p_error text) returns void language sql security definer set search_path to '' as $$
  insert into hdar.amb_payouts (amb, amount_cents, period_to, note, status, stripe_transfer, error)
  values (p_user, p_cents, current_date, case when p_status = 'paid' then 'Virement Stripe automatique' else 'Échec du virement' end, p_status, p_transfer, left(p_error, 300)) $$;
create or replace function public.hdar_amb_cron_key() returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'hdar_amb_cron_key' $$;
revoke all on function public.hdar_amb_set_account(text, text), public.hdar_amb_account_status(text, boolean), public.hdar_amb_payout_batch(),
  public.hdar_amb_payout_record(text, int, text, text, text), public.hdar_amb_cron_key() from public, anon, authenticated;
grant execute on function public.hdar_amb_set_account(text, text), public.hdar_amb_account_status(text, boolean), public.hdar_amb_payout_batch(),
  public.hdar_amb_payout_record(text, int, text, text, text), public.hdar_amb_cron_key() to service_role;
revoke all on function hdar.amb_due(hdar.ambassadors) from public, anon, authenticated;

select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hdar_amb_cron_key')
  where not exists (select 1 from vault.secrets where name = 'hdar_amb_cron_key');
select cron.unschedule('hdar-amb-payouts') where exists (select 1 from cron.job where jobname = 'hdar-amb-payouts');
select cron.schedule('hdar-amb-payouts', '0 9 1 * *', $c$
  select net.http_post(url := 'https://hoomzhgqzwuystwburfa.supabase.co/functions/v1/hdar-amb-payouts',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hdar_amb_cron_key')),
    body := '{}'::jsonb) $c$);

-- admin : pause ambassadeur / suspendre le prochain versement ; manuel = statut paid
create or replace function public.hdar_admin_amb_flags(p_key text, p_user text, p_paused boolean, p_hold boolean) returns void language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.ambassadors set paused = coalesce(p_paused, paused), hold_next = coalesce(p_hold, hold_next) where user_id = p_user;
end $$;
revoke all on function public.hdar_admin_amb_flags(text, text, boolean, boolean) from public, anon; grant execute on function public.hdar_admin_amb_flags(text, text, boolean, boolean) to authenticated;

create or replace function public.hdar_admin_ambs(p_key text, p_from timestamptz default '-infinity', p_to timestamptz default null) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'revoked_at' || jsonb_build_object('pseudo', coalesce(pf.pseudo, 'Sans pseudo'),
      'stats', hdar.amb_stats(a, coalesce(p_from, '-infinity'), coalesce(p_to, now() + interval '1 second')),
      'paid_total', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id and status = 'paid'),
      'due_total', hdar.amb_due(a),
      'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount', amount_cents, 'from', period_from, 'to', period_to, 'note', note, 'at', paid_at, 'status', status, 'error', error) order by paid_at desc) from hdar.amb_payouts where amb = a.user_id), '[]'::jsonb),
      'promos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'promo', promo, 'status', promo_status)) from hdar.places where amb = a.user_id and promo is not null), '[]'::jsonb))
    order by a.active desc, a.created_at) from hdar.ambassadors a left join hdar.profiles pf on pf.user_id = a.user_id), '[]'::jsonb);
end $$;

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
    'connect', case when a.stripe_account is null then 'none' when a.payouts_enabled then 'ready' else 'pending' end, 'paused', a.paused,
    'month', hdar.amb_stats(a, date_trunc('month', now()), now() + interval '1 second'), 'total', tot,
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'amount', amount, 'used', uses >= max_uses, 'expires_at', expires_at) order by created_at desc)
        from (select * from hdar.gift_codes where amb = s order by created_at desc limit 20) g), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'claimed', claimed_at is not null, 'active', coalesce(partner_until > now(), false),
        'token', case when claimed_at is null then claim_token end, 'promo', promo, 'promo_status', promo_status) order by created_at desc) from hdar.places where amb = s), '[]'::jsonb));
end $$;
