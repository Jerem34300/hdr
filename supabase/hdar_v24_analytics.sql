-- hdar v24 — Analytics persistants (survivent aux purges de confidentialité)
-- Applied as migration hdar_v24_analytics.
--
-- Rien ici ne stocke une position exacte ni un historique de déplacement par personne :
-- * hdar.activity_hourly : nb de personnes visibles par carreau de ~1 km (0,01°) et par heure,
--   photographié toutes les 10 min par pg_cron (hdar.stats_snapshot). Aucun identifiant.
-- * hdar.msg_hourly : compteurs de messages / visites par heure et par type (pm, area, place, spot, session).
-- * hdar.user_daily : compteurs d'activité par utilisateur et par jour (messages envoyés,
--   conversations lancées, vues de profil reçues). Aucune position, aucun contenu.
-- * hdar.place_daily / hdar.place_visitors : messages, vues de fiche et visiteurs uniques par lieu et par jour.
-- Remplis par triggers sur les tables de messages, hdar_hit, hdar_profile_get, hdar_place_get.
-- Rétention : 400 jours (place_visitors : 90 jours). Effacés avec le compte (trigger sur profiles).
-- RPC admin (SECURITY DEFINER + hdar.admin_check => auth.uid() dans hdar.admins, anon révoqué) :
--   hdar_admin_overview(p_key, p_days), hdar_admin_heat(p_key, p_days), hdar_admin_week(p_key, p_days),
--   hdar_admin_top_places(p_key, p_days), hdar_admin_influencers(p_key, p_days).

create table if not exists hdar.activity_hourly (
  hour timestamptz not null, lat double precision not null, lng double precision not null,
  peak int not null default 0, samples int not null default 0, total int not null default 0,
  primary key (hour, lat, lng));
create table if not exists hdar.msg_hourly (
  hour timestamptz not null, kind text not null, n int not null default 0, primary key (hour, kind));
create table if not exists hdar.user_daily (
  day date not null, user_id text not null,
  pm int not null default 0, area int not null default 0, place int not null default 0, spot int not null default 0,
  convs int not null default 0, views int not null default 0,
  primary key (day, user_id));
create index if not exists user_daily_user on hdar.user_daily (user_id);
create table if not exists hdar.place_daily (
  day date not null, place_id uuid not null, messages int not null default 0, views int not null default 0,
  primary key (day, place_id));
create table if not exists hdar.place_visitors (
  day date not null, place_id uuid not null, user_id text not null, primary key (day, place_id, user_id));
alter table hdar.activity_hourly enable row level security;
alter table hdar.msg_hourly enable row level security;
alter table hdar.user_daily enable row level security;
alter table hdar.place_daily enable row level security;
alter table hdar.place_visitors enable row level security;
revoke all on hdar.activity_hourly, hdar.msg_hourly, hdar.user_daily, hdar.place_daily, hdar.place_visitors from anon, authenticated;

create or replace function hdar.bump_msg(p_kind text, p_n int default 1) returns void
language sql security definer set search_path = '' as $$
  insert into hdar.msg_hourly (hour, kind, n) values (date_trunc('hour', now()), p_kind, p_n)
  on conflict (hour, kind) do update set n = hdar.msg_hourly.n + excluded.n;
$$;

