-- v29 — Abonnement premium « hdar+ » : album 20 photos, filtres carte, qui m'a vu / mis en favori, recherche par pseudo, badge.
-- Tout est vérifié côté serveur (hdar.is_premium) ; le client ne fait qu'afficher.
alter table hdar.pricing drop constraint if exists pricing_kind_check;
alter table hdar.pricing add constraint pricing_kind_check check (kind in ('listing', 'boost', 'place_boost', 'premium'));
insert into hdar.pricing (product, kind, label, duration, stripe_interval, stripe_interval_count, price_cents, active, sort) values
  ('premium_week', 'premium', '1 semaine', interval '7 days', 'week', 1, 499, true, 31),
  ('premium_month', 'premium', '1 mois', interval '1 month', 'month', 1, 999, true, 32)
on conflict (product) do nothing;

create table if not exists hdar.premium (
  user_id text primary key,
  until timestamptz not null,
  stripe_subscription text,
  status text,
  updated_at timestamptz not null default now()
);
alter table hdar.premium enable row level security;
revoke all on hdar.premium from public, anon, authenticated;

create table if not exists hdar.profile_views (
  viewer_id text not null,
  viewed_id text not null,
  at timestamptz not null default now(),
  primary key (viewed_id, viewer_id)
);
alter table hdar.profile_views enable row level security;
revoke all on hdar.profile_views from public, anon, authenticated;

create or replace function hdar.is_premium(p_user text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from hdar.premium where user_id = p_user and until > now());
$$;
revoke all on function hdar.is_premium(text) from public, anon, authenticated;

create or replace function hdar.require_premium(p_user text) returns void
language plpgsql stable security definer set search_path to '' as $$
begin
  if not hdar.is_premium(p_user) then raise exception 'premium_required: réservé à hdar+'; end if;
end $$;
revoke all on function hdar.require_premium(text) from public, anon, authenticated;

-- État premium de l'utilisateur courant.
create or replace function public.hdar_my_premium() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('premium', coalesce(p.until > now(), false), 'until', p.until, 'status', p.status,
    'photo_limit', case when p.until > now() then 20 else 5 end)
  from (select 1) x left join hdar.premium p on p.user_id = hdar.self_id();
$$;
revoke all on function public.hdar_my_premium() from public, anon;
grant execute on function public.hdar_my_premium() to authenticated, service_role;

-- Paiement : checkout_prepare accepte le premium (abonnement).
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
    if pr.kind = 'premium' and exists (select 1 from hdar.premium where user_id = s and until > now() and stripe_subscription is not null
        and coalesce(status, 'active') not in ('cancelled', 'canceled', 'cancelling')) then
      raise exception 'Tu es déjà hdar+ : gère ton abonnement depuis la page premium';
    end if;
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
    update hdar.spots set boosted_until = greatest(now(), coalesce(boosted_until, now())) + pr.duration
      where id = p_place and creator_id = p_user returning boosted_until, round(lat::numeric, 1), round(lng::numeric, 1) into en, la, lo;
    if en is null then raise exception 'spot/creator mismatch'; end if;
    update hdar.spots set closes_at = greatest(closes_at, en) where id = p_place;
  elsif pr.kind = 'premium' then
    -- Prolonge depuis la fin actuelle (+ 1 jour de marge pour le renouvellement Stripe).
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
    values (p_ref, p_user, p_product, pr.kind, case when pr.kind = 'listing' then p_place end,
      case when pr.kind = 'place_boost' then p_place end,
      case when pr.kind = 'boost' then nid end, case when pr.kind = 'listing' then nid end,
      coalesce(p_amount, 0), lower(coalesce(p_currency, 'eur')), p_subscription, p_customer, la, lo);
  return jsonb_build_object('ok', true, 'id', nid, 'until', en);
end $$;

create or replace function public.hdar_subscription_status(p_subscription text, p_status text)
returns void language sql security definer set search_path to '' as $$
  update hdar.places set sub_status = left(p_status, 30) where stripe_subscription = p_subscription;
  update hdar.premium set status = left(p_status, 30), updated_at = now() where stripe_subscription = p_subscription;
$$;

