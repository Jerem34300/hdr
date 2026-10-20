-- hdar v73 — Carte jamais vide : profils vus < 48 h (pins estompés) + visiteurs anonymes géolocalisés < 48 h (bulles).
-- Additif. Seules des coordonnées floutées sont stockées/renvoyées : profils → grille 0,004° (~400 m, hdar.ad_fuzz),
-- visiteurs → grille 0,01° (~1 km, position exacte jamais stockée). Blocages respectés, admins exclus,
-- plafond par fenêtre de carte. Opt-out : profiles.hide_offline ; visiteurs : hdar_visitor_forget().
alter table hdar.profiles add column if not exists hide_offline boolean not null default false;

create table if not exists hdar.visitor_pos (
  device_id text primary key,
  lat double precision not null,
  lng double precision not null,
  at timestamptz not null default now()
);
create index if not exists visitor_pos_at_idx on hdar.visitor_pos (at);
alter table hdar.visitor_pos enable row level security;
revoke all on hdar.visitor_pos from anon, authenticated;

create or replace function hdar.grid(v double precision, step double precision) returns double precision
language sql immutable set search_path to '' as $$ select round((round(v / step) * step)::numeric, 4)::double precision $$;

-- Visiteur sans profil ayant accepté la géolocalisation : position arrondie à ~1 km côté serveur.
create or replace function public.hdar_visitor_ping(p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return; end if;
  if exists (select 1 from hdar.profiles where user_id = s) then delete from hdar.visitor_pos where device_id = s; return; end if;
  perform hdar.rate_check(s, 'vping', 30, interval '1 hour');
  insert into hdar.visitor_pos (device_id, lat, lng) values (s, hdar.grid(p_lat, 0.01), hdar.grid(p_lng, 0.01))
  on conflict (device_id) do update set lat = excluded.lat, lng = excluded.lng, at = now();
end $$;

create or replace function public.hdar_visitor_forget() returns void
language sql security definer set search_path to '' as $$ delete from hdar.visitor_pos where device_id = hdar.self_id() $$;

create or replace function public.hdar_map_hide_offline_set(p_on boolean) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.require_profile(s);
  update hdar.profiles set hide_offline = coalesce(p_on, false) where user_id = s;
end $$;

-- Pins « récents » (hors ligne, vus < 48 h) + bulles visiteurs, dans la fenêtre de carte.
create or replace function public.hdar_map_recent(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if p_s is null or p_n - p_s > 3 or p_e - p_w > 4 then  -- fenêtre trop large : rien (pas d'aspiration du pays entier)
    return jsonb_build_object('people', '[]'::jsonb, 'visitors', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'pseudo', x.pseudo, 'lat', x.la, 'lng', x.lo,
        'h', greatest(0, floor(extract(epoch from now() - x.updated_at) / 3600))::int)) from (
      select p.user_id, p.pseudo, p.updated_at, hdar.ad_fuzz(p.lat) la, hdar.ad_fuzz(p.lng) lo
      from hdar.profiles p
      where p.updated_at > now() - interval '48 hours'
        and (p.visible_until is null or p.visible_until <= now())
        and not p.hide_offline and p.lat is not null
        and p.lat between p_s and p_n and p.lng between p_w and p_e
        and p.user_id <> coalesce(s, '')
        and not hdar.is_admin_user(p.user_id)
        and (s is null or not hdar.is_blocked(s, p.user_id))
      order by p.updated_at desc limit 120) x), '[]'::jsonb),
    'visitors', coalesce((select jsonb_agg(jsonb_build_object('lat', v.lat, 'lng', v.lng, 'n', v.n,
        'h', greatest(0, floor(extract(epoch from now() - v.last) / 3600))::int)) from (
      select lat, lng, count(*) n, max(at) last from hdar.visitor_pos
      where at > now() - interval '48 hours' and device_id <> coalesce(s, '')
        and lat between p_s and p_n and lng between p_w and p_e
        and not exists (select 1 from hdar.profiles pr where pr.user_id = device_id)
      group by lat, lng order by max(at) desc limit 80) v), '[]'::jsonb));
end $$;

-- RGPD : purge des positions visiteurs > 48 h ; création du profil → position visiteur effacée.
select cron.schedule('hdar-visitor-pos-purge', '17 * * * *', $c$ delete from hdar.visitor_pos where at < now() - interval '48 hours' $c$);
create or replace function hdar.visitor_pos_profile_trg() returns trigger language plpgsql security definer set search_path to '' as $$
begin delete from hdar.visitor_pos where device_id = new.user_id; return new; end $$;
drop trigger if exists visitor_pos_profile on hdar.profiles;
create trigger visitor_pos_profile after insert on hdar.profiles for each row execute function hdar.visitor_pos_profile_trg();

revoke all on function hdar.grid(double precision, double precision), hdar.visitor_pos_profile_trg() from public, anon, authenticated;
revoke all on function public.hdar_visitor_ping(double precision, double precision), public.hdar_visitor_forget(),
  public.hdar_map_hide_offline_set(boolean), public.hdar_map_recent(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.hdar_visitor_ping(double precision, double precision), public.hdar_visitor_forget(),
  public.hdar_map_hide_offline_set(boolean), public.hdar_map_recent(double precision, double precision, double precision, double precision) to authenticated;

-- v73 (suite) : préférence lue par l'appli.
create or replace function public.hdar_map_hide_offline_get() returns boolean
language sql stable security definer set search_path to '' as $$ select coalesce((select hide_offline from hdar.profiles where user_id = hdar.self_id()), false) $$;
revoke all on function public.hdar_map_hide_offline_get() from public, anon;
grant execute on function public.hdar_map_hide_offline_get() to authenticated;
