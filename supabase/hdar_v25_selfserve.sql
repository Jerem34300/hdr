-- hdar v25 — Avis sur les lieux, espace partenaire en libre-service, boosts payants, paiements Stripe, analytics régie.
-- Applied as migration hdar_v25_selfserve.
-- * hdar.pricing : tarifs (centimes) modifiables par l'admin. kind = listing (abonnement) | boost (paiement unique).
-- * hdar.places : + owner_id, website, contact, photos, réglages avis (ratings_on, comments_on, comments_public), sub_status.
-- * hdar.place_ratings / place_comments / place_comment_reports : étoiles 1–5 (une par personne, modifiable), commentaires, signalements.
-- * hdar.place_daily.clicks, hdar.place_origin (zone ~5 km × heure, sans identifiant), hdar.user_daily.pm_in.
-- * hdar.payments : paiements Stripe (idempotents par stripe_ref). Seule la fonction edge (service_role) peut les écrire.

create table if not exists hdar.pricing (
  product text primary key,
  kind text not null check (kind in ('listing', 'boost')),
  label text not null,
  duration interval not null,
  stripe_interval text check (stripe_interval in ('week', 'month')),
  stripe_interval_count int,
  price_cents int not null check (price_cents >= 0),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now());
insert into hdar.pricing (product, kind, label, duration, stripe_interval, stripe_interval_count, price_cents, sort) values
  ('listing_week', 'listing', '1 semaine', interval '7 days', 'week', 1, 1500, 1),
  ('listing_month', 'listing', '1 mois', interval '1 month', 'month', 1, 4900, 2),
  ('listing_quarter', 'listing', '3 mois', interval '3 months', 'month', 3, 12900, 3),
  ('boost_1h', 'boost', '1 heure', interval '1 hour', null, null, 199, 11),
  ('boost_24h', 'boost', '24 heures', interval '24 hours', null, null, 499, 12),
  ('boost_7d', 'boost', '7 jours', interval '7 days', null, null, 1499, 13)
on conflict (product) do nothing;

alter table hdar.places add column if not exists owner_id text;
alter table hdar.places add column if not exists website text;
alter table hdar.places add column if not exists contact text;
alter table hdar.places add column if not exists photos text[] not null default '{}';
alter table hdar.places add column if not exists ratings_on boolean not null default true;
alter table hdar.places add column if not exists comments_on boolean not null default true;
alter table hdar.places add column if not exists comments_public boolean not null default true;
alter table hdar.places add column if not exists sub_status text;
alter table hdar.places add column if not exists stripe_subscription text;
create index if not exists places_owner on hdar.places (owner_id) where owner_id is not null;

create table if not exists hdar.place_ratings (
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null, stars int not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(), primary key (place_id, user_id));
create table if not exists hdar.place_comments (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null, body text not null, hidden boolean not null default false,
  created_at timestamptz not null default now());
create index if not exists place_comments_place on hdar.place_comments (place_id, created_at desc);
create table if not exists hdar.place_comment_reports (
  comment_id uuid not null references hdar.place_comments(id) on delete cascade,
  user_id text not null, reason text, created_at timestamptz not null default now(), handled boolean not null default false,
  primary key (comment_id, user_id));
alter table hdar.place_daily add column if not exists clicks int not null default 0;
create table if not exists hdar.place_origin (
  day date not null, place_id uuid not null, hour int not null, lat double precision not null, lng double precision not null,
  n int not null default 0, primary key (day, place_id, hour, lat, lng));
alter table hdar.user_daily add column if not exists pm_in int not null default 0;

create table if not exists hdar.payments (
  id uuid primary key default gen_random_uuid(),
  stripe_ref text not null unique,
  user_id text not null, product text not null, kind text not null,
  place_id uuid references hdar.places(id) on delete set null,
  boost_id uuid, listing_id uuid,
  amount_cents int not null default 0, currency text not null default 'eur',
  stripe_subscription text, stripe_customer text,
  lat double precision, lng double precision,
  created_at timestamptz not null default now());
create index if not exists payments_created on hdar.payments (created_at);

