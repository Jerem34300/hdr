-- v57 : ville approximative des profils (géolocalisation Netlify côté serveur, sans IP stockée),
-- visible uniquement dans l'admin. Effacée avec le profil (la ligne est supprimée).
alter table hdar.profiles add column if not exists city text, add column if not exists city_at timestamptz;

create or replace function public.hdar_set_city(p_city text) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if p_city is null or length(trim(p_city)) = 0 then return; end if;
  update hdar.profiles set city = left(trim(p_city), 80), city_at = now()
  where user_id = s and (city_at is null or city_at < now() - interval '1 hour');
end $$;
revoke all on function public.hdar_set_city(text) from public, anon;
grant execute on function public.hdar_set_city(text) to authenticated;

create or replace function public.hdar_admin_users(p_key text, p_q text default null, p_offset int default 0, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return (select jsonb_build_object('total', (select count(*) from hdar.profiles p where p.profile_at is not null
      and (p_q is null or p.pseudo ilike '%' || p_q || '%' or p.user_id like lower(p_q) || '%')),
    'rows', coalesce(jsonb_agg(r order by r ->> 'last' desc nulls last), '[]'::jsonb))
  from (
    select jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'iam', p.iam, 'has_photo', p.photo is not null,
      'photo_status', p.photo_status, 'created', p.created_at, 'last', greatest(p.updated_at, p.visible_until),
      'region', hdar.region_label(p.lat, p.lng), 'city', p.city, 'premium', hdar.is_premium(p.user_id),
      'boosts', (select count(*) from hdar.boosts b where b.user_id = p.user_id and not b.cancelled),
      'hearts', (select jsonb_build_object('balance', w.balance, 'received', w.received) from hdar.hearts_wallet w where w.user_id = p.user_id),
      'spent', (select coalesce(sum(amount_cents), 0) from hdar.payments y where y.user_id = p.user_id),
      'reports', (select count(*) from hdar.live_reports x where x.target_id = p.user_id),
      'banned', exists (select 1 from hdar.bans z where z.user_id = p.user_id and z.active)) r
    from hdar.profiles p
    where p.profile_at is not null and (p_q is null or p.pseudo ilike '%' || p_q || '%' or p.user_id like lower(p_q) || '%')
    order by greatest(p.updated_at, p.visible_until) desc nulls last
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
  ) q(r));
end $$;
revoke all on function public.hdar_admin_users(text, text, int, int) from public, anon;
grant execute on function public.hdar_admin_users(text, text, int, int) to authenticated;
