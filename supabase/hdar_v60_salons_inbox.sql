-- v60 : salons dans la boîte de réception (non lus, dernier message, réponses à moi) et notification
-- push quand quelqu'un répond à ton message dans un salon ou dans le chat du quartier.
-- Applied as migration hdar_v60_salons_inbox.

create or replace function hdar.safe_ts(p text) returns timestamptz
language plpgsql stable set search_path = '' as $$
begin
  return greatest(coalesce(p::timestamptz, now()), now() - interval '24 hours');
exception when others then return now();
end $$;

-- p_seen : { "<salon_id>": "<ISO date de dernière lecture>" } pour les salons suivis sur cet appareil.
create or replace function public.hdar_salons_inbox(p_seen jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
    from (select * from hdar.salons where not removed order by official desc, last_at desc limit 100) x), '[]'::jsonb);
end $$;

-- Push : les réponses à tes messages (salons, quartier) en plus des messages privés et appels.
create or replace function hdar.push_to(p_user text, p_kind text, p_ref text, p_window interval, p_payload jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare subs jsonb; vk text; sec text;
begin
  -- messages privés, appels et réponses à tes messages seulement
  if p_kind not in ('msg', 'call', 'reply') then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
    into subs from hdar.push_subs where user_id = p_user;
  if jsonb_array_length(subs) = 0 then return; end if;
  -- une notification par conversation toutes les 3 minutes max
  if exists (select 1 from hdar.push_sent where user_id = p_user and kind = p_kind and ref = p_ref
             and sent_at > now() - greatest(p_window, interval '3 minutes')) then return; end if;
  -- plafond global : 20 par jour et 6 par heure par personne
  if (select count(*) from hdar.push_log where user_id = p_user and sent_at > now() - interval '24 hours') >= 20
     or (select count(*) from hdar.push_log where user_id = p_user and sent_at > now() - interval '1 hour') >= 6 then return; end if;
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
end $$;

create or replace function hdar.push_salon_reply_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text; n text;
begin
  if new.reply_to is null then return new; end if;
  select o.from_id into t from hdar.salon_messages o where o.id = new.reply_to;
  if t is null or t = new.from_id or hdar.is_blocked(t, new.from_id) then return new; end if;
  select x.name into n from hdar.salons x where x.id = new.salon_id;
  perform hdar.push_to(t, 'reply', 'salon:' || new.salon_id, interval '3 minutes', jsonb_build_object(
    'type', 'message', 'title', coalesce(new.pseudo, 'Quelqu''un') || ' t''a répondu dans ' || coalesce(n, 'un salon'),
    'body', 'Touche pour lire et répondre', 'tag', 'salon-' || new.salon_id, 'url', '/?salon=' || new.salon_id));
  return new;
exception when others then return new;
end $$;
drop trigger if exists salon_messages_push on hdar.salon_messages;
create trigger salon_messages_push after insert on hdar.salon_messages for each row execute function hdar.push_salon_reply_trg();

create or replace function hdar.push_area_reply_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if new.reply_to is null then return new; end if;
  select o.from_id into t from hdar.area_messages o where o.id = new.reply_to;
  if t is null or t = new.from_id or hdar.is_blocked(t, new.from_id) then return new; end if;
  perform hdar.push_to(t, 'reply', 'area', interval '3 minutes', jsonb_build_object(
    'type', 'message', 'title', coalesce(new.pseudo, 'Quelqu''un') || ' t''a répondu dans le chat du quartier',
    'body', 'Touche pour lire et répondre', 'tag', 'area', 'url', '/?quartier=1'));
  return new;
exception when others then return new;
end $$;
drop trigger if exists area_messages_push on hdar.area_messages;
create trigger area_messages_push after insert on hdar.area_messages for each row execute function hdar.push_area_reply_trg();

revoke execute on function hdar.push_salon_reply_trg(), hdar.push_area_reply_trg(), hdar.safe_ts(text) from public, anon, authenticated;
revoke all on function public.hdar_salons_inbox(jsonb) from public, anon;
grant execute on function public.hdar_salons_inbox(jsonb) to authenticated;
