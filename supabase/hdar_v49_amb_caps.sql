-- v49 : plafonds des primes d'inscription (par ambassadeur / mois + budget global / mois). Les % sur encaissements restent non plafonnés.
create table if not exists hdar.amb_settings (id int primary key default 1 check (id = 1), signup_cap_cents int not null default 10000, global_budget_cents int not null default 50000);
insert into hdar.amb_settings (id) values (1) on conflict do nothing;
alter table hdar.amb_settings enable row level security;
alter table hdar.ambassadors add column if not exists signup_cap_cents int;

-- primes d'inscription (0,50 € / validé + bonus palier) d'un ambassadeur pour un mois, plafonnées par ambassadeur
create or replace function hdar.amb_signup_raw(a hdar.ambassadors, m date) returns int language sql stable security definer set search_path to '' as $$
  with v as (select count(*) n from hdar.amb_signups s join hdar.profiles pf on pf.user_id = s.user_id
             where s.amb = a.user_id and date_trunc('month', s.created_at) = m and s.created_at < now() - interval '7 days'
               and pf.photo_status = 'approved' and greatest(pf.updated_at, pf.visible_until) >= s.created_at + interval '7 days')
  select least((select n from v) * a.per_signup_cents + case when (select n from v) >= a.bonus_at then a.bonus_cents else 0 end,
               coalesce(a.signup_cap_cents, (select signup_cap_cents from hdar.amb_settings where id = 1)))::int $$;
-- facteur du budget global du mois (réduction proportionnelle si le total dépasse le budget)
create or replace function hdar.amb_budget_factor(m date) returns numeric language sql stable security definer set search_path to '' as $$
  select case when t.total <= 0 then 1 else least(1, (select global_budget_cents from hdar.amb_settings where id = 1)::numeric / t.total) end
  from (select coalesce(sum(hdar.amb_signup_raw(a, m)), 0) total from hdar.ambassadors a) t $$;
create or replace function hdar.amb_signup_due(a hdar.ambassadors, p_from timestamptz, p_to timestamptz) returns int language sql stable security definer set search_path to '' as $$
  select coalesce(sum(floor(hdar.amb_signup_raw(a, m::date) * hdar.amb_budget_factor(m::date))), 0)::int
  from generate_series(date_trunc('month', greatest(p_from, coalesce((select min(created_at) from hdar.amb_signups where amb = a.user_id), now()))),
                       date_trunc('month', least(p_to, now())), interval '1 month') m $$;
revoke all on function hdar.amb_signup_raw(hdar.ambassadors, date), hdar.amb_budget_factor(date), hdar.amb_signup_due(hdar.ambassadors, timestamptz, timestamptz) from public, anon, authenticated;

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
       bon as (select count(*) n from (select date_trunc('month', created_at) from su where ok group by 1 having count(*) >= a.bonus_at) m),
       sd as (select hdar.amb_signup_due(a, p_from, p_to) c)
  select jsonb_build_object(
    'signups', (select count(*) from su), 'validated', (select count(*) from su where ok),
    'codes_created', (select count(*) from hdar.gift_codes where amb = a.user_id and created_at >= p_from and created_at < p_to),
    'codes_redeemed', (select count(*) from hdar.gift_code_uses u join hdar.gift_codes g on g.code = u.code where g.amb = a.user_id and u.at >= p_from and u.at < p_to),
    'places', (select count(*) from pl where created_at >= p_from and created_at < p_to),
    'places_claimed', (select count(*) from pl where claimed_at is not null),
    'places_active', (select count(*) from pl where partner_until > now()),
    'revenue_users', (select c from urev), 'revenue_partners', (select c from prev), 'bonuses', (select n from bon),
    'signup_bonus', (select c from sd),
    'commission', greatest(0, (select c from sd) + round((select base from urev) * a.user_pct / 100) + round((select base from prev) * a.partner_pct / 100)),
    'paid', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = a.user_id and paid_at >= p_from and paid_at < p_to)) $$;
revoke all on function hdar.amb_stats(hdar.ambassadors, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.hdar_admin_amb_budget(p_key text, p_cap int default null, p_budget int default null) returns jsonb language plpgsql security definer set search_path to '' as $$
declare m date := date_trunc('month', now())::date; used numeric;
begin
  perform hdar.admin_check(p_key);
  update hdar.amb_settings set signup_cap_cents = coalesce(greatest(p_cap, 0), signup_cap_cents), global_budget_cents = coalesce(greatest(p_budget, 0), global_budget_cents) where id = 1;
  select coalesce(sum(hdar.amb_signup_raw(a, m)), 0) into used from hdar.ambassadors a;
  return (select jsonb_build_object('signup_cap_cents', signup_cap_cents, 'global_budget_cents', global_budget_cents,
    'month_requested_cents', used, 'month_used_cents', least(used, global_budget_cents), 'factor', hdar.amb_budget_factor(m)) from hdar.amb_settings where id = 1);
end $$;
revoke all on function public.hdar_admin_amb_budget(text, int, int) from public, anon; grant execute on function public.hdar_admin_amb_budget(text, int, int) to authenticated;

-- override par ambassadeur via les règles (signup_cap_cents ; vide = réglage global)
create or replace function public.hdar_admin_amb_cap(p_key text, p_user text, p_cap int) returns void language plpgsql security definer set search_path to '' as $$
begin perform hdar.admin_check(p_key); update hdar.ambassadors set signup_cap_cents = p_cap where user_id = p_user; end $$;
revoke all on function public.hdar_admin_amb_cap(text, text, int) from public, anon; grant execute on function public.hdar_admin_amb_cap(text, text, int) to authenticated;
