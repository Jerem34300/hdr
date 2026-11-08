-- v138 : un seul « battement » pour les compteurs de fond. L'appli faisait sept relevés séparés,
-- chacun avec son minuteur (activité du quartier / spots / lieux, compteur du Live, personnes en
-- Live, profils boostés, mon boost actif, présence dans les salons, notifications) : sept requêtes et
-- sept connexions du pool PostgREST (10 sur Micro) toutes les 45 s à 5 min. hdar_tick les renvoie
-- en une fois ; chaque partie est isolée (une erreur n'empêche pas les autres de répondre).
-- À appliquer AVANT de mettre en ligne l'appli correspondante.
-- Applied as migration hdar_v138_tick.

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
  -- Les notifications sont marquées lues à la lecture : l'appli les garde jusqu'à les afficher.
  begin r := r || jsonb_build_object('notices', public.hdar_my_notices());
  exception when others then null; end;
  return r;
end $$;
revoke all on function public.hdar_tick(double precision, double precision, timestamptz, double precision, double precision) from public, anon;
grant execute on function public.hdar_tick(double precision, double precision, timestamptz, double precision, double precision) to authenticated;