-- Album : 20 photos en premium, 5 sinon.
create or replace function public.hdar_profile_save(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photos jsonb, p_voice text, p_voice_sec integer)
returns void language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  ps text := coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme');
  kept jsonb := '[]'::jsonb;
  item jsonb;
  v text := nullif(p_voice, '');
  lim int := case when hdar.is_premium(s) then 20 else 5 end;
begin
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) = 'array' then
    for item in select * from jsonb_array_elements(p_photos) loop
      exit when jsonb_array_length(kept) >= lim;
      if jsonb_typeof(item) = 'string' and item #>> '{}' ~ '^data:image/(jpeg|png|webp);base64,' and length(item #>> '{}') <= 400000 then
        kept := kept || jsonb_build_array(item);
      end if;
    end loop;
  end if;
  if v is not null and (v !~ '^data:audio/(webm|ogg|mp4|mpeg|aac|x-m4a)[^,]*;base64,' or length(v) > 300000) then v := null; end if;
  insert into hdar.profiles (user_id, pseudo, age, bio, tags, photo, album, voice, voice_sec, profile_at)
  values (s, ps, case when p_age between 18 and 99 then p_age end, left(coalesce(p_bio, ''), 300),
          left(coalesce(p_tags, ''), 200), kept ->> 0, kept, v,
          case when v is not null then least(10, greatest(1, coalesce(p_voice_sec, 1))) end, now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, age = excluded.age, bio = excluded.bio, tags = excluded.tags,
    photo = excluded.photo, album = excluded.album, voice = excluded.voice, voice_sec = excluded.voice_sec, profile_at = now();
end $$;

-- Fiche : enregistre la visite (pour « qui m'a vu ») + badge premium.
drop function if exists public.hdar_profile_get(text, text);
create function public.hdar_profile_get(p_self text, p_id text)
returns table(id text, pseudo text, age integer, bio text, tags text, desires text, photo text, online boolean, lat double precision, lng double precision, note text, premium boolean)
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text := lower(left(coalesce(p_id, ''), 80));
begin
  if hdar.is_blocked(s, o) then return; end if;
  if o <> s and exists (select 1 from hdar.profiles p where p.user_id = o) then
    perform hdar.bump_user(o, 'views');
    insert into hdar.profile_views (viewer_id, viewed_id, at) values (s, o, now())
      on conflict (viewed_id, viewer_id) do update set at = now();
  end if;
  return query
    select p.user_id, p.pseudo, p.age, p.bio, p.tags, p.desires,
      case when p.user_id = s or p.photo_status = 'approved' then p.photo end,
      coalesce(p.visible_until > now(), false),
      case when p.visible_until > now() then hdar.round_coord(p.lat) end,
      case when p.visible_until > now() then hdar.round_coord(p.lng) end,
      p.note, hdar.is_premium(p.user_id)
    from hdar.profiles p where p.user_id = o;
end $$;
revoke all on function public.hdar_profile_get(text, text) from public, anon;
grant execute on function public.hdar_profile_get(text, text) to authenticated, service_role;

-- Carte avec filtres (filtres = premium, refusés sinon) + badge.
create or replace function public.hdar_live_map(p_min_age int default null, p_max_age int default null, p_desires text[] default null,
  p_places text[] default null, p_online boolean default false, p_photo boolean default false)
returns table(id text, pseudo text, lat double precision, lng double precision, desires text, premium boolean)
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
  filtered boolean := p_min_age is not null or p_max_age is not null or coalesce(cardinality(p_desires), 0) > 0
    or coalesce(cardinality(p_places), 0) > 0 or coalesce(p_online, false) or coalesce(p_photo, false);
begin
  if filtered then perform hdar.require_premium(s); end if;
  return query
    select p.user_id, p.pseudo, hdar.round_coord(p.lat), hdar.round_coord(p.lng), p.desires,
      exists (select 1 from hdar.premium pm where pm.user_id = p.user_id and pm.until > now())
    from hdar.profiles p
    where p.visible_until > now() and p.user_id <> s and p.lat is not null and not hdar.is_blocked(s, p.user_id)
      and (p_min_age is null or p.age >= p_min_age)
      and (p_max_age is null or p.age <= p_max_age)
      and (coalesce(cardinality(p_desires), 0) = 0 or string_to_array(coalesce(p.desires, ''), ',') && p_desires)
      and (coalesce(cardinality(p_places), 0) = 0 or string_to_array(coalesce(p.desires, ''), ',') && p_places)
      and (not coalesce(p_online, false) or p.updated_at > now() - interval '10 minutes')
      and (not coalesce(p_photo, false) or (p.photo is not null and p.photo_status = 'approved'))
    limit 500;
end $$;
revoke all on function public.hdar_live_map(int, int, text[], text[], boolean, boolean) from public, anon;
grant execute on function public.hdar_live_map(int, int, text[], text[], boolean, boolean) to authenticated, service_role;

-- Qui m'a vu / mis en favori (30 jours). Non premium : seulement les compteurs.
create or replace function public.hdar_admirers() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); prem boolean := hdar.is_premium(s); nv int; nf int;
begin
  select count(*) into nv from hdar.profile_views v where v.viewed_id = s and v.at > now() - interval '30 days' and not hdar.is_blocked(s, v.viewer_id);
  select count(*) into nf from hdar.favorites f where f.fav_id = s and not hdar.is_blocked(s, f.user_id);
  if not prem then return jsonb_build_object('premium', false, 'views', nv, 'favs', nf); end if;
  return jsonb_build_object('premium', true, 'views', nv, 'favs', nf,
    'viewers', coalesce((select jsonb_agg(jsonb_build_object('id', v.viewer_id, 'pseudo', coalesce(p.pseudo, 'Anonyme'), 'at', v.at,
        'live', coalesce(p.visible_until > now(), false), 'photo', p.photo is not null and p.photo_status = 'approved') order by v.at desc)
      from (select * from hdar.profile_views where viewed_id = s and at > now() - interval '30 days' order by at desc limit 50) v
      join hdar.profiles p on p.user_id = v.viewer_id
      where not hdar.is_blocked(s, v.viewer_id) and not exists (select 1 from hdar.bans b where b.user_id = v.viewer_id and b.active)), '[]'::jsonb),
    'fans', coalesce((select jsonb_agg(jsonb_build_object('id', f.user_id, 'pseudo', coalesce(p.pseudo, 'Anonyme'), 'at', f.created_at,
        'live', coalesce(p.visible_until > now(), false), 'photo', p.photo is not null and p.photo_status = 'approved') order by f.created_at desc)
      from (select * from hdar.favorites where fav_id = s order by created_at desc limit 50) f
      join hdar.profiles p on p.user_id = f.user_id
      where not hdar.is_blocked(s, f.user_id) and not exists (select 1 from hdar.bans b where b.user_id = f.user_id and b.active)), '[]'::jsonb));
end $$;
revoke all on function public.hdar_admirers() from public, anon;
grant execute on function public.hdar_admirers() to authenticated, service_role;

-- Recherche par pseudo (premium) : profils visibles ou actifs < 7 jours, sans position, blocages/bannis exclus.
create or replace function public.hdar_search_pseudo(p_q text)
returns table(id text, pseudo text, live boolean, photo boolean, premium boolean)
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); q text := btrim(left(coalesce(p_q, ''), 24));
begin
  perform hdar.require_premium(s);
  perform hdar.rate_check(s, 'search', 30, interval '1 minute');
  if length(q) < 2 then return; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.user_id, p.pseudo, coalesce(p.visible_until > now(), false),
      p.photo is not null and p.photo_status = 'approved', hdar.is_premium(p.user_id)
    from hdar.profiles p
    where p.user_id <> s and p.pseudo ilike '%' || q || '%' and p.pseudo <> 'Anonyme'
      and (p.visible_until > now() or greatest(p.updated_at, p.profile_at) > now() - interval '7 days')
      and not hdar.is_blocked(s, p.user_id)
      and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
    order by (p.visible_until > now()) desc nulls last, (lower(p.pseudo) = lower(btrim(p_q))) desc, greatest(p.updated_at, p.profile_at) desc nulls last
    limit 20;
