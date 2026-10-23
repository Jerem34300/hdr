-- hdar v76 — Réponses citées en privé, réactions emoji et modification de ses messages (MP, salons, chat du quartier). Additif.
-- Pas encore appliquée en production : en attente de validation.

-- 1) Réponse à un message en privé -------------------------------------------------------------
alter table hdar.live_messages add column if not exists reply_to uuid;

-- Modification : date de la dernière modification (null = jamais modifié).
alter table hdar.live_messages add column if not exists edited_at timestamptz;
alter table hdar.salon_messages add column if not exists edited_at timestamptz;
alter table hdar.area_messages add column if not exists edited_at timestamptz;

-- 2) Réactions ----------------------------------------------------------------------------------
create table if not exists hdar.message_reactions (
  scope text not null check (scope in ('dm', 'salon', 'area')),
  message_id uuid not null,
  user_id text not null,
  emoji text not null check (emoji in ('❤️', '😂', '🔥', '👍', '😮', '😢')),
  created_at timestamptz not null default now(),
  primary key (scope, message_id, user_id, emoji)
);
create index if not exists message_reactions_user_idx on hdar.message_reactions (user_id);
-- Aucun accès direct : tout passe par les fonctions security definer ci-dessous.
alter table hdar.message_reactions enable row level security;
revoke all on hdar.message_reactions from anon, authenticated;

-- Réactions visibles par s : seulement des profils encore existants et non bloqués avec s.
create or replace function hdar.reactions_of(p_scope text, p_id uuid, s text) returns jsonb
language sql stable set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('e', x.emoji, 'n', x.n, 'mine', x.mine) order by x.first_at), '[]'::jsonb)
  from (
    select r.emoji, count(*)::int n, bool_or(r.user_id = s) mine, min(r.created_at) first_at
    from hdar.message_reactions r
    join hdar.profiles p on p.user_id = r.user_id and p.profile_at is not null
    where r.scope = p_scope and r.message_id = p_id and not hdar.is_blocked(s, r.user_id)
    group by r.emoji
  ) x
$$;

-- Ajoute ou retire (2e appui) une réaction. Renvoie les réactions à jour du message.
create or replace function public.hdar_react(p_scope text, p_id uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); th text; author text; n int;
begin
  -- Profil propriétaire authentifié (auth.uid() = profiles.auth_user_id), non supprimé.
  if s is null or auth.uid() is null or not exists (
    select 1 from hdar.profiles p where p.user_id = s and p.profile_at is not null and p.auth_user_id = auth.uid()
      and nullif(btrim(coalesce(p.pseudo, '')), '') is not null) then
    raise exception 'Crée ton profil pour réagir';
  end if;
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  if p_emoji is null or p_emoji not in ('❤️', '😂', '🔥', '👍', '😮', '😢') then raise exception 'Réaction invalide'; end if;
  perform hdar.rate_check(s, 'react', 40, interval '1 minute');

  if p_scope = 'dm' then
    select m.thread_id, m.from_id into th, author from hdar.live_messages m where m.id = p_id;
    -- Seuls les deux participants de la conversation.
    if th is null or s not in (split_part(th, ':', 1), split_part(th, ':', 2)) then raise exception 'Message introuvable'; end if;
    -- L'autre participant doit encore avoir un profil et ne pas être bloqué.
    if hdar.is_blocked(split_part(th, ':', 1), split_part(th, ':', 2))
       or not exists (select 1 from hdar.profiles p
                      where p.user_id = case when split_part(th, ':', 1) = s then split_part(th, ':', 2) else split_part(th, ':', 1) end
                        and p.profile_at is not null) then
      raise exception 'Conversation indisponible';
    end if;
  elsif p_scope = 'salon' then
    select m.from_id into author from hdar.salon_messages m
      join hdar.salons x on x.id = m.salon_id and not x.removed
      where m.id = p_id and not m.removed and m.created_at > now() - interval '24 hours';
    if author is null then raise exception 'Message introuvable'; end if;
    if hdar.is_blocked(s, author) then raise exception 'Message indisponible'; end if;
  elsif p_scope = 'area' then
    select m.from_id into author from hdar.area_messages m
      where m.id = p_id and not m.removed and m.created_at > now() - interval '24 hours';
    if author is null then raise exception 'Message introuvable'; end if;
    if hdar.is_blocked(s, author) then raise exception 'Message indisponible'; end if;
  else
    raise exception 'Type invalide';
  end if;

  delete from hdar.message_reactions where scope = p_scope and message_id = p_id and user_id = s and emoji = p_emoji;
  get diagnostics n = row_count;
  if n = 0 then
    insert into hdar.message_reactions (scope, message_id, user_id, emoji) values (p_scope, p_id, s, p_emoji);
  end if;
  return hdar.reactions_of(p_scope, p_id, s);
end $$;
revoke all on function public.hdar_react(text, uuid, text) from public, anon;
grant execute on function public.hdar_react(text, uuid, text) to authenticated;