alter table hdar.pricing enable row level security;
alter table hdar.place_ratings enable row level security;
alter table hdar.place_comments enable row level security;
alter table hdar.place_comment_reports enable row level security;
alter table hdar.place_origin enable row level security;
alter table hdar.payments enable row level security;
revoke all on hdar.pricing, hdar.place_ratings, hdar.place_comments, hdar.place_comment_reports, hdar.place_origin, hdar.payments
  from public, anon, authenticated;

-- Messages reçus (pour les stats de boost)
create or replace function hdar.on_msg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text := tg_argv[0]; dest text;
begin
  perform hdar.bump_msg(k);
  perform hdar.bump_user(new.from_id, k);
  if k = 'pm' then
    dest := case when split_part(new.thread_id, ':', 1) = new.from_id then split_part(new.thread_id, ':', 2) else split_part(new.thread_id, ':', 1) end;
    if dest <> '' and dest <> new.from_id then perform hdar.bump_user(dest, 'pm_in'); end if;
    if not exists (select 1 from hdar.live_messages m where m.thread_id = new.thread_id and m.id <> new.id) then
      perform hdar.bump_user(new.from_id, 'convs');
    end if;
  end if;
  if k = 'place' then
    insert into hdar.place_daily (day, place_id, messages) values (current_date, new.place_id, 1)
      on conflict (day, place_id) do update set messages = hdar.place_daily.messages + 1;
    insert into hdar.place_visitors values (current_date, new.place_id, new.from_id) on conflict do nothing;
  end if;
  return null;
exception when others then return null;
end $$;
revoke execute on function hdar.on_msg() from public, anon, authenticated;

create or replace function hdar.on_profile_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from hdar.user_daily where user_id = old.user_id;
  delete from hdar.place_visitors where user_id = old.user_id;
  delete from hdar.place_ratings where user_id = old.user_id;
  delete from hdar.place_comments where user_id = old.user_id;
  return null;
end $$;
revoke execute on function hdar.on_profile_delete() from public, anon, authenticated;

create or replace function hdar.place_visible(p hdar.places) returns boolean
language sql stable set search_path = '' as $$
  select p.status = 'approved' and (not p.partner or coalesce(p.partner_until > now(), false));
$$;
revoke execute on function hdar.place_visible(hdar.places) from public, anon, authenticated;

---------------------------------------------------------------- Fiche lieu (public)
-- Détail enrichi : photos, site, contact, réglages avis, moyenne.
create or replace function public.hdar_place_info(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id(); p hdar.places; own boolean; pub boolean; r jsonb;
begin
  select * into p from hdar.places where id = p_id;
  if p.id is null then return null; end if;
  own := p.owner_id = s;
  if not hdar.place_visible(p) and not own then return null; end if;
  pub := not p.partner or p.comments_public;
  select jsonb_build_object(
    'website', p.website, 'contact', p.contact, 'photos', to_jsonb(p.photos), 'owner', own,
    'ratings_on', (not p.partner or p.ratings_on), 'comments_on', (not p.partner or p.comments_on), 'comments_public', pub,
    'avg', (select round(avg(stars)::numeric, 1) from hdar.place_ratings where place_id = p_id),
    'count', (select count(*) from hdar.place_ratings where place_id = p_id),
    'mine', (select stars from hdar.place_ratings where place_id = p_id and user_id = s),
    'comments', case when pub or own then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at,
        'pseudo', coalesce(pr.pseudo, 'Anonyme'), 'mine', c.user_id = s,
        'stars', (select stars from hdar.place_ratings x where x.place_id = p_id and x.user_id = c.user_id)) order by c.created_at desc)
      from (select * from hdar.place_comments where place_id = p_id and not hidden order by created_at desc limit 100) c
      left join hdar.profiles pr on pr.user_id = c.user_id), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'pseudo', 'Toi', 'mine', true, 'stars', null))
        from hdar.place_comments c where c.place_id = p_id and c.user_id = s and not c.hidden), '[]'::jsonb) end
  ) into r;
  return r;
end $$;

