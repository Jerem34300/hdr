-- v111 : calque « Bus » (gares routières OSM amenity=bus_station) + import des arrêts depuis un extrait Geofabrik (scripts/import-transit-pbf.py).
-- Ajoute le type 'bus' partout où les arrêts sont reconnus (fonctions reprises de la prod au 30/10/2026, seul le type change).
-- Pas d'arrêt de bus individuel (des centaines de milliers) : seulement les gares routières, affichées au zoom 12+.

alter table hdar.places drop constraint if exists places_kind_check;
alter table hdar.places add constraint places_kind_check check (kind in
  ('cruising','beach','park','garden','viewpoint','square','promenade','aire','other','toilets','bar','club','sauna',
   'station','metro','bus','airport'));
drop index if exists hdar.places_transit_geo;
create index if not exists places_transit_geo on hdar.places (lat, lng) where kind in ('station','metro','bus','airport');

CREATE OR REPLACE FUNCTION public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.self_id();
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name, 'lat', x.lat, 'lng', x.lng,
      'partner', x.partner, 'pro_boost', x.pro_boost) order by x.pro_boost desc, x.partner desc)
    from (
      select p.id, p.kind, p.name, p.lat, p.lng, p.partner,
        coalesce(p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) as pro_boost
      from hdar.places p
      where p.status = 'approved' and p.kind not in ('toilets','station','metro','bus','airport')
        and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
        and (not p.partner or coalesce(p.partner_until > now(), false))
        and p.lat between p_s and p_n
        and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
      order by 7 desc, p.partner desc
      limit 5000) x), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.hdar_transit_stop(p_ref text, p_kind text, p_name text, p_lat double precision, p_lng double precision)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); v uuid; n text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_ref is null or (p_ref !~ '^osm:(node|way|relation)/[0-9]{1,12}$' and p_ref !~ '^tr:[A-Za-z0-9_:.\-]{1,160}$') then
    raise exception 'Arrêt inconnu';
  end if;
  select p.id into v from hdar.places p where p.source_ref = p_ref;
  if v is not null then return v; end if;
  if p_kind not in ('station','metro','bus','airport') then raise exception 'Type d''arrêt inconnu'; end if;
  if length(n) < 2 then raise exception 'Nom manquant'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position invalide';
  end if;
  -- Un arrêt OSM déjà en base à moins de 300 m avec ce type : on réutilise son chat.
  if p_ref like 'tr:%' then
    select p.id into v from hdar.places p where p.kind = p_kind and p.source_ref like 'osm:%'
      and p.lat between p_lat - 0.003 and p_lat + 0.003 and p.lng between p_lng - 0.004 and p_lng + 0.004
      and hdar.km(p_lat, p_lng, p.lat, p.lng) < 0.3 limit 1;
    if v is not null then return v; end if;
  end if;
  perform hdar.rate_check(s, 'transit_stop', 60, interval '1 hour');
  insert into hdar.places (kind, name, lat, lng, source, source_ref, status, ratings_on, comments_on)
  values (p_kind, n, p_lat, p_lng, case when p_ref like 'tr:%' then 'admin' else 'osm' end, p_ref, 'approved', false, false)
  on conflict (source_ref) do nothing returning places.id into v;
  if v is null then select p.id into v from hdar.places p where p.source_ref = p_ref; end if;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.hdar_trip_join(p_kind text, p_code text, p_day date, p_place uuid, p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); c text := hdar.trip_code(p_kind, p_code); d date := coalesce(p_day, current_date);
  net text := left(regexp_replace(btrim(coalesce(p_network, '')), '\s+', ' ', 'g'), 40);
  k text; nm text; v uuid; num text;
begin
  if s is null then raise exception 'Session requise'; end if;
  perform hdar.require_profile(s);
  if exists (select 1 from hdar.bans b where b.user_id = s and b.active) then raise exception 'Compte suspendu'; end if;
  if p_kind = 'train' then
    if c !~ '^([A-Z][A-Z ]{0,23} ?)?[0-9]{1,6}[A-Z]?$' then raise exception 'Numéro de train invalide (ex. TGV 6201)'; end if;
    num := substring(c from '([0-9]{1,6})[A-Z]?$');
    nm := c;
  elsif p_kind = 'flight' then
    if c !~ '^[A-Z0-9]{2}[A-Z]?[0-9]{1,4}[A-Z]?$' then raise exception 'Numéro de vol invalide (ex. AF1234)'; end if;
    num := hdar.trip_norm(c); nm := 'Vol ' || c;
  elsif p_kind in ('metro', 'bus') then
    if length(c) < 1 then raise exception 'Choisis ta ligne'; end if;
    num := hdar.trip_norm(c);
    if num = '' then raise exception 'Choisis ta ligne'; end if;
    nm := btrim(left(initcap(lower(c)) || case when net <> '' then ' · ' || net else '' end, 60));
  else raise exception 'Type de trajet inconnu'; end if;
  if d not between current_date - 1 and current_date + 1 then raise exception 'Date : hier, aujourd''hui ou demain'; end if;
  k := p_kind || '|' || case when p_kind in ('metro', 'bus') then hdar.trip_norm(net) || '|' else '' end || num || '|' || d::text;
  perform hdar.rate_check(s, 'trip_join', 20, interval '1 hour');
  select x.id into v from hdar.salons x where x.trip_key = k and not x.removed;
  if v is null then
    insert into hdar.salons (name, description, trip_kind, trip_key, expires_at, creator_id)
    values (nm, to_char(d, 'DD/MM'), p_kind, k, least(((d + 1)::timestamp + interval '6 hours') at time zone 'UTC', now() + interval '36 hours'), null)
    on conflict do nothing returning salons.id into v;
    if v is null then select x.id into v from hdar.salons x where x.trip_key = k and not x.removed; end if;
  end if;
  insert into hdar.trip_members (salon_id, user_id) values (v, s)
    on conflict (salon_id, user_id) do update set joined_at = now();
  if p_place is not null and exists (select 1 from hdar.places p where p.id = p_place and p.kind in ('station','metro','bus','airport')) then
    insert into hdar.trip_stops (salon_id, place_id) values (v, p_place) on conflict do nothing;
  end if;
  return hdar.trip_row(v, s);
end $function$
;

CREATE OR REPLACE FUNCTION public.hdar_transit(p_s double precision, p_w double precision, p_n double precision, p_e double precision, p_zoom integer)
 RETURNS TABLE(ref text, kind text, name text, lat double precision, lng double precision, iata text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
    select p.source_ref, p.kind, p.name, p.lat, p.lng, p.transit_code from hdar.places p
    where p.kind in ('station','metro','bus','airport') and p.status = 'approved' and p.source_ref like 'osm:%'
      and (p_zoom >= 12 or p.kind = 'airport')
      and p.lat between p_s and p_n
      and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
    limit 1500;
end $function$
;
