-- v136 : fin des réécritures massives qui faisaient tomber la base sous la charge.
-- Constat (prod, 6 → 8 nov.) : toilets_pin / outings_pin vidées (TRUNCATE, verrou exclusif) puis
-- recopiées toutes les 10 min = 21 millions de lignes écrites en 42 h, 3,3 Go de WAL par jour pour
-- une base de 130 Mo ; le budget disque/CPU du Micro s'épuise et, à :00 / :10 / :20, les tâches
-- (places_map jusqu'à 96 s, outings 70 s, toilets 35 s, amb_rewards 20 s) bloquent les utilisateurs :
-- statement timeout, « Timed out acquiring connection from connection pool », inscriptions en échec.
--
-- 1) Les tables de pins suivent hdar.places par trigger (une ligne écrite quand un lieu change),
--    plus aucune recopie périodique ; une réconciliation incrémentale tourne une fois par nuit.
-- 2) Le cache de la carte des lieux n'est reconstruit que si un lieu affiché a changé (sinon
--    une fois par heure, pour les fins de partenariat / boost), et jamais pendant une requête.
-- 3) Les tâches restantes sont étalées dans la minute au lieu de partir toutes à :00 / :10.
-- Applied as migration hdar_v136_pins_incremental.

---------------------------------------------------------------- 1) Pins par trigger
create or replace function hdar.places_pins_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from hdar.toilets_pin where id = old.id and (tg_op = 'DELETE' or not (new.kind = 'toilets' and new.status = 'approved'));
    delete from hdar.outings_pin where id = old.id and (tg_op = 'DELETE'
      or not (new.source = 'osm' and new.kind in ('park','garden','viewpoint','square','promenade') and new.status = 'approved'));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.kind = 'toilets' and new.status = 'approved' then
      insert into hdar.toilets_pin (id, lat, lng) values (new.id, new.lat, new.lng)
      on conflict (id) do update set lat = excluded.lat, lng = excluded.lng
        where hdar.toilets_pin.lat is distinct from excluded.lat or hdar.toilets_pin.lng is distinct from excluded.lng;
    elsif new.source = 'osm' and new.kind in ('park','garden','viewpoint','square','promenade') and new.status = 'approved' then
      insert into hdar.outings_pin (id, kind, name, lat, lng) values (new.id, new.kind, new.name, new.lat, new.lng)
      on conflict (id) do update set kind = excluded.kind, name = excluded.name, lat = excluded.lat, lng = excluded.lng
        where (hdar.outings_pin.kind, hdar.outings_pin.name, hdar.outings_pin.lat, hdar.outings_pin.lng)
          is distinct from (excluded.kind, excluded.name, excluded.lat, excluded.lng);
    end if;
  end if;
  return null;
end $$;
revoke execute on function hdar.places_pins_trg() from public, anon, authenticated;
drop trigger if exists places_pins on hdar.places;
create trigger places_pins after insert or update of kind, status, source, name, lat, lng or delete on hdar.places
  for each row execute function hdar.places_pins_trg();

-- Réconciliation incrémentale (sans TRUNCATE ni verrou exclusif) : n'écrit que les écarts.
create or replace function hdar.toilets_pin_refresh() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from hdar.toilets_pin t where not exists
    (select 1 from hdar.places p where p.id = t.id and p.kind = 'toilets' and p.status = 'approved');
  insert into hdar.toilets_pin (id, lat, lng)
  select p.id, p.lat, p.lng from hdar.places p where p.kind = 'toilets' and p.status = 'approved'
  on conflict (id) do update set lat = excluded.lat, lng = excluded.lng
    where hdar.toilets_pin.lat is distinct from excluded.lat or hdar.toilets_pin.lng is distinct from excluded.lng;
end $$;

create or replace function hdar.outings_pin_refresh() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from hdar.outings_pin o where not exists
    (select 1 from hdar.places p where p.id = o.id and p.source = 'osm' and p.status = 'approved'
       and p.kind in ('park','garden','viewpoint','square','promenade'));
  insert into hdar.outings_pin (id, kind, name, lat, lng)
  select p.id, p.kind, p.name, p.lat, p.lng from hdar.places p
  where p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade') and p.status = 'approved'
  on conflict (id) do update set kind = excluded.kind, name = excluded.name, lat = excluded.lat, lng = excluded.lng
    where (hdar.outings_pin.kind, hdar.outings_pin.name, hdar.outings_pin.lat, hdar.outings_pin.lng)
      is distinct from (excluded.kind, excluded.name, excluded.lat, excluded.lng);
end $$;
revoke execute on function hdar.toilets_pin_refresh(), hdar.outings_pin_refresh() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('hdar_toilets_pin', 'hdar_outings_pin');
select cron.schedule('hdar_toilets_pin', '41 4 * * *', 'select hdar.toilets_pin_refresh()');
select cron.schedule('hdar_outings_pin', '47 4 * * *', 'select hdar.outings_pin_refresh()');

