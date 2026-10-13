-- v27 — Boost payant des lieux privés (spots créés par les utilisateurs).
-- Le créateur paie (Stripe via hdar-checkout) : le lieu brille sur la carte, remonte en tête de la liste Lieux,
-- et reste ouvert au moins jusqu'à la fin du boost.
alter table hdar.pricing drop constraint if exists pricing_kind_check;
alter table hdar.pricing add constraint pricing_kind_check check (kind in ('listing', 'boost', 'place_boost'));

insert into hdar.pricing (product, kind, label, duration, price_cents, active, sort) values
  ('place_boost_24h', 'place_boost', '24 heures', interval '24 hours', 299, true, 21),
  ('place_boost_7d', 'place_boost', '7 jours', interval '7 days', 999, true, 22)
on conflict (product) do nothing;

alter table hdar.spots add column if not exists boosted_until timestamptz;
alter table hdar.payments add column if not exists spot_id uuid;

create or replace function public.hdar_checkout_prepare(p_product text, p_place uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); pr hdar.pricing; nm text;
begin
  select * into pr from hdar.pricing where product = p_product and active;
  if pr.product is null then raise exception 'Offre indisponible'; end if;
  if pr.kind = 'listing' then
    if p_place is null or not exists (select 1 from hdar.places where id = p_place and owner_id = s) then raise exception 'Lieu introuvable'; end if;
    select name into nm from hdar.places where id = p_place;
  elsif pr.kind = 'place_boost' then
    select title into nm from hdar.spots where id = p_place and creator_id = s and closes_at > now();
    if nm is null then raise exception 'Lieu introuvable ou fermé'; end if;
  else
    perform hdar.require_profile(s);
  end if;
  return jsonb_build_object('user_id', s, 'product', pr.product, 'kind', pr.kind, 'label', pr.label, 'price_cents', pr.price_cents,
    'interval', pr.stripe_interval, 'interval_count', pr.stripe_interval_count,
    'place_id', case when pr.kind in ('listing', 'place_boost') then p_place end, 'place_name', nm);
end $$;

create or replace function public.hdar_payment_apply(p_ref text, p_user text, p_product text, p_place uuid, p_amount integer, p_currency text, p_subscription text, p_customer text)
returns jsonb language plpgsql security definer set search_path to '' as $$
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
  elsif pr.kind = 'place_boost' then
    -- Payé : on applique même si le lieu a fermé entre-temps (il est rouvert pour la durée du boost).
    update hdar.spots set boosted_until = greatest(now(), coalesce(boosted_until, now())) + pr.duration
      where id = p_place and creator_id = p_user returning boosted_until, round(lat::numeric, 1), round(lng::numeric, 1) into en, la, lo;
    if en is null then raise exception 'spot/creator mismatch'; end if;
    update hdar.spots set closes_at = greatest(closes_at, en) where id = p_place;
  else
    select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.boosts where user_id = p_user and not cancelled;
    insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note)
      values (p_user, st, st + pr.duration, coalesce(p_amount, 0), 'Stripe ' || p_ref) returning id into nid;
    select round(lat::numeric, 1), round(lng::numeric, 1) into la, lo from hdar.profiles where user_id = p_user;
  end if;
  insert into hdar.payments (stripe_ref, user_id, product, kind, place_id, spot_id, boost_id, listing_id, amount_cents, currency,
      stripe_subscription, stripe_customer, lat, lng)
    values (p_ref, p_user, p_product, pr.kind, case when pr.kind = 'listing' then p_place end,
      case when pr.kind = 'place_boost' then p_place end,
      case when pr.kind = 'boost' then nid end, case when pr.kind = 'listing' then nid end,
      coalesce(p_amount, 0), lower(coalesce(p_currency, 'eur')), p_subscription, p_customer, la, lo);
  return jsonb_build_object('ok', true, 'id', nid, 'boosted_until', en);
end $$;

drop function if exists public.hdar_spot_list(text, double precision, double precision);
create function public.hdar_spot_list(p_self text, p_lat double precision, p_lng double precision)
returns table(id uuid, title text, lat double precision, lng double precision, closes_at text, mine boolean, members bigint, boosted_until text)
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return query
    select sp.id, sp.title, hdar.round_coord(sp.lat), hdar.round_coord(sp.lng), sp.closes_at::text, sp.creator_id = s,
      (select count(distinct m.from_id) from hdar.spot_messages m where m.spot_id = sp.id),
      case when sp.boosted_until > now() then sp.boosted_until::text end
    from hdar.spots sp
    where sp.closes_at > now()
      and (sp.creator_id = s or (
        abs(sp.lat - coalesce(p_lat, sp.lat)) < 1 and abs(sp.lng - coalesce(p_lng, sp.lng)) < 1.5
        and not hdar.is_blocked(s, sp.creator_id)))
    order by (sp.boosted_until > now()) desc nulls last, sp.created_at desc
    limit 200;
end $$;
revoke all on function public.hdar_spot_list(text, double precision, double precision) from public, anon;
grant execute on function public.hdar_spot_list(text, double precision, double precision) to authenticated, service_role;

-- Mes lieux boostables (pour la page /boost).
create or replace function public.hdar_my_spots()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'title', sp.title, 'closes_at', sp.closes_at,
      'boosted_until', case when sp.boosted_until > now() then sp.boosted_until end) order by sp.created_at desc)
    from hdar.spots sp where sp.creator_id = s and sp.closes_at > now()), '[]'::jsonb);
end $$;
revoke all on function public.hdar_my_spots() from public, anon;
grant execute on function public.hdar_my_spots() to authenticated, service_role;
