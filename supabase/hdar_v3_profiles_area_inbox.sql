-- Applied as migration `hdar_profiles_area_inbox`.
-- Public profiles, neighbourhood chat (~3 km, 24 h) and the conversations list.

alter table hdar.profiles
  add column if not exists age int,
  add column if not exists bio text not null default '',
  add column if not exists tags text not null default '',
  add column if not exists photo text,
  add column if not exists profile_at timestamptz;

create or replace function public.hdar_profile_set(
  p_self text, p_pseudo text, p_age int, p_bio text, p_tags text, p_photo text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  ps text := coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme');
  ph text := nullif(p_photo, '');
begin
  if ph is not null and (ph !~ '^data:image/(jpeg|png|webp);base64,' or length(ph) > 400000) then
    ph := null;
  end if;
  insert into hdar.profiles (user_id, pseudo, age, bio, tags, photo, profile_at)
  values (s, ps, case when p_age between 18 and 99 then p_age end, left(coalesce(p_bio, ''), 300),
          left(coalesce(p_tags, ''), 200), ph, now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, age = excluded.age, bio = excluded.bio,
    tags = excluded.tags, photo = excluded.photo, profile_at = now();
end $$;

create or replace function public.hdar_profile_get(p_self text, p_id text)
returns table (id text, pseudo text, age int, bio text, tags text, desires text, photo text,
               online boolean, lat double precision, lng double precision)
language plpgsql stable security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  o text := lower(left(coalesce(p_id, ''), 80));
begin
  if hdar.is_blocked(s, o) then return; end if;
  return query
    select p.user_id, p.pseudo, p.age, p.bio, p.tags, p.desires, p.photo,
      coalesce(p.visible_until > now(), false),
      case when p.visible_until > now() then p.lat end,
      case when p.visible_until > now() then p.lng end
    from hdar.profiles p where p.user_id = o;
end $$;

create table if not exists hdar.area_messages (
  id uuid primary key default gen_random_uuid(),
  from_id text not null,
  pseudo text not null,
  lat double precision not null,
  lng double precision not null,
  body text not null,
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists area_messages_time_idx on hdar.area_messages (created_at);
alter table hdar.area_messages enable row level security;

create or replace function public.hdar_area_send(
  p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_body text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  b text := left(trim(coalesce(p_body, '')), 300);
begin
  if b = '' then return; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position inconnue';
  end if;
  if (select count(*) from hdar.area_messages where from_id = s and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Trop de messages, patiente un peu';
  end if;
  -- Position is rounded (~100 m grid) so a message never pins where someone is.
  insert into hdar.area_messages (from_id, pseudo, lat, lng, body)
  values (s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'),
          round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision, b);
end $$;

create or replace function public.hdar_area_feed(p_self text, p_lat double precision, p_lng double precision)
returns table (id uuid, from_id text, pseudo text, body text, at text, mine boolean,
               lat double precision, lng double precision, photo boolean)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  if p_lat is null or p_lng is null then return; end if;
  return query
    select m.id, m.from_id, m.pseudo, m.body, m.created_at::text, m.from_id = s, m.lat, m.lng,
      exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null)
    from (
      select * from hdar.area_messages a
      where a.created_at > now() - interval '24 hours'
        and not a.removed
        and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045
        and not hdar.is_blocked(s, a.from_id)
      order by a.created_at desc
      limit 150
    ) m
    order by m.created_at asc;
end $$;

create or replace function public.hdar_area_hide(p_self text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update hdar.area_messages set removed = true where id = p_id and from_id = hdar.check_id(p_self);
end $$;

create or replace function public.hdar_conversations(p_self text)
returns table (other_id text, pseudo text, last_kind text, last_body text, last_at text, last_mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  return query
    select c.other, coalesce(p.pseudo, 'Anonyme'), c.kind, c.body, c.created_at::text, c.from_id = s
    from (
      select distinct on (m.thread_id)
        case when split_part(m.thread_id, ':', 1) = s then split_part(m.thread_id, ':', 2)
             else split_part(m.thread_id, ':', 1) end as other,
        m.kind, m.body, m.created_at, m.from_id
      from hdar.live_messages m
      where split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s
      order by m.thread_id, m.created_at desc
    ) c
    left join hdar.profiles p on p.user_id = c.other
    where not hdar.is_blocked(s, c.other)
    order by c.created_at desc
    limit 100;
end $$;

revoke execute on function
  public.hdar_profile_set(text, text, int, text, text, text), public.hdar_profile_get(text, text),
  public.hdar_area_send(text, double precision, double precision, text, text),
  public.hdar_area_feed(text, double precision, double precision), public.hdar_area_hide(text, uuid),
  public.hdar_conversations(text)
  from public, authenticated;
grant execute on function
  public.hdar_profile_set(text, text, int, text, text, text), public.hdar_profile_get(text, text),
  public.hdar_area_send(text, double precision, double precision, text, text),
  public.hdar_area_feed(text, double precision, double precision), public.hdar_area_hide(text, uuid),
  public.hdar_conversations(text)
  to anon;