create or replace function public.hdar_place_rate(p_id uuid, p_stars int) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); p hdar.places;
begin
  perform hdar.require_profile(s);
  select * into p from hdar.places where id = p_id;
  if p.id is null or not hdar.place_visible(p) then raise exception 'Lieu introuvable'; end if;
  if p.partner and not p.ratings_on then raise exception 'Les notes sont désactivées pour ce lieu'; end if;
  if p.owner_id = s then raise exception 'Tu ne peux pas noter ton propre lieu'; end if;
  if p_stars is null then delete from hdar.place_ratings where place_id = p_id and user_id = s; return; end if;
  if p_stars not between 1 and 5 then raise exception 'Note invalide'; end if;
  perform hdar.rate_check(s, 'rate', 30, interval '1 hour');
  insert into hdar.place_ratings (place_id, user_id, stars) values (p_id, s, p_stars)
    on conflict (place_id, user_id) do update set stars = excluded.stars, updated_at = now();
end $$;

create or replace function public.hdar_place_comment(p_id uuid, p_body text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); p hdar.places; b text := left(btrim(coalesce(p_body, '')), 500);
begin
  perform hdar.require_profile(s);
  select * into p from hdar.places where id = p_id;
  if p.id is null or not hdar.place_visible(p) then raise exception 'Lieu introuvable'; end if;
  if p.partner and not p.comments_on then raise exception 'Les commentaires sont désactivés pour ce lieu'; end if;
  if length(b) < 2 then raise exception 'Écris un commentaire'; end if;
  perform hdar.rate_check(s, 'comment', 5, interval '1 hour');
  insert into hdar.place_comments (place_id, user_id, body) values (p_id, s, b);
end $$;

create or replace function public.hdar_place_comment_delete(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from hdar.place_comments where id = p_id and user_id = hdar.self_id();
end $$;

create or replace function public.hdar_place_comment_report(p_id uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.rate_check(s, 'report', 20, interval '1 day');
  insert into hdar.place_comment_reports (comment_id, user_id, reason) values (p_id, s, left(p_reason, 300))
    on conflict do nothing;
end $$;

create or replace function public.hdar_place_click(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.self_id();
  if exists (select 1 from hdar.places where id = p_id) then
    insert into hdar.place_daily (day, place_id, clicks) values (current_date, p_id, 1)
      on conflict (day, place_id) do update set clicks = hdar.place_daily.clicks + 1;
  end if;
end $$;

-- Zone d'origine du visiteur (carreau ~5 km) et heure, sans identifiant.
create or replace function public.hdar_place_seen(p_id uuid, p_lat double precision, p_lng double precision) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.self_id();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return; end if;
  if not exists (select 1 from hdar.places where id = p_id) then return; end if;
  insert into hdar.place_origin (day, place_id, hour, lat, lng, n)
    values (current_date, p_id, extract(hour from now() at time zone 'Europe/Paris')::int,
      round(p_lat::numeric * 20) / 20, round(p_lng::numeric * 20) / 20, 1)
    on conflict (day, place_id, hour, lat, lng) do update set n = hdar.place_origin.n + 1;
end $$;

create or replace function public.hdar_pricing() returns table (product text, kind text, label text, price_cents int)
language sql stable security definer set search_path = '' as $$
  select product, kind, label, price_cents from hdar.pricing where active order by sort;
$$;

---------------------------------------------------------------- Espace partenaire
create or replace function public.hdar_my_places() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'name', p.name, 'description', p.description, 'lat', p.lat, 'lng', p.lng,
      'website', p.website, 'contact', p.contact, 'photos', to_jsonb(p.photos),
      'ratings_on', p.ratings_on, 'comments_on', p.comments_on, 'comments_public', p.comments_public,
      'partner_until', p.partner_until, 'active', coalesce(p.partner_until > now(), false) and p.status = 'approved',
      'status', p.status, 'sub_status', p.sub_status) order by p.created_at desc)
    from hdar.places p where p.owner_id = s), '[]'::jsonb);
end $$;

create or replace function public.hdar_partner_save(p_id uuid, p_kind text, p_name text, p_description text,
  p_lat double precision, p_lng double precision, p_website text, p_contact text, p_photos text[],
  p_ratings_on boolean, p_comments_on boolean, p_comments_public boolean) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); n text := left(btrim(coalesce(p_name, '')), 80); w text := btrim(coalesce(p_website, '')); r uuid;
  ph text[] := coalesce(p_photos, '{}');
