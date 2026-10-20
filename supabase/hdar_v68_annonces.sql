-- hdar v68 — Petites annonces (in-app, derrière l'écran 18+, jamais indexées).
-- Additif : nouvelles tables/fonctions ; fonctions existantes remplacées à l'identique + une branche « annonces »
-- (lecture/purge des photos, paiement Stripe ad_boost). Contrainte pricing_kind_check élargie (sur-ensemble).

create table if not exists hdar.ads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  pseudo text not null,
  title text not null check (length(title) between 3 and 60),
  body text not null check (length(body) between 1 and 1000),
  category text not null check (category in ('rencontre','sortie','kink','exhib','autre')),
  region text not null check (region ~ '^[a-z-]{2,40}$'),
  city text not null check (length(city) between 1 and 60),
  city_slug text not null check (city_slug ~ '^[a-z0-9-]{1,60}$'),
  photos text[] not null default '{}' check (cardinality(photos) <= 3),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hidden boolean not null default false,
  boost_scope text check (boost_scope in ('ville','region','france','monde')),
  boost_until timestamptz
);
create index if not exists ads_active_idx on hdar.ads (expires_at desc) where not hidden;
create index if not exists ads_user_idx on hdar.ads (user_id);
create index if not exists ads_city_idx on hdar.ads (city_slug, region);
alter table hdar.ads enable row level security;
revoke all on hdar.ads from anon, authenticated;

create table if not exists hdar.ad_reports (
  ad_id uuid not null references hdar.ads(id) on delete cascade,
  reporter_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  handled boolean not null default false,
  primary key (ad_id, reporter_id)
);
alter table hdar.ad_reports enable row level security;
revoke all on hdar.ad_reports from anon, authenticated;

alter table hdar.payments add column if not exists ad_id uuid;

-- RGPD : la suppression du profil supprime ses annonces.
create or replace function hdar.ads_profile_gone() returns trigger language plpgsql security definer set search_path to '' as $$
begin delete from hdar.ads where user_id = old.user_id; return old; end $$;
drop trigger if exists ads_profile_gone on hdar.profiles;
create trigger ads_profile_gone after delete on hdar.profiles for each row execute function hdar.ads_profile_gone();

create or replace function hdar.ad_json(a hdar.ads, s text, p_city text, p_region text) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object('id', a.id, 'user_id', a.user_id, 'pseudo', a.pseudo, 'title', a.title, 'body', a.body,
    'category', a.category, 'region', a.region, 'city', a.city, 'city_slug', a.city_slug, 'photos', to_jsonb(a.photos),
    'created_at', a.created_at, 'expires_at', a.expires_at, 'mine', a.user_id = s,
    'boost_scope', case when a.boost_until > now() then a.boost_scope end,
    'boost_until', case when a.boost_until > now() then a.boost_until end)
$$;

-- Le boost couvre-t-il la liste demandée ? ville < région < France < Monde.
create or replace function hdar.ad_pinned(a hdar.ads, p_region text, p_city text) returns boolean
language sql stable set search_path to '' as $$
  select coalesce(a.boost_until > now(), false) and case a.boost_scope
    when 'monde' then true
    when 'france' then coalesce(p_region, '') <> 'outre-mer'
    when 'region' then p_region is null or p_region = a.region
    when 'ville' then p_city = a.city_slug
    else false end
$$;

create or replace function public.hdar_ad_create(p_title text, p_body text, p_category text, p_region text, p_city text,
  p_city_slug text, p_hours int, p_photos text[]) returns uuid
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); ps text; ph text[] := '{}'; x text; nid uuid;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'ad', 6, interval '1 hour');
  if p_hours not in (24, 72, 168) then raise exception 'Durée invalide'; end if;
  if (select count(*) from hdar.ads where user_id = s and expires_at > now()) >= 3 then
    raise exception 'Tu as déjà 3 annonces en ligne : supprimes-en une d''abord';
  end if;
  if coalesce(cardinality(p_photos), 0) > 3 then raise exception '3 photos maximum'; end if;
  foreach x in array coalesce(p_photos, '{}') loop ph := ph || hdar.own_media(x, 'image'); end loop;
  select pseudo into ps from hdar.profiles where user_id = s;
  insert into hdar.ads (user_id, pseudo, title, body, category, region, city, city_slug, photos, expires_at)
  values (s, left(ps, 24), left(btrim(coalesce(p_title, '')), 60), left(btrim(coalesce(p_body, '')), 1000), lower(p_category),
    lower(p_region), left(btrim(coalesce(p_city, '')), 60), lower(left(p_city_slug, 60)), ph, now() + make_interval(hours => p_hours))
  returning id into nid;
  return nid;
