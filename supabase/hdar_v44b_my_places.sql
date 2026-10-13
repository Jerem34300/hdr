create or replace function public.hdar_my_places() returns jsonb
language plpgsql stable security definer set search_path to '' as $function$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'name', p.name, 'description', p.description, 'lat', p.lat, 'lng', p.lng,
      'website', p.website, 'contact', p.contact, 'photos', to_jsonb(p.photos),
      'ratings_on', p.ratings_on, 'comments_on', p.comments_on, 'comments_public', p.comments_public,
      'partner_until', p.partner_until, 'pro_boost_until', p.pro_boost_until, 'active', coalesce(p.partner_until > now(), false) and p.status = 'approved',
      'status', p.status, 'sub_status', p.sub_status) order by p.created_at desc)
    from hdar.places p where p.owner_id = s), '[]'::jsonb);
end $function$;
