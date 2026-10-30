-- v108 (NON appliquée) : la carte ne recevait que 1 000 lieux sur 2 066.
-- PostgREST plafonne les fonctions qui renvoient une table à 1 000 lignes (max-rows) : les plus récents
-- (IDM Sauna, L'Impact Bar…) tombaient hors de la liste. On renvoie un seul tableau jsonb (non plafonné),
-- partenaires en tête, même forme que l'appli attend ({id, kind, name, lat, lng, partner, pro_boost}).
drop function if exists public.hdar_places(double precision, double precision, double precision, double precision);
create function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.self_id();
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name, 'lat', x.lat, 'lng', x.lng,
      'partner', x.partner, 'pro_boost', x.pro_boost) order by x.pro_boost desc, x.partner desc)
    from (
      select p.id, p.kind, p.name, p.lat, p.lng, p.partner,
        coalesce(p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) as pro_boost
      from hdar.places p
      where p.status = 'approved' and p.kind not in ('toilets','station','metro','airport')
        and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
        and (not p.partner or coalesce(p.partner_until > now(), false))
        and p.lat between p_s and p_n
        and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
      order by 7 desc, p.partner desc
      limit 5000) x), '[]'::jsonb);
end $$;
grant execute on function public.hdar_places(double precision, double precision, double precision, double precision) to anon, authenticated;
