-- v109 (NON appliquée) : programme ambassadeur de lancement, AUCUNE récompense en argent.
-- Récompenses automatiques : 1 boost (crédit, comme le parrainage) par inscrit validé (photo approuvée), 20 max / mois ;
-- bonus 7 j de hdar+ à 10 validés dans le mois ; 7 j de hdar+ par lieu partenaire réclamé, 4 max / mois.
-- Les versements Stripe sont coupés tant que amb_settings.money_on = false (cron mensuel inoffensif).
alter table hdar.amb_settings add column if not exists money_on boolean not null default false;
alter table hdar.amb_settings add column if not exists boost_cap int not null default 20;
alter table hdar.amb_settings add column if not exists bonus_at int not null default 10;
alter table hdar.amb_settings add column if not exists bonus_days int not null default 7;
alter table hdar.amb_settings add column if not exists place_days int not null default 7;
alter table hdar.amb_settings add column if not exists place_cap int not null default 4;
update hdar.amb_settings set money_on = false where id = 1;

create table if not exists hdar.amb_rewards (
  id bigserial primary key,
  amb text not null references hdar.ambassadors(user_id) on delete cascade,
  kind text not null check (kind in ('signup', 'bonus', 'place')),
  ref text not null,                         -- membre parrainé, lieu, ou mois (bonus)
  boosts int not null default 0,
  premium_days int not null default 0,
  at timestamptz not null default now(),
  unique (amb, kind, ref)
);
alter table hdar.amb_rewards enable row level security;
revoke all on hdar.amb_rewards from anon, authenticated;

-- Attribution idempotente (cron toutes les 15 min).
create or replace function hdar.amb_reward_tick() returns int language plpgsql security definer set search_path to '' as $$
declare cfg hdar.amb_settings; r record; n int := 0; m date := date_trunc('month', now())::date; c int;
begin
  select * into cfg from hdar.amb_settings where id = 1;
  -- Inscrits validés
  for r in select s.amb, s.user_id from hdar.amb_signups s
      join hdar.ambassadors a on a.user_id = s.amb and a.active and a.terms_at is not null
      join hdar.profiles pf on pf.user_id = s.user_id and pf.photo_status = 'approved'
      where s.amb <> s.user_id
        and not exists (select 1 from hdar.amb_rewards w where w.amb = s.amb and w.kind = 'signup' and w.ref = s.user_id)
      limit 500 loop
    select count(*) into c from hdar.amb_rewards where amb = r.amb and kind = 'signup' and boosts > 0 and at >= m;
    insert into hdar.amb_rewards (amb, kind, ref, boosts) values (r.amb, 'signup', r.user_id, case when c < cfg.boost_cap then 1 else 0 end)
      on conflict do nothing;
    if found and c < cfg.boost_cap then
      insert into hdar.boost_credits as b (user_id, earned) values (r.amb, 1)
        on conflict (user_id) do update set earned = b.earned + 1, updated_at = now();
      n := n + 1;
    end if;
  end loop;
  -- Bonus mensuel
  for r in select w.amb from hdar.amb_rewards w where w.kind = 'signup' and w.at >= m group by w.amb having count(*) >= cfg.bonus_at loop
    insert into hdar.amb_rewards (amb, kind, ref, premium_days) values (r.amb, 'bonus', to_char(m, 'YYYY-MM'), cfg.bonus_days) on conflict do nothing;
    if found then perform hdar.grant_gift(r.amb, 'premium', cfg.bonus_days); n := n + 1; end if;
  end loop;
  -- Lieux partenaires réclamés
  for r in select p.amb, p.id from hdar.places p join hdar.ambassadors a on a.user_id = p.amb and a.active
      where p.claimed_at is not null and coalesce(p.owner_id, '') <> p.amb
        and not exists (select 1 from hdar.amb_rewards w where w.amb = p.amb and w.kind = 'place' and w.ref = p.id::text) loop
    select count(*) into c from hdar.amb_rewards where amb = r.amb and kind = 'place' and premium_days > 0 and at >= m;
    insert into hdar.amb_rewards (amb, kind, ref, premium_days) values (r.amb, 'place', r.id::text, case when c < cfg.place_cap then cfg.place_days else 0 end)
      on conflict do nothing;
    if found and c < cfg.place_cap then perform hdar.grant_gift(r.amb, 'premium', cfg.place_days); n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function hdar.amb_reward_tick() from public, anon, authenticated;