end $$;
revoke all on function public.hdar_search_pseudo(text) from public, anon;
grant execute on function public.hdar_search_pseudo(text) to authenticated, service_role;

-- Nettoyage des visites > 30 jours à la suppression du profil / purge.
create or replace function hdar.purge_views() returns void language sql security definer set search_path to '' as $$
  delete from hdar.profile_views where at < now() - interval '30 days';
$$;

-- v29 (suite) — « Je suis » / « Je cherche » (gratuit) + filtre carte (premium).
alter table hdar.profiles add column if not exists iam text;
alter table hdar.profiles add column if not exists seeking text;

create or replace function public.hdar_identity_set(p_iam text, p_seeking text[])
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); ok text[] := array['h', 'f', 'x'];
begin
  perform hdar.require_profile(s);
  update hdar.profiles set
    iam = case when p_iam = any(ok) then p_iam end,
    seeking = nullif(array_to_string(array(select distinct x from unnest(coalesce(p_seeking, '{}')) x where x = any(ok) order by 1), ','), '')
  where user_id = s;
end $$;
revoke all on function public.hdar_identity_set(text, text[]) from public, anon;
grant execute on function public.hdar_identity_set(text, text[]) to authenticated, service_role;

drop function if exists public.hdar_profile_get(text, text);
create function public.hdar_profile_get(p_self text, p_id text)
returns table(id text, pseudo text, age integer, bio text, tags text, desires text, photo text, online boolean, lat double precision, lng double precision, note text, premium boolean, iam text, seeking text)
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text := lower(left(coalesce(p_id, ''), 80));
begin
  if hdar.is_blocked(s, o) then return; end if;
  if o <> s and exists (select 1 from hdar.profiles p where p.user_id = o) then
    perform hdar.bump_user(o, 'views');
    insert into hdar.profile_views (viewer_id, viewed_id, at) values (s, o, now())
      on conflict (viewed_id, viewer_id) do update set at = now();
  end if;
  return query
    select p.user_id, p.pseudo, p.age, p.bio, p.tags, p.desires,
      case when p.user_id = s or p.photo_status = 'approved' then p.photo end,
      coalesce(p.visible_until > now(), false),
      case when p.visible_until > now() then hdar.round_coord(p.lat) end,
      case when p.visible_until > now() then hdar.round_coord(p.lng) end,
      p.note, hdar.is_premium(p.user_id), p.iam, p.seeking
    from hdar.profiles p where p.user_id = o;
