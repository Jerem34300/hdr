-- v140 : comptes d'annonces des pages publiques /petites-annonces en UN relevé. Chaque page de commune
-- demandait deux fois hdar_ads_count au serveur ; un robot qui parcourt les milliers de communes a fait
-- 68 700 appels le 8 nov. (plus de 10 fois tout le trafic de l'appli), autant de places prises dans le
-- pool de connexions. hdar_ads_counts renvoie tous les comptes (par commune, par région, total) ;
-- le serveur du site le garde 10 min en mémoire. Aucun contenu d'annonce, seulement des nombres.
-- Le battement commun (v138) renvoie aussi les alertes d'annonces non lues (relevées avant chaque
-- minute à part par la page Autour).
-- Applied as migration hdar_v140_ads_counts.

create or replace function public.hdar_ads_counts() returns jsonb
language sql stable security definer set search_path = '' as $$
  with live as (select a.region, a.city_slug from hdar.ads a where a.expires_at > now() and not a.hidden)
  select jsonb_build_object(
    'total', (select count(*) from live),
    'cities', coalesce((select jsonb_object_agg(city_slug, n) from (select city_slug, count(*) n from live where city_slug is not null group by 1) c), '{}'::jsonb),
    'regions', coalesce((select jsonb_object_agg(region, n) from (select region, count(*) n from live where region is not null group by 1) r), '{}'::jsonb));
$$;
revoke all on function public.hdar_ads_counts() from public;
grant execute on function public.hdar_ads_counts() to anon, authenticated;

create or replace function public.hdar_tick(
  p_lat double precision, p_lng double precision, p_area_since timestamptz,
  p_pos_lat double precision, p_pos_lng double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := '{}'::jsonb; v jsonb;
begin
  perform hdar.self_id();
  begin r := r || jsonb_build_object('activity', public.hdar_activity(p_lat, p_lng, p_area_since));
  exception when others then null; end;
  begin r := r || jsonb_build_object('live_count', public.hdar_live_count(p_pos_lat, p_pos_lng));
  exception when others then null; end;
  begin r := r || jsonb_build_object('live_ids', to_jsonb(public.hdar_live_ids()));
  exception when others then null; end;
  begin
    select coalesce(jsonb_agg(b.id), '[]'::jsonb) into v from public.hdar_boosted() b;
    r := r || jsonb_build_object('boosted', v);
  exception when others then null; end;
  begin
    select x into v from jsonb_array_elements(public.hdar_my_boosts()) x where (x ->> 'active')::boolean limit 1;
    r := r || jsonb_build_object('my_boost', coalesce(v, 'null'::jsonb));
  exception when others then null; end;
  begin r := r || jsonb_build_object('rooms_online', public.hdar_rooms_online(p_pos_lat, p_pos_lng));
  exception when others then null; end;
  begin r := r || jsonb_build_object('notices', public.hdar_my_notices());
  exception when others then null; end;
  begin r := r || jsonb_build_object('ad_hits', public.hdar_ad_alert_hits(false));
  exception when others then null; end;
  return r;
end $$;
