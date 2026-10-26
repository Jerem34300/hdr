-- v88 : colonne « Actif » de l'admin. Avant : greatest(updated_at, visible_until), or visible_until = fin de
-- visibilité sur la carte (≈ dernière activité + 3 h), donc dans le futur. Maintenant : dernière activité réelle, jamais après now().
CREATE OR REPLACE FUNCTION public.hdar_admin_users(p_key text, p_q text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.admin_check(p_key);
  return (select jsonb_build_object('total', (select count(*) from hdar.profiles p where p.profile_at is not null
      and (p_q is null or p.pseudo ilike '%' || p_q || '%' or p.user_id like lower(p_q) || '%')),
    'rows', coalesce(jsonb_agg(r order by r ->> 'last' desc nulls last), '[]'::jsonb))
  from (
    select jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'iam', p.iam, 'has_photo', p.photo is not null,
      'photo_status', p.photo_status, 'created', p.created_at, 'last', least(p.updated_at, now()),
      'region', hdar.region_label(p.lat, p.lng), 'city', p.city, 'premium', hdar.is_premium(p.user_id),
      'boosts', (select count(*) from hdar.boosts b where b.user_id = p.user_id and not b.cancelled),
      'hearts', (select jsonb_build_object('balance', w.balance, 'received', w.received) from hdar.hearts_wallet w where w.user_id = p.user_id),
      'spent', (select coalesce(sum(amount_cents), 0) from hdar.payments y where y.user_id = p.user_id),
      'reports', (select count(*) from hdar.live_reports x where x.target_id = p.user_id),
      'banned', exists (select 1 from hdar.bans z where z.user_id = p.user_id and z.active)) r
    from hdar.profiles p
    where p.profile_at is not null and (p_q is null or p.pseudo ilike '%' || p_q || '%' or p.user_id like lower(p_q) || '%')
    order by p.updated_at desc nulls last
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
  ) q(r));
end $function$;
