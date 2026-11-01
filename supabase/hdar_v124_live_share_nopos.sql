-- v124 : partager son Live sans être visible ni épinglé sur la carte.
-- Avant : exigeait une position de profil (p.lat) ET d'être dans la file 1:1 (pas en diffusion ni en spectateur).
-- Désormais : dans le Live = file 1:1 OU membre actif d'un salon à plusieurs ; centre = position du profil, sinon
-- épingle, sinon position du Live envoyée par l'appli (arrondie ~1 km + décalage, jamais exacte).
create or replace function public.hdar_live_share_create(p_lat double precision default null, p_lng double precision default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.profiles; c text; ref jsonb; la double precision; lo double precision;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'live_share', 20, interval '1 hour');
  if not exists (select 1 from hdar.live_queue where user_id = s and seen_at > now() - interval '2 minutes')
     and not exists (select 1 from hdar.live_room_members where user_id = s and left_at is null) then
    raise exception 'live_off: entre dans le Live pour partager ton lien';
  end if;
  select * into p from hdar.profiles where user_id = s;
  la := p.lat; lo := p.lng;
  if la is null then select pin_lat, pin_lng into la, lo from hdar.pos_meta where user_id = s and chosen; end if;
  if la is null and p_lat between -90 and 90 and p_lng between -180 and 180 then la := p_lat; lo := p_lng; end if;
  if la is null then raise exception 'live_nopos: position inconnue'; end if;
  ref := public.hdar_my_ref();
  select code into c from hdar.live_shares where user_id = s and created_at > now() - interval '12 hours' order by created_at desc limit 1;
  if c is null then
    loop
      c := lower(substr(md5(gen_random_uuid()::text), 1, 8));
      begin
        insert into hdar.live_shares (code, user_id, lat, lng)
        values (c, s, round(la::numeric, 2)::float8 + hdar.jit(c || 'a'), round(lo::numeric, 2)::float8 + hdar.jit(c || 'o'));
        exit;
      exception when unique_violation then end;
    end loop;
  end if;
  return jsonb_build_object('code', c, 'ref', ref->>'code');
end $$;
drop function if exists public.hdar_live_share_create();
revoke all on function public.hdar_live_share_create(double precision, double precision) from public, anon;
grant execute on function public.hdar_live_share_create(double precision, double precision) to authenticated;
