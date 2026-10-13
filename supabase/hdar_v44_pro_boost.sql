-- v44 : Boost Pro (partenaires actifs) : pin doré, « À la une » des Lieux, priorité Live Pro
alter table hdar.places add column if not exists pro_boost_until timestamptz;
alter table hdar.pricing drop constraint if exists pricing_kind_check;
alter table hdar.pricing add constraint pricing_kind_check check (kind in ('listing', 'boost', 'place_boost', 'premium', 'hearts', 'pro_boost'));
insert into hdar.pricing (product, kind, label, duration, price_cents, active, sort) values
  ('pro_boost_24h', 'pro_boost', '24 heures', interval '24 hours', 499, true, 31),
  ('pro_boost_7d', 'pro_boost', '7 jours', interval '7 days', 1999, true, 32),
  ('pro_boost_30d', 'pro_boost', '30 jours', interval '30 days', 5999, true, 33)
on conflict (product) do nothing;

drop function if exists public.hdar_places(double precision, double precision, double precision, double precision);
create function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
 returns table(id uuid, kind text, name text, lat double precision, lng double precision, partner boolean, pro_boost boolean)
 language plpgsql stable security definer set search_path to '' as $function$
begin
  perform hdar.self_id();
  return query
    select p.id, p.kind, p.name, p.lat, p.lng, p.partner,
      coalesce(p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) from hdar.places p
    where p.status = 'approved' and p.kind <> 'toilets'
      and (not p.partner or coalesce(p.partner_until > now(), false))
      and p.lat between p_s and p_n
      and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
    order by 7 desc
    limit 3000;
end $function$;
grant execute on function public.hdar_places(double precision, double precision, double precision, double precision) to authenticated;

