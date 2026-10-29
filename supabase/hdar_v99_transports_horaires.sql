-- v99 — Transports : salon train par numéro (quel que soit le libellé saisi), arrêts importés en base.

-- 1) Train : la clé ne garde que le numéro (« 6223 », « TGV 6223 », « TGV INOUI 6223 » = même salon).
--    Le nom du salon est le libellé du premier arrivé (ex. libellé officiel trouvé dans les horaires).
create or replace function public.hdar_trip_join(p_kind text, p_code text, p_day date, p_place uuid, p_network text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); c text := hdar.trip_code(p_kind, p_code); d date := coalesce(p_day, current_date);
  net text := left(regexp_replace(btrim(coalesce(p_network, '')), '\s+', ' ', 'g'), 40);
  k text; nm text; v uuid; num text;
begin
  if s is null then raise exception 'Session requise'; end if;
  perform hdar.require_profile(s);
  if exists (select 1 from hdar.bans b where b.user_id = s and b.active) then raise exception 'Compte suspendu'; end if;
  if p_kind = 'train' then
    if c !~ '^([A-Z][A-Z ]{0,23} ?)?[0-9]{1,6}[A-Z]?$' then raise exception 'Numéro de train invalide (ex. TGV 6201)'; end if;
    num := substring(c from '([0-9]{1,6})[A-Z]?$');
    nm := c;
  elsif p_kind = 'flight' then
    if c !~ '^[A-Z0-9]{2}[A-Z]?[0-9]{1,4}[A-Z]?$' then raise exception 'Numéro de vol invalide (ex. AF1234)'; end if;
    num := c; nm := 'Vol ' || c;
  elsif p_kind = 'metro' then
    if length(c) < 1 then raise exception 'Choisis ta ligne'; end if;
    num := c;
    nm := btrim(left(initcap(lower(c)) || case when net <> '' then ' · ' || net else '' end, 60));
  else raise exception 'Type de trajet inconnu'; end if;
  if d not between current_date - 1 and current_date + 1 then raise exception 'Date : hier, aujourd''hui ou demain'; end if;
  k := p_kind || '|' || case when p_kind = 'metro' then upper(net) || '|' else '' end || num || '|' || d::text;
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

-- 2) Arrêts importés (OSM, par pays) : lus par zone visible comme les toilettes.
alter table hdar.places add column if not exists transit_code text; -- code IATA des aéroports
create index if not exists places_transit_geo on hdar.places (lat, lng) where kind in ('station','metro','airport');

create or replace function public.hdar_transit(p_s double precision, p_w double precision, p_n double precision, p_e double precision, p_zoom int)
returns table(ref text, kind text, name text, lat double precision, lng double precision, iata text)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select p.source_ref, p.kind, p.name, p.lat, p.lng, p.transit_code from hdar.places p
    where p.kind in ('station','metro','airport') and p.status = 'approved' and p.source_ref like 'osm:%'
      and (p_zoom >= 12 or p.kind = 'airport')
      and p.lat between p_s and p_n
      and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
    limit 1500;
end $$;
revoke execute on function public.hdar_transit(double precision, double precision, double precision, double precision, int) from public;
grant execute on function public.hdar_transit(double precision, double precision, double precision, double precision, int) to anon, authenticated;
