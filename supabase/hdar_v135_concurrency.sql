-- hdar v135 — Tenue de charge Micro (pool PostgREST ≈ 10) : pins toilettes/sorties hors table places,
-- sonnette salon → boîte perso, plafonds bbox, timeouts courts.
-- NE PAS appliquer sans feu vert Jérémie (screenshots + widget).

-- 1) Table mince des toilettes (33k) : bbox Paris 0,26 ms vs ~170 ms sur hdar.places.
create table if not exists hdar.toilets_pin (
  id uuid primary key,
  lat double precision not null,
  lng double precision not null
);
create index if not exists toilets_pin_geo on hdar.toilets_pin (lat, lng);
alter table hdar.toilets_pin enable row level security;
revoke all on hdar.toilets_pin from public, anon, authenticated;

create or replace function hdar.toilets_pin_refresh() returns void
language plpgsql security definer set search_path to '' as $$
begin
  truncate hdar.toilets_pin;
  insert into hdar.toilets_pin (id, lat, lng)
  select p.id, p.lat, p.lng from hdar.places p
  where p.kind = 'toilets' and p.status = 'approved';
end $$;
revoke all on function hdar.toilets_pin_refresh() from public, anon, authenticated;

select hdar.toilets_pin_refresh();
select cron.unschedule('hdar_toilets_pin') where exists (select 1 from cron.job where jobname = 'hdar_toilets_pin');
select cron.schedule('hdar_toilets_pin', '*/10 * * * *', 'select hdar.toilets_pin_refresh()');