begin
  if p_kind not in ('bar', 'club', 'sauna', 'other', 'cruising', 'beach', 'park', 'aire') then raise exception 'Catégorie invalide'; end if;
  if length(n) < 2 then raise exception 'Donne un nom au lieu'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Position invalide'; end if;
  if w <> '' and w !~* '^https?://[^\s]+$' then w := 'https://' || w; end if;
  if w <> '' and w !~* '^https?://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' then raise exception 'Site web invalide'; end if;
  if cardinality(ph) > 4 then raise exception '4 photos maximum'; end if;
  if exists (select 1 from unnest(ph) x where x !~ '^data:image/(jpeg|png|webp);base64,' or length(x) > 400000) then raise exception 'Photo invalide'; end if;
  if p_id is null then
    perform hdar.rate_check(s, 'partner', 5, interval '1 day');
    insert into hdar.places (kind, name, description, lat, lng, source, status, partner, owner_id, website, contact, photos,
        ratings_on, comments_on, comments_public)
      values (p_kind, n, left(btrim(coalesce(p_description, '')), 600), p_lat, p_lng, 'user', 'approved', true, s, nullif(w, ''),
        nullif(left(btrim(coalesce(p_contact, '')), 200), ''), ph, coalesce(p_ratings_on, true), coalesce(p_comments_on, true), coalesce(p_comments_public, true))
      returning id into r;
  else
    update hdar.places set kind = p_kind, name = n, description = left(btrim(coalesce(p_description, '')), 600), lat = p_lat, lng = p_lng,
        website = nullif(w, ''), contact = nullif(left(btrim(coalesce(p_contact, '')), 200), ''), photos = ph,
        ratings_on = coalesce(p_ratings_on, true), comments_on = coalesce(p_comments_on, true), comments_public = coalesce(p_comments_public, true)
      where id = p_id and owner_id = s returning id into r;
    if r is null then raise exception 'Lieu introuvable'; end if;
  end if;
  return r;
end $$;

create or replace function public.hdar_partner_stats(p_id uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id(); since date := current_date - least(greatest(coalesce(p_days, 30), 1), 400);
begin
  if not exists (select 1 from hdar.places where id = p_id and owner_id = s) then raise exception 'Lieu introuvable'; end if;
  return jsonb_build_object(
    'views', (select coalesce(sum(views), 0) from hdar.place_daily where place_id = p_id and day > since),
    'clicks', (select coalesce(sum(clicks), 0) from hdar.place_daily where place_id = p_id and day > since),
    'messages', (select coalesce(sum(messages), 0) from hdar.place_daily where place_id = p_id and day > since),
    'visitors', (select count(distinct user_id) from hdar.place_visitors where place_id = p_id and day > since),
    'avg', (select round(avg(stars)::numeric, 1) from hdar.place_ratings where place_id = p_id),
    'ratings', (select count(*) from hdar.place_ratings where place_id = p_id),
    'comments', (select count(*) from hdar.place_comments where place_id = p_id and not hidden),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'views', views, 'clicks', clicks, 'messages', messages,
        'visitors', (select count(*) from hdar.place_visitors v where v.place_id = p_id and v.day = d.day)) order by day)
      from hdar.place_daily d where place_id = p_id and day > since), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(z) from (select jsonb_build_object('lat', lat, 'lng', lng, 'n', sum(n)) z
      from hdar.place_origin where place_id = p_id and day > since group by lat, lng order by sum(n) desc limit 30) q), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('hour', hour, 'n', n) order by hour) from (select hour, sum(n) n
      from hdar.place_origin where place_id = p_id and day > since group by hour) q), '[]'::jsonb));
end $$;

---------------------------------------------------------------- Boost en libre-service
create or replace function public.hdar_my_boosts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
      'active', not b.cancelled and now() between b.starts_at and b.ends_at, 'cancelled', b.cancelled,
      'views', (select coalesce(sum(d.views), 0) from hdar.user_daily d where d.user_id = s and d.day between b.starts_at::date and b.ends_at::date),
      'messages', (select coalesce(sum(d.pm_in), 0) from hdar.user_daily d where d.user_id = s and d.day between b.starts_at::date and b.ends_at::date))
      order by b.starts_at desc)
    from (select * from hdar.boosts where user_id = s order by starts_at desc limit 20) b), '[]'::jsonb);
