-- hdar v140 — « Préviens-moi quand quelqu'un arrive près de moi ».
-- Constat du 9 nov. : 891 appareils répartis sur 342 villes, 87 % ne reviennent jamais, 17 abonnés push.
-- Sur un radar vide, le visiteur peut demander à être prévenu : une notification (sans pseudo ni
-- position) quand un profil devient visible à moins de 30 km, au plus une toutes les 12 h.
-- NE PAS appliquer sans feu vert Jérémy.

-- 1) Une alerte par personne. Position arrondie à ~1 km, jamais renvoyée au client.
create table if not exists hdar.near_alerts (
  user_id text primary key,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists near_alerts_geo on hdar.near_alerts (lat, lng);
alter table hdar.near_alerts enable row level security;
revoke all on hdar.near_alerts from public, anon, authenticated;

-- 2) Activer / couper / relire son alerte.
create or replace function public.hdar_near_alert_set(p_lat double precision, p_lng double precision, p_on boolean)
returns boolean language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.rate_check(s, 'nearalert', 20, interval '1 hour');
  if not coalesce(p_on, false) then
    delete from hdar.near_alerts where user_id = s;
    return false;
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position inconnue';
  end if;
  insert into hdar.near_alerts (user_id, lat, lng)
  values (s, round(p_lat::numeric, 2), round(p_lng::numeric, 2))
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, created_at = now();
  return true;
end $$;

create or replace function public.hdar_near_alert_get()
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from hdar.near_alerts where user_id = hdar.self_id());
$$;

revoke all on function public.hdar_near_alert_set(double precision, double precision, boolean), public.hdar_near_alert_get() from public, anon;
grant execute on function public.hdar_near_alert_set(double precision, double precision, boolean), public.hdar_near_alert_get() to authenticated, service_role;

-- 3) push_to : le type « near » rejoint la liste des notifications autorisées (reste inchangé).
create or replace function hdar.push_to(p_user text, p_kind text, p_ref text, p_window interval, p_payload jsonb)
returns void language plpgsql security definer set search_path to '' as $function$
declare subs jsonb; vk text; sec text; meet boolean := p_kind in ('meet', 'meetflash');
begin
  if p_kind not in ('msg', 'call', 'reply', 'meet', 'meetflash', 'near') then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
    into subs from hdar.push_subs where user_id = p_user;
  if jsonb_array_length(subs) = 0 then return; end if;
  if exists (select 1 from hdar.push_sent where user_id = p_user and kind = p_kind and ref = p_ref
             and sent_at > now() - case when meet then p_window else greatest(p_window, interval '3 minutes') end) then return; end if;
  if not meet and ((select count(*) from hdar.push_log where user_id = p_user and sent_at > now() - interval '24 hours') >= 20
     or (select count(*) from hdar.push_log where user_id = p_user and sent_at > now() - interval '1 hour') >= 6) then return; end if;
  insert into hdar.push_sent (user_id, kind, ref) values (p_user, p_kind, p_ref)
    on conflict (user_id, kind, ref) do update set sent_at = now();
  insert into hdar.push_log (user_id, kind) values (p_user, p_kind);
  delete from hdar.push_log where sent_at < now() - interval '7 days';
  select decrypted_secret into vk from vault.decrypted_secrets where name = 'hdar_vapid_private';
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'hdar_push_relay';
  if vk is null or sec is null then return; end if;
  perform net.http_post(
    url := 'https://hoomzhgqzwuystwburfa.supabase.co/functions/v1/hdar-push',
    body := jsonb_build_object('secret', sec, 'vapid_private', vk, 'subs', subs, 'payload', p_payload),
    headers := '{"content-type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000);
exception when others then return;
end $function$;

-- 4) Quelqu'un devient visible → on prévient les alertes à moins de 30 km (25 au plus par apparition).
--    Jamais le bot, jamais une personne bloquée, et seulement si le genre correspond à ce que cherche
--    la personne prévenue (quand les deux l'ont renseigné). Le texte est choisi par le service worker.
create or replace function hdar.near_alert_trg() returns trigger
language plpgsql security definer set search_path to '' as $$
declare a record;
begin
  if new.visible_until is null or new.visible_until <= now() or new.lat is null or new.lng is null then return new; end if;
  if tg_op = 'UPDATE' and old.visible_until is not null and old.visible_until > now() then return new; end if;
  if new.user_id = hdar.bot_id() then return new; end if;
  for a in
    select n.user_id from hdar.near_alerts n
    left join hdar.profiles o on o.user_id = n.user_id
    where n.user_id <> new.user_id
      and n.lat between new.lat - 0.27 and new.lat + 0.27
      and n.lng between new.lng - 0.27 / greatest(cos(radians(new.lat)), 0.2) and new.lng + 0.27 / greatest(cos(radians(new.lat)), 0.2)
      and 6371 * 2 * asin(sqrt(power(sin(radians(n.lat - new.lat) / 2), 2)
            + cos(radians(new.lat)) * cos(radians(n.lat)) * power(sin(radians(n.lng - new.lng) / 2), 2))) <= 30
      and (n.last_sent_at is null or n.last_sent_at < now() - interval '12 hours')
      and (nullif(o.seeking, '') is null or nullif(new.iam, '') is null or new.iam = any (string_to_array(o.seeking, ',')))
      and not hdar.is_blocked(n.user_id, new.user_id)
    order by n.last_sent_at nulls first
    limit 25
  loop
    update hdar.near_alerts set last_sent_at = now() where user_id = a.user_id;
    perform hdar.push_to(a.user_id, 'near', 'near', interval '12 hours',
      jsonb_build_object('type', 'near', 'tag', 'hdar-near', 'url', '/'));
  end loop;
  return new;
exception when others then return new; -- une alerte ne doit jamais empêcher quelqu'un de se montrer
end $$;
drop trigger if exists near_alert on hdar.profiles;
create trigger near_alert after insert or update of visible_until on hdar.profiles
  for each row execute function hdar.near_alert_trg();

-- 5) RGPD : identité supprimée (« Supprimer mes données ») → alerte supprimée ; alerte oubliée après 60 jours.
create or replace function hdar.near_alerts_identity_gone() returns trigger
language plpgsql security definer set search_path to '' as $$
begin delete from hdar.near_alerts where user_id = old.user_id; return old; end $$;
drop trigger if exists near_alerts_identity_gone on hdar.identities;
create trigger near_alerts_identity_gone after delete on hdar.identities
  for each row execute function hdar.near_alerts_identity_gone();

revoke all on function hdar.near_alert_trg(), hdar.near_alerts_identity_gone() from public, anon, authenticated;

select cron.unschedule('hdar-near-alerts-purge') where exists (select 1 from cron.job where jobname = 'hdar-near-alerts-purge');
select cron.schedule('hdar-near-alerts-purge', '29 4 * * *', $$delete from hdar.near_alerts where created_at < now() - interval '60 days'$$);
