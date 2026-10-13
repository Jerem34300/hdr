-- v51c : la règle des 2 km du Live est toujours appliquée côté serveur
alter table hdar.live_queue add column if not exists lat double precision, add column if not exists lng double precision;
drop function if exists public.hdar_live_next(text[], integer, integer, text, uuid);
drop function if exists public.hdar_live_count();
CREATE OR REPLACE FUNCTION public.hdar_live_next(p_iam text[] DEFAULT NULL::text[], p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_back text DEFAULT NULL::text, p_pro uuid DEFAULT NULL::uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); me hdar.profiles; prem boolean; pick text; filt boolean; pro boolean := p_pro is not null; mla float8; mlo float8;
begin
  if pro then
    perform hdar.require_profile(s);
    perform hdar.pro_place_check(s, p_pro);
    if not exists (select 1 from hdar.live_terms where user_id = s and version >= 1) then raise exception 'live_terms: accepte les règles du Live'; end if;
  else
    perform hdar.live_require(s);
  end if;
  perform hdar.rate_check(s, 'live_next', 60, interval '1 minute');
  prem := hdar.is_premium(s);
  filt := not pro and (coalesce(cardinality(p_iam), 0) > 0 or p_min_age is not null or p_max_age is not null);
  if filt and not prem then perform hdar.require_premium(s); end if;
  perform public.hdar_live_leave(true);
  -- v51c : position Live arrondie (~500 m), jamais exacte ; obligatoire entre particuliers (règle des 2 km)
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    mla := round(p_lat * 200) / 200; mlo := round(p_lng * 200) / 200;
  end if;
  if mla is null then select round(lat * 200) / 200, round(lng * 200) / 200 into mla, mlo from hdar.profiles where user_id = s; end if;
  if not pro and p_back is null and mla is null then raise exception 'live_nopos: active ta position pour entrer dans le Live'; end if;
  insert into hdar.live_queue (user_id, pro_place, lat, lng) values (s, p_pro, mla, mlo)
    on conflict (user_id) do update set seen_at = now(), pro_place = p_pro, lat = coalesce(excluded.lat, hdar.live_queue.lat), lng = coalesce(excluded.lng, hdar.live_queue.lng);
  delete from hdar.live_queue where seen_at < now() - interval '20 seconds';
  perform 1 from hdar.live_queue where user_id = s for update;
  select * into me from hdar.profiles where user_id = s;
  me.lat := mla; me.lng := mlo;

  if p_back is not null then
    select q.user_id into pick from hdar.live_queue q
      where q.user_id = lower(p_back) and q.peer_id is null and q.user_id <> s and not hdar.is_blocked(s, q.user_id)
        -- v51c : ciblage explicite (« Rejoindre son live » / « Revenir ») : pas de règle de distance
      for update skip locked;
    if pick is null then return jsonb_build_object('back_gone', true); end if;
  else
    select q.user_id into pick from hdar.live_queue q join hdar.profiles p on p.user_id = q.user_id
      where q.user_id <> s and q.peer_id is null and q.seen_at > now() - interval '12 seconds'
        and (p.photo_status = 'approved' or q.pro_place is not null)
        and not (pro and q.pro_place is not null) -- deux pros ne se croisent pas
        and not hdar.is_blocked(s, q.user_id)
        and not exists (select 1 from hdar.live_history h where h.user_id = s and h.peer_id = q.user_id and h.at > now() - interval '30 seconds')
        and (not filt or ((coalesce(cardinality(p_iam), 0) = 0 or p.iam = any(p_iam))
             and (p_min_age is null or p.age >= p_min_age) and (p_max_age is null or p.age <= p_max_age)))
        -- jamais à moins de ~2 km entre particuliers ; le Live Pro n'a pas de limite de distance
        and (pro or q.pro_place is not null or (q.lat is not null and hdar.live_km(me.lat, me.lng, q.lat, q.lng) > 2))
      order by
        -- Boost Pro : les lieux boostés passent en premier
        case when q.pro_place is not null and exists (select 1 from hdar.places bp where bp.id = q.pro_place and bp.pro_boost_until > now()) then 0 else 1 end,
        case when pro or q.pro_place is not null then 0
             when me.lat is null or q.lat is null then 2
             when hdar.live_km(me.lat, me.lng, q.lat, q.lng) <= 150 then 0
             when hdar.live_km(me.lat, me.lng, q.lat, q.lng) <= 600 then 1 else 2 end,
        case when prem and position(coalesce(me.iam, '?') in coalesce(p.seeking, '')) > 0
                       and position(coalesce(p.iam, '?') in coalesce(me.seeking, '')) > 0 then 0 else 1 end,
        random()
      limit 1 for update of q skip locked;
    -- v50 : personne d'autre de compatible -> on ignore filtres et délai de re-croisement
    if pick is null then
    select q.user_id into pick from hdar.live_queue q join hdar.profiles p on p.user_id = q.user_id
      where q.user_id <> s and q.peer_id is null and q.seen_at > now() - interval '12 seconds'
        and (p.photo_status = 'approved' or q.pro_place is not null)
        and not (pro and q.pro_place is not null) -- deux pros ne se croisent pas
        and not hdar.is_blocked(s, q.user_id)
        
        and (true or ((coalesce(cardinality(p_iam), 0) = 0 or p.iam = any(p_iam))
             and (p_min_age is null or p.age >= p_min_age) and (p_max_age is null or p.age <= p_max_age)))
        -- jamais à moins de ~2 km entre particuliers ; le Live Pro n'a pas de limite de distance
        and (pro or q.pro_place is not null or (q.lat is not null and hdar.live_km(me.lat, me.lng, q.lat, q.lng) > 2))
      order by
        -- Boost Pro : les lieux boostés passent en premier
        case when q.pro_place is not null and exists (select 1 from hdar.places bp where bp.id = q.pro_place and bp.pro_boost_until > now()) then 0 else 1 end,
        case when pro or q.pro_place is not null then 0
             when me.lat is null or q.lat is null then 2
             when hdar.live_km(me.lat, me.lng, q.lat, q.lng) <= 150 then 0
             when hdar.live_km(me.lat, me.lng, q.lat, q.lng) <= 600 then 1 else 2 end,
        case when prem and position(coalesce(me.iam, '?') in coalesce(p.seeking, '')) > 0
                       and position(coalesce(p.iam, '?') in coalesce(me.seeking, '')) > 0 then 0 else 1 end,
        random()
      limit 1 for update of q skip locked;
    end if;
    if pick is null then return jsonb_build_object('waiting', true); end if;
  end if;

  update hdar.live_queue set peer_id = pick, role = 'offer', matched_at = now(), seen_at = now() where user_id = s;
  update hdar.live_queue set peer_id = s, role = 'answer', matched_at = now() where user_id = pick;
  insert into hdar.live_history values (s, pick, now()), (pick, s, now())
    on conflict (user_id, peer_id) do update set at = now();
  return hdar.live_card(pick, 'offer');