end $$;

---------------------------------------------------------------- Paiement (appelé par les fonctions edge)
-- Appelée avec le jeton de l'utilisateur : valide le produit et la propriété, renvoie ce qu'il faut pour Stripe.
create or replace function public.hdar_checkout_prepare(p_product text, p_place uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id(); pr hdar.pricing;
begin
  select * into pr from hdar.pricing where product = p_product and active;
  if pr.product is null then raise exception 'Offre indisponible'; end if;
  if pr.kind = 'listing' then
    if p_place is null or not exists (select 1 from hdar.places where id = p_place and owner_id = s) then raise exception 'Lieu introuvable'; end if;
  else
    perform hdar.require_profile(s);
  end if;
  return jsonb_build_object('user_id', s, 'product', pr.product, 'kind', pr.kind, 'label', pr.label, 'price_cents', pr.price_cents,
    'interval', pr.stripe_interval, 'interval_count', pr.stripe_interval_count, 'place_id', case when pr.kind = 'listing' then p_place end,
    'place_name', (select name from hdar.places where id = p_place));
end $$;

-- service_role uniquement : applique un paiement confirmé (idempotent via p_ref = session ou facture Stripe).
create or replace function public.hdar_payment_apply(p_ref text, p_user text, p_product text, p_place uuid, p_amount int,
  p_currency text, p_subscription text, p_customer text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pr hdar.pricing; st timestamptz; nid uuid; la double precision; lo double precision;
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
  else
    select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.boosts where user_id = p_user and not cancelled;
    insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note)
      values (p_user, st, st + pr.duration, coalesce(p_amount, 0), 'Stripe ' || p_ref) returning id into nid;
    select round(lat::numeric, 1), round(lng::numeric, 1) into la, lo from hdar.profiles where user_id = p_user;
  end if;
  insert into hdar.payments (stripe_ref, user_id, product, kind, place_id, boost_id, listing_id, amount_cents, currency,
      stripe_subscription, stripe_customer, lat, lng)
    values (p_ref, p_user, p_product, pr.kind, case when pr.kind = 'listing' then p_place end,
      case when pr.kind = 'boost' then nid end, case when pr.kind = 'listing' then nid end,
      coalesce(p_amount, 0), lower(coalesce(p_currency, 'eur')), p_subscription, p_customer, la, lo);
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function public.hdar_subscription_status(p_subscription text, p_status text) returns void
language sql volatile security definer set search_path = '' as $$
  update hdar.places set sub_status = left(p_status, 30) where stripe_subscription = p_subscription;
$$;

---------------------------------------------------------------- Admin
create or replace function public.hdar_admin_pricing(p_key text) returns setof hdar.pricing
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return query select * from hdar.pricing order by sort;
end $$;

create or replace function public.hdar_admin_pricing_set(p_key text, p_product text, p_label text, p_price int, p_active boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  if p_price is null or p_price < 0 or p_price > 1000000 then raise exception 'Prix invalide'; end if;
  update hdar.pricing set label = coalesce(nullif(btrim(p_label), ''), label), price_cents = p_price, active = coalesce(p_active, active),
    updated_at = now() where product = p_product;
end $$;

create or replace function public.hdar_admin_comments(p_key text, p_reported boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(x order by (x->>'reports')::int desc, x->>'at' desc) from (
    select jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'hidden', c.hidden, 'user_id', c.user_id,
      'pseudo', coalesce(pr.pseudo, '(supprimé)'), 'place_id', c.place_id, 'place', p.name,
      'reports', (select count(*) from hdar.place_comment_reports r where r.comment_id = c.id and not r.handled),
      'reasons', (select jsonb_agg(r.reason) from hdar.place_comment_reports r where r.comment_id = c.id and not r.handled and r.reason is not null)) x
    from hdar.place_comments c join hdar.places p on p.id = c.place_id left join hdar.profiles pr on pr.user_id = c.user_id
    where not coalesce(p_reported, false) or exists (select 1 from hdar.place_comment_reports r where r.comment_id = c.id and not r.handled)
    order by c.created_at desc limit 300) q), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_comment_moderate(p_key text, p_id uuid, p_action text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  if p_action = 'delete' then delete from hdar.place_comments where id = p_id; return; end if;
  if p_action in ('hide', 'show') then update hdar.place_comments set hidden = (p_action = 'hide') where id = p_id; end if;
  update hdar.place_comment_reports set handled = true where comment_id = p_id;
end $$;

-- ROI par lieu : vues, visiteurs uniques, clics site, messages, avis, revenu sur la période.
create or replace function public.hdar_admin_places_roi(p_key text, p_days int default 30)
returns table (id uuid, name text, kind text, partner boolean, active boolean, lat double precision, lng double precision,
  views bigint, visitors bigint, clicks bigint, messages bigint, ratings bigint, avg_stars numeric, comments bigint, revenue_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare since date := current_date - least(greatest(coalesce(p_days, 30), 1), 400);
begin
  perform hdar.admin_check(p_key);
  return query
    with d as (select place_id, sum(views) v, sum(clicks) c, sum(messages) m from hdar.place_daily where day > since group by 1),
    pay as (select place_id, sum(amount_cents) r from hdar.payments where created_at::date > since and place_id is not null group by 1)
    select p.id, p.name, p.kind, p.partner, coalesce(p.partner and p.partner_until > now(), false), hdar.round_coord(p.lat), hdar.round_coord(p.lng),
      coalesce(d.v, 0)::bigint, (select count(distinct v.user_id) from hdar.place_visitors v where v.place_id = p.id and v.day > since)::bigint,
      coalesce(d.c, 0)::bigint, coalesce(d.m, 0)::bigint,
      (select count(*) from hdar.place_ratings r where r.place_id = p.id)::bigint,
      (select round(avg(r.stars)::numeric, 1) from hdar.place_ratings r where r.place_id = p.id),
      (select count(*) from hdar.place_comments c where c.place_id = p.id)::bigint,
      coalesce(pay.r, 0)::bigint
    from hdar.places p left join d on d.place_id = p.id left join pay on pay.place_id = p.id
    where p.partner or d.place_id is not null
    order by p.partner desc, coalesce(d.v, 0) desc limit 200;
end $$;

create or replace function public.hdar_admin_place_origin(p_key text, p_place uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare since date := current_date - least(greatest(coalesce(p_days, 30), 1), 400);
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'zones', coalesce((select jsonb_agg(z) from (select jsonb_build_object('lat', lat, 'lng', lng, 'n', sum(n)) z
      from hdar.place_origin where place_id = p_place and day > since group by lat, lng order by sum(n) desc limit 50) q), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('hour', hour, 'n', n) order by hour) from (select hour, sum(n) n
      from hdar.place_origin where place_id = p_place and day > since group by hour) q), '[]'::jsonb));
end $$;

-- Entonnoir, rétention S1/M1, tendances semaine/semaine, revenus.
create or replace function public.hdar_admin_growth(p_key text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 400); since timestamptz := now() - make_interval(days => d);
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'funnel', (select jsonb_build_object(
        'visitors', count(*),
        'profiles', count(*) filter (where exists (select 1 from hdar.profiles p where p.user_id = c.id and p.profile_at is not null)),
        'first_message', count(*) filter (where exists (select 1 from hdar.user_daily u where u.user_id = c.id and u.pm + u.area + u.place + u.spot > 0)))
      from hdar.devices c where c.first_seen > since),
    'retention', (select jsonb_build_object(
        'w1_cohort', count(*) filter (where c.f <= current_date - 14),
        'w1', count(*) filter (where c.f <= current_date - 14 and exists (select 1 from hdar.daily_visits v where v.device = c.id and v.day between c.f + 7 and c.f + 13)),
        'm1_cohort', count(*) filter (where c.f <= current_date - 35),
        'm1', count(*) filter (where c.f <= current_date - 35 and exists (select 1 from hdar.daily_visits v where v.device = c.id and v.day between c.f + 28 and c.f + 34)))
      from (select id, first_seen::date f from hdar.devices where first_seen > now() - interval '120 days') c),
    'trend_zones', coalesce((select jsonb_agg(z) from (
        select jsonb_build_object('lat', lat, 'lng', lng, 'now', cur, 'prev', prev) z from (
          select round(lat::numeric, 1)::float8 lat, round(lng::numeric, 1)::float8 lng,
            sum(total) filter (where hour > now() - interval '7 days') cur,
            sum(total) filter (where hour <= now() - interval '7 days') prev
          from hdar.activity_hourly where hour > now() - interval '14 days' group by 1, 2) t
        where coalesce(cur, 0) > 0 order by coalesce(cur, 0) - coalesce(prev, 0) desc limit 20) q), '[]'::jsonb),
    'trend_places', coalesce((select jsonb_agg(z) from (
        select jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'lat', p.lat, 'lng', p.lng, 'now', t.cur, 'prev', t.prev) z from (
          select place_id, sum(views + messages * 3 + clicks * 2) filter (where day > current_date - 7) cur,
            sum(views + messages * 3 + clicks * 2) filter (where day <= current_date - 7) prev
          from hdar.place_daily where day > current_date - 14 group by 1) t join hdar.places p on p.id = t.place_id
        where coalesce(t.cur, 0) > 0 order by coalesce(t.cur, 0) - coalesce(t.prev, 0) desc limit 20) q), '[]'::jsonb),
    'revenue', (select jsonb_build_object('total', coalesce(sum(amount_cents), 0), 'count', count(*), 'payers', count(distinct user_id),
        'listings', coalesce(sum(amount_cents) filter (where kind = 'listing'), 0), 'boosts', coalesce(sum(amount_cents) filter (where kind = 'boost'), 0),
        'mau', (select count(distinct device) from hdar.daily_visits where day > current_date - 30))
      from hdar.payments where created_at > since),
    'revenue_zones', coalesce((select jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng, 'cents', c, 'payers', u)) from (
        select lat, lng, sum(amount_cents) c, count(distinct user_id) u from hdar.payments where created_at > since and lat is not null group by 1, 2) q), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'kind', kind, 'product', product, 'cents', amount_cents,
        'user_id', y.user_id, 'place', (select name from hdar.places where id = y.place_id)) order by created_at desc)
      from (select * from hdar.payments where created_at > since order by created_at desc limit 100) y), '[]'::jsonb));