end $$;

-- Lecture : toute session de l'appli (même sans profil). Ordre : boostées de la zone, puis plus récentes.
create or replace function public.hdar_ads_list(p_region text, p_city text, p_category text, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text;
begin
  s := hdar.self_id();
  return coalesce((select jsonb_agg(hdar.ad_json(q.a, s, p_city, p_region) order by q.pin desc, q.created_at desc) from (
    select a as a, hdar.ad_pinned(a, nullif(p_region, ''), nullif(p_city, '')) pin, a.created_at from hdar.ads a
    where a.expires_at > now() and not a.hidden
      and (nullif(p_category, '') is null or a.category = p_category)
      and not hdar.is_blocked(s, a.user_id)
      and ((nullif(p_region, '') is null or a.region = p_region) and (nullif(p_city, '') is null or a.city_slug = p_city)
           or hdar.ad_pinned(a, nullif(p_region, ''), nullif(p_city, '')))
    order by 2 desc, a.created_at desc
    offset greatest(0, coalesce(p_offset, 0)) limit 40) q(a, pin, created_at)), '[]'::jsonb);
end $$;

create or replace function public.hdar_ad_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); r jsonb;
begin
  select hdar.ad_json(a, s, null, null) into r from hdar.ads a
  where a.id = p_id and ((a.expires_at > now() and not a.hidden) or a.user_id = s);
  return r;
end $$;

create or replace function public.hdar_ads_mine() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(hdar.ad_json(a, s, null, null) || jsonb_build_object('hidden', a.hidden) order by a.created_at desc)
    from hdar.ads a where a.user_id = s and a.expires_at > now() - interval '7 days'), '[]'::jsonb);
end $$;

