-- Permanent places layer. Free, non-commercial spots only (cruising areas, naturist beaches, parks, aires).
-- Commercial venues (bar/club/sauna) are reserved for future paid "partenaire" listings: admin-only, hidden for now.
create table if not exists hdar.places (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cruising','beach','park','aire','other','bar','club','sauna')),
  name text not null,
  description text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  source text not null check (source in ('osm','user','admin')),
  source_ref text unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  partner boolean not null default false,
  partner_until timestamptz,
  submitted_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint commercial_is_partner check (kind not in ('bar','club','sauna') or partner)
);
create index if not exists places_geo on hdar.places (lat, lng) where status = 'approved';
alter table hdar.places enable row level security;
revoke all on hdar.places from public, anon, authenticated;

-- Visible = approved free spots; partners only while a paid listing is active (none today).

create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns table (id uuid, kind text, name text, lat double precision, lng double precision, partner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.self_id();
  return query
    select p.id, p.kind, p.name, p.lat, p.lng, p.partner from hdar.places p
    where p.status = 'approved' and (not p.partner or coalesce(p.partner_until > now(), false))
      and p.lat between p_s and p_n
      and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
    limit 3000;
end $$;

create or replace function public.hdar_place_get(p_id uuid)
returns table (id uuid, kind text, name text, description text, lat double precision, lng double precision, source text, source_ref text, partner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.self_id();
  return query select p.id, p.kind, p.name, p.description, p.lat, p.lng, p.source, p.source_ref, p.partner
    from hdar.places p where p.id = p_id
      and p.status = 'approved' and (not p.partner or coalesce(p.partner_until > now(), false));
end $$;

create or replace function public.hdar_place_propose(p_kind text, p_name text, p_description text, p_lat double precision, p_lng double precision)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); n text := left(btrim(coalesce(p_name, '')), 80);
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'place', 3, interval '1 day');
  if p_kind not in ('cruising','beach','park','aire','other') then raise exception 'Catégorie non autorisée'; end if;
  if length(n) < 3 then raise exception 'Donne un nom au lieu'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Position invalide'; end if;
  insert into hdar.places (kind, name, description, lat, lng, source, status, submitted_by)
  values (p_kind, n, left(btrim(coalesce(p_description, '')), 600), p_lat, p_lng, 'user', 'pending', s);
end $$;

create or replace function public.hdar_admin_places(p_key text)
returns table (id uuid, kind text, name text, description text, lat double precision, lng double precision, submitted_by text, at text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return query select p.id, p.kind, p.name, p.description, p.lat, p.lng, p.submitted_by, p.created_at::text
    from hdar.places p where p.status = 'pending' order by p.created_at limit 200;
end $$;

create or replace function public.hdar_admin_place_review(p_key text, p_id uuid, p_ok boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.places set status = case when p_ok then 'approved' else 'rejected' end, reviewed_at = now()
    where id = p_id and status = 'pending';
end $$;

-- Prepared for paid partner listings (not exposed in the UI yet).
create or replace function public.hdar_admin_place_create(p_key text, p_kind text, p_name text, p_description text,
  p_lat double precision, p_lng double precision, p_partner boolean, p_partner_until timestamptz)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare i uuid;
begin
  perform hdar.admin_check(p_key);
  insert into hdar.places (kind, name, description, lat, lng, source, status, partner, partner_until)
  values (p_kind, left(p_name, 80), left(coalesce(p_description, ''), 1000), p_lat, p_lng, 'admin', 'approved',
          coalesce(p_partner, false), p_partner_until)
  returning id into i;
  return i;
end $$;

revoke execute on function public.hdar_places(double precision, double precision, double precision, double precision),
  public.hdar_place_get(uuid), public.hdar_place_propose(text, text, text, double precision, double precision),
  public.hdar_admin_places(text), public.hdar_admin_place_review(text, uuid, boolean),
  public.hdar_admin_place_create(text, text, text, text, double precision, double precision, boolean, timestamptz) from public, anon;
grant execute on function public.hdar_places(double precision, double precision, double precision, double precision),
  public.hdar_place_get(uuid), public.hdar_place_propose(text, text, text, double precision, double precision),
  public.hdar_admin_places(text), public.hdar_admin_place_review(text, uuid, boolean),
  public.hdar_admin_place_create(text, text, text, text, double precision, double precision, boolean, timestamptz) to authenticated;
