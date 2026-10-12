-- Chat rooms for permanent places: anyone signed in can read; posting needs to be within ~2 km.
create table if not exists hdar.place_messages (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  from_id text not null,
  pseudo text not null,
  body text not null,
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists place_messages_place on hdar.place_messages (place_id, created_at desc);
create index if not exists place_messages_from on hdar.place_messages (from_id);
alter table hdar.place_messages enable row level security;
revoke all on hdar.place_messages from public, anon, authenticated;

create or replace function hdar.km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 6371 * 2 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
    + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)))
$$;

create or replace function public.hdar_place_messages(p_id uuid)
returns table (id uuid, from_id text, pseudo text, body text, at text, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  return query
    select m.id, m.from_id, m.pseudo, m.body, m.created_at::text, m.from_id = s from (
      select * from hdar.place_messages pm
      where pm.place_id = p_id and not pm.removed and pm.created_at > now() - interval '24 hours'
        and not hdar.is_blocked(s, pm.from_id)
      order by pm.created_at desc limit 200) m
    order by m.created_at asc;
end $$;

create or replace function public.hdar_place_send(p_id uuid, p_body text, p_lat double precision, p_lng double precision)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); b text := left(btrim(coalesce(p_body, '')), 240); pl hdar.places; ps text;
begin
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  if b = '' then return; end if;
  select * into pl from hdar.places p where p.id = p_id and p.status = 'approved'
    and (not p.partner or coalesce(p.partner_until > now(), false));
  if pl.id is null then raise exception 'Lieu introuvable'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Active ta position pour écrire ici';
  end if;
  if hdar.km(p_lat, p_lng, pl.lat, pl.lng) > 2 then
    raise exception 'Tu dois être à moins de 2 km du lieu pour écrire';
  end if;
  select coalesce(nullif(btrim(p.pseudo), ''), 'Anonyme') into ps from hdar.profiles p where p.user_id = s;
  insert into hdar.place_messages (place_id, from_id, pseudo, body) values (p_id, s, coalesce(ps, 'Anonyme'), b);
end $$;

create or replace function public.hdar_place_hide(p_msg uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  update hdar.place_messages set removed = true where id = p_msg and from_id = s;
end $$;

revoke execute on function public.hdar_place_messages(uuid), public.hdar_place_send(uuid, text, double precision, double precision),
  public.hdar_place_hide(uuid) from public, anon;
grant execute on function public.hdar_place_messages(uuid), public.hdar_place_send(uuid, text, double precision, double precision),
  public.hdar_place_hide(uuid) to authenticated;

-- Same 24 h retention as the neighborhood chat.
select cron.schedule('hdar-place-chat-purge', '*/10 * * * *', $c$delete from hdar.place_messages where created_at < now() - interval '24 hours'$c$);

-- Lightweight activity summary for in-app badges (no message text).
create or replace function public.hdar_activity(p_lat double precision, p_lng double precision, p_area_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id(); area int := 0; spots jsonb; places jsonb;
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_lat is not null and p_lng is not null then
    select count(*) into area from (
      select 1 from hdar.area_messages a
      where a.created_at > greatest(coalesce(p_area_since, now() - interval '24 hours'), now() - interval '24 hours')
        and not a.removed and a.from_id <> s
        and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045
        and not hdar.is_blocked(s, a.from_id)
      limit 99) x;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', sp.id,
      'created', sp.created_at,
      'mine', sp.creator_id = s,
      'joined', sp.creator_id = s or exists (select 1 from hdar.spot_messages m where m.spot_id = sp.id and m.from_id = s),
      'last', (select max(m.created_at) from hdar.spot_messages m where m.spot_id = sp.id and m.from_id <> s and not m.removed
               and not hdar.is_blocked(s, m.from_id)),
      'near', p_lat is not null and abs(sp.lat - p_lat) < 0.018 and abs(sp.lng - p_lng) < 0.026
    )), '[]'::jsonb) into spots
  from hdar.spots sp
  where sp.closes_at > now()
    and (sp.creator_id = s or (p_lat is not null and abs(sp.lat - p_lat) < 1 and abs(sp.lng - p_lng) < 1.5
         and not hdar.is_blocked(s, sp.creator_id)));
  select coalesce(jsonb_agg(jsonb_build_object('id', x.place_id, 'last', x.last)), '[]'::jsonb) into places
  from (
    select m.place_id, (select max(o.created_at) from hdar.place_messages o where o.place_id = m.place_id
                         and o.from_id <> s and not o.removed and not hdar.is_blocked(s, o.from_id)) last
    from hdar.place_messages m where m.from_id = s group by m.place_id
  ) x where x.last is not null;
  return jsonb_build_object('area', area, 'spots', spots, 'places', places);
end $$;

create or replace function public.hdar_delete_me()
returns void language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); u uuid := auth.uid();
begin
  delete from hdar.live_messages where from_id = s
    or split_part(thread_id, ':', 1) = s or split_part(thread_id, ':', 2) = s;
  delete from hdar.favorites where user_id = s or fav_id = s;
  delete from hdar.hidden_threads where user_id = s or other_id = s;
  delete from hdar.live_blocks where user_id = s;
  delete from hdar.live_reports where reporter_id = s;
  delete from hdar.rtc_signals where from_id = s or to_id = s;
  delete from hdar.area_messages where from_id = s;
  delete from hdar.spot_messages where from_id = s;
  delete from hdar.place_messages where from_id = s;
  delete from hdar.spots where creator_id = s;
  delete from hdar.rate_limits where user_id = s;
  delete from hdar.push_subs where user_id = s;
  delete from hdar.push_sent where user_id = s;
  delete from hdar.daily_visits where device = s;
  delete from hdar.devices where id = s;
  delete from hdar.profiles where user_id = s or auth_user_id = u;
  delete from hdar.identities where user_id = s or auth_user_id = u;
  delete from auth.users where id = u;
end $$;
revoke execute on function public.hdar_delete_me() from public, anon;
grant execute on function public.hdar_delete_me() to authenticated;
