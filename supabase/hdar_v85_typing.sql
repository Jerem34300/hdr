-- hdar v85 — Indicateurs « est en train d'écrire / envoie une photo… » (Supabase Realtime Broadcast, canaux PRIVÉS).
-- Rien n'est stocké : seules des règles d'accès sur realtime.messages (broadcast) et une fonction qui donne le nom du canal.
-- Canaux : typing:salon:<id> (toute session), typing:area:<case ~2 km> (toute session), typing:dm:<a:b> (les 2 seuls membres,
-- avec profil, sans blocage). À l'application en prod : Realtime → décocher « Allow public access » n'est PAS nécessaire,
-- les canaux sont ouverts en mode private par le client.

create or replace function hdar.typing_topic_ok(p_topic text) returns boolean
language plpgsql stable security definer set search_path to '' as $$
declare s text; a text; b text; th text;
begin
  if p_topic like 'typing:salon:%' then
    return exists (select 1 from hdar.salons x where x.id::text = substr(p_topic, 14) and not x.removed);
  elsif p_topic ~ '^typing:area:-?[0-9]+:-?[0-9]+$' then
    return auth.uid() is not null;
  elsif p_topic like 'typing:dm:%' then
    begin s := hdar.self_id(); exception when others then return false; end;
    th := substr(p_topic, 11); a := split_part(th, ':', 1); b := split_part(th, ':', 2);
    if s is null or s not in (a, b) or th <> hdar.thread_of(a, b) then return false; end if;
    if not exists (select 1 from hdar.profiles p where p.user_id = s) then return false; end if;
    return not hdar.is_blocked(a, b);
  end if;
  return false;
end $$;
revoke all on function hdar.typing_topic_ok(text) from public, anon;
grant execute on function hdar.typing_topic_ok(text) to authenticated;

drop policy if exists hdar_typing_read on realtime.messages;
create policy hdar_typing_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and hdar.typing_topic_ok(realtime.topic()));
drop policy if exists hdar_typing_send on realtime.messages;
create policy hdar_typing_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and hdar.typing_topic_ok(realtime.topic()));

-- Nom du canal + mon identifiant (pour filtrer mes propres échos et les blocages côté client). null = pas d'indicateur ici.
create or replace function public.hdar_typing_topic(p_scope text, p_ref text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); t text; la double precision; lo double precision;
begin
  if s is null then return null; end if;
  if p_scope = 'salon' then t := 'typing:salon:' || p_ref;
  elsif p_scope = 'area' then
    la := split_part(p_ref, ',', 1)::double precision; lo := split_part(p_ref, ',', 2)::double precision;
    t := 'typing:area:' || floor(la / 0.02)::int || ':' || floor(lo / 0.03)::int;
  elsif p_scope = 'dm' then
    if p_ref is null or p_ref = s then return null; end if;
    t := 'typing:dm:' || hdar.thread_of(s, p_ref);
  else return null; end if;
  if not hdar.typing_topic_ok(t) then return null; end if;
  return jsonb_build_object('topic', t, 'me', s);
end $$;
revoke all on function public.hdar_typing_topic(text, text) from public, anon;
grant execute on function public.hdar_typing_topic(text, text) to authenticated;