end $$;
revoke all on function public.hdar_profile_get(text, text) from public, anon;
grant execute on function public.hdar_profile_get(text, text) to authenticated, service_role;

drop function if exists public.hdar_live_map(int, int, text[], text[], boolean, boolean);
create function public.hdar_live_map(p_min_age int default null, p_max_age int default null, p_desires text[] default null,
  p_places text[] default null, p_online boolean default false, p_photo boolean default false, p_iam text[] default null)
returns table(id text, pseudo text, lat double precision, lng double precision, desires text, premium boolean)
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
  filtered boolean := p_min_age is not null or p_max_age is not null or coalesce(cardinality(p_desires), 0) > 0
    or coalesce(cardinality(p_places), 0) > 0 or coalesce(p_online, false) or coalesce(p_photo, false) or coalesce(cardinality(p_iam), 0) > 0;
begin
  if filtered then perform hdar.require_premium(s); end if;
  return query
    select p.user_id, p.pseudo, hdar.round_coord(p.lat), hdar.round_coord(p.lng), p.desires,
      exists (select 1 from hdar.premium pm where pm.user_id = p.user_id and pm.until > now())
    from hdar.profiles p
    where p.visible_until > now() and p.user_id <> s and p.lat is not null and not hdar.is_blocked(s, p.user_id)
      and (p_min_age is null or p.age >= p_min_age)
      and (p_max_age is null or p.age <= p_max_age)
      and (coalesce(cardinality(p_desires), 0) = 0 or string_to_array(coalesce(p.desires, ''), ',') && p_desires)
      and (coalesce(cardinality(p_places), 0) = 0 or string_to_array(coalesce(p.desires, ''), ',') && p_places)
      and (not coalesce(p_online, false) or p.updated_at > now() - interval '10 minutes')
      and (not coalesce(p_photo, false) or (p.photo is not null and p.photo_status = 'approved'))
      and (coalesce(cardinality(p_iam), 0) = 0 or p.iam = any(p_iam))
    limit 500;
end $$;
revoke all on function public.hdar_live_map(int, int, text[], text[], boolean, boolean, text[]) from public, anon;
grant execute on function public.hdar_live_map(int, int, text[], text[], boolean, boolean, text[]) to authenticated, service_role;