select cron.schedule('hdar_amb_rewards', '*/15 * * * *', $$select hdar.amb_reward_tick()$$);

-- Plus aucun versement en argent tant que money_on = false.
create or replace function public.hdar_amb_payout_batch() returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb := '[]'::jsonb; a hdar.ambassadors; d int;
begin
  if not coalesce((select money_on from hdar.amb_settings where id = 1), false) then return '[]'::jsonb; end if;
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

-- Espace ambassadeur : compteurs de récompenses (boosts, jours hdar+) en plus des compteurs existants.
create or replace function public.hdar_amb_me() returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ambassadors; wk int; tot jsonb; cfg hdar.amb_settings; m timestamptz := date_trunc('month', now());
begin
  select * into a from hdar.ambassadors where user_id = s and active;
  if a.user_id is null then return null; end if;
  if a.terms_at is null then return jsonb_build_object('needs_terms', true); end if;
  select * into cfg from hdar.amb_settings where id = 1;
  select count(*) into wk from hdar.gift_codes where amb = s and created_at > now() - interval '7 days';
  tot := hdar.amb_stats(a, '-infinity', now() + interval '1 second');
  return jsonb_build_object('code', a.code, 'codes_per_week', a.codes_per_week, 'codes_left', greatest(a.codes_per_week - wk, 0),
    'max_days', a.max_days, 'max_boost_h', a.max_boost_h, 'max_hearts', a.max_hearts,
    'per_signup_cents', a.per_signup_cents, 'partner_pct', a.partner_pct, 'partner_months', a.partner_months, 'user_pct', a.user_pct, 'user_months', a.user_months,
    'bonus_cents', a.bonus_cents, 'bonus_at', a.bonus_at, 'min_payout_cents', a.min_payout_cents,
    'paid_total', (select coalesce(sum(amount_cents), 0) from hdar.amb_payouts where amb = s and status = 'paid'),
    'connect', case when a.stripe_account is null then 'none' when a.payouts_enabled then 'ready' else 'pending' end, 'paused', a.paused,
    'contract', (select jsonb_build_object('version', version, 'at', accepted_at, 'name', full_name) from hdar.amb_contracts where user_id = s order by accepted_at desc limit 1),
    'month', hdar.amb_stats(a, m, now() + interval '1 second'), 'total', tot,
    'rewards', jsonb_build_object('boost_cap', cfg.boost_cap, 'bonus_at', cfg.bonus_at, 'place_days', cfg.place_days, 'place_cap', cfg.place_cap,
      'month', (select jsonb_build_object('boosts', coalesce(sum(boosts), 0), 'premium_days', coalesce(sum(premium_days), 0)) from hdar.amb_rewards where amb = s and at >= m),
      'total', (select jsonb_build_object('boosts', coalesce(sum(boosts), 0), 'premium_days', coalesce(sum(premium_days), 0)) from hdar.amb_rewards where amb = s)),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'amount', amount, 'used', uses >= max_uses, 'expires_at', expires_at) order by created_at desc)
        from (select * from hdar.gift_codes where amb = s order by created_at desc limit 20) g), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'claimed', claimed_at is not null, 'active', coalesce(partner_until > now(), false),
        'token', case when claimed_at is null then claim_token end, 'promo', promo, 'promo_status', promo_status) order by created_at desc) from hdar.places where amb = s), '[]'::jsonb));
end $$;
