-- hdar v71 — Teaser 18+ : ajoute has_photos (booléen, jamais les photos). Additif.
-- Additif. Pas de texte, photo, pseudo ni tag. Titres explicites exclus (liste simple, doublée côté client).
create or replace function public.hdar_ads_teaser(p_region text default null) returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'city', city, 'boosted', boosted, 'has_photos', has_photos)
    order by boosted desc, created_at desc), '[]'::jsonb) from (
    select a.id, a.title, a.city, a.created_at, coalesce(a.boost_until > now(), false) boosted, coalesce(cardinality(a.photos), 0) > 0 has_photos
    from hdar.ads a
    where a.expires_at > now() and not a.hidden
      and (nullif(p_region, '') is null or a.region = p_region or (a.boost_until > now() and a.boost_scope in ('france', 'monde')))
      and lower(a.title) !~ '(sexe|sexy|sex\M|baise|baiser|bais|plan cul|\mpc\M|nu\M|nue|nus\M|bite|queue|chatte|cul\M|suce|sucer|pipe|sodo|anal|porn|cam ?sex|hard|soumis|ma[iî]tre|esclave|fist|uro|scato|gang|partouze|orgie|trio|plan [aà] 3|bdsm|fetish|f[eé]tich|kink|exhib|chaud|chaude|coquin|cochon|salope|branl|jouir|[eé]jac|nude|xxx|sm\M)'
    order by boosted desc, a.created_at desc limit 20) x
$$;
revoke all on function public.hdar_ads_teaser(text) from public;
grant execute on function public.hdar_ads_teaser(text) to anon, authenticated;
