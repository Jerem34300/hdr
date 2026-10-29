-- v98 — Transports (monde entier) : gares, métro/tram, aéroports + salons « à bord » temporaires.
-- Les arrêts viennent d'OpenStreetMap (chargés par le client via Overpass, par zone visible) et ne sont
-- créés dans hdar.places qu'au premier ouverture de leur chat (source='osm', source_ref='osm:node/123').
-- Les salons « à bord » (train / avion / ligne de métro) sont des hdar.salons marqués trip_*, expirés puis
-- purgés (messages, membres, nom) : aucun historique de trajet n'est conservé.

---------------------------------------------------------------- Arrêts
alter table hdar.places drop constraint if exists places_kind_check;
alter table hdar.places add constraint places_kind_check check (kind in
  ('cruising','beach','park','garden','viewpoint','square','promenade','aire','other','toilets','bar','club','sauna',
   'station','metro','airport'));

-- Carte : les arrêts sont affichés par le calque transports (Overpass), pas par hdar_places.
create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
 returns table(id uuid, kind text, name text, lat double precision, lng double precision, partner boolean, pro_boost boolean)
 language plpgsql stable security definer set search_path to '' as $function$
begin
  perform hdar.self_id();
  return query
    select p.id, p.kind, p.name, p.lat, p.lng, p.partner,
      coalesce(p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) from hdar.places p
    where p.status = 'approved' and p.kind not in ('toilets','station','metro','airport')
      and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
      and (not p.partner or coalesce(p.partner_until > now(), false))
      and p.lat between p_s and p_n
      and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
    order by 7 desc
    limit 3000;
end $function$;

-- Renvoie l'id du lieu pour un arrêt OSM, en le créant au besoin (premier arrivé : nom/coordonnées figés).
create or replace function public.hdar_transit_stop(p_ref text, p_kind text, p_name text, p_lat double precision, p_lng double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); v uuid; n text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_ref is null or p_ref !~ '^osm:(node|way|relation)/[0-9]{1,12}$' then raise exception 'Arrêt inconnu'; end if;
  select p.id into v from hdar.places p where p.source_ref = p_ref;
  if v is not null then return v; end if;
  if p_kind not in ('station','metro','airport') then raise exception 'Type d''arrêt inconnu'; end if;
  if length(n) < 2 then raise exception 'Nom manquant'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position invalide';
  end if;
  perform hdar.rate_check(s, 'transit_stop', 60, interval '1 hour');
  insert into hdar.places (kind, name, lat, lng, source, source_ref, status, ratings_on, comments_on)
  values (p_kind, n, p_lat, p_lng, 'osm', p_ref, 'approved', false, false)
  on conflict (source_ref) do nothing returning places.id into v;
  if v is null then select p.id into v from hdar.places p where p.source_ref = p_ref; end if;
  return v;
end $$;
revoke execute on function public.hdar_transit_stop(text, text, text, double precision, double precision) from public, anon;
grant execute on function public.hdar_transit_stop(text, text, text, double precision, double precision) to authenticated;

---------------------------------------------------------------- Salons « à bord »
alter table hdar.salons add column if not exists trip_kind text check (trip_kind in ('train','flight','metro'));
alter table hdar.salons add column if not exists trip_key text;
alter table hdar.salons add column if not exists expires_at timestamptz;
create unique index if not exists salons_trip_key on hdar.salons (trip_key) where not removed and trip_key is not null;
create index if not exists salons_expires on hdar.salons (expires_at) where expires_at is not null and not removed;
-- Les noms des salons de trajet (« TGV 6201 ») ne bloquent pas les salons classiques, et inversement.
drop index if exists hdar.salons_name;
create unique index salons_name on hdar.salons (lower(name)) where not removed and trip_key is null;

create table if not exists hdar.trip_members (
  salon_id uuid not null references hdar.salons (id) on delete cascade,
  user_id text not null,
  joined_at timestamptz not null default now(),
  primary key (salon_id, user_id));
