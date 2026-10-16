-- v58 : parcours des visiteurs (sans contenu, sans position), salons de discussion
-- ouverts à tous (sans limite de distance) et vues admin des chats de lieux / notes des lieux.
-- Applied as migration hdar_v58_visitors_salons.

---------------------------------------------------------------- Parcours des visiteurs
-- Une ligne par appareil et par étape atteinte (première fois + nombre de fois). Aucune donnée
-- de contenu, aucune position. Effacé avec l'appareil (trigger) et après 400 jours.
alter table hdar.devices
  add column if not exists source text,
  add column if not exists landing text,
  add column if not exists platform text,
  add column if not exists pwa boolean,
  add column if not exists city text;

create table if not exists hdar.device_steps (
  device text not null, step text not null,
  first_at timestamptz not null default now(), last_at timestamptz not null default now(), n int not null default 1,
  primary key (device, step));
create index if not exists device_steps_step on hdar.device_steps (step, first_at);
alter table hdar.device_steps enable row level security;
revoke all on hdar.device_steps from anon, authenticated;

create or replace function public.hdar_track(p_steps text[], p_ctx jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); st text; k int := 0;
begin
  if s is null then return; end if;
  perform hdar.rate_check(s, 'track', 60, interval '1 minute');
  foreach st in array coalesce(p_steps, '{}'::text[]) loop
    k := k + 1;
    exit when k > 20;
    continue when st is null or st !~ '^[a-z0-9_:.-]{1,40}$';
    insert into hdar.device_steps as d (device, step) values (s, st)
    on conflict (device, step) do update set n = d.n + 1, last_at = now();
  end loop;
  if p_ctx is not null then
    update hdar.devices set
      source = coalesce(source, nullif(left(p_ctx ->> 'source', 80), '')),
      landing = coalesce(landing, nullif(left(p_ctx ->> 'landing', 120), '')),
      platform = coalesce(nullif(left(p_ctx ->> 'platform', 20), ''), platform),
      pwa = coalesce((p_ctx ->> 'pwa')::boolean, pwa)
    where id = s;
  end if;
end $$;
revoke all on function public.hdar_track(text[], jsonb) from public, anon;
grant execute on function public.hdar_track(text[], jsonb) to authenticated;

-- Écran d'entrée 18+ : compteurs horaires sans identifiant (le visiteur n'a pas encore de session).
-- Table à part pour ne pas gonfler les « messages » de l'onglet Horaires (msg_hourly).
create table if not exists hdar.gate_hourly (hour timestamptz not null, kind text not null, n int not null default 0, primary key (hour, kind));
alter table hdar.gate_hourly enable row level security;
revoke all on hdar.gate_hourly from anon, authenticated;
create or replace function public.hdar_gate(p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind in ('gate_view', 'gate_enter', 'gate_error') then
    insert into hdar.gate_hourly as g (hour, kind, n) values (date_trunc('hour', now()), p_kind, 1)
    on conflict (hour, kind) do update set n = g.n + 1;
  end if;
end $$;
revoke all on function public.hdar_gate(text) from public;
grant execute on function public.hdar_gate(text) to anon, authenticated;

-- Ville approximative aussi pour les visiteurs sans profil (admin seulement).
create or replace function public.hdar_set_city(p_city text) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if p_city is null or length(trim(p_city)) = 0 then return; end if;
  update hdar.profiles set city = left(trim(p_city), 80), city_at = now()
  where user_id = s and (city_at is null or city_at < now() - interval '1 hour');
  update hdar.devices set city = left(trim(p_city), 80) where id = s;
end $$;

---------------------------------------------------------------- Salons
create table if not exists hdar.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text, emoji text,
  creator_id text, official boolean not null default false, removed boolean not null default false,
  created_at timestamptz not null default now(), last_at timestamptz not null default now());
create unique index if not exists salons_name on hdar.salons (lower(name)) where not removed;
create table if not exists hdar.salon_messages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references hdar.salons (id) on delete cascade,
  from_id text not null, pseudo text not null, body text not null,
  removed boolean not null default false, created_at timestamptz not null default now());
create index if not exists salon_messages_feed on hdar.salon_messages (salon_id, created_at desc);
create index if not exists salon_messages_from on hdar.salon_messages (from_id);
alter table hdar.salons enable row level security;
alter table hdar.salon_messages enable row level security;
revoke all on hdar.salons, hdar.salon_messages from anon, authenticated;

