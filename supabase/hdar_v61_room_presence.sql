-- v61 : qui est là dans un salon ou dans le chat du quartier. Chaque écran de discussion ouvert
-- signale sa présence toutes les ~15 s ; est « en ligne » celui vu dans les 60 dernières secondes.
-- Compteur sur la liste des salons et du quartier, liste des présents (profil, écrire en privé).
-- Applied as migration hdar_v61_room_presence.

create table if not exists hdar.room_presence (
  room text not null, user_id text not null, pseudo text not null,
  lat double precision, lng double precision,
  seen_at timestamptz not null default now(),
  primary key (room, user_id));
create index if not exists room_presence_seen on hdar.room_presence (room, seen_at desc);
alter table hdar.room_presence enable row level security;
revoke all on hdar.room_presence from anon, authenticated;

-- Salon : 'salon:<uuid>' (salon ouvert) ; quartier : 'area' + position arrondie (~100 m).
create or replace function hdar.room_ok(p_room text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_room = 'area' then return true; end if;
  if p_room !~ '^salon:[0-9a-f-]{36}$' then return false; end if;
  return exists (select 1 from hdar.salons x where x.id = substr(p_room, 7)::uuid and not x.removed);
exception when others then return false;
end $$;

-- Les présents d'une pièce, vus par s (bloqués exclus, moi en premier, puis profils avec photo).
create or replace function hdar.room_people(p_room text, s text, p_lat double precision, p_lng double precision) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'pseudo', coalesce(nullif(p.pseudo, ''), r.pseudo),
      'profile', p.profile_at is not null, 'mine', r.user_id = s,
      'photo', p.photo is not null and p.photo_status = 'approved')
      order by r.user_id = s desc, (p.profile_at is not null) desc, (p.photo is not null and p.photo_status = 'approved') desc, r.seen_at desc), '[]'::jsonb)
  from (select * from hdar.room_presence r
        where r.room = p_room and r.seen_at > now() - interval '60 seconds'
          and (p_room <> 'area' or (abs(r.lat - p_lat) < 0.03 and abs(r.lng - p_lng) < 0.045))
          and not hdar.is_blocked(s, r.user_id)
        order by r.seen_at desc limit 200) r
  left join hdar.profiles p on p.user_id = r.user_id and p.profile_at is not null
    and not exists (select 1 from hdar.bans b where b.user_id = r.user_id and b.active);
$$;

create or replace function public.hdar_room_here(p_room text, p_pseudo text, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); lat double precision; lng double precision; people jsonb;
begin
  if s is null then raise exception 'Session requise'; end if;
  if not hdar.room_ok(p_room) then raise exception 'Salon introuvable'; end if;
  if p_room = 'area' then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      return jsonb_build_object('n', 0, 'people', '[]'::jsonb);
    end if;
    lat := round(p_lat::numeric, 3)::double precision;
    lng := round(p_lng::numeric, 3)::double precision;
  end if;
  insert into hdar.room_presence as r (room, user_id, pseudo, lat, lng)
  values (p_room, s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'), lat, lng)
  on conflict (room, user_id) do update set pseudo = excluded.pseudo, lat = excluded.lat, lng = excluded.lng, seen_at = now()
    where r.seen_at < now() - interval '10 seconds' or r.lat is distinct from excluded.lat or r.lng is distinct from excluded.lng;
  people := hdar.room_people(p_room, s, lat, lng);
  return jsonb_build_object('n', jsonb_array_length(people), 'people', people);
end $$;

create or replace function public.hdar_room_leave(p_room text) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  delete from hdar.room_presence where room = p_room and user_id = s;
end $$;

-- Compteurs pour la liste : quartier autour de la position + chaque salon (hors moi, bloqués exclus).
create or replace function public.hdar_rooms_online(p_lat double precision default null, p_lng double precision default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return jsonb_build_object(
    'area', case when p_lat is null or p_lng is null then 0 else (select count(*) from hdar.room_presence r
      where r.room = 'area' and r.seen_at > now() - interval '60 seconds' and r.user_id <> s
        and abs(r.lat - p_lat) < 0.03 and abs(r.lng - p_lng) < 0.045 and not hdar.is_blocked(s, r.user_id)) end,
    'salons', coalesce((select jsonb_object_agg(substr(x.room, 7), x.n) from (
      select r.room, count(*) as n from hdar.room_presence r
      where r.room like 'salon:%' and r.seen_at > now() - interval '60 seconds' and r.user_id <> s
        and not hdar.is_blocked(s, r.user_id)
      group by r.room) x), '{}'::jsonb));
end $$;

create or replace function hdar.room_presence_purge() returns void
language sql security definer set search_path = '' as $$
  delete from hdar.room_presence where seen_at < now() - interval '10 minutes';
$$;
select cron.unschedule(jobid) from cron.job where jobname = 'hdar-room-presence-purge';
select cron.schedule('hdar-room-presence-purge', '*/10 * * * *', 'select hdar.room_presence_purge()');

revoke execute on function hdar.room_ok(text), hdar.room_people(text, text, double precision, double precision),
  hdar.room_presence_purge() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['hdar_room_here(text, text, double precision, double precision)', 'hdar_room_leave(text)',
    'hdar_rooms_online(double precision, double precision)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