---------------------------------------------------------------- 2) Cache de la carte des lieux
alter table hdar.places_map_cache add column if not exists dirty boolean not null default true;

-- Un lieu qui peut apparaître sur la carte change → cache à reconstruire (les gares, toilettes
-- et sorties OSM n'y sont pas : leurs imports ne déclenchent rien).
create or replace function hdar.places_map_dirty_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op <> 'INSERT' and old.kind not in ('toilets','station','metro','bus','airport')
        and not (old.source = 'osm' and old.kind in ('park','garden','viewpoint','square','promenade')))
     or (tg_op <> 'DELETE' and new.kind not in ('toilets','station','metro','bus','airport')
        and not (new.source = 'osm' and new.kind in ('park','garden','viewpoint','square','promenade'))) then
    update hdar.places_map_cache set dirty = true where id and not dirty;
  end if;
  return null;
end $$;
revoke execute on function hdar.places_map_dirty_trg() from public, anon, authenticated;
drop trigger if exists places_map_dirty on hdar.places;
create trigger places_map_dirty after insert or update or delete on hdar.places
  for each row execute function hdar.places_map_dirty_trg();

-- p_force : reconstruction même sans changement (fins de partenariat / boost, une fois par heure).
-- L'ancienne version sans argument est remplacée (sinon « select hdar.places_map_refresh() » serait ambigu).
drop function if exists hdar.places_map_refresh();
create or replace function hdar.places_map_refresh(p_force boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not p_force and exists (select 1 from hdar.places_map_cache where id and not dirty) then return; end if;
  -- Une seule reconstruction à la fois ; les autres appels repartent tout de suite.
  if not pg_try_advisory_xact_lock(hashtext('hdar.places_map_refresh')) then return; end if;
  insert into hdar.places_map_cache (id, data, at, dirty) values (true, hdar.places_map_build(-90, -180, 90, 180), now(), false)
  on conflict (id) do update set data = excluded.data, at = excluded.at, dirty = false;
end $$;
revoke execute on function hdar.places_map_refresh(boolean) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('hdar_places_map', 'hdar_places_map_hourly');
select cron.schedule('hdar_places_map', '2-59/5 * * * *', 'select hdar.places_map_refresh()');
select cron.schedule('hdar_places_map_hourly', '32 * * * *', 'select hdar.places_map_refresh(true)');

-- La carte ne reconstruit plus le cache pendant une requête utilisateur (cache périmé = servi tel quel).
create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns jsonb language plpgsql stable security definer set search_path to ''
set statement_timeout to '2000ms' as $$
declare c jsonb; filtered jsonb;
begin
  perform hdar.self_id();
  select data into c from hdar.places_map_cache where id;
  if c is null then return hdar.places_map_build(p_s, p_w, p_n, p_e); end if;
  if p_s <= -89 and p_n >= 89 and p_w <= -179 and p_e >= 179 then return c; end if;
  select coalesce(jsonb_agg(e order by coalesce((e->>'pro_boost')::boolean, false) desc,
                                      coalesce((e->>'partner')::boolean, false) desc), '[]'::jsonb)
    into filtered
  from jsonb_array_elements(c) e
  where (e->>'lat')::double precision between p_s and p_n
    and (case when p_w <= p_e
          then (e->>'lng')::double precision between p_w and p_e
          else (e->>'lng')::double precision >= p_w or (e->>'lng')::double precision <= p_e end);
  return filtered;
end $$;

---------------------------------------------------------------- 3) Tâches étalées
-- Lieux réclamés par un ambassadeur : index pour ne plus parcourir les 139 000 lieux.
create index if not exists places_claimed_amb on hdar.places (amb) where claimed_at is not null;

do $$
declare j record;
begin
  for j in select * from (values
      ('hdar-purge', '1-59/10 * * * *'), ('hdar-stats-snapshot', '3-59/10 * * * *'),
      ('hdar_trips_purge', '4-59/10 * * * *'), ('hdar-room-presence-purge', '6-59/10 * * * *'),
      ('hdar-place-chat-purge', '8-59/10 * * * *'), ('hdar_amb_rewards', '7-59/15 * * * *'),
      ('hdar_bot_tick', '9-59/15 * * * *'), ('hdar-salons-purge', '11-59/15 * * * *'),
      ('hdar-room-gc', '1-59/5 * * * *')) v(name, sched) loop
    perform cron.alter_job(c.jobid, schedule := j.sched) from cron.job c where c.jobname = j.name;
  end loop;
end $$;

-- État cohérent tout de suite (incrémental : quasiment rien à écrire).
select hdar.toilets_pin_refresh();
select hdar.outings_pin_refresh();
select hdar.places_map_refresh(true);