insert into hdar.salons (name, description, emoji, official)
select v.* from (values
  ('Général', 'Discute avec tout le monde, partout en France', '💬', true),
  ('Montpellier', 'Sorties, plans et bons coins à Montpellier', '☀️', true),
  ('LGBT+', 'Entre nous, sans prise de tête', '🏳️‍🌈', true),
  ('Ce soir', 'Qui sort ce soir ? Où ça bouge ?', '🌙', true)) v(name, description, emoji, official)
where not exists (select 1 from hdar.salons s where lower(s.name) = lower(v.name) and not s.removed);

create or replace function hdar.salon_row(p_id uuid, s text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'name', x.name, 'description', x.description, 'emoji', x.emoji,
    'official', x.official, 'mine', x.creator_id = s, 'last_at', x.last_at,
    'recent', (select count(*) from hdar.salon_messages m where m.salon_id = x.id and not m.removed and m.created_at > now() - interval '24 hours'),
    'people', (select count(distinct m.from_id) from hdar.salon_messages m where m.salon_id = x.id and not m.removed and m.created_at > now() - interval '24 hours'))
  from hdar.salons x where x.id = p_id;
$$;
revoke execute on function hdar.salon_row(uuid, text) from public, anon, authenticated;

create or replace function public.hdar_salons() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(hdar.salon_row(x.id, s) order by x.official desc, x.last_at desc)
    from (select * from hdar.salons where not removed order by official desc, last_at desc limit 100) x), '[]'::jsonb);
end $$;

create or replace function public.hdar_salon_create(p_name text, p_description text, p_emoji text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); n text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 40); v_id uuid;
begin
  if s is null then raise exception 'Session requise'; end if;
  if not exists (select 1 from hdar.profiles p where p.user_id = s and p.profile_at is not null) then
    raise exception 'Crée ton profil pour ouvrir un salon';
  end if;
  if exists (select 1 from hdar.bans b where b.user_id = s and b.active) then raise exception 'Compte suspendu'; end if;
  if length(n) < 3 then raise exception 'Nom trop court (3 caractères minimum)'; end if;
  if (select count(*) from hdar.salons where creator_id = s and not removed) >= 3 then
    raise exception 'Tu as déjà 3 salons ouverts';
  end if;
  perform hdar.rate_check(s, 'salon_create', 3, interval '1 day');
  if exists (select 1 from hdar.salons where lower(name) = lower(n) and not removed) then
    raise exception 'Ce salon existe déjà';
  end if;
  insert into hdar.salons (name, description, emoji, creator_id)
  values (n, nullif(left(trim(coalesce(p_description, '')), 120), ''), nullif(left(trim(coalesce(p_emoji, '')), 8), ''), s)
  returning salons.id into v_id;
  return v_id;
end $$;

create or replace function public.hdar_salon_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return (select hdar.salon_row(x.id, s) from hdar.salons x where x.id = p_id and not x.removed);
end $$;

create or replace function public.hdar_salon_messages(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
      'at', m.created_at, 'mine', m.from_id = s) order by m.created_at)
    from (select * from hdar.salon_messages m where m.salon_id = p_id and not m.removed and not hdar.is_blocked(s, m.from_id)
          order by m.created_at desc limit 150) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_salon_send(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); b text := left(trim(coalesce(p_body, '')), 500); ps text;
begin
  if s is null then raise exception 'Session requise'; end if;
  if b = '' then return; end if;
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  if not exists (select 1 from hdar.salons x where x.id = p_id and not x.removed) then raise exception 'Ce salon est fermé'; end if;
  perform hdar.rate_check(s, 'salon', 10, interval '1 minute');
  select coalesce(nullif(p.pseudo, ''), 'Anonyme') into ps from hdar.profiles p where p.user_id = s and p.profile_at is not null;
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body) values (p_id, s, coalesce(ps, 'Anonyme'), b);
  update hdar.salons set last_at = now() where id = p_id;
  perform hdar.bump_msg('salon');
end $$;

