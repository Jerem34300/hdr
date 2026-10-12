-- hdar v23 — Fondations monétisation (aucun paiement en ligne pour l'instant ; saisie manuelle par l'admin)
-- Applied as migration hdar_v23_monetization.
-- * hdar.boosts : un utilisateur « boosté » brille sur la carte entre starts_at et ends_at (prix noté en centimes).
-- * hdar.partner_listings : annonces payantes d'un lieu partenaire ; chaque annonce prolonge places.partner_until
--   (un lieu partenaire n'est visible que pendant une annonce active, cf. v20).
-- * public.hdar_boosted() : ids des personnes visibles actuellement boostées (pour le halo sur la carte).
-- * Admin : hdar_admin_boosts, hdar_admin_boost_create, hdar_admin_boost_cancel,
--   hdar_admin_partners, hdar_admin_partner_create, hdar_admin_listing_add, hdar_admin_listing_cancel.

create table if not exists hdar.boosts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  price_cents int not null default 0 check (price_cents >= 0),
  note text,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at));
create index if not exists boosts_active on hdar.boosts (user_id, ends_at);
create table if not exists hdar.partner_listings (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  price_cents int not null default 0 check (price_cents >= 0),
  contact text,
  note text,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at));
alter table hdar.boosts enable row level security;
alter table hdar.partner_listings enable row level security;
revoke all on hdar.boosts, hdar.partner_listings from anon, authenticated;

create or replace function hdar.sync_partner(p_place uuid) returns void
language sql security definer set search_path = '' as $$
  update hdar.places p set partner = true, status = 'approved', partner_until = (
    select max(l.ends_at) from hdar.partner_listings l where l.place_id = p_place and not l.cancelled and l.starts_at <= now())
  where p.id = p_place;
$$;
revoke execute on function hdar.sync_partner(uuid) from public, anon, authenticated;

create or replace function public.hdar_boosted() returns table (id text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform hdar.self_id();
  return query select distinct b.user_id from hdar.boosts b join hdar.profiles p on p.user_id = b.user_id
    where not b.cancelled and now() between b.starts_at and b.ends_at and p.visible_until > now();
end $$;
revoke execute on function public.hdar_boosted() from public, anon;
grant execute on function public.hdar_boosted() to authenticated;

create or replace function public.hdar_admin_boosts(p_key text)
returns table (id uuid, user_id text, pseudo text, starts_at timestamptz, ends_at timestamptz, price_cents int, note text, cancelled boolean, active boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform hdar.admin_check(p_key);
  return query select b.id, b.user_id, coalesce(p.pseudo, '(supprimé)'), b.starts_at, b.ends_at, b.price_cents, b.note, b.cancelled,
      (not b.cancelled and now() between b.starts_at and b.ends_at)
    from hdar.boosts b left join hdar.profiles p on p.user_id = b.user_id
    order by b.created_at desc limit 200;
end $$;

create or replace function public.hdar_admin_boost_create(p_key text, p_user text, p_starts timestamptz, p_ends timestamptz, p_price int, p_note text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare r uuid;
begin
  perform hdar.admin_check(p_key);
  if not exists (select 1 from hdar.profiles where user_id = p_user) then raise exception 'Utilisateur introuvable'; end if;
  insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note)
    values (p_user, coalesce(p_starts, now()), p_ends, greatest(coalesce(p_price, 0), 0), left(p_note, 300)) returning id into r;
  return r;
end $$;

create or replace function public.hdar_admin_boost_cancel(p_key text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.boosts set cancelled = true where id = p_id;
end $$;

create or replace function public.hdar_admin_partners(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'kind', p.kind, 'description', p.description, 'lat', p.lat, 'lng', p.lng,
      'partner_until', p.partner_until, 'active', coalesce(p.partner_until > now(), false),
      'listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'starts_at', l.starts_at, 'ends_at', l.ends_at,
          'price_cents', l.price_cents, 'contact', l.contact, 'note', l.note, 'cancelled', l.cancelled) order by l.created_at desc)
        from hdar.partner_listings l where l.place_id = p.id), '[]'::jsonb)) order by p.partner_until desc nulls last)
    from hdar.places p where p.partner), '[]'::jsonb);
end $$;

-- Crée le lieu partenaire et sa première annonce.
create or replace function public.hdar_admin_partner_create(p_key text, p_kind text, p_name text, p_description text,
  p_lat double precision, p_lng double precision, p_ends timestamptz, p_price int, p_contact text, p_note text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare r uuid;
begin
  perform hdar.admin_check(p_key);
  if coalesce(btrim(p_name), '') = '' or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Nom et position requis';
  end if;
  insert into hdar.places (kind, name, description, lat, lng, source, status, partner, partner_until, reviewed_at)
    values (p_kind, left(btrim(p_name), 80), left(p_description, 600), p_lat, p_lng, 'admin', 'approved', true, p_ends, now())
    returning id into r;
  insert into hdar.partner_listings (place_id, ends_at, price_cents, contact, note)
    values (r, p_ends, greatest(coalesce(p_price, 0), 0), left(p_contact, 200), left(p_note, 300));
  perform hdar.sync_partner(r);
  return r;
end $$;

create or replace function public.hdar_admin_listing_add(p_key text, p_place uuid, p_starts timestamptz, p_ends timestamptz, p_price int, p_contact text, p_note text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  insert into hdar.partner_listings (place_id, starts_at, ends_at, price_cents, contact, note)
    values (p_place, coalesce(p_starts, now()), p_ends, greatest(coalesce(p_price, 0), 0), left(p_contact, 200), left(p_note, 300));
  perform hdar.sync_partner(p_place);
end $$;

create or replace function public.hdar_admin_listing_cancel(p_key text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare pl uuid;
begin
  perform hdar.admin_check(p_key);
  update hdar.partner_listings set cancelled = true where id = p_id returning place_id into pl;
  if pl is not null then perform hdar.sync_partner(pl); end if;
end $$;

revoke execute on function public.hdar_admin_boosts(text), public.hdar_admin_boost_create(text, text, timestamptz, timestamptz, int, text),
  public.hdar_admin_boost_cancel(text, uuid), public.hdar_admin_partners(text),
  public.hdar_admin_partner_create(text, text, text, text, double precision, double precision, timestamptz, int, text, text),
  public.hdar_admin_listing_add(text, uuid, timestamptz, timestamptz, int, text, text), public.hdar_admin_listing_cancel(text, uuid) from public, anon;
grant execute on function public.hdar_admin_boosts(text), public.hdar_admin_boost_create(text, text, timestamptz, timestamptz, int, text),
  public.hdar_admin_boost_cancel(text, uuid), public.hdar_admin_partners(text),
  public.hdar_admin_partner_create(text, text, text, text, double precision, double precision, timestamptz, int, text, text),
  public.hdar_admin_listing_add(text, uuid, timestamptz, timestamptz, int, text, text), public.hdar_admin_listing_cancel(text, uuid) to authenticated;
