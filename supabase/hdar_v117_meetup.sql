-- hdar v117 — « Se retrouver » dans le chat privé (consentement mutuel, 15 min max, 18+).
-- NON APPLIQUÉE EN PROD : à relire puis appliquer manuellement.
-- Données : seule la session (qui, quand, statut) est enregistrée. Les positions précises, la boussole et
-- « Fais-toi voir » passent UNIQUEMENT par Supabase Realtime Broadcast (canal privé meet:<id>) : rien n'est stocké.
-- Les sessions terminées sont purgées après 24 h (RGPD : minimisation).
-- Règles : uniquement entre deux personnes qui se sont déjà écrit (les DEUX ont envoyé au moins un message),
-- avec profil (donc 18+ validé à l'inscription), sans blocage ; une seule session ouverte par conversation.

create table if not exists hdar.meetups (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  from_id text not null,
  to_id text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  expires_at timestamptz not null default now() + interval '5 minutes',
  ended_by text
);
create index if not exists meetups_thread_idx on hdar.meetups (thread_id, created_at desc);
alter table hdar.meetups enable row level security; -- aucun accès direct : tout passe par les fonctions ci-dessous
revoke all on hdar.meetups from public, anon, authenticated;

-- Expire / purge (appelée par chaque fonction, pas besoin de cron).
create or replace function hdar.meet_gc() returns void
language sql security definer set search_path to '' as $$
  update hdar.meetups set status = 'ended', ended_by = coalesce(ended_by, 'timeout') where status <> 'ended' and expires_at < now();
  delete from hdar.meetups where status = 'ended' and created_at < now() - interval '24 hours';
$$;

create or replace function hdar.meet_row(m hdar.meetups, s text) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object('id', m.id, 'status', m.status, 'mine', m.from_id = s, 'started_at', m.started_at,
    'expires_at', m.expires_at, 'ended_by', case when m.ended_by is null then null when m.ended_by = s then 'me' when m.ended_by = 'timeout' then 'timeout' else 'other' end,
    'topic', case when m.status = 'active' then 'meet:' || m.id::text end, 'me', s);
$$;

create or replace function hdar.meet_allowed(a text, b text) returns boolean
language sql stable security definer set search_path to '' as $$
  select a <> b
    and exists (select 1 from hdar.profiles p where p.user_id = a)
    and exists (select 1 from hdar.profiles p where p.user_id = b)
    and not hdar.is_blocked(a, b)
    and exists (select 1 from hdar.live_messages m where m.thread_id = hdar.thread_of(a, b) and m.from_id = a)
    and exists (select 1 from hdar.live_messages m where m.thread_id = hdar.thread_of(a, b) and m.from_id = b);
$$;

-- État courant avec quelqu'un (la plus récente session de moins de 10 min après sa fin), ou null.
create or replace function public.hdar_meet_state(p_with text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); m hdar.meetups;
begin
  if s is null or p_with is null then return null; end if;
  perform hdar.meet_gc();
  select * into m from hdar.meetups x where x.thread_id = hdar.thread_of(s, p_with)
    and (x.status <> 'ended' or x.expires_at > now() - interval '10 minutes') order by x.created_at desc limit 1;
  if m.id is null then return jsonb_build_object('allowed', hdar.meet_allowed(s, p_with)); end if;
  return hdar.meet_row(m, s) || jsonb_build_object('allowed', hdar.meet_allowed(s, p_with));
end $$;

create or replace function public.hdar_meet_propose(p_to text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); m hdar.meetups; th text;
begin
  if s is null then raise exception 'Connexion requise'; end if;
  if not hdar.meet_allowed(s, p_to) then raise exception 'Possible seulement avec quelqu''un avec qui tu as déjà échangé'; end if;
  perform hdar.meet_gc();
  th := hdar.thread_of(s, p_to);
  if exists (select 1 from hdar.meetups x where x.thread_id = th and x.status <> 'ended') then raise exception 'Une demande est déjà en cours'; end if;
  if (select count(*) from hdar.meetups x where x.from_id = s and x.created_at > now() - interval '1 hour') >= 6 then raise exception 'Trop de demandes, réessaie plus tard'; end if;
  insert into hdar.meetups (thread_id, from_id, to_id) values (th, s, p_to) returning * into m;
  return hdar.meet_row(m, s);
end $$;

create or replace function public.hdar_meet_accept(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); m hdar.meetups;
begin
  perform hdar.meet_gc();
  update hdar.meetups set status = 'active', started_at = now(), expires_at = now() + interval '15 minutes'
    where id = p_id and to_id = s and status = 'pending' and hdar.meet_allowed(from_id, to_id) returning * into m;
  if m.id is null then raise exception 'Demande expirée'; end if;
  return hdar.meet_row(m, s);
end $$;

-- Refuser, annuler ou arrêter : chacun peut le faire à tout moment.
create or replace function public.hdar_meet_stop(p_id uuid) returns void
language sql security definer set search_path to '' as $$
  update hdar.meetups set status = 'ended', ended_by = hdar.self_id(), expires_at = now()
    where id = p_id and status <> 'ended' and hdar.self_id() in (from_id, to_id);
$$;

-- Canal privé meet:<id> : seulement les 2 participants, seulement pendant la session active.
create or replace function hdar.meet_topic_ok(p_topic text) returns boolean
language plpgsql stable security definer set search_path to '' as $$
declare s text;
begin
  if p_topic !~ '^meet:[0-9a-f-]{36}$' then return false; end if;
  begin s := hdar.self_id(); exception when others then return false; end;
  return exists (select 1 from hdar.meetups m where m.id::text = substr(p_topic, 6) and m.status = 'active'
    and m.expires_at > now() and s in (m.from_id, m.to_id) and not hdar.is_blocked(m.from_id, m.to_id));
end $$;

drop policy if exists hdar_meet_read on realtime.messages;
create policy hdar_meet_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and hdar.meet_topic_ok(realtime.topic()));
drop policy if exists hdar_meet_send on realtime.messages;
create policy hdar_meet_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and hdar.meet_topic_ok(realtime.topic()));

revoke all on function hdar.meet_gc(), hdar.meet_row(hdar.meetups, text), hdar.meet_allowed(text, text) from public, anon, authenticated;
revoke all on function hdar.meet_topic_ok(text) from public, anon;
grant execute on function hdar.meet_topic_ok(text) to authenticated;
revoke all on function public.hdar_meet_state(text), public.hdar_meet_propose(text), public.hdar_meet_accept(uuid), public.hdar_meet_stop(uuid) from public, anon;
grant execute on function public.hdar_meet_state(text), public.hdar_meet_propose(text), public.hdar_meet_accept(uuid), public.hdar_meet_stop(uuid) to authenticated;