-- Retirer : son propre message, ou n'importe quel message de son salon.
create or replace function public.hdar_salon_hide(p_msg uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  update hdar.salon_messages m set removed = true
  where m.id = p_msg and (m.from_id = s or exists (select 1 from hdar.salons x where x.id = m.salon_id and x.creator_id = s));
end $$;

create or replace function public.hdar_salon_close(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  update hdar.salons set removed = true where id = p_id and creator_id = s and not official;
end $$;

-- Purge : messages > 7 jours ; salons d'utilisateurs sans message depuis 14 jours.
create or replace function hdar.salons_purge() returns void
language sql security definer set search_path = '' as $$
  delete from hdar.salon_messages where created_at < now() - interval '7 days';
  update hdar.salons set removed = true where not official and not removed and last_at < now() - interval '14 days';
  delete from hdar.device_steps where last_at < now() - interval '400 days';
  delete from hdar.gate_hourly where hour < now() - interval '400 days';
$$;
revoke execute on function hdar.salons_purge() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'hdar-salons-purge';
select cron.schedule('hdar-salons-purge', '23 * * * *', 'select hdar.salons_purge()');

-- Effacement avec l'appareil (Supprimer mes données, purge de confidentialité).
create or replace function hdar.on_device_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from hdar.device_steps where device = old.id;
  delete from hdar.salon_messages where from_id = old.id;
  update hdar.salons set removed = true, creator_id = null where creator_id = old.id and not official;
  return null;
end $$;
revoke execute on function hdar.on_device_delete() from public, anon, authenticated;
drop trigger if exists device_forget on hdar.devices;
create trigger device_forget after delete on hdar.devices for each row execute function hdar.on_device_delete();

---------------------------------------------------------------- Admin
-- Visiteurs : entonnoir, sources, appareils et liste détaillée (sans contenu ni position).
create or replace function public.hdar_admin_visitors(p_key text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 400); since timestamptz := now() - make_interval(days => d);
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'tracked_since', (select min(first_at) from hdar.device_steps),
    'gate', coalesce((select jsonb_object_agg(kind, n) from (
        select h.kind, sum(h.n) n from hdar.gate_hourly h where h.hour > since group by 1) g), '{}'::jsonb),
    'total', (select count(*) from hdar.devices where first_seen > since),
    'with_profile', (select count(*) from hdar.devices v join hdar.profiles p on p.user_id = v.id and p.profile_at is not null where v.first_seen > since),
    'bounce', (select count(*) from hdar.devices where first_seen > since and last_seen < first_seen + interval '2 minutes' and sessions <= 1),
    'returning', (select count(*) from hdar.devices v where v.first_seen > since and (select count(*) from hdar.daily_visits x where x.device = v.id) > 1),
    'steps', coalesce((select jsonb_object_agg(step, n) from (
        select s.step, count(*) n from hdar.device_steps s join hdar.devices v on v.id = s.device
        where v.first_seen > since group by 1) q), '{}'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n, 'p', p) order by n desc) from (
        select coalesce(v.source, '?') k, count(*) n, count(p.user_id) p from hdar.devices v
        left join hdar.profiles p on p.user_id = v.id and p.profile_at is not null
        where v.first_seen > since group by 1 order by 2 desc limit 15) q), '[]'::jsonb),
    'landings', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n, 'p', p) order by n desc) from (
        select coalesce(v.landing, '?') k, count(*) n, count(p.user_id) p from hdar.devices v
        left join hdar.profiles p on p.user_id = v.id and p.profile_at is not null
        where v.first_seen > since group by 1 order by 2 desc limit 15) q), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n, 'p', p) order by n desc) from (
        select coalesce(v.platform, '?') k, count(*) n, count(p.user_id) p from hdar.devices v
        left join hdar.profiles p on p.user_id = v.id and p.profile_at is not null
        where v.first_seen > since group by 1 order by 2 desc) q), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(r order by r ->> 'last' desc) from (
        select jsonb_build_object('id', v.id, 'first', v.first_seen, 'last', v.last_seen, 'sessions', v.sessions,
          'days', (select count(*) from hdar.daily_visits x where x.device = v.id),
          'city', coalesce(p.city, v.city), 'source', v.source, 'landing', v.landing, 'platform', v.platform, 'pwa', v.pwa,
          'profile', p.profile_at is not null, 'pseudo', case when p.profile_at is not null then p.pseudo end,
          'pm', (select coalesce(sum(u.pm), 0) from hdar.user_daily u where u.user_id = v.id),
          'area', (select coalesce(sum(u.area), 0) from hdar.user_daily u where u.user_id = v.id),
          'place', (select coalesce(sum(u.place + u.spot), 0) from hdar.user_daily u where u.user_id = v.id),
          'steps', coalesce((select jsonb_agg(s.step order by s.first_at) from hdar.device_steps s where s.device = v.id), '[]'::jsonb)) r
        from hdar.devices v left join hdar.profiles p on p.user_id = v.id
        where v.first_seen > since or v.last_seen > since
        order by v.last_seen desc limit 300) q), '[]'::jsonb));