create or replace function hdar.bump_user(p_user text, p_col text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  execute format('insert into hdar.user_daily (day, user_id, %1$I) values (current_date, $1, 1)
    on conflict (day, user_id) do update set %1$I = hdar.user_daily.%1$I + 1', p_col) using p_user;
end $$;

create or replace function hdar.on_msg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text := tg_argv[0];
begin
  perform hdar.bump_msg(k);
  perform hdar.bump_user(new.from_id, k);
  if k = 'pm' and not exists (select 1 from hdar.live_messages m where m.thread_id = new.thread_id and m.id <> new.id) then
    perform hdar.bump_user(new.from_id, 'convs');
  end if;
  if k = 'place' then
    insert into hdar.place_daily (day, place_id, messages) values (current_date, new.place_id, 1)
      on conflict (day, place_id) do update set messages = hdar.place_daily.messages + 1;
    insert into hdar.place_visitors values (current_date, new.place_id, new.from_id) on conflict do nothing;
  end if;
  return null;
exception when others then return null; -- les stats ne doivent jamais bloquer un message
end $$;

drop trigger if exists stats_pm on hdar.live_messages;
create trigger stats_pm after insert on hdar.live_messages for each row execute function hdar.on_msg('pm');
drop trigger if exists stats_area on hdar.area_messages;
create trigger stats_area after insert on hdar.area_messages for each row execute function hdar.on_msg('area');
drop trigger if exists stats_place on hdar.place_messages;
create trigger stats_place after insert on hdar.place_messages for each row execute function hdar.on_msg('place');
drop trigger if exists stats_spot on hdar.spot_messages;
create trigger stats_spot after insert on hdar.spot_messages for each row execute function hdar.on_msg('spot');

create or replace function hdar.on_profile_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from hdar.user_daily where user_id = old.user_id;
  delete from hdar.place_visitors where user_id = old.user_id;
  return null;
end $$;
drop trigger if exists stats_forget on hdar.profiles;
create trigger stats_forget after delete on hdar.profiles for each row execute function hdar.on_profile_delete();

-- Sessions (ouverture de l'appli après 30 min d'absence)
create or replace function public.hdar_hit(p_self text) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); prev timestamptz; fresh boolean;
begin
  select d.last_seen into prev from hdar.devices d where d.id = s;
  fresh := prev is null or prev < now() - interval '30 minutes';
  insert into hdar.devices (id) values (s)
  on conflict (id) do update set last_seen = now(),
    sessions = hdar.devices.sessions + case when fresh then 1 else 0 end;
  insert into hdar.daily_visits (day, device) values (current_date, s)
  on conflict (day, device) do update set
    sessions = hdar.daily_visits.sessions + case when fresh then 1 else 0 end;
  if fresh then perform hdar.bump_msg('session'); end if;
end $$;

-- Vues de profil (pas les siennes)
create or replace function public.hdar_profile_get(p_self text, p_id text)
returns table(id text, pseudo text, age integer, bio text, tags text, desires text, photo text, online boolean, lat double precision, lng double precision)
language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); o text := lower(left(coalesce(p_id, ''), 80));
begin
  if hdar.is_blocked(s, o) then return; end if;
  if o <> s and exists (select 1 from hdar.profiles p where p.user_id = o) then
    perform hdar.bump_user(o, 'views');
  end if;
  return query
    select p.user_id, p.pseudo, p.age, p.bio, p.tags, p.desires,
      case when p.user_id = s or p.photo_status = 'approved' then p.photo end,
      coalesce(p.visible_until > now(), false),
      case when p.visible_until > now() then hdar.round_coord(p.lat) end,
      case when p.visible_until > now() then hdar.round_coord(p.lng) end
    from hdar.profiles p where p.user_id = o;
end $$;

