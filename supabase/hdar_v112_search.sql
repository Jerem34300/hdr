-- v112 : recherche « GPS » dans nos lieux (gares, métros, bus, aéroports, lieux hdar approuvés).
-- Lecture seule, discret : pas de personnes, uniquement des lieux publics approuvés.
create or replace function public.hdar_search(p_q text, p_lat double precision, p_lng double precision)
returns table(id uuid, ref text, kind text, name text, lat double precision, lng double precision, code text)
language plpgsql stable security definer set search_path = '' as $$
declare q text := btrim(coalesce(p_q, ''));
begin
  if char_length(q) < 2 or char_length(q) > 60 then return; end if;
  q := replace(replace(replace(q, '\', ''), '%', ''), '_', ' ');
  return query
    select p.id, p.source_ref, p.kind, p.name, p.lat, p.lng, p.transit_code from hdar.places p
    where p.status = 'approved' and p.kind <> 'toilets'
      and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
      and (p.name ilike '%' || q || '%' or (p.transit_code is not null and upper(p.transit_code) = upper(q)))
    order by (upper(coalesce(p.transit_code, '')) = upper(q)) desc,
      (p.name ilike q || '%') desc,
      (p.kind in ('airport','station')) desc,
      ((p.lat - coalesce(p_lat, 46.6)) ^ 2 + ((p.lng - coalesce(p_lng, 2.4)) * 0.7) ^ 2)
    limit 8;
end $$;
revoke execute on function public.hdar_search(text, double precision, double precision) from public;
grant execute on function public.hdar_search(text, double precision, double precision) to anon, authenticated;