end $$;

-- Grants
do $$ declare f text; begin
  foreach f in array array[
    'hdar_place_info(uuid)', 'hdar_place_rate(uuid, int)', 'hdar_place_comment(uuid, text)', 'hdar_place_comment_delete(uuid)',
    'hdar_place_comment_report(uuid, text)', 'hdar_place_click(uuid)', 'hdar_place_seen(uuid, double precision, double precision)',
    'hdar_pricing()', 'hdar_my_places()',
    'hdar_partner_save(uuid, text, text, text, double precision, double precision, text, text, text[], boolean, boolean, boolean)',
    'hdar_partner_stats(uuid, int)', 'hdar_my_boosts()', 'hdar_checkout_prepare(text, uuid)',
    'hdar_admin_pricing(text)', 'hdar_admin_pricing_set(text, text, text, int, boolean)', 'hdar_admin_comments(text, boolean)',
    'hdar_admin_comment_moderate(text, uuid, text)', 'hdar_admin_places_roi(text, int)', 'hdar_admin_place_origin(text, uuid, int)',
    'hdar_admin_growth(text, int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['hdar_payment_apply(text, text, text, uuid, int, text, text, text)', 'hdar_subscription_status(text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Rétention des nouvelles tables de stats
create or replace function hdar.stats_snapshot_v25() returns void
language sql security definer set search_path = '' as $$
  delete from hdar.place_origin where day < current_date - 400;
$$;
revoke execute on function hdar.stats_snapshot_v25() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'hdar-origin-purge';
select cron.schedule('hdar-origin-purge', '17 3 * * *', 'select hdar.stats_snapshot_v25()');
