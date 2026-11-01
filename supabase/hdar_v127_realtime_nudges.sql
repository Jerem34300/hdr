-- hdar v127 — Temps réel « sonnette » à la place des pollings rapides.
-- Principe : à chaque nouveau message / modification, la base envoie un broadcast VIDE (aucun contenu, aucune position)
-- sur un canal privé ; les clients abonnés relisent alors la même RPC qu'avant (mêmes filtres : blocages, bannis…).
-- Le polling reste en secours, lent et seulement au premier plan.
-- Canaux (privés, règles sur realtime.messages) :
--   typing:dm:<a:b>          les 2 participants (déjà existant, v85)          événement « m »
--   typing:salon:<id>        salon ouvert (déjà existant)                     événement « m »
--   typing:spot:<id>         chat d'un spot (nouveau)                         événement « m »
--   typing:place:<id>        chat d'un lieu (nouveau)                         événement « m »
--   nudge:area:<i>:<j>       chat du quartier, case de 0,1° (nouveau)         événement « m »
--   nudge:u:<moi>            ma boîte de réception, moi seul (nouveau)        événement « dm »

create or replace function hdar.typing_topic_ok(p_topic text) returns boolean
language plpgsql stable security definer set search_path to '' as $$
declare s text; a text; b text; th text;
begin
  if p_topic like 'typing:salon:%' then
    return exists (select 1 from hdar.salons x where x.id::text = substr(p_topic, 14) and not x.removed);
  elsif p_topic ~ '^typing:area:-?[0-9]+:-?[0-9]+$' or p_topic ~ '^nudge:area:-?[0-9]+:-?[0-9]+$' then
    return auth.uid() is not null;
  elsif p_topic like 'typing:spot:%' or p_topic like 'typing:place:%' then
    return auth.uid() is not null;
  elsif p_topic like 'nudge:u:%' then
    begin s := hdar.self_id(); exception when others then return false; end;
    return s is not null and p_topic = 'nudge:u:' || s;
  elsif p_topic like 'typing:dm:%' then
    begin s := hdar.self_id(); exception when others then return false; end;
    th := substr(p_topic, 11); a := split_part(th, ':', 1); b := split_part(th, ':', 2);
    if s is null or s not in (a, b) or th <> hdar.thread_of(a, b) then return false; end if;
    if not exists (select 1 from hdar.profiles p where p.user_id = s) then return false; end if;
    return not hdar.is_blocked(a, b);
  end if;
  return false;
end $$;

-- Les « sonnettes » sont envoyées par la base seulement : les clients ne peuvent pas en émettre (les règles d'envoi
-- existantes restent limitées aux canaux typing:*, et nudge:* n'y est accepté que pour la lecture).
drop policy if exists hdar_typing_send on realtime.messages;
create policy hdar_typing_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and realtime.topic() like 'typing:%' and hdar.typing_topic_ok(realtime.topic()));

-- Nom de mon canal personnel.
create or replace function public.hdar_my_topic() returns text
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null or not exists (select 1 from hdar.profiles p where p.user_id = s) then return null; end if;
  return 'nudge:u:' || s;
end $$;
revoke all on function public.hdar_my_topic() from public, anon;
grant execute on function public.hdar_my_topic() to authenticated;

-- Envoi d'une sonnette (jamais bloquant : une erreur Realtime n'empêche pas l'envoi du message).
create or replace function hdar.nudge(p_topic text, p_event text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform realtime.send('{}'::jsonb, p_event, p_topic, true);
exception when others then null;
end $$;
revoke all on function hdar.nudge(text, text) from public, anon, authenticated;

create or replace function hdar.nudge_area(p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path to '' as $$
declare i int; j int;
begin
  -- le fil du quartier montre ±0,03° en latitude et ±0,045° en longitude : on sonne toutes les cases de 0,1° touchées
  for i in select distinct floor(x / 0.1)::int from unnest(array[p_lat - 0.03, p_lat + 0.03]) x loop
    for j in select distinct floor(y / 0.1)::int from unnest(array[p_lng - 0.045, p_lng + 0.045]) y loop
      perform hdar.nudge('nudge:area:' || i || ':' || j, 'm');
    end loop;
  end loop;
end $$;
revoke all on function hdar.nudge_area(double precision, double precision) from public, anon, authenticated;

create or replace function hdar.nudge_trg() returns trigger
language plpgsql security definer set search_path to '' as $$
declare r record := coalesce(new, old); o text;
begin
  if tg_table_name = 'live_messages' then
    perform hdar.nudge('typing:dm:' || r.thread_id, 'm');
    foreach o in array array[split_part(r.thread_id, ':', 1), split_part(r.thread_id, ':', 2)] loop
      if o <> '' and (tg_op <> 'INSERT' or o <> r.from_id) then perform hdar.nudge('nudge:u:' || o, 'dm'); end if;
    end loop;
  elsif tg_table_name = 'salon_messages' then perform hdar.nudge('typing:salon:' || r.salon_id, 'm');
  elsif tg_table_name = 'spot_messages' then perform hdar.nudge('typing:spot:' || r.spot_id, 'm');
  elsif tg_table_name = 'place_messages' then perform hdar.nudge('typing:place:' || r.place_id, 'm');
  elsif tg_table_name = 'area_messages' then perform hdar.nudge_area(r.lat, r.lng);
  elsif tg_table_name = 'message_reactions' then
    if r.scope = 'salon' then perform hdar.nudge('typing:salon:' || m.salon_id, 'm') from hdar.salon_messages m where m.id = r.message_id;
    elsif r.scope = 'dm' then perform hdar.nudge('typing:dm:' || m.thread_id, 'm') from hdar.live_messages m where m.id = r.message_id;
    elsif r.scope = 'area' then perform hdar.nudge_area(m.lat, m.lng) from hdar.area_messages m where m.id = r.message_id;
    end if;
  end if;
  return null;
exception when others then return null;
end $$;
revoke all on function hdar.nudge_trg() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['live_messages', 'salon_messages', 'spot_messages', 'place_messages', 'area_messages', 'message_reactions'] loop
    execute format('drop trigger if exists nudge on hdar.%I', t);
    execute format('create trigger nudge after insert or update or delete on hdar.%I for each row execute function hdar.nudge_trg()', t);
  end loop;
end $$;