end $function$
;
CREATE OR REPLACE FUNCTION public.hdar_live_count(p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare s text; la float8; lo float8;
begin
  begin s := hdar.self_id(); exception when others then s := null; end;
  delete from hdar.live_queue where seen_at < now() - interval '2 minutes';
  if p_lat between -90 and 90 and p_lng between -180 and 180 then la := p_lat; lo := p_lng;
  elsif s is not null then select lat, lng into la, lo from hdar.live_queue where user_id = s;
    if la is null then select lat, lng into la, lo from hdar.profiles where user_id = s; end if;
  end if;
  -- v51c : seulement les personnes qu'on peut réellement croiser (> 2 km, ou un lieu Live Pro)
  return (select count(*)::int from hdar.live_queue q where q.seen_at > now() - interval '20 seconds' and q.user_id is distinct from s
    and (q.pro_place is not null or (la is not null and q.lat is not null and hdar.live_km(la, lo, q.lat, q.lng) > 2)));
end $function$;
revoke execute on function public.hdar_live_next(text[], integer, integer, text, uuid, double precision, double precision) from public, anon;
grant execute on function public.hdar_live_next(text[], integer, integer, text, uuid, double precision, double precision) to authenticated;
grant execute on function public.hdar_live_count(double precision, double precision) to anon, authenticated;
