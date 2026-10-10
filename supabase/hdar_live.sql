-- Presence + live chat for hdar. Tables live in the private `hdar` schema and
-- are only reachable through the validated public.hdar_* functions, which the
-- publishable (anon) key may call over /rest/v1/rpc.

create schema if not exists hdar;
revoke all on schema hdar from public, anon, authenticated;

create table hdar.profiles (
  user_id text primary key,
  pseudo text not null,
  lat double precision,
  lng double precision,
  desires text not null default '',
  visible_until timestamptz,
  updated_at timestamptz not null default now()
);
create index profiles_visible_idx on hdar.profiles (visible_until);

create table hdar.live_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  from_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index live_messages_thread_idx on hdar.live_messages (thread_id, created_at);

create table hdar.live_blocks (
  user_id text not null,
  blocked_id text not null,
  primary key (user_id, blocked_id)
);

create table hdar.live_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);

alter table hdar.profiles enable row level security;
alter table hdar.live_messages enable row level security;
alter table hdar.live_blocks enable row level security;
alter table hdar.live_reports enable row level security;

create or replace function hdar.check_id(p text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or p !~* '^[0-9a-f-]{36}$' then
    raise exception 'Identité invalide';
  end if;
  return lower(p);
end $$;

create or replace function hdar.thread_of(a text, b text) returns text
language sql immutable set search_path = '' as $$
  select case when a < b then a || ':' || b else b || ':' || a end
$$;

create or replace function hdar.is_blocked(a text, b text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from hdar.live_blocks
    where (user_id = a and blocked_id = b) or (user_id = b and blocked_id = a)
  )
$$;

create or replace function public.hdar_pulse(
  p_self text, p_lat double precision, p_lng double precision,
  p_pseudo text, p_desires text, p_hours int
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  ps text := coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme');
  h int := least(12, greatest(1, coalesce(p_hours, 3)));
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return;
  end if;
  insert into hdar.profiles (user_id, pseudo, lat, lng, desires, visible_until, updated_at)
  values (s, ps, p_lat, p_lng, left(coalesce(p_desires, ''), 80), now() + make_interval(hours => h), now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, lat = excluded.lat, lng = excluded.lng,
    desires = excluded.desires, visible_until = excluded.visible_until, updated_at = now();
end $$;

create or replace function public.hdar_go_dark(p_self text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update hdar.profiles set visible_until = now() where user_id = hdar.check_id(p_self);
end $$;

create or replace function public.hdar_list_live(p_self text)
returns table (id text, pseudo text, lat double precision, lng double precision, desires text)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.check_id(p_self);
begin
  return query
    select p.user_id, p.pseudo, p.lat, p.lng, p.desires
    from hdar.profiles p
    where p.visible_until > now()
      and p.user_id <> s
      and p.lat is not null
      and not hdar.is_blocked(s, p.user_id)
    limit 500;
end $$;

create or replace function public.hdar_read_thread(p_self text, p_with text)
returns table (id uuid, from_id text, body text, at text)
language plpgsql stable security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  w text := lower(left(coalesce(p_with, ''), 80));
begin
  if w = '' or w = s then return; end if;
  return query
    select m.id, m.from_id, m.body, m.created_at::text
    from (
      select * from hdar.live_messages
      where thread_id = hdar.thread_of(s, w)
      order by created_at desc
      limit 200
    ) m
    order by m.created_at asc;
end $$;

create or replace function public.hdar_send(p_self text, p_to text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  t text := lower(left(coalesce(p_to, ''), 80));
  b text := left(trim(coalesce(p_body, '')), 500);
begin
  if t = '' or b = '' or t = s then return; end if;
  if hdar.is_blocked(s, t) then return; end if;
  -- Light flood guard: at most 30 messages per sender per minute.
  if (select count(*) from hdar.live_messages
      where from_id = s and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de messages, patiente un peu';
  end if;
  insert into hdar.live_messages (thread_id, from_id, body) values (hdar.thread_of(s, t), s, b);
end $$;

create or replace function public.hdar_block(p_self text, p_other text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  o text := lower(left(coalesce(p_other, ''), 80));
begin
  if o = '' or o = s then return; end if;
  insert into hdar.live_blocks values (s, o), (o, s) on conflict do nothing;
end $$;

create or replace function public.hdar_report(p_self text, p_other text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  o text := lower(left(coalesce(p_other, ''), 80));
begin
  if o = '' or o = s then return; end if;
  insert into hdar.live_reports (reporter_id, target_id) values (s, o);
  insert into hdar.live_blocks values (s, o), (o, s) on conflict do nothing;
end $$;

revoke execute on function hdar.check_id(text), hdar.thread_of(text, text), hdar.is_blocked(text, text) from public, anon, authenticated;
revoke execute on function
  public.hdar_pulse(text, double precision, double precision, text, text, int),
  public.hdar_go_dark(text), public.hdar_list_live(text), public.hdar_read_thread(text, text),
  public.hdar_send(text, text, text), public.hdar_block(text, text), public.hdar_report(text, text)
  from public, authenticated;
grant execute on function
  public.hdar_pulse(text, double precision, double precision, text, text, int),
  public.hdar_go_dark(text), public.hdar_list_live(text), public.hdar_read_thread(text, text),
  public.hdar_send(text, text, text), public.hdar_block(text, text), public.hdar_report(text, text)
  to anon;