-- 3) Messages privés : fil avec réponses et réactions, envoi avec réponse -----------------------
create or replace function public.hdar_thread2(p_with text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); w text := lower(left(coalesce(p_with, ''), 80)); since timestamptz; th text;
begin
  if w = '' or w = s then return '[]'::jsonb; end if;
  th := hdar.thread_of(s, w);
  select h.hidden_at into since from hdar.hidden_threads h where h.user_id = s and h.other_id = w;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'from_id', m.from_id,
      'body', case when m.kind = 'location' and m.duration > 0 and m.created_at + make_interval(mins => m.duration) < now() then '' else m.body end,
      'at', m.created_at::text, 'kind', m.kind, 'duration', m.duration, 'reply_to', m.reply_to, 'edited_at', m.edited_at,
      'reply', (select hdar.reply_preview(case when r.from_id = s then 'Toi' else coalesce(nullif(pp.pseudo, ''), 'Anonyme') end,
                                          r.body, r.kind, false)
                from hdar.live_messages r left join hdar.profiles pp on pp.user_id = r.from_id
                where r.id = m.reply_to and r.thread_id = th),
      'reactions', hdar.reactions_of('dm', m.id, s))
      order by m.created_at)
    from (select * from hdar.live_messages lm where lm.thread_id = th and (since is null or lm.created_at > since)
          order by lm.created_at desc limit 200) m), '[]'::jsonb);
end $$;
revoke all on function public.hdar_thread2(text) from public, anon;
grant execute on function public.hdar_thread2(text) to authenticated;

create or replace function public.hdar_send2(p_to text, p_body text, p_reply uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); t text := lower(left(coalesce(p_to, ''), 80)); b text := left(trim(coalesce(p_body, '')), 500);
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'msg', 20, interval '1 minute');
  if t = '' or b = '' or t = s then return; end if;
  if hdar.is_blocked(s, t) then return; end if;
  if (select count(*) from hdar.live_messages where from_id = s and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de messages, patiente un peu';
  end if;
  insert into hdar.live_messages (thread_id, from_id, body, reply_to)
  values (hdar.thread_of(s, t), s, b,
          (select r.id from hdar.live_messages r where r.id = p_reply and r.thread_id = hdar.thread_of(s, t)));
end $$;
revoke all on function public.hdar_send2(text, text, uuid) from public, anon;
grant execute on function public.hdar_send2(text, text, uuid) to authenticated;

-- 4) Salons et chat du quartier : mêmes flux + réactions (signature inchangée) ------------------
create or replace function public.hdar_salon_messages(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
      'kind', m.kind, 'duration', m.duration, 'at', m.created_at, 'mine', m.from_id = s, 'reply_to', m.reply_to, 'edited_at', m.edited_at,
      'reply', (select hdar.reply_preview(r.pseudo, r.body, r.kind, r.removed) from hdar.salon_messages r where r.id = m.reply_to),
      'reactions', hdar.reactions_of('salon', m.id, s),
      'photo', exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved'))
      order by m.created_at)
    from (select * from hdar.salon_messages m where m.salon_id = p_id and not m.removed and not hdar.is_blocked(s, m.from_id)
            and m.created_at > now() - interval '24 hours'
          order by m.created_at desc limit 200) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_area_feed2(p_lat double precision, p_lng double precision) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_lat is null or p_lng is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
      'kind', coalesce(m.kind, 'text'), 'duration', m.duration, 'at', m.created_at, 'mine', m.from_id = s,
      'lat', hdar.round_coord(m.lat), 'lng', hdar.round_coord(m.lng), 'reply_to', m.reply_to, 'edited_at', m.edited_at,
      'reply', (select hdar.reply_preview(r.pseudo, r.body, r.kind, r.removed) from hdar.area_messages r where r.id = m.reply_to),
      'reactions', hdar.reactions_of('area', m.id, s),
      'photo', exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved'))
      order by m.created_at)
    from (select * from hdar.area_messages a
          where a.created_at > now() - interval '24 hours' and not a.removed
            and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045
            and not hdar.is_blocked(s, a.from_id)
          order by a.created_at desc limit 150) m), '[]'::jsonb);
end $$;

-- 5) Ménage : réactions des messages disparus et des profils supprimés.
create or replace function hdar.purge_reactions() returns void
language sql security definer set search_path to '' as $$
  delete from hdar.message_reactions r where
    not exists (select 1 from hdar.profiles p where p.user_id = r.user_id and p.profile_at is not null)
    or (r.scope = 'dm' and not exists (select 1 from hdar.live_messages m where m.id = r.message_id))
    or (r.scope = 'salon' and not exists (select 1 from hdar.salon_messages m where m.id = r.message_id))
    or (r.scope = 'area' and not exists (select 1 from hdar.area_messages m where m.id = r.message_id));