create index if not exists trip_members_user on hdar.trip_members (user_id);
-- Gare / station / aéroport où le trajet a été rejoint (pour la liste « à bord » du chat de l'arrêt).
create table if not exists hdar.trip_stops (
  salon_id uuid not null references hdar.salons (id) on delete cascade,
  place_id uuid not null references hdar.places (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (salon_id, place_id));
create index if not exists trip_stops_place on hdar.trip_stops (place_id);
alter table hdar.trip_members enable row level security;
alter table hdar.trip_stops enable row level security;
revoke all on hdar.trip_members, hdar.trip_stops from anon, authenticated;

-- Normalisation : majuscules, espaces simples ; avion sans espace (« af 1234 » -> « AF1234 »).
create or replace function hdar.trip_code(p_kind text, p_code text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'flight' then regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g')
    else left(regexp_replace(btrim(upper(coalesce(p_code, ''))), '\s+', ' ', 'g'), 30) end;
$$;

-- Membres actifs = rejoints il y a moins de 12 h.
create or replace function hdar.trip_row(p_id uuid, s text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select hdar.salon_row(x.id, s) || jsonb_build_object('trip_kind', x.trip_kind, 'expires_at', x.expires_at,
    'aboard', (select count(*) from hdar.trip_members t where t.salon_id = x.id and t.joined_at > now() - interval '12 hours'),
    'me_aboard', exists (select 1 from hdar.trip_members t where t.salon_id = x.id and t.user_id = s and t.joined_at > now() - interval '12 hours'))
  from hdar.salons x where x.id = p_id;
$$;
revoke execute on function hdar.trip_row(uuid, text) from public, anon, authenticated;

create or replace function public.hdar_trip_join(p_kind text, p_code text, p_day date, p_place uuid, p_network text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); c text := hdar.trip_code(p_kind, p_code); d date := coalesce(p_day, current_date);
  net text := left(regexp_replace(btrim(coalesce(p_network, '')), '\s+', ' ', 'g'), 40);
  k text; nm text; v uuid;
begin
  if s is null then raise exception 'Session requise'; end if;
  perform hdar.require_profile(s);
  if exists (select 1 from hdar.bans b where b.user_id = s and b.active) then raise exception 'Compte suspendu'; end if;
  if p_kind = 'train' then
    if c !~ '^([A-Z]{1,10} )?[0-9]{1,6}[A-Z]?$' and c !~ '^[A-Z]{1,10}[0-9]{1,6}$' then raise exception 'Numéro de train invalide (ex. TGV 6201)'; end if;
    nm := c;
  elsif p_kind = 'flight' then
    if c !~ '^[A-Z0-9]{2}[A-Z]?[0-9]{1,4}[A-Z]?$' then raise exception 'Numéro de vol invalide (ex. AF1234)'; end if;
    nm := 'Vol ' || c;
  elsif p_kind = 'metro' then
    if length(c) < 1 then raise exception 'Choisis ta ligne'; end if;
    nm := initcap(lower(c)) || case when net <> '' then ' · ' || net else '' end;
    nm := btrim(left(nm, 60));
  else raise exception 'Type de trajet inconnu'; end if;
  if d not between current_date - 1 and current_date + 1 then raise exception 'Date : hier, aujourd''hui ou demain'; end if;
  k := p_kind || '|' || case when p_kind = 'metro' then upper(net) || '|' else '' end || c || '|' || d::text;
  perform hdar.rate_check(s, 'trip_join', 20, interval '1 hour');
  select x.id into v from hdar.salons x where x.trip_key = k and not x.removed;
  if v is null then
    insert into hdar.salons (name, description, trip_kind, trip_key, expires_at, creator_id)
    values (nm, to_char(d, 'DD/MM'), p_kind, k, least(((d + 1)::timestamp + interval '6 hours') at time zone 'UTC', now() + interval '36 hours'), null)
    on conflict do nothing returning salons.id into v;
    if v is null then select x.id into v from hdar.salons x where x.trip_key = k and not x.removed; end if;
  end if;
  insert into hdar.trip_members (salon_id, user_id) values (v, s)
    on conflict (salon_id, user_id) do update set joined_at = now();
  if p_place is not null and exists (select 1 from hdar.places p where p.id = p_place and p.kind in ('station','metro','airport')) then
    insert into hdar.trip_stops (salon_id, place_id) values (v, p_place) on conflict do nothing;
  end if;
  return hdar.trip_row(v, s);
end $$;

create or replace function public.hdar_trip_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  delete from hdar.trip_members where salon_id = p_id and user_id = s;
end $$;

-- Trajets avec du monde à bord, rejoints depuis cet arrêt. Lecture libre (comme le chat du lieu), aucune position.
create or replace function public.hdar_trips_at(p_place uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(r order by (r ->> 'aboard')::int desc) from (
    select hdar.trip_row(x.id, s) r from hdar.trip_stops ts join hdar.salons x on x.id = ts.salon_id
    where ts.place_id = p_place and not x.removed and x.expires_at > now()
      and exists (select 1 from hdar.trip_members t where t.salon_id = x.id and t.joined_at > now() - interval '12 hours')
    limit 30) q), '[]'::jsonb);
end $$;

create or replace function public.hdar_trips_mine() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(hdar.trip_row(x.id, s) order by x.expires_at) from hdar.salons x
    where not x.removed and x.expires_at > now()
      and exists (select 1 from hdar.trip_members t where t.salon_id = x.id and t.user_id = s and t.joined_at > now() - interval '12 hours')), '[]'::jsonb);
end $$;
revoke execute on function public.hdar_trip_join(text, text, date, uuid, text), public.hdar_trip_leave(uuid),
  public.hdar_trips_at(uuid), public.hdar_trips_mine() from public, anon;
grant execute on function public.hdar_trip_join(text, text, date, uuid, text), public.hdar_trip_leave(uuid),
  public.hdar_trips_at(uuid), public.hdar_trips_mine() to authenticated;

-- Liste des salons : les trajets n'y figurent pas (section « À bord » à part).
create or replace function public.hdar_salons() returns jsonb
 language plpgsql stable security definer set search_path to '' as $function$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(hdar.salon_row(x.id, s) order by x.official desc, x.last_at desc)
    from (select * from hdar.salons where not removed and trip_key is null order by official desc, last_at desc limit 100) x), '[]'::jsonb);
