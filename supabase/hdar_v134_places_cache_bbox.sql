-- hdar v134 — hdar_places lit toujours le cache monde (bbox filtré), plus de scan places_map_build
-- pour chaque zoom régional (~7 s / PGRST003 dès 3–5 clients). Cache ~2000 pins, cron */5.

create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  c jsonb;
  c_at timestamptz;
  filtered jsonb;
begin
  perform hdar.self_id();

  select data, at into c, c_at from hdar.places_map_cache where id;
  if c is null or c_at is null or c_at <= now() - interval '15 minutes' then
    perform hdar.places_map_refresh();
    select data, at into c, c_at from hdar.places_map_cache where id;
  end if;

  -- Vue monde : cache entier (comportement v126).
  if p_s <= -89 and p_n >= 89 and p_w <= -179 and p_e >= 179 then
    if c is not null then return c; end if;
    return hdar.places_map_build(p_s, p_w, p_n, p_e);
  end if;

  -- Vue régionale / locale : filtre JSON du cache (pas de scan hdar.places).
  if c is not null then
    select coalesce(jsonb_agg(e order by coalesce((e->>'pro_boost')::boolean, false) desc,
                                        coalesce((e->>'partner')::boolean, false) desc), '[]'::jsonb)
      into filtered
    from jsonb_array_elements(c) e
    where (e->>'lat')::double precision between p_s and p_n
      and (
        case when p_w <= p_e
          then (e->>'lng')::double precision between p_w and p_e
          else (e->>'lng')::double precision >= p_w or (e->>'lng')::double precision <= p_e
        end
      );
    return filtered;
  end if;

  -- Dernier recours si le cache est introuvable après refresh.
  return hdar.places_map_build(p_s, p_w, p_n, p_e);
end $$;

revoke all on function public.hdar_places(double precision, double precision, double precision, double precision) from public;
grant execute on function public.hdar_places(double precision, double precision, double precision, double precision) to authenticated, anon;