$$;
revoke all on function hdar.purge_reactions() from public, anon, authenticated;

-- 6) Modifier ses messages (15 min, texte seulement, auteur seulement) ------------------------------

-- Garde-fou en base : toute modification du texte faite par un utilisateur connecté doit venir de
-- l'auteur, sur un message texte de moins de 15 min ; edited_at est posé ici, jamais par le client.
-- Les tâches système sans session (purge RGPD v13 qui vide body) ne sont pas concernées.
create or replace function hdar.message_edit_guard() returns trigger
language plpgsql set search_path to '' as $$
declare s text;
begin
  if new.body is not distinct from old.body then
    new.edited_at := old.edited_at;
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  s := hdar.self_id();
  if old.from_id is distinct from s then raise exception 'Seul l''auteur peut modifier ce message'; end if;
  if coalesce(old.kind, 'text') <> 'text' then raise exception 'Seuls les messages texte se modifient'; end if;
  if old.created_at < now() - interval '15 minutes' then raise exception 'Trop tard : un message se modifie pendant 15 min'; end if;
  if new.from_id is distinct from old.from_id or new.created_at is distinct from old.created_at then
    raise exception 'Modification invalide';
  end if;
  new.edited_at := now();
  return new;
end $$;

drop trigger if exists live_messages_edit_guard on hdar.live_messages;
create trigger live_messages_edit_guard before update on hdar.live_messages
  for each row execute function hdar.message_edit_guard();
drop trigger if exists salon_messages_edit_guard on hdar.salon_messages;
create trigger salon_messages_edit_guard before update on hdar.salon_messages
  for each row execute function hdar.message_edit_guard();
drop trigger if exists area_messages_edit_guard on hdar.area_messages;
create trigger area_messages_edit_guard before update on hdar.area_messages
  for each row execute function hdar.message_edit_guard();

-- RLS (défense en profondeur) : politique restrictive, une mise à jour directe n'est jamais
-- possible pour quelqu'un d'autre que l'auteur, même si une politique permissive était ajoutée un jour.
drop policy if exists live_messages_author_update on hdar.live_messages;
create policy live_messages_author_update on hdar.live_messages as restrictive for update to authenticated
  using (from_id = hdar.self_id()) with check (from_id = hdar.self_id());
drop policy if exists salon_messages_author_update on hdar.salon_messages;
create policy salon_messages_author_update on hdar.salon_messages as restrictive for update to authenticated
  using (from_id = hdar.self_id()) with check (from_id = hdar.self_id());
drop policy if exists area_messages_author_update on hdar.area_messages;
create policy area_messages_author_update on hdar.area_messages as restrictive for update to authenticated
  using (from_id = hdar.self_id()) with check (from_id = hdar.self_id());

-- Repasse les mêmes contrôles qu'à l'envoi (compte suspendu, profil pour les MP, anti-flood,
-- longueur, blocage, salon fermé, message retiré), puis met à jour ; le trigger fait le reste.
create or replace function public.hdar_edit_message(p_scope text, p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); b text; th text; author text; n int;
begin
  if s is null then raise exception 'Session requise'; end if;
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  perform hdar.rate_check(s, 'edit', 10, interval '1 minute');
  b := left(trim(coalesce(p_body, '')), case p_scope when 'dm' then 500 when 'salon' then 1000 else 300 end);
  if b = '' then raise exception 'Le message ne peut pas être vide'; end if;

  if p_scope = 'dm' then
    perform hdar.require_profile(s);
    select m.thread_id, m.from_id into th, author from hdar.live_messages m where m.id = p_id;
    if author is distinct from s then raise exception 'Seul l''auteur peut modifier ce message'; end if;
    if hdar.is_blocked(split_part(th, ':', 1), split_part(th, ':', 2)) then raise exception 'Conversation indisponible'; end if;
    update hdar.live_messages set body = b where id = p_id and from_id = s and coalesce(kind, 'text') = 'text'
      and created_at > now() - interval '15 minutes';
  elsif p_scope = 'salon' then
    update hdar.salon_messages m set body = b where m.id = p_id and m.from_id = s and not m.removed
      and coalesce(m.kind, 'text') = 'text' and m.created_at > now() - interval '15 minutes'
      and exists (select 1 from hdar.salons x where x.id = m.salon_id and not x.removed);
  elsif p_scope = 'area' then
    update hdar.area_messages m set body = b where m.id = p_id and m.from_id = s and not m.removed
      and coalesce(m.kind, 'text') = 'text' and m.created_at > now() - interval '15 minutes';
  else
    raise exception 'Type invalide';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ce message ne peut plus être modifié (15 min max, texte seulement)'; end if;
  return jsonb_build_object('body', b, 'edited_at', now());
end $$;
revoke all on function public.hdar_edit_message(text, uuid, text) from public, anon;
grant execute on function public.hdar_edit_message(text, uuid, text) to authenticated;