create or replace function public.hdar_ad_delete(p_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin delete from hdar.ads where id = p_id and user_id = s; end $$;

create or replace function public.hdar_ad_report(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.rate_check(s, 'adreport', 10, interval '1 hour');
  if not exists (select 1 from hdar.ads where id = p_id and user_id <> s) then return; end if;
  insert into hdar.ad_reports (ad_id, reporter_id, reason) values (p_id, s, left(coalesce(p_reason, ''), 200))
  on conflict do nothing;
  -- 3 signalements non traités : l'annonce est masquée en attendant l'admin.
  update hdar.ads set hidden = true where id = p_id
    and (select count(*) from hdar.ad_reports r where r.ad_id = p_id and not r.handled) >= 3;
end $$;

-- Répondre : message privé normal, préfixé d'une citation [[ad:<id>|<titre>]]. Profil obligatoire (côté serveur).
create or replace function public.hdar_ad_reply(p_id uuid, p_body text) returns text
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ads; b text := left(btrim(coalesce(p_body, '')), 380);
begin
  perform hdar.require_profile(s);
  select * into a from hdar.ads where id = p_id and expires_at > now() and not hidden;
  if a.id is null then raise exception 'Cette annonce n''est plus en ligne'; end if;
  if a.user_id = s then raise exception 'C''est ton annonce'; end if;
  if b = '' then raise exception 'Écris un message'; end if;
  perform public.hdar_send(s, a.user_id, '[[ad:' || a.id || '|' || replace(replace(a.title, ']', ''), '|', '') || ']]' || chr(10) || b);
  return a.user_id;
end $$;

-- Compteur anonyme pour les pages publiques /petites-annonces (aucun contenu).
create or replace function public.hdar_ads_count(p_region text, p_city text) returns integer
language sql stable security definer set search_path to '' as $$
  select count(*)::int from hdar.ads a where a.expires_at > now() and not a.hidden
    and (nullif(p_region, '') is null or a.region = p_region) and (nullif(p_city, '') is null or a.city_slug = p_city)
$$;

-- Admin
create or replace function public.hdar_admin_ads(p_key text, p_status text, p_city text, p_category text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(x order by (x->>'created_at') desc) from (
    select hdar.ad_json(a, null, null, null) || jsonb_build_object('hidden', a.hidden,
      'status', case when a.hidden then 'hidden' when a.expires_at <= now() then 'expired' else 'active' end,
      'reports', (select count(*) from hdar.ad_reports r where r.ad_id = a.id),
      'open_reports', (select count(*) from hdar.ad_reports r where r.ad_id = a.id and not r.handled),
      'reasons', (select jsonb_agg(r.reason order by r.created_at desc) from hdar.ad_reports r where r.ad_id = a.id)) x
    from hdar.ads a
    where (nullif(p_category, '') is null or a.category = p_category)
      and (nullif(p_city, '') is null or a.city_slug like '%' || p_city || '%' or a.city ilike '%' || p_city || '%')
      and case coalesce(p_status, '') when 'active' then a.expires_at > now() and not a.hidden
        when 'expired' then a.expires_at <= now() when 'hidden' then a.hidden
        when 'reported' then exists (select 1 from hdar.ad_reports r where r.ad_id = a.id and not r.handled) else true end
    order by a.created_at desc limit 300) q), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_ad_set(p_key text, p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.ads set hidden = p_hidden where id = p_id;
  update hdar.ad_reports set handled = true where ad_id = p_id;
end $$;

create or replace function public.hdar_admin_ad_delete(p_key text, p_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
begin perform hdar.admin_check(p_key); delete from hdar.ads where id = p_id; end $$;

do $$ declare f text; begin
  foreach f in array array['hdar_ad_create(text,text,text,text,text,text,int,text[])','hdar_ads_list(text,text,text,int)',
    'hdar_ad_get(uuid)','hdar_ads_mine()','hdar_ad_delete(uuid)','hdar_ad_report(uuid,text)','hdar_ad_reply(uuid,text)',
    'hdar_admin_ads(text,text,text,text)','hdar_admin_ad_set(text,uuid,boolean)','hdar_admin_ad_delete(text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.hdar_ads_count(text, text) from public;
grant execute on function public.hdar_ads_count(text, text) to anon, authenticated;
revoke all on function hdar.ads_profile_gone() from public, anon, authenticated;

-- Photos d'annonces : lisibles tant que l'annonce est en ligne, purgées ensuite (fonctions v30/v31 + branche annonces).
CREATE OR REPLACE FUNCTION public.hdar_can_read_media(p_name text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
declare s text;
begin
  if auth.uid() is null then return false; end if;
  begin s := hdar.self_id(); exception when others then s := null; end;
  if split_part(p_name, '/', 1) = auth.uid()::text then return true; end if;
  if exists (select 1 from hdar.admins a where a.auth_user_id = auth.uid()) then return true; end if;
  return (s is not null and exists (select 1 from hdar.live_messages m where m.media = 'sb:' || p_name
            and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s)))
    or exists (select 1 from hdar.area_messages a where a.media = p_name and not a.removed and a.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.place_messages p where p.media = p_name and not p.removed and p.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.spot_messages p where p.media = p_name and not p.removed)
    or (s is not null and exists (select 1 from hdar.ads d where p_name = any(d.photos) and not d.hidden and d.expires_at > now()));
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_media_orphans(p_limit integer DEFAULT 500)
 RETURNS TABLE(name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  select o.name from storage.objects o
  where o.bucket_id = 'hdar-media' and o.created_at < now() - interval '2 hours'
    and not exists (select 1 from hdar.live_messages m where m.media = 'sb:' || o.name
      and not (
        exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 1) and h.other_id = split_part(m.thread_id, ':', 2) and h.hidden_at > m.created_at)
        and exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 2) and h.other_id = split_part(m.thread_id, ':', 1) and h.hidden_at > m.created_at)))
    and not exists (select 1 from hdar.area_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.place_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.salon_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.spot_messages a where a.media = o.name and not a.removed
      and exists (select 1 from hdar.spots s where s.id = a.spot_id))
    and not exists (select 1 from hdar.ads d where o.name = any(d.photos) and d.expires_at > now() - interval '7 days')
  limit greatest(1, least(p_limit, 1000));
$function$;

-- Ménage : annonces expirées depuis plus de 7 jours.
select cron.unschedule('hdar-ads-purge') where exists (select 1 from cron.job where jobname = 'hdar-ads-purge');
select cron.schedule('hdar-ads-purge', '41 4 * * *', $c$ delete from hdar.ads where expires_at < now() - interval '7 days' $c$);

-- Boost d'annonce : 4 portées, mêmes paiements Stripe que les autres boosts (hdar-checkout / webhook).
alter table hdar.pricing drop constraint if exists pricing_kind_check;
alter table hdar.pricing add constraint pricing_kind_check check (kind in ('listing','boost','place_boost','premium','hearts','pro_boost','ad_boost'));
insert into hdar.pricing (product, kind, label, duration, price_cents, active, sort) values
  ('ad_boost_ville_24h',  'ad_boost', 'Ville · 24 heures',  interval '24 hours', 199, true, 41),
  ('ad_boost_ville_7d',   'ad_boost', 'Ville · 7 jours',    interval '7 days',   599, true, 42),
  ('ad_boost_region_24h', 'ad_boost', 'Région · 24 heures', interval '24 hours', 399, true, 43),
  ('ad_boost_region_7d',  'ad_boost', 'Région · 7 jours',   interval '7 days',  1199, true, 44),
  ('ad_boost_france_24h', 'ad_boost', 'France · 24 heures', interval '24 hours', 699, true, 45),
  ('ad_boost_france_7d',  'ad_boost', 'France · 7 jours',   interval '7 days',  1999, true, 46),
  ('ad_boost_monde_24h',  'ad_boost', 'Monde · 24 heures',  interval '24 hours', 999, true, 47),
  ('ad_boost_monde_7d',   'ad_boost', 'Monde · 7 jours',    interval '7 days',  2999, true, 48)
on conflict (product) do nothing;

CREATE OR REPLACE FUNCTION public.hdar_checkout_prepare(p_product text, p_place uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
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
  elsif pr.kind = 'ad_boost' then
    select title into nm from hdar.ads where id = p_place and user_id = s and expires_at > now() and not hidden;
    if nm is null then raise exception 'Annonce introuvable ou expirée'; end if;
  else
    perform hdar.require_profile(s);
    if pr.kind = 'premium' and exists (select 1 from hdar.premium where user_id = s and until > now() and stripe_subscription is not null
        and coalesce(status, 'active') not in ('cancelled', 'canceled', 'cancelling')) then
      raise exception 'Tu es déjà hdar+ : gère ton abonnement depuis la page premium';
    end if;
  end if;
  return jsonb_build_object('user_id', s, 'product', pr.product, 'kind', pr.kind, 'label', pr.label, 'price_cents', pr.price_cents,
    'interval', pr.stripe_interval, 'interval_count', pr.stripe_interval_count,
    'place_id', case when pr.kind in ('listing', 'place_boost', 'pro_boost', 'ad_boost') then p_place end, 'place_name', nm);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_payment_apply(p_ref text, p_user text, p_product text, p_place uuid, p_amount integer, p_currency text, p_subscription text, p_customer text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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
  elsif pr.kind = 'ad_boost' then
    -- Payé : on applique même si l'annonce a expiré entre-temps (elle reste en ligne pendant le boost).
    -- Portée : la plus large entre l'actuelle (si encore active) et celle achetée.
    update hdar.ads set
      boost_scope = case when boost_until > now() and array_position(array['ville','region','france','monde'], boost_scope)
          > array_position(array['ville','region','france','monde'], split_part(p_product, '_', 3)) then boost_scope
        else split_part(p_product, '_', 3) end,
      boost_until = greatest(now(), coalesce(boost_until, now())) + pr.duration
      where id = p_place and user_id = p_user returning boost_until into en;
    if en is null then raise exception 'ad/user mismatch'; end if;
    update hdar.ads set expires_at = greatest(expires_at, en) where id = p_place;
    select round(lat::numeric, 1), round(lng::numeric, 1) into la, lo from hdar.profiles where user_id = p_user;
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
  insert into hdar.payments (stripe_ref, user_id, product, kind, place_id, spot_id, boost_id, listing_id, ad_id, amount_cents, currency,
      stripe_subscription, stripe_customer, lat, lng)
    values (p_ref, p_user, p_product, pr.kind, case when pr.kind in ('listing', 'pro_boost') then p_place end,
      case when pr.kind = 'place_boost' then p_place end,
      case when pr.kind = 'boost' then nid end, case when pr.kind = 'listing' then nid end,
      case when pr.kind = 'ad_boost' then p_place end,
      coalesce(p_amount, 0), lower(coalesce(p_currency, 'eur')), p_subscription, p_customer, la, lo);
  return jsonb_build_object('ok', true, 'id', nid, 'until', en);
end $function$;

-- v68 (suite) : nombre de personnes ayant répondu (auteur + admin), aperçu de partage générique (ville seulement).
create table if not exists hdar.ad_replies (
  ad_id uuid not null references hdar.ads(id) on delete cascade,
  from_id text not null,
  created_at timestamptz not null default now(),
  primary key (ad_id, from_id)
);
alter table hdar.ad_replies enable row level security;
revoke all on hdar.ad_replies from anon, authenticated;

create or replace function public.hdar_ad_reply(p_id uuid, p_body text) returns text
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ads; b text := left(btrim(coalesce(p_body, '')), 380);
begin
  perform hdar.require_profile(s);
  select * into a from hdar.ads where id = p_id and expires_at > now() and not hidden;
  if a.id is null then raise exception 'Cette annonce n''est plus en ligne'; end if;
  if a.user_id = s then raise exception 'C''est ton annonce'; end if;
  if b = '' then raise exception 'Écris un message'; end if;
  perform public.hdar_send(s, a.user_id, '[[ad:' || a.id || '|' || replace(replace(a.title, ']', ''), '|', '') || ']]' || chr(10) || b);
  if not hdar.is_blocked(s, a.user_id) then
    insert into hdar.ad_replies (ad_id, from_id) values (a.id, s) on conflict do nothing;
  end if;
  return a.user_id;
end $$;

create or replace function public.hdar_ads_mine() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(hdar.ad_json(a, s, null, null) || jsonb_build_object('hidden', a.hidden,
      'replies', (select count(*) from hdar.ad_replies r where r.ad_id = a.id)) order by a.created_at desc)
    from hdar.ads a where a.user_id = s and a.expires_at > now() - interval '7 days'), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_ads(p_key text, p_status text, p_city text, p_category text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(x order by (x->>'created_at') desc) from (
    select hdar.ad_json(a, null, null, null) || jsonb_build_object('hidden', a.hidden,
      'status', case when a.hidden then 'hidden' when a.expires_at <= now() then 'expired' else 'active' end,
      'replies', (select count(*) from hdar.ad_replies r where r.ad_id = a.id),
      'reports', (select count(*) from hdar.ad_reports r where r.ad_id = a.id),
      'open_reports', (select count(*) from hdar.ad_reports r where r.ad_id = a.id and not r.handled),
      'reasons', (select jsonb_agg(r.reason order by r.created_at desc) from hdar.ad_reports r where r.ad_id = a.id)) x
    from hdar.ads a
    where (nullif(p_category, '') is null or a.category = p_category)
      and (nullif(p_city, '') is null or a.city_slug like '%' || p_city || '%' or a.city ilike '%' || p_city || '%')
      and case coalesce(p_status, '') when 'active' then a.expires_at > now() and not a.hidden
        when 'expired' then a.expires_at <= now() when 'hidden' then a.hidden
        when 'reported' then exists (select 1 from hdar.ad_reports r where r.ad_id = a.id and not r.handled) else true end
    order by a.created_at desc limit 300) q), '[]'::jsonb);
end $$;

-- Aperçu de lien partagé : seulement la ville d'une annonce en ligne (ni texte, ni photo, ni pseudo).
create or replace function public.hdar_ad_share_city(p_id uuid) returns text
language sql stable security definer set search_path to '' as $$
  select a.city from hdar.ads a where a.id = p_id and a.expires_at > now() and not a.hidden
$$;
revoke all on function public.hdar_ad_share_city(uuid) from public;
grant execute on function public.hdar_ad_share_city(uuid) to anon, authenticated;

-- v68 (suite 2) : position approximative (~400 m, grille 0,004°), tri « Près de moi », calque carte, avantages hdar+
-- (10 annonces actives, jusqu'à 30 jours, badge hdar+, 1 boost Région 24 h offert par mois).
alter table hdar.ads add column if not exists lat double precision, add column if not exists lng double precision,
  add column if not exists premium boolean not null default false;
create table if not exists hdar.ad_free_boosts (
  user_id text not null, month date not null, ad_id uuid, created_at timestamptz not null default now(),
  primary key (user_id, month));
alter table hdar.ad_free_boosts enable row level security;
revoke all on hdar.ad_free_boosts from anon, authenticated;

create or replace function hdar.ad_fuzz(v double precision) returns double precision
language sql immutable set search_path to '' as $$ select round((v / 0.004)::numeric)::double precision * 0.004 $$;

create or replace function hdar.ad_json(a hdar.ads, s text, p_city text, p_region text) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object('id', a.id, 'user_id', a.user_id, 'pseudo', a.pseudo, 'title', a.title, 'body', a.body,
    'category', a.category, 'region', a.region, 'city', a.city, 'city_slug', a.city_slug, 'photos', to_jsonb(a.photos),
    'created_at', a.created_at, 'expires_at', a.expires_at, 'mine', a.user_id = s, 'premium', a.premium,
    'lat', a.lat, 'lng', a.lng,
    'boost_scope', case when a.boost_until > now() then a.boost_scope end,
    'boost_until', case when a.boost_until > now() then a.boost_until end)
$$;

create or replace function hdar.ad_limit(p_user text) returns int language sql stable security definer set search_path to '' as $$
  select case when hdar.is_premium(p_user) then 10 else 3 end $$;

drop function if exists public.hdar_ad_create(text,text,text,text,text,text,int,text[]);
create or replace function public.hdar_ad_create(p_title text, p_body text, p_category text, p_region text, p_city text,
  p_city_slug text, p_hours int, p_photos text[], p_lat double precision default null, p_lng double precision default null) returns uuid
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); ps text; ph text[] := '{}'; x text; nid uuid; prem boolean;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'ad', 6, interval '1 hour');
  prem := hdar.is_premium(s);
  if p_hours not in (24, 72, 168) and not (prem and p_hours in (336, 720)) then
    raise exception '%', case when p_hours in (336, 720) then 'premium_required: 14 et 30 jours sont réservés à hdar+' else 'Durée invalide' end;
  end if;
  if (select count(*) from hdar.ads where user_id = s and expires_at > now()) >= hdar.ad_limit(s) then
    raise exception '%', case when prem then 'Tu as déjà 10 annonces en ligne : supprimes-en une d''abord'
      else 'Tu as déjà 3 annonces en ligne : supprimes-en une, ou passe à hdar+ pour en avoir 10' end;
  end if;
  if coalesce(cardinality(p_photos), 0) > 3 then raise exception '3 photos maximum'; end if;
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Position invalide';
  end if;
  foreach x in array coalesce(p_photos, '{}') loop ph := ph || hdar.own_media(x, 'image'); end loop;
  select pseudo into ps from hdar.profiles where user_id = s;
  insert into hdar.ads (user_id, pseudo, title, body, category, region, city, city_slug, photos, expires_at, lat, lng, premium)
  values (s, left(ps, 24), left(btrim(coalesce(p_title, '')), 60), left(btrim(coalesce(p_body, '')), 1000), lower(p_category),
    lower(p_region), left(btrim(coalesce(p_city, '')), 60), lower(left(p_city_slug, 60)), ph, now() + make_interval(hours => p_hours),
    hdar.ad_fuzz(p_lat), hdar.ad_fuzz(p_lng), prem)
  returning id into nid;
  return nid;
end $$;

drop function if exists public.hdar_ads_list(text,text,text,int);
create or replace function public.hdar_ads_list(p_region text, p_city text, p_category text, p_offset int default 0,
  p_lat double precision default null, p_lng double precision default null, p_near boolean default false)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(hdar.ad_json(q.a, s, p_city, p_region) || jsonb_build_object('km', q.km)
      order by q.pin desc, case when p_near then q.km end asc nulls last, q.created_at desc) from (
    select a as a, hdar.ad_pinned(a, nullif(p_region, ''), nullif(p_city, '')) pin, a.created_at,
      case when p_lat is not null and a.lat is not null then round(hdar.km(p_lat, p_lng, a.lat, a.lng)::numeric, 1) end km
    from hdar.ads a
    where a.expires_at > now() and not a.hidden
      and (nullif(p_category, '') is null or a.category = p_category)
      and not hdar.is_blocked(s, a.user_id)
      and ((nullif(p_region, '') is null or a.region = p_region) and (nullif(p_city, '') is null or a.city_slug = p_city)
           or hdar.ad_pinned(a, nullif(p_region, ''), nullif(p_city, '')))
    order by 2 desc, case when p_near then 4 end asc nulls last, a.created_at desc
    offset greatest(0, coalesce(p_offset, 0)) limit 40) q(a, pin, created_at, km)), '[]'::jsonb);
