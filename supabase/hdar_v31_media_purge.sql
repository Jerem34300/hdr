-- hdar v31 — Purge automatique des fichiers hdar-media orphelins + texte push vidéo
create or replace function public.hdar_media_orphans(p_limit int default 500)
returns table(name text) language sql stable security definer set search_path to '' as $$
  select o.name from storage.objects o
  where o.bucket_id = 'hdar-media' and o.created_at < now() - interval '2 hours'
    and not exists (select 1 from hdar.live_messages m where m.media = 'sb:' || o.name
      and not (
        exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 1) and h.other_id = split_part(m.thread_id, ':', 2) and h.hidden_at > m.created_at)
        and exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 2) and h.other_id = split_part(m.thread_id, ':', 1) and h.hidden_at > m.created_at)))
    and not exists (select 1 from hdar.area_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.place_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.spot_messages a where a.media = o.name and not a.removed
      and exists (select 1 from hdar.spots s where s.id = a.spot_id))
  limit greatest(1, least(p_limit, 1000));
$$;
revoke execute on function public.hdar_media_orphans(int) from public, anon, authenticated;
grant execute on function public.hdar_media_orphans(int) to service_role;

-- secret créé hors dépôt : select vault.create_secret('<clé aléatoire>', 'hdar_media_purge_key')
-- select vault.create_secret('<clé>', 'hdar_media_purge_key') where not exists (select 1 from vault.secrets where name = 'hdar_media_purge_key');

select cron.unschedule('hdar-media-purge') where exists (select 1 from cron.job where jobname = 'hdar-media-purge');
select cron.schedule('hdar-media-purge', '23 * * * *', $c$
  select net.http_post(
    url := 'https://hoomzhgqzwuystwburfa.supabase.co/functions/v1/hdar-media-purge',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-purge-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hdar_media_purge_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
$c$);

CREATE OR REPLACE FUNCTION hdar.push_message_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare a text := split_part(new.thread_id, ':', 1); b text := split_part(new.thread_id, ':', 2); t text; ps text;
begin
  t := case when a = new.from_id then b else a end;
  if t is null or t = '' or hdar.is_blocked(t, new.from_id) then return new; end if;
  select coalesce(pseudo, 'Quelqu''un') into ps from hdar.profiles where user_id = new.from_id;
  perform hdar.push_to(t, 'msg', new.from_id, interval '20 seconds', jsonb_build_object(
    'type', 'message', 'title', coalesce(ps, 'Quelqu''un') || ' t''a écrit',
    'body', case new.kind when 'image' then '📷 Photo' when 'video' then '🎥 Vidéo' when 'audio' then '🎤 Vocal' when 'location' then '📍 Position' else 'Nouveau message' end,
    'tag', 'msg-' || new.from_id, 'url', '/?chat=' || new.from_id));
  return new;
end $function$;

create or replace function public.hdar_media_purge_key() returns text
language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'hdar_media_purge_key' $$;
revoke execute on function public.hdar_media_purge_key() from public, anon, authenticated;
grant execute on function public.hdar_media_purge_key() to service_role;