-- Vues de fiche lieu
create or replace function public.hdar_place_get(p_id uuid)
returns table(id uuid, kind text, name text, description text, lat double precision, lng double precision, source text, source_ref text, partner boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if exists (select 1 from hdar.places p where p.id = p_id) then
    insert into hdar.place_daily (day, place_id, views) values (current_date, p_id, 1)
      on conflict (day, place_id) do update set views = hdar.place_daily.views + 1;
    insert into hdar.place_visitors values (current_date, p_id, s) on conflict do nothing;
  end if;
  return query select p.id, p.kind, p.name, p.description, p.lat, p.lng, p.source, p.source_ref, p.partner
    from hdar.places p where p.id = p_id
      and p.status = 'approved' and (not p.partner or coalesce(p.partner_until > now(), false));
end $$;

-- Photo toutes les 10 min des personnes visibles, par carreau de ~1 km.
create or replace function hdar.stats_snapshot() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into hdar.activity_hourly as a (hour, lat, lng, peak, samples, total)
    select date_trunc('hour', now()), round(p.lat::numeric, 2)::float8, round(p.lng::numeric, 2)::float8, count(*), 1, count(*)
    from hdar.profiles p where p.visible_until > now() and p.lat is not null
    group by 2, 3
  on conflict (hour, lat, lng) do update set peak = greatest(a.peak, excluded.peak),
    samples = a.samples + 1, total = a.total + excluded.total;
  delete from hdar.activity_hourly where hour < now() - interval '400 days';
  delete from hdar.msg_hourly where hour < now() - interval '400 days';
  delete from hdar.user_daily where day < current_date - 400;
  delete from hdar.place_daily where day < current_date - 400;
  delete from hdar.place_visitors where day < current_date - 90;
end $$;
revoke execute on function hdar.stats_snapshot(), hdar.bump_msg(text, int), hdar.bump_user(text, text) from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'hdar-stats-snapshot';
select cron.schedule('hdar-stats-snapshot', '*/10 * * * *', 'select hdar.stats_snapshot()');

-- Rattrapage depuis les données encore présentes
insert into hdar.msg_hourly (hour, kind, n)
  select date_trunc('hour', created_at), 'pm', count(*) from hdar.live_messages group by 1
  union all select date_trunc('hour', created_at), 'area', count(*) from hdar.area_messages group by 1
  union all select date_trunc('hour', created_at), 'place', count(*) from hdar.place_messages group by 1
  union all select date_trunc('hour', created_at), 'spot', count(*) from hdar.spot_messages group by 1
on conflict do nothing;
insert into hdar.user_daily (day, user_id, pm, area, place, spot)
  select day, from_id, sum(pm), sum(area), sum(place), sum(spot) from (
    select created_at::date as day, from_id, 1 as pm, 0 as area, 0 as place, 0 as spot from hdar.live_messages
    union all select created_at::date, from_id, 0, 1, 0, 0 from hdar.area_messages
    union all select created_at::date, from_id, 0, 0, 1, 0 from hdar.place_messages
    union all select created_at::date, from_id, 0, 0, 0, 1 from hdar.spot_messages) x
  group by 1, 2
on conflict do nothing;
select hdar.stats_snapshot();

---------------------------------------------------------------- Admin RPCs
create or replace function public.hdar_admin_overview(p_key text, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); r jsonb;
begin
  perform hdar.admin_check(p_key);
  select jsonb_build_object(
    'profiles_total', (select count(*) from hdar.profiles),
    'profiles_photo', (select count(*) from hdar.profiles where photo is not null),
    'devices_total', (select count(*) from hdar.devices),
    'active_now', (select count(*) from hdar.devices where last_seen > now() - interval '5 minutes'),
    'visible_now', (select count(*) from hdar.profiles where visible_until > now()),
    'dau', (select count(*) from hdar.daily_visits where day = current_date),
    'wau', (select count(distinct device) from hdar.daily_visits where day > current_date - 7),
    'mau', (select count(distinct device) from hdar.daily_visits where day > current_date - 30),
    'favorites_total', (select count(*) from hdar.favorites),
    'partners_active', (select count(*) from hdar.places where partner and partner_until > now()),
    'boosts_active', (select count(*) from hdar.boosts where not cancelled and now() between starts_at and ends_at),
    'retention', (
      select jsonb_build_object(
        'd1_cohort', count(*) filter (where c.first_day <= current_date - 1),
        'd1', count(*) filter (where c.first_day <= current_date - 1 and exists (select 1 from hdar.daily_visits v where v.device = c.id and v.day = c.first_day + 1)),
        'd7_cohort', count(*) filter (where c.first_day <= current_date - 7),
        'd7', count(*) filter (where c.first_day <= current_date - 7 and exists (select 1 from hdar.daily_visits v where v.device = c.id and v.day between c.first_day + 7 and c.first_day + 13)))
      from (select id, first_seen::date as first_day from hdar.devices where first_seen > now() - make_interval(days => greatest(d, 14))) c),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', g.day::text,
        'visitors', (select count(*) from hdar.daily_visits v where v.day = g.day),
        'sessions', (select coalesce(sum(sessions), 0) from hdar.daily_visits v where v.day = g.day),
        'new_devices', (select count(*) from hdar.devices x where x.first_seen::date = g.day),
        'new_profiles', (select count(*) from hdar.profiles x where x.created_at::date = g.day),
        'pm', (select coalesce(sum(n), 0) from hdar.msg_hourly m where m.kind = 'pm' and (m.hour at time zone 'Europe/Paris')::date = g.day),
        'area', (select coalesce(sum(n), 0) from hdar.msg_hourly m where m.kind = 'area' and (m.hour at time zone 'Europe/Paris')::date = g.day),
        'place', (select coalesce(sum(n), 0) from hdar.msg_hourly m where m.kind in ('place', 'spot') and (m.hour at time zone 'Europe/Paris')::date = g.day)
      ) order by g.day), '[]'::jsonb)
      from (select generate_series(current_date - (d - 1), current_date, interval '1 day')::date as day) g)
  ) into r;
  return r;
end $$;

create or replace function public.hdar_admin_heat(p_key text, p_days int default 7)
returns table (lat double precision, lng double precision, presence bigint, peak int, hours bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform hdar.admin_check(p_key);
  return query select a.lat, a.lng, sum(a.total)::bigint, max(a.peak), count(*)::bigint
    from hdar.activity_hourly a
    where a.hour > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 400))
    group by 1, 2 order by 3 desc limit 2000;
