-- hdar v14 — Web Push (nouveau message, favori sur la carte)
-- Secrets (clé privée VAPID, secret du relais) : dans Supabase Vault, insérés à part
-- (jamais dans le dépôt) :
--   select vault.create_secret('<vapid_private>', 'hdar_vapid_private');
--   select vault.create_secret('<relay_secret>', 'hdar_push_relay');
create extension if not exists pg_net;

create table if not exists hdar.push_subs (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on hdar.push_subs (user_id);
alter table hdar.push_subs enable row level security;

create table if not exists hdar.push_sent (
  user_id text not null,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table hdar.push_sent enable row level security;

create or replace function public.hdar_push_subscribe(p_self text, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.rate_check(s, 'pushsub', 10, interval '1 hour');
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(coalesce(p_p256dh, '')) > 200
     or length(coalesce(p_auth, '')) > 100 then
    raise exception 'Abonnement invalide';
  end if;
  insert into hdar.push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, s, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  delete from hdar.push_subs where user_id = s and endpoint <> p_endpoint
    and endpoint not in (select endpoint from hdar.push_subs where user_id = s order by created_at desc limit 5);
end $$;

create or replace function public.hdar_push_unsubscribe(p_self text, p_endpoint text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  delete from hdar.push_subs where user_id = s and (p_endpoint is null or endpoint = p_endpoint);
end $$;
revoke execute on function public.hdar_push_subscribe(text, text, text, text), public.hdar_push_unsubscribe(text, text) from public, anon;
grant execute on function public.hdar_push_subscribe(text, text, text, text), public.hdar_push_unsubscribe(text, text) to authenticated;

-- Envoie (asynchrone, pg_net) une notification à un utilisateur. Throttle : 1 par (kind, ref) par fenêtre.
create or replace function hdar.push_to(p_user text, p_kind text, p_ref text, p_window interval, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare subs jsonb; vk text; sec text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
    into subs from hdar.push_subs where user_id = p_user;
  if jsonb_array_length(subs) = 0 then return; end if;
  if exists (select 1 from hdar.push_sent where user_id = p_user and kind = p_kind and ref = p_ref
             and sent_at > now() - p_window) then return; end if;
  insert into hdar.push_sent (user_id, kind, ref) values (p_user, p_kind, p_ref)
    on conflict (user_id, kind, ref) do update set sent_at = now();
  select decrypted_secret into vk from vault.decrypted_secrets where name = 'hdar_vapid_private';
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'hdar_push_relay';
  if vk is null or sec is null then return; end if;
  perform net.http_post(
    url := 'https://hoomzhgqzwuystwburfa.supabase.co/functions/v1/hdar-push',
    body := jsonb_build_object('secret', sec, 'vapid_private', vk, 'subs', subs, 'payload', p_payload),
    headers := '{"content-type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
exception when others then
  -- une notification ne doit jamais bloquer un message
  return;
end $$;

create or replace function hdar.push_message_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a text := split_part(new.thread_id, ':', 1); b text := split_part(new.thread_id, ':', 2); t text; ps text;
begin
  t := case when a = new.from_id then b else a end;
  if t is null or t = '' or hdar.is_blocked(t, new.from_id) then return new; end if;
  select coalesce(pseudo, 'Quelqu''un') into ps from hdar.profiles where user_id = new.from_id;
  perform hdar.push_to(t, 'msg', new.from_id, interval '20 seconds', jsonb_build_object(
    'type', 'message', 'title', coalesce(ps, 'Quelqu''un') || ' t''a écrit',
    'body', case new.kind when 'image' then '📷 Photo' when 'audio' then '🎤 Vocal' when 'location' then '📍 Position' else 'Nouveau message' end,
    'tag', 'msg-' || new.from_id, 'url', '/?chat=' || new.from_id));
  return new;
end $$;
drop trigger if exists live_messages_push on hdar.live_messages;
create trigger live_messages_push after insert on hdar.live_messages
  for each row execute function hdar.push_message_trg();

create or replace function hdar.push_favorite_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  if new.visible_until is null or new.visible_until <= now()
     or (old.visible_until is not null and old.visible_until > now()) then
    return new;
  end if;
  for f in select fv.user_id from hdar.favorites fv where fv.fav_id = new.user_id
             and not hdar.is_blocked(fv.user_id, new.user_id) limit 200 loop
    perform hdar.push_to(f.user_id, 'fav', new.user_id, interval '2 hours', jsonb_build_object(
      'type', 'favorite', 'title', '★ ' || coalesce(new.pseudo, 'Un favori') || ' est sur la carte',
      'body', 'Ton favori vient d''apparaître près de toi.', 'tag', 'fav-' || new.user_id, 'url', '/'));
  end loop;
  return new;
end $$;
drop trigger if exists profiles_push_favorite on hdar.profiles;
create trigger profiles_push_favorite after update of visible_until on hdar.profiles
  for each row execute function hdar.push_favorite_trg();

revoke execute on function hdar.push_to(text, text, text, interval, jsonb), hdar.push_message_trg(), hdar.push_favorite_trg()
  from public, anon, authenticated;

-- suppression de compte : retirer aussi les abonnements push
create or replace function public.hdar_delete_me()
returns void language plpgsql volatile security definer set search_path = '' as $$
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
  delete from hdar.spots where creator_id = s;
  delete from hdar.rate_limits where user_id = s;
  delete from hdar.push_subs where user_id = s;
  delete from hdar.push_sent where user_id = s;
  delete from hdar.daily_visits where device = s;
  delete from hdar.devices where id = s;
  delete from hdar.profiles where user_id = s;
  delete from hdar.identities where user_id = s;
  delete from auth.users where id = u;
end $$;

create or replace function hdar.purge_push() returns void language sql security definer set search_path = '' as $$
  delete from hdar.push_sent where sent_at < now() - interval '1 day';
$$;
select cron.unschedule(jobid) from cron.job where jobname = 'hdar-purge-push';
select cron.schedule('hdar-purge-push', '17 * * * *', 'select hdar.purge_push()');
