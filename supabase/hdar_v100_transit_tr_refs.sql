-- v100 — Arrêts issus du secours Transitous (« tr:<stopId> ») : chat de l'arrêt possible même sans OSM.
create or replace function public.hdar_transit_stop(p_ref text, p_kind text, p_name text, p_lat double precision, p_lng double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); v uuid; n text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_ref is null or (p_ref !~ '^osm:(node|way|relation)/[0-9]{1,12}$' and p_ref !~ '^tr:[A-Za-z0-9_:.\-]{1,160}$') then
    raise exception 'Arrêt inconnu';
  end if;
  select p.id into v from hdar.places p where p.source_ref = p_ref;
  if v is not null then return v; end if;
  if p_kind not in ('station','metro','airport') then raise exception 'Type d''arrêt inconnu'; end if;
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
end $$;
