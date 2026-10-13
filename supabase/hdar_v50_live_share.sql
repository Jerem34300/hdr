-- v50 : « Partager mon live » — lien public hdar.chat/live/<code>, aperçu lecture seule, positions floutées.
create table if not exists hdar.live_shares (
  code text primary key, user_id text not null, lat double precision not null, lng double precision not null,
  created_at timestamptz not null default now(), shared_at timestamptz);
create index if not exists live_shares_user on hdar.live_shares (user_id, created_at desc);
alter table hdar.live_shares enable row level security;
revoke all on hdar.live_shares from public, anon, authenticated;

-- Décalage pseudo-aléatoire stable (~300 m max), change chaque heure.
create or replace function hdar.jit(seed text) returns double precision language sql immutable set search_path = '' as $$
  select ((('x' || substr(md5(seed), 1, 8))::bit(32)::bigint % 10000) / 10000.0 - 0.5) * 2 * 0.0027
$$;

create or replace function hdar.share_active(sh hdar.live_shares) returns boolean language sql stable set search_path = '' as $$
  select sh.created_at > now() - interval '12 hours'
    and exists (select 1 from hdar.live_queue q where q.user_id = sh.user_id and q.seen_at > now() - interval '2 minutes' and q.joined_at <= now())
$$;

-- Créer / réutiliser mon lien (uniquement quand je suis dans le Live).
create or replace function public.hdar_live_share_create() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.profiles; c text; ref jsonb;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'live_share', 20, interval '1 hour');
  if not exists (select 1 from hdar.live_queue where user_id = s and seen_at > now() - interval '1 minute') then
    raise exception 'live_off: entre dans le Live pour partager ton lien';
  end if;
  select * into p from hdar.profiles where user_id = s;
  if p.lat is null then raise exception 'live_nopos: active ta position sur la carte pour partager ton live'; end if;
  ref := public.hdar_my_ref();
  select code into c from hdar.live_shares where user_id = s and created_at > now() - interval '12 hours' order by created_at desc limit 1;
  if c is null then
    loop
      c := lower(substr(md5(gen_random_uuid()::text), 1, 8));
      begin
        -- Centre volontairement grossier (~1 km) + décalage : jamais la position exacte.
        insert into hdar.live_shares (code, user_id, lat, lng)
        values (c, s, round(p.lat::numeric, 2)::float8 + hdar.jit(c || 'a'), round(p.lng::numeric, 2)::float8 + hdar.jit(c || 'o'));
        exit;
      exception when unique_violation then end;
    end loop;
  end if;
  return jsonb_build_object('code', c, 'ref', ref->>'code');
end $$;

-- Compte un partage pour la récompense hebdo, seulement pour SON propre lien.
create or replace function public.hdar_live_share_done(p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  update hdar.live_shares set shared_at = now() where code = lower(p_code) and user_id = s;
  if not found then return null; end if;
  return public.hdar_share_reward();
end $$;

-- Infos légères pour les balises OG (agrégats seulement).
create or replace function public.hdar_live_share_meta(p_code text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('pseudo', p.pseudo, 'active', hdar.share_active(sh),
    'area', (select g.label from hdar.geo_cache g where g.k = round(sh.lat::numeric, 1) || ',' || round(sh.lng::numeric, 1)),
    'around', (select count(*) from hdar.profiles x where x.visible_until > now() and x.lat between sh.lat - 0.03 and sh.lat + 0.03 and x.lng between sh.lng - 0.045 and sh.lng + 0.045))
  from hdar.live_shares sh join hdar.profiles p on p.user_id = sh.user_id where sh.code = lower(p_code)
$$;

-- Aperçu public : zone ~3 km, pins floutés et anonymes (aucun pseudo, id, e-mail ni photo des autres).
create or replace function public.hdar_live_share_view(p_code text) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare sh hdar.live_shares; ip text; owner hdar.profiles; hr text := to_char(now(), 'YYYYMMDDHH24');
begin
  if p_code !~ '^[a-z0-9]{8}$' then return null; end if;
  ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'none');
  perform hdar.rate_check('ip:' || md5(ip), 'live_view', 40, interval '1 minute');
  perform hdar.rate_check('code:' || p_code, 'live_view', 1200, interval '1 minute');
  select * into sh from hdar.live_shares where code = p_code;
  if sh.code is null then return null; end if;
  select * into owner from hdar.profiles where user_id = sh.user_id;
  return jsonb_build_object(
    'pseudo', owner.pseudo, 'active', hdar.share_active(sh), 'ref', owner.ref_code,
    'lat', sh.lat, 'lng', sh.lng,
    'area', (select g.label from hdar.geo_cache g where g.k = round(sh.lat::numeric, 1) || ',' || round(sh.lng::numeric, 1)),
    'live', (select count(*) from hdar.live_queue q where q.seen_at > now() - interval '15 seconds'),
    'pins', coalesce((select jsonb_agg(jsonb_build_object('lat', t.lat, 'lng', t.lng, 'live', t.live)) from (
        select round((x.lat + hdar.jit(x.user_id || hr || 'a'))::numeric, 4) lat, round((x.lng + hdar.jit(x.user_id || hr || 'o'))::numeric, 4) lng,
          exists (select 1 from hdar.live_queue q where q.user_id = x.user_id and q.seen_at > now() - interval '15 seconds') live
        from hdar.profiles x
        where x.visible_until > now() and x.user_id <> sh.user_id and x.lat between sh.lat - 0.03 and sh.lat + 0.03 and x.lng between sh.lng - 0.045 and sh.lng + 0.045
        limit 150) t), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('kind', pl.kind, 'name', pl.name, 'lat', pl.lat, 'lng', pl.lng)) from (
        select kind, name, lat, lng from hdar.places
        where status = 'approved' and kind <> 'cruising' and lat between sh.lat - 0.03 and sh.lat + 0.03 and lng between sh.lng - 0.045 and sh.lng + 0.045
        limit 300) pl), '[]'::jsonb));
end $$;

revoke all on function public.hdar_live_share_create(), public.hdar_live_share_done(text) from public, anon;
grant execute on function public.hdar_live_share_create(), public.hdar_live_share_done(text) to authenticated;
revoke all on function public.hdar_live_share_meta(text), public.hdar_live_share_view(text) from public;
grant execute on function public.hdar_live_share_meta(text), public.hdar_live_share_view(text) to anon, authenticated;
revoke all on function hdar.jit(text), hdar.share_active(hdar.live_shares) from public, anon, authenticated;