end $function$;

-- Boîte de réception : salons classiques + trajets où je suis à bord.
create or replace function public.hdar_salons_inbox(p_seen jsonb)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare s text := hdar.self_id(); seen jsonb := coalesce(p_seen, '{}'::jsonb);
begin
  if s is null then raise exception 'Session requise'; end if;
  if jsonb_typeof(seen) <> 'object' then seen := '{}'::jsonb; end if;
  return coalesce((select jsonb_agg(hdar.salon_row(x.id, s) || jsonb_build_object(
      'wrote', exists (select 1 from hdar.salon_messages m where m.salon_id = x.id and m.from_id = s and not m.removed
                       and m.created_at > now() - interval '24 hours'),
      'unread', case when seen ? x.id::text then (select count(*) from hdar.salon_messages m
                  where m.salon_id = x.id and not m.removed and m.from_id <> s
                    and m.created_at > hdar.safe_ts(seen ->> x.id::text) and not hdar.is_blocked(s, m.from_id)) else 0 end,
      'replies', case when seen ? x.id::text then (select count(*) from hdar.salon_messages m
                  join hdar.salon_messages o on o.id = m.reply_to and o.from_id = s
                  where m.salon_id = x.id and not m.removed and m.from_id <> s
                    and m.created_at > hdar.safe_ts(seen ->> x.id::text) and not hdar.is_blocked(s, m.from_id)) else 0 end,
      'last', (select jsonb_build_object('pseudo', m.pseudo, 'at', m.created_at, 'mine', m.from_id = s,
                 'body', hdar.reply_preview(m.pseudo, m.body, m.kind, false) ->> 'body')
               from hdar.salon_messages m where m.salon_id = x.id and not m.removed and not hdar.is_blocked(s, m.from_id)
                 and m.created_at > now() - interval '24 hours'
               order by m.created_at desc limit 1))
      order by x.official desc, x.last_at desc)
    from (select * from hdar.salons y where not y.removed
            and (y.trip_key is null or (y.expires_at > now() and exists (select 1 from hdar.trip_members t
                   where t.salon_id = y.id and t.user_id = s and t.joined_at > now() - interval '12 hours')))
          order by official desc, last_at desc limit 100) x), '[]'::jsonb);
end $function$;

-- Un salon de trajet expiré n'est plus lisible même avant la purge.
create or replace function public.hdar_salon_get(p_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return (select case when x.trip_key is null then hdar.salon_row(x.id, s) else hdar.trip_row(x.id, s) end
    from hdar.salons x where x.id = p_id and not x.removed and (x.expires_at is null or x.expires_at > now()));
end $function$;

---------------------------------------------------------------- Purge (RGPD : aucun historique de trajet)
create or replace function hdar.trips_purge() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from hdar.trip_members t using hdar.salons x
    where x.id = t.salon_id and (x.expires_at <= now() or t.joined_at <= now() - interval '12 hours');
  delete from hdar.salons x where x.trip_key is not null and x.expires_at <= now(); -- cascade : messages, membres, arrêts
end $$;
revoke execute on function hdar.trips_purge() from public, anon, authenticated;
select cron.unschedule('hdar_trips_purge') where exists (select 1 from cron.job where jobname = 'hdar_trips_purge');
select cron.schedule('hdar_trips_purge', '*/10 * * * *', 'select hdar.trips_purge()');
