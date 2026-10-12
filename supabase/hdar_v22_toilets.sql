-- Public toilets (OSM amenity=toilets, public access) as a permanent-place kind, loaded by viewport.
alter table hdar.places drop constraint if exists places_kind_check;
alter table hdar.places add constraint places_kind_check
  check (kind in ('cruising','beach','park','aire','other','toilets','bar','club','sauna'));
create index if not exists places_toilets_geo on hdar.places (lat, lng) where kind = 'toilets' and status = 'approved';

-- Global preload excludes toilets (too many); they come from the bbox call below.
create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns table (id uuid, kind text, name text, lat double precision, lng double precision, partner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.self_id();
  return query
    select p.id, p.kind, p.name, p.lat, p.lng, p.partner from hdar.places p
    where p.status = 'approved' and p.kind <> 'toilets'
      and (not p.partner or coalesce(p.partner_until > now(), false))
      and p.lat between p_s and p_n
      and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
    limit 3000;
end $$;

create or replace function public.hdar_toilets(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns table (id uuid, lat double precision, lng double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.self_id();
  if p_n - p_s > 0.6 or abs(p_e - p_w) > 0.9 then return; end if; -- zoomed out: nothing (zoom >= 12 only)
  return query
    select p.id, p.lat, p.lng from hdar.places p
    where p.kind = 'toilets' and p.status = 'approved'
      and p.lat between p_s and p_n and p.lng between p_w and p_e
    limit 1500;
end $$;
revoke execute on function public.hdar_toilets(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.hdar_toilets(double precision, double precision, double precision, double precision) to authenticated;
