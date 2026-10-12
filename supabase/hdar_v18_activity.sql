-- Lightweight activity summary for in-app badges (no message text).
create or replace function public.hdar_activity(p_lat double precision, p_lng double precision, p_area_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id(); area int := 0; spots jsonb;
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_lat is not null and p_lng is not null then
    select count(*) into area from (
      select 1 from hdar.area_messages a
      where a.created_at > greatest(coalesce(p_area_since, now() - interval '24 hours'), now() - interval '24 hours')
        and not a.removed and a.from_id <> s
        and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045
        and not hdar.is_blocked(s, a.from_id)
      limit 99) x;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', sp.id,
      'created', sp.created_at,
      'mine', sp.creator_id = s,
      'joined', sp.creator_id = s or exists (select 1 from hdar.spot_messages m where m.spot_id = sp.id and m.from_id = s),
      'last', (select max(m.created_at) from hdar.spot_messages m where m.spot_id = sp.id and m.from_id <> s and not m.removed
               and not hdar.is_blocked(s, m.from_id)),
      'near', p_lat is not null and abs(sp.lat - p_lat) < 0.018 and abs(sp.lng - p_lng) < 0.026
    )), '[]'::jsonb) into spots
  from hdar.spots sp
  where sp.closes_at > now()
    and (sp.creator_id = s or (p_lat is not null and abs(sp.lat - p_lat) < 1 and abs(sp.lng - p_lng) < 1.5
         and not hdar.is_blocked(s, sp.creator_id)));
  return jsonb_build_object('area', area, 'spots', spots);
end $$;
revoke execute on function public.hdar_activity(double precision, double precision, timestamptz) from public, anon;
grant execute on function public.hdar_activity(double precision, double precision, timestamptz) to authenticated;