end $$;

-- Calque carte : annonces avec position, dans une boîte (positions déjà arrondies à ~400 m).
create or replace function public.hdar_ads_pins(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'lat', a.lat, 'lng', a.lng, 'category', a.category, 'title', a.title,
      'boosted', coalesce(a.boost_until > now(), false)))
    from (select * from hdar.ads a where a.expires_at > now() and not a.hidden and a.lat between p_s and p_n and a.lng between p_w and p_e
      and not hdar.is_blocked(s, a.user_id) order by a.created_at desc limit 200) a), '[]'::jsonb);
end $$;

-- Statut pour l'écran de création : limite, hdar+, boost offert du mois.
create or replace function public.hdar_ads_status() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); prem boolean := hdar.is_premium(s);
begin
  return jsonb_build_object('premium', prem, 'limit', hdar.ad_limit(s),
    'active', (select count(*) from hdar.ads where user_id = s and expires_at > now()),
    'free_boost', prem and not exists (select 1 from hdar.ad_free_boosts where user_id = s and month = date_trunc('month', now())::date));
end $$;

-- hdar+ : 1 boost Région 24 h offert par mois civil.
create or replace function public.hdar_ad_free_boost(p_id uuid) returns timestamptz
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); en timestamptz;
begin
  perform hdar.require_premium(s);
  if not exists (select 1 from hdar.ads where id = p_id and user_id = s and expires_at > now() and not hidden) then
    raise exception 'Annonce introuvable ou expirée';
  end if;
  insert into hdar.ad_free_boosts (user_id, month, ad_id) values (s, date_trunc('month', now())::date, p_id)
  on conflict do nothing;
  if not found then raise exception 'Ton boost offert de ce mois est déjà utilisé'; end if;
  update hdar.ads set
    boost_scope = case when boost_until > now() and boost_scope in ('region','france','monde') then boost_scope else 'region' end,
    boost_until = greatest(now(), coalesce(boost_until, now())) + interval '24 hours'
  where id = p_id returning boost_until into en;
  update hdar.ads set expires_at = greatest(expires_at, en) where id = p_id;
  return en;
end $$;

do $$ declare f text; begin
  foreach f in array array['hdar_ad_create(text,text,text,text,text,text,int,text[],double precision,double precision)',
    'hdar_ads_list(text,text,text,int,double precision,double precision,boolean)',
    'hdar_ads_pins(double precision,double precision,double precision,double precision)','hdar_ads_status()','hdar_ad_free_boost(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function hdar.ad_limit(text) from public, anon, authenticated;
