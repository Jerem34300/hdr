-- v64 : (1) l'admin lit en entier les conversations privées signalées (les deux sens, médias
-- compris) — seulement entre la personne signalée et celle qui l'a signalée ; chaque lecture est
-- journalisée. (2) Journal des connexions (adresse IP, navigateur, première / dernière fois) gardé
-- 1 an, obligation légale de conservation des données de connexion (LCEN).
-- Applied as migration hdar_v64_reports_ip.

---------------------------------------------------------------- Conversations signalées
create table if not exists hdar.admin_reads (
  id bigint generated always as identity primary key,
  admin_auth uuid, a text not null, b text not null, at timestamptz not null default now());
alter table hdar.admin_reads enable row level security;
revoke all on hdar.admin_reads from anon, authenticated;

-- Conversations de p_id avec quelqu'un qui l'a signalé ou qu'il a signalé.
create or replace function public.hdar_admin_reported_threads(p_key text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o text := lower(left(coalesce(p_id, ''), 80));
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(x order by x ->> 'last' desc nulls last) from (
    select jsonb_build_object('other', k.other, 'pseudo', coalesce(p.pseudo, 'Anonyme'),
      'reported_by_other', k.by_other, 'reported_other', k.by_me,
      'n', (select count(*) from hdar.live_messages m where m.thread_id = hdar.thread_of(o, k.other)),
      'last', (select max(m.created_at) from hdar.live_messages m where m.thread_id = hdar.thread_of(o, k.other))) x
    from (select other, bool_or(by_other) by_other, bool_or(not by_other) by_me from (
            select r.reporter_id other, true by_other from hdar.live_reports r where r.target_id = o
            union all
            select r.target_id, false from hdar.live_reports r where r.reporter_id = o) u
          where other <> o group by other) k
    left join hdar.profiles p on p.user_id = k.other) q), '[]'::jsonb);
end $$;

-- Toute la conversation entre a et b, si l'un a signalé l'autre (lecture journalisée).
create or replace function public.hdar_admin_thread(p_key text, p_a text, p_b text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a text := lower(left(coalesce(p_a, ''), 80)); b text := lower(left(coalesce(p_b, ''), 80));
begin
  perform hdar.admin_check(p_key);
  if not exists (select 1 from hdar.live_reports r
                 where (r.reporter_id = a and r.target_id = b) or (r.reporter_id = b and r.target_id = a)) then
    raise exception 'Conversation non signalée : lecture impossible';
  end if;
  insert into hdar.admin_reads (admin_auth, a, b) values (auth.uid(), a, b);
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id,
      'pseudo', coalesce((select p.pseudo from hdar.profiles p where p.user_id = m.from_id), 'Anonyme'),
      'kind', coalesce(m.kind, 'text'), 'body', m.body, 'media', m.media, 'duration', m.duration, 'at', m.created_at)
      order by m.created_at)
    from (select * from hdar.live_messages m where m.thread_id = hdar.thread_of(a, b)
          order by m.created_at desc limit 500) m), '[]'::jsonb);
end $$;

---------------------------------------------------------------- Journal des connexions (1 an)
create table if not exists hdar.connection_log (
  user_id text not null, ip text not null, ua text,
  first_at timestamptz not null default now(), last_at timestamptz not null default now(),
  hits int not null default 1,
  primary key (user_id, ip));
create index if not exists connection_log_last on hdar.connection_log (last_at);
create index if not exists connection_log_ip on hdar.connection_log (ip);
alter table hdar.connection_log enable row level security;
revoke all on hdar.connection_log from anon, authenticated;

-- À chaque battement de l'appli (hdar_hit, toutes les 2 min) : on note l'IP de la requête.
create or replace function hdar.log_connection_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h json; ip text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then return null;
  end;
  ip := nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1)), '');
  if ip is null then return null; end if;
  insert into hdar.connection_log as c (user_id, ip, ua) values (new.id, left(ip, 64), left(h ->> 'user-agent', 300))
  on conflict (user_id, ip) do update set last_at = now(), hits = c.hits + 1, ua = coalesce(excluded.ua, c.ua);
  return null;
exception when others then return null;
end $$;
revoke execute on function hdar.log_connection_trg() from public, anon, authenticated;
drop trigger if exists device_connection_log on hdar.devices;
create trigger device_connection_log after insert or update of last_seen on hdar.devices
  for each row execute function hdar.log_connection_trg();

create or replace function hdar.connection_log_purge() returns void
language sql security definer set search_path = '' as $$
  delete from hdar.connection_log where last_at < now() - interval '1 year';
  delete from hdar.admin_reads where at < now() - interval '1 year';
$$;
revoke execute on function hdar.connection_log_purge() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'hdar-connection-log-purge';
select cron.schedule('hdar-connection-log-purge', '17 3 * * *', 'select hdar.connection_log_purge()');

create or replace function public.hdar_admin_user_ips(p_key text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o text := lower(left(coalesce(p_id, ''), 80));
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('ip', c.ip, 'ua', c.ua, 'first', c.first_at, 'last', c.last_at, 'hits', c.hits,
      'others', (select count(distinct x.user_id) from hdar.connection_log x where x.ip = c.ip and x.user_id <> o))
      order by c.last_at desc)
    from hdar.connection_log c where c.user_id = o), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['hdar_admin_reported_threads(text, text)', 'hdar_admin_thread(text, text, text)',
    'hdar_admin_user_ips(text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