end $$;

-- Messages des chats de lieux et des spots (purgés après 24 h côté appli).
create or replace function public.hdar_admin_place_msgs(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(q.x order by q.at desc) from (
    select * from (
      select m.created_at at, jsonb_build_object('id', m.id, 'scope', 'place', 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
        'kind', m.kind, 'at', m.created_at, 'removed', m.removed, 'where', p.name, 'where_id', p.id) x
      from hdar.place_messages m join hdar.places p on p.id = m.place_id
      union all
      select m.created_at, jsonb_build_object('id', m.id, 'scope', 'spot', 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
        'kind', m.kind, 'at', m.created_at, 'removed', m.removed, 'where', sp.title, 'where_id', sp.id)
      from hdar.spot_messages m join hdar.spots sp on sp.id = m.spot_id) u
    order by u.at desc limit 200) q), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_hide_msg(p_key text, p_scope text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  if p_scope = 'place' then update hdar.place_messages set removed = true where id = p_id;
  elsif p_scope = 'spot' then update hdar.spot_messages set removed = true where id = p_id;
  elsif p_scope = 'salon' then update hdar.salon_messages set removed = true where id = p_id;
  elsif p_scope = 'area' then update hdar.area_messages set removed = true where id = p_id;
  end if;
end $$;

-- Notes des lieux : moyenne, nombre de notes, d'avis, répartition.
create or replace function public.hdar_admin_ratings(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(x order by (x ->> 'last') desc nulls last) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'partner', coalesce(p.partner and p.partner_until > now(), false),
      'avg', round((select avg(r.stars) from hdar.place_ratings r where r.place_id = p.id)::numeric, 2),
      'n', (select count(*) from hdar.place_ratings r where r.place_id = p.id),
      'dist', (select jsonb_object_agg(r.stars, r.c) from (select stars, count(*) c from hdar.place_ratings where place_id = p.id group by 1) r),
      'comments', (select count(*) from hdar.place_comments c where c.place_id = p.id),
      'last', greatest((select max(r.updated_at) from hdar.place_ratings r where r.place_id = p.id),
                       (select max(c.created_at) from hdar.place_comments c where c.place_id = p.id))) x
    from hdar.places p
    where exists (select 1 from hdar.place_ratings r where r.place_id = p.id)
       or exists (select 1 from hdar.place_comments c where c.place_id = p.id)) q), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_salons(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(x order by (x ->> 'removed')::boolean, x ->> 'last_at' desc) from (
    select jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'emoji', s.emoji, 'official', s.official,
      'removed', s.removed, 'created_at', s.created_at, 'last_at', s.last_at, 'creator_id', s.creator_id,
      'creator', (select p.pseudo from hdar.profiles p where p.user_id = s.creator_id),
      'messages', (select count(*) from hdar.salon_messages m where m.salon_id = s.id),
      'people', (select count(distinct m.from_id) from hdar.salon_messages m where m.salon_id = s.id)) x
    from hdar.salons s order by s.last_at desc limit 200) q), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_salon_messages(p_key text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
      'at', m.created_at, 'removed', m.removed) order by m.created_at desc)
    from (select * from hdar.salon_messages where salon_id = p_id order by created_at desc limit 300) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_salon_set(p_key text, p_id uuid, p_removed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.salons set removed = p_removed where id = p_id;
end $$;

create or replace function public.hdar_admin_salon_create(p_key text, p_name text, p_description text, p_emoji text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform hdar.admin_check(p_key);
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Nom trop court'; end if;
  insert into hdar.salons (name, description, emoji, official)
  values (left(trim(p_name), 40), nullif(left(trim(coalesce(p_description, '')), 120), ''), nullif(left(trim(coalesce(p_emoji, '')), 8), ''), true)
  returning salons.id into v_id;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['hdar_salons()', 'hdar_salon_create(text, text, text)', 'hdar_salon_get(uuid)', 'hdar_salon_messages(uuid)',
    'hdar_salon_send(uuid, text)', 'hdar_salon_hide(uuid)', 'hdar_salon_close(uuid)',
    'hdar_admin_visitors(text, int)', 'hdar_admin_place_msgs(text)', 'hdar_admin_hide_msg(text, text, uuid)', 'hdar_admin_ratings(text)',
    'hdar_admin_salons(text)', 'hdar_admin_salon_messages(text, uuid)', 'hdar_admin_salon_set(text, uuid, boolean)',
    'hdar_admin_salon_create(text, text, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