create or replace function public.hdar_toilets(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns table (id uuid, lat double precision, lng double precision)
language plpgsql stable security definer set search_path to ''
set statement_timeout to '1500ms' as $$
begin
  perform hdar.self_id();
  -- zoom ≥ 12 seulement ; bbox un peu plus serrée qu'avant
  if p_n - p_s > 0.45 or abs(p_e - p_w) > 0.7 then return; end if;
  return query
    select t.id, t.lat, t.lng from hdar.toilets_pin t
    where t.lat between p_s and p_n and t.lng between p_w and p_e
    limit 400;
end $$;
revoke all on function public.hdar_toilets(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.hdar_toilets(double precision, double precision, double precision, double precision) to authenticated;

-- 2) Table mince des sorties OSM (parcs…).
create table if not exists hdar.outings_pin (
  id uuid primary key,
  kind text not null,
  name text not null,
  lat double precision not null,
  lng double precision not null
);
create index if not exists outings_pin_geo on hdar.outings_pin (lat, lng);
alter table hdar.outings_pin enable row level security;
revoke all on hdar.outings_pin from public, anon, authenticated;

create or replace function hdar.outings_pin_refresh() returns void
language plpgsql security definer set search_path to '' as $$
begin
  truncate hdar.outings_pin;
  insert into hdar.outings_pin (id, kind, name, lat, lng)
  select p.id, p.kind, p.name, p.lat, p.lng from hdar.places p
  where p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade') and p.status = 'approved';
end $$;
revoke all on function hdar.outings_pin_refresh() from public, anon, authenticated;

select hdar.outings_pin_refresh();
select cron.unschedule('hdar_outings_pin') where exists (select 1 from cron.job where jobname = 'hdar_outings_pin');
select cron.schedule('hdar_outings_pin', '*/10 * * * *', 'select hdar.outings_pin_refresh()');

create or replace function public.hdar_outings(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns table (id uuid, kind text, name text, lat double precision, lng double precision)
language plpgsql stable security definer set search_path to ''
set statement_timeout to '1500ms' as $$
begin
  perform hdar.self_id();
  if p_n - p_s > 0.45 or abs(p_e - p_w) > 0.7 then return; end if;
  return query
    select o.id, o.kind, o.name, o.lat, o.lng from hdar.outings_pin o
    where o.lat between p_s and p_n and o.lng between p_w and p_e
    limit 400;
end $$;
revoke all on function public.hdar_outings(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.hdar_outings(double precision, double precision, double precision, double precision) to authenticated;

-- 3) hdar_places : timeout court (le cache JSON doit répondre en ms ; sinon on coupe plutôt que saturer le pool).
create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns jsonb language plpgsql stable security definer set search_path to ''
set statement_timeout to '2000ms' as $$
declare
  c jsonb;
  c_at timestamptz;
  filtered jsonb;
begin
  perform hdar.self_id();

  select data, at into c, c_at from hdar.places_map_cache where id;
  if c is null or c_at is null or c_at <= now() - interval '15 minutes' then
    perform hdar.places_map_refresh();
    select data, at into c, c_at from hdar.places_map_cache where id;
  end if;

  if p_s <= -89 and p_n >= 89 and p_w <= -179 and p_e >= 179 then
    if c is not null then return c; end if;
    return hdar.places_map_build(p_s, p_w, p_n, p_e);
  end if;

  if c is not null then
    select coalesce(jsonb_agg(e order by coalesce((e->>'pro_boost')::boolean, false) desc,
                                        coalesce((e->>'partner')::boolean, false) desc), '[]'::jsonb)
      into filtered
    from jsonb_array_elements(c) e
    where (e->>'lat')::double precision between p_s and p_n
      and (
        case when p_w <= p_e
          then (e->>'lng')::double precision between p_w and p_e
          else (e->>'lng')::double precision >= p_w or (e->>'lng')::double precision <= p_e
        end
      );
    return filtered;
  end if;

  return hdar.places_map_build(p_s, p_w, p_n, p_e);
end $$;
revoke all on function public.hdar_places(double precision, double precision, double precision, double precision) from public;
grant execute on function public.hdar_places(double precision, double precision, double precision, double precision) to authenticated, anon;

-- 4) Sonnette perso quand un message arrive dans un salon où j'ai écrit (24 h) — événement « salon ».
--    Le client (salon-inbox) écoute nudge:u avec events dm|salon et ne poll plus toutes les 5 s.
create or replace function hdar.nudge_trg() returns trigger
language plpgsql security definer set search_path to '' as $$
declare r record := coalesce(new, old); o text;
begin
  if tg_table_name = 'live_messages' then
    perform hdar.nudge('typing:dm:' || r.thread_id, 'm');
    foreach o in array array[split_part(r.thread_id, ':', 1), split_part(r.thread_id, ':', 2)] loop
      if o <> '' and (tg_op <> 'INSERT' or o <> r.from_id) then perform hdar.nudge('nudge:u:' || o, 'dm'); end if;
    end loop;
  elsif tg_table_name = 'salon_messages' then
    perform hdar.nudge('typing:salon:' || r.salon_id, 'm');
    if tg_op = 'INSERT' then
      for o in
        select distinct m.from_id from hdar.salon_messages m
        where m.salon_id = r.salon_id and m.from_id <> r.from_id
          and m.created_at > now() - interval '24 hours' and not m.removed
        limit 40
      loop
        perform hdar.nudge('nudge:u:' || o, 'salon');
      end loop;
    end if;
  elsif tg_table_name = 'spot_messages' then perform hdar.nudge('typing:spot:' || r.spot_id, 'm');
  elsif tg_table_name = 'place_messages' then perform hdar.nudge('typing:place:' || r.place_id, 'm');
  elsif tg_table_name = 'area_messages' then perform hdar.nudge_area(r.lat, r.lng);
  elsif tg_table_name = 'message_reactions' then
    if r.scope = 'salon' then perform hdar.nudge('typing:salon:' || m.salon_id, 'm') from hdar.salon_messages m where m.id = r.message_id;
    elsif r.scope = 'dm' then perform hdar.nudge('typing:dm:' || m.thread_id, 'm') from hdar.live_messages m where m.id = r.message_id;
    elsif r.scope = 'area' then perform hdar.nudge_area(m.lat, m.lng) from hdar.area_messages m where m.id = r.message_id;
    end if;
  end if;
  return null;
exception when others then return null;
end $$;
revoke all on function hdar.nudge_trg() from public, anon, authenticated;

-- 5) live_map : timeout court (table profiles déjà petite ; garde-fou sous charge).
do $$
declare def text;
begin
  -- on ne recrée le corps que si la signature 7-args existe ; on ajoute statement_timeout via ALTER
  begin
    execute 'alter function public.hdar_live_map(int, int, text[], text[], boolean, boolean, text[]) set statement_timeout to ''2000ms''';
  exception when undefined_function then
    begin
      execute 'alter function public.hdar_live_map(int, int, text[], text[], boolean, boolean) set statement_timeout to ''2000ms''';
    exception when undefined_function then null;
    end;
  end;
  begin
    execute 'alter function public.hdar_conversations(text) set statement_timeout to ''2000ms''';
  exception when undefined_function then null;
  end;
  begin
    execute 'alter function public.hdar_salons_inbox(jsonb) set statement_timeout to ''2500ms''';
  exception when undefined_function then null;
  end;
end $$;

-- 6) Index utile pour les non-lus salon (si absent)
create index if not exists salon_messages_salon_created on hdar.salon_messages (salon_id, created_at desc) where not removed;
