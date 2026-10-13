-- v46 : onglet admin Revenus (paiements Stripe réels) + remboursements
alter table hdar.payments add column if not exists payment_intent text, add column if not exists refunded_cents integer not null default 0, add column if not exists fee_cents integer;
create index if not exists payments_pi on hdar.payments (payment_intent);

create or replace function public.hdar_payment_meta(p_ref text, p_pi text) returns void language sql security definer set search_path to '' as $$
  update hdar.payments set payment_intent = p_pi where stripe_ref = p_ref and p_pi is not null $$;
create or replace function public.hdar_payment_refund(p_pi text, p_ref text, p_refunded integer) returns void language sql security definer set search_path to '' as $$
  update hdar.payments set refunded_cents = greatest(coalesce(p_refunded, 0), 0)
  where (p_pi is not null and payment_intent = p_pi) or (p_ref is not null and stripe_ref = p_ref) $$;
revoke all on function public.hdar_payment_meta(text, text), public.hdar_payment_refund(text, text, integer) from public, anon, authenticated;
grant execute on function public.hdar_payment_meta(text, text), public.hdar_payment_refund(text, text, integer) to service_role;

create or replace function public.hdar_admin_revenue(p_key text, p_period text default '30d') returns jsonb
language plpgsql security definer set search_path to '' as $$
declare since timestamptz; unit text;
begin
  perform hdar.admin_check(p_key);
  since := case p_period when 'today' then date_trunc('day', now()) when '7d' then now() - interval '7 days' when '30d' then now() - interval '30 days'
    when 'month' then date_trunc('month', now()) else '-infinity'::timestamptz end;
  unit := case when p_period = 'today' then 'hour' when p_period = 'all' then 'month' else 'day' end;
  return (with p as (
      select y.*, coalesce(y.fee_cents, round(y.amount_cents * 0.015 + 25)::int) fee, y.fee_cents is null est,
        y.amount_cents - y.refunded_cents net_gross, coalesce(pr.label, y.product) lbl
      from hdar.payments y left join hdar.pricing pr on pr.product = y.product where y.created_at >= since and y.amount_cents > 0)
    select jsonb_build_object(
      'gross', coalesce(sum(amount_cents), 0), 'refunds', coalesce(sum(refunded_cents), 0), 'fees', coalesce(sum(fee), 0),
      'net', coalesce(sum(amount_cents - refunded_cents - fee), 0), 'count', count(*), 'fees_estimated', coalesce(bool_or(est), true),
      'series', coalesce((select jsonb_agg(jsonb_build_object('t', t, 'cents', c) order by t) from (select date_trunc(unit, created_at) t, sum(net_gross) c from p group by 1) s), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'product', product, 'label', lbl, 'cents', c, 'n', n) order by c desc)
          from (select kind, product, lbl, sum(net_gross) c, count(*) n from p group by 1, 2, 3) s), '[]'::jsonb),
      'partners', coalesce((select jsonb_agg(jsonb_build_object('name', pl.name, 'cents', c, 'n', n) order by c desc)
          from (select place_id, sum(net_gross) c, count(*) n from p where place_id is not null group by 1 order by 2 desc limit 10) s join hdar.places pl on pl.id = s.place_id), '[]'::jsonb),
      'spenders', coalesce((select jsonb_agg(jsonb_build_object('pseudo', coalesce(pf.pseudo, 'Sans pseudo'), 'cents', c, 'n', n) order by c desc)
          from (select user_id, sum(net_gross) c, count(*) n from p where user_id is not null group by 1 order by 2 desc limit 10) s left join hdar.profiles pf on pf.user_id = s.user_id), '[]'::jsonb))
    from p);
end $$;
revoke all on function public.hdar_admin_revenue(text, text) from public, anon;
grant execute on function public.hdar_admin_revenue(text, text) to authenticated;