end $$;

create or replace function public.hdar_admin_week(p_key text, p_days int default 30)
returns table (dow int, hour int, sessions bigint, messages bigint, presence bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 400));
begin
  perform hdar.admin_check(p_key);
  return query
    with m as (
      select extract(isodow from h.hour at time zone 'Europe/Paris')::int dw, extract(hour from h.hour at time zone 'Europe/Paris')::int hr,
        sum(h.n) filter (where h.kind = 'session') s, sum(h.n) filter (where h.kind <> 'session') msg
      from hdar.msg_hourly h where h.hour > since group by 1, 2),
    a as (
      select extract(isodow from x.hour at time zone 'Europe/Paris')::int dw, extract(hour from x.hour at time zone 'Europe/Paris')::int hr, sum(x.peak) p
      from hdar.activity_hourly x where x.hour > since group by 1, 2)
    select coalesce(m.dw, a.dw), coalesce(m.hr, a.hr), coalesce(m.s, 0)::bigint, coalesce(m.msg, 0)::bigint, coalesce(a.p, 0)::bigint
    from m full join a on a.dw = m.dw and a.hr = m.hr;
end $$;

create or replace function public.hdar_admin_top_places(p_key text, p_days int default 30)
returns table (id uuid, name text, kind text, partner boolean, lat double precision, lng double precision, messages bigint, views bigint, visitors bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare since date := current_date - least(greatest(coalesce(p_days, 30), 1), 400);
begin
  perform hdar.admin_check(p_key);
  return query
    select p.id, p.name, p.kind, coalesce(p.partner and p.partner_until > now(), false), hdar.round_coord(p.lat), hdar.round_coord(p.lng),
      coalesce(sum(d.messages), 0)::bigint, coalesce(sum(d.views), 0)::bigint,
      (select count(distinct v.user_id) from hdar.place_visitors v where v.place_id = p.id and v.day > since)::bigint
    from hdar.place_daily d join hdar.places p on p.id = d.place_id
    where d.day > since group by p.id order by 7 desc, 9 desc, 8 desc limit 50;
end $$;

create or replace function public.hdar_admin_influencers(p_key text, p_days int default 30)
returns table (user_id text, pseudo text, photo text, banned boolean, online boolean, pm bigint, convs bigint, area bigint,
  place bigint, views bigint, favs bigint, sessions bigint, score bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare since date := current_date - least(greatest(coalesce(p_days, 30), 1), 400);
begin
  perform hdar.admin_check(p_key);
  return query
    with u as (
      select d.user_id, sum(d.pm) pm, sum(d.convs) convs, sum(d.area) area, sum(d.place + d.spot) place, sum(d.views) views
      from hdar.user_daily d where d.day > since group by 1),
    f as (select fav_id, count(*) n from hdar.favorites group by 1),
    s as (select device, sum(sessions) n from hdar.daily_visits where day > since group by 1)
    select p.user_id, p.pseudo, p.photo, exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active),
      coalesce(p.visible_until > now(), false),
      coalesce(u.pm, 0)::bigint, coalesce(u.convs, 0)::bigint, coalesce(u.area, 0)::bigint, coalesce(u.place, 0)::bigint,
      coalesce(u.views, 0)::bigint, coalesce(f.n, 0)::bigint, coalesce(s.n, 0)::bigint,
      (coalesce(u.pm, 0) + 3 * coalesce(u.convs, 0) + coalesce(u.area, 0) + coalesce(u.place, 0)
        + 2 * coalesce(u.views, 0) + 5 * coalesce(f.n, 0) + coalesce(s.n, 0))::bigint
    from hdar.profiles p left join u on u.user_id = p.user_id left join f on f.fav_id = p.user_id left join s on s.device = p.user_id
    order by 13 desc, p.created_at desc limit 100;
end $$;

revoke execute on function public.hdar_admin_overview(text, int), public.hdar_admin_heat(text, int), public.hdar_admin_week(text, int),
  public.hdar_admin_top_places(text, int), public.hdar_admin_influencers(text, int) from public, anon;
grant execute on function public.hdar_admin_overview(text, int), public.hdar_admin_heat(text, int), public.hdar_admin_week(text, int),
  public.hdar_admin_top_places(text, int), public.hdar_admin_influencers(text, int) to authenticated;

revoke execute on function hdar.on_msg(), hdar.on_profile_delete() from public, anon, authenticated;
