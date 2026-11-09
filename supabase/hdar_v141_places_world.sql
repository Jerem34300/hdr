-- v141 : carte des lieux (monde) servie par le CDN du site (/api/pub/places) au lieu d'une lecture par téléphone.
-- Lecture seule du cache déjà calculé par la base (places_map_refresh) ; NULL si le cache n'est pas prêt
-- (le client repasse alors par hdar_places habituel). Mêmes données que hdar_places sur le monde entier.
-- À appliquer avant la mise en ligne (sans elle, le client repasse simplement par hdar_places).

create or replace function public.hdar_places_world() returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '2000ms' as $$
  select c.data from hdar.places_map_cache c where c.id;
$$;
revoke all on function public.hdar_places_world() from public;
grant execute on function public.hdar_places_world() to anon, authenticated;