create or replace function public.hdar_checkout_prepare(p_product text, p_place uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare s text := hdar.self_id(); pr hdar.pricing; nm text;
begin
  select * into pr from hdar.pricing where product = p_product and active;
  if pr.product is null then raise exception 'Offre indisponible'; end if;
  if pr.kind = 'listing' then
    if p_place is null or not exists (select 1 from hdar.places where id = p_place and owner_id = s) then raise exception 'Lieu introuvable'; end if;
    select name into nm from hdar.places where id = p_place;
  elsif pr.kind = 'pro_boost' then
    select name into nm from hdar.places where id = p_place and owner_id = s and status = 'approved' and partner_until > now();
    if nm is null then raise exception 'Boost Pro réservé aux lieux partenaires actifs'; end if;
  elsif pr.kind = 'place_boost' then
    select title into nm from hdar.spots where id = p_place and creator_id = s and closes_at > now();
    if nm is null then raise exception 'Lieu introuvable ou fermé'; end if;
  else
    perform hdar.require_profile(s);
    if pr.kind = 'premium' and exists (select 1 from hdar.premium where user_id = s and until > now() and stripe_subscription is not null
        and coalesce(status, 'active') not in ('cancelled', 'canceled', 'cancelling')) then
      raise exception 'Tu es déjà hdar+ : gère ton abonnement depuis la page premium';
    end if;
  end if;
  return jsonb_build_object('user_id', s, 'product', pr.product, 'kind', pr.kind, 'label', pr.label, 'price_cents', pr.price_cents,
    'interval', pr.stripe_interval, 'interval_count', pr.stripe_interval_count,
    'place_id', case when pr.kind in ('listing', 'place_boost', 'pro_boost') then p_place end, 'place_name', nm);
end $function$;

create or replace function public.hdar_live_next(p_iam text[] default null, p_min_age integer default null, p_max_age integer default null, p_back text default null, p_pro uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s text := hdar.self_id(); me hdar.profiles; prem boolean; pick text; filt boolean; pro boolean := p_pro is not null;
begin
  if pro then
    perform hdar.require_profile(s);
    perform hdar.pro_place_check(s, p_pro);
    if not exists (select 1 from hdar.live_terms where user_id = s and version >= 1) then raise exception 'live_terms: accepte les règles du Live'; end if;
  else
    perform hdar.live_require(s);
  end if;
  perform hdar.rate_check(s, 'live_next', 60, interval '1 minute');
  prem := hdar.is_premium(s);
  filt := not pro and (coalesce(cardinality(p_iam), 0) > 0 or p_min_age is not null or p_max_age is not null);
  if (filt or p_back is not null) and not prem then perform hdar.require_premium(s); end if;
  perform public.hdar_live_leave(true);
  insert into hdar.live_queue (user_id, pro_place) values (s, p_pro) on conflict (user_id) do update set seen_at = now(), pro_place = p_pro;
  delete from hdar.live_queue where seen_at < now() - interval '20 seconds';
  perform 1 from hdar.live_queue where user_id = s for update;
  select * into me from hdar.profiles where user_id = s;

  if p_back is not null then
    select q.user_id into pick from hdar.live_queue q
      where q.user_id = lower(p_back) and q.peer_id is null and q.user_id <> s and not hdar.is_blocked(s, q.user_id)
      for update skip locked;
    if pick is null then return jsonb_build_object('back_gone', true); end if;
  else
    select q.user_id into pick from hdar.live_queue q join hdar.profiles p on p.user_id = q.user_id
      where q.user_id <> s and q.peer_id is null and q.seen_at > now() - interval '12 seconds'
        and (p.photo_status = 'approved' or q.pro_place is not null)
        and not (pro and q.pro_place is not null) -- deux pros ne se croisent pas
        and not hdar.is_blocked(s, q.user_id)
        and not exists (select 1 from hdar.live_history h where h.user_id = s and h.peer_id = q.user_id and h.at > now() - interval '15 minutes')
        and (not filt or ((coalesce(cardinality(p_iam), 0) = 0 or p.iam = any(p_iam))
             and (p_min_age is null or p.age >= p_min_age) and (p_max_age is null or p.age <= p_max_age)))
        -- jamais à moins de ~2 km entre particuliers ; le Live Pro n'a pas de limite de distance
        and (pro or q.pro_place is not null or me.lat is null or p.lat is null or hdar.live_km(me.lat, me.lng, p.lat, p.lng) > 2)
      order by
        -- Boost Pro : les lieux boostés passent en premier
        case when q.pro_place is not null and exists (select 1 from hdar.places bp where bp.id = q.pro_place and bp.pro_boost_until > now()) then 0 else 1 end,
        case when pro or q.pro_place is not null then 0
             when me.lat is null or p.lat is null then 2
             when hdar.live_km(me.lat, me.lng, p.lat, p.lng) <= 150 then 0
             when hdar.live_km(me.lat, me.lng, p.lat, p.lng) <= 600 then 1 else 2 end,
        case when prem and position(coalesce(me.iam, '?') in coalesce(p.seeking, '')) > 0
                       and position(coalesce(p.iam, '?') in coalesce(me.seeking, '')) > 0 then 0 else 1 end,
        random()
      limit 1 for update of q skip locked;
    if pick is null then return jsonb_build_object('waiting', true); end if;
  end if;

  update hdar.live_queue set peer_id = pick, role = 'offer', matched_at = now(), seen_at = now() where user_id = s;
  update hdar.live_queue set peer_id = s, role = 'answer', matched_at = now() where user_id = pick;
  insert into hdar.live_history values (s, pick, now()), (pick, s, now())
    on conflict (user_id, peer_id) do update set at = now();
  return hdar.live_card(pick, 'offer');
end $function$;


create or replace function public.hdar_payment_apply(p_ref text, p_user text, p_product text, p_place uuid, p_amount integer, p_currency text, p_subscription text, p_customer text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare pr hdar.pricing; st timestamptz; nid uuid; la double precision; lo double precision; en timestamptz;
begin
  if exists (select 1 from hdar.payments where stripe_ref = p_ref) then return jsonb_build_object('duplicate', true); end if;
  select * into pr from hdar.pricing where product = p_product;
  if pr.product is null then raise exception 'unknown product %', p_product; end if;
  if pr.kind = 'listing' then
    if not exists (select 1 from hdar.places where id = p_place and owner_id = p_user) then raise exception 'place/owner mismatch'; end if;
    select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.partner_listings where place_id = p_place and not cancelled;
    insert into hdar.partner_listings (place_id, starts_at, ends_at, price_cents, note)
      values (p_place, st, st + pr.duration, coalesce(p_amount, 0), 'Stripe ' || p_ref) returning id into nid;
    update hdar.places set status = 'approved', sub_status = case when p_subscription is not null then 'active' else sub_status end,
      stripe_subscription = coalesce(p_subscription, stripe_subscription) where id = p_place;
    perform hdar.sync_partner(p_place);
    select round(lat::numeric, 1), round(lng::numeric, 1) into la, lo from hdar.places where id = p_place;
  elsif pr.kind = 'pro_boost' then
    update hdar.places set pro_boost_until = greatest(now(), coalesce(pro_boost_until, now())) + pr.duration
      where id = p_place and owner_id = p_user returning pro_boost_until, round(lat::numeric, 1), round(lng::numeric, 1) into en, la, lo;
    if en is null then raise exception 'place/owner mismatch'; end if;
  elsif pr.kind = 'place_boost' then
    update hdar.spots set boosted_until = greatest(now(), coalesce(boosted_until, now())) + pr.duration
      where id = p_place and creator_id = p_user returning boosted_until, round(lat::numeric, 1), round(lng::numeric, 1) into en, la, lo;
    if en is null then raise exception 'spot/creator mismatch'; end if;
    update hdar.spots set closes_at = greatest(closes_at, en) where id = p_place;
  elsif pr.kind = 'hearts' then
    insert into hdar.hearts_wallet as w (user_id, balance, bought) values (p_user, coalesce(pr.qty, 0), coalesce(pr.qty, 0))
      on conflict (user_id) do update set balance = w.balance + coalesce(pr.qty, 0), bought = w.bought + coalesce(pr.qty, 0), updated_at = now();
  elsif pr.kind = 'premium' then
    insert into hdar.premium as pm (user_id, until, stripe_subscription, status)
      values (p_user, now() + pr.duration + interval '1 day', p_subscription, 'active')
    on conflict (user_id) do update set
      until = greatest(now(), pm.until - interval '1 day') + pr.duration + interval '1 day',
      stripe_subscription = coalesce(excluded.stripe_subscription, pm.stripe_subscription), status = 'active', updated_at = now()
    returning until into en;
    select round(lat::numeric, 1), round(lng::numeric, 1) into la, lo from hdar.profiles where user_id = p_user;
  else
    select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.boosts where user_id = p_user and not cancelled;
    insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note)
      values (p_user, st, st + pr.duration, coalesce(p_amount, 0), 'Stripe ' || p_ref) returning id into nid;
    select round(lat::numeric, 1), round(lng::numeric, 1) into la, lo from hdar.profiles where user_id = p_user;
  end if;
  insert into hdar.payments (stripe_ref, user_id, product, kind, place_id, spot_id, boost_id, listing_id, amount_cents, currency,
      stripe_subscription, stripe_customer, lat, lng)
    values (p_ref, p_user, p_product, pr.kind, case when pr.kind in ('listing', 'pro_boost') then p_place end,
      case when pr.kind = 'place_boost' then p_place end,
      case when pr.kind = 'boost' then nid end, case when pr.kind = 'listing' then nid end,
      coalesce(p_amount, 0), lower(coalesce(p_currency, 'eur')), p_subscription, p_customer, la, lo);
  return jsonb_build_object('ok', true, 'id', nid, 'until', en);
end $function$;
revoke all on function public.hdar_places(double precision, double precision, double precision, double precision) from public, anon;
