-- v66 : activité des dernières 24 h, pour ne jamais montrer une carte vide.
-- Agrégat anonyme lu depuis hdar.activity_hourly (déjà agrégé par carreau ~1 km / heure),
-- regroupé en carreaux grossiers de 0,05° (~5 km). Aucun identifiant, aucun pseudo.
-- Lisible par anon (aperçu avant l'écran 18+) et authenticated.
create or replace function public.hdar_recent_activity(p_lat double precision default null, p_lng double precision default null)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with c as (
    select round(a.lat / 0.05) * 0.05 as lat, round(a.lng / 0.05) * 0.05 as lng,
           max(a.peak) as n, max(a.hour) as last
    from hdar.activity_hourly a
    where a.hour > now() - interval '24 hours' and a.peak > 0
    group by 1, 2
  ), d as (
    select c.*, case when p_lat is null or p_lng is null then null
      else 111.32 * sqrt(power(c.lat - p_lat, 2) + power((c.lng - p_lng) * cos(radians(p_lat)), 2)) end as km
    from c
  )
  select jsonb_build_object(
    'total', coalesce((select sum(n) from d), 0),
    'near', coalesce((select sum(n) from d where km is null or km <= 60), 0),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('lat', round(lat::numeric, 2), 'lng', round(lng::numeric, 2), 'n', n,
                 'h', greatest(0, floor(extract(epoch from now() - last) / 3600))::int) order by km nulls last)
               from (select * from d order by km nulls last limit 60) x), '[]'::jsonb),
    'nearest', (select jsonb_build_object('lat', round(lat::numeric, 2), 'lng', round(lng::numeric, 2), 'km', round(km::numeric)) from d where km is not null order by km limit 1)
  );
$$;
revoke all on function public.hdar_recent_activity(double precision, double precision) from public;
grant execute on function public.hdar_recent_activity(double precision, double precision) to anon, authenticated;
