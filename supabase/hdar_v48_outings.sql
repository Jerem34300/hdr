-- v48 : repositionnement « pour tout le monde » : lieux de sortie OSM (parcs, jardins, belvédères, places, promenades), chargés par zone visible
alter table hdar.places drop constraint if exists places_kind_check;
alter table hdar.places add constraint places_kind_check
  check (kind in ('cruising','beach','park','garden','viewpoint','square','promenade','aire','other','toilets','bar','club','sauna'));
alter table hdar.places drop constraint if exists places_source_check;
alter table hdar.places add constraint places_source_check check (source in ('osm','user','admin','ambassador'));
create index if not exists places_outings_geo on hdar.places (lat, lng) where source = 'osm' and kind in ('park','garden','viewpoint','square','promenade') and status = 'approved';
create index if not exists places_source_ref on hdar.places (source, source_ref) where source_ref is not null;

create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
 returns table(id uuid, kind text, name text, lat double precision, lng double precision, partner boolean, pro_boost boolean)
 language plpgsql stable security definer set search_path to '' as $function$
begin
  perform hdar.self_id();
  return query
    select p.id, p.kind, p.name, p.lat, p.lng, p.partner,
      coalesce(p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) from hdar.places p
    where p.status = 'approved' and p.kind <> 'toilets'
      and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
      and (not p.partner or coalesce(p.partner_until > now(), false))
      and p.lat between p_s and p_n
      and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
    order by 7 desc
    limit 3000;
end $function$;

create or replace function public.hdar_outings(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns table (id uuid, kind text, name text, lat double precision, lng double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.self_id();
  if p_n - p_s > 0.6 or abs(p_e - p_w) > 0.9 then return; end if;
  return query
    select p.id, p.kind, p.name, p.lat, p.lng from hdar.places p
    where p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade') and p.status = 'approved'
      and p.lat between p_s and p_n and p.lng between p_w and p_e
    limit 1500;
end $$;
revoke execute on function public.hdar_outings(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.hdar_outings(double precision, double precision, double precision, double precision) to authenticated;
