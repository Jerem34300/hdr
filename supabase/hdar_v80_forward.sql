-- hdar v80 — Transférer un message (texte, photo, vidéo, vocal) entre messages privés et salons, dans les deux sens.
-- Copie côté serveur : une nouvelle ligne dans la cible qui pointe sur le même fichier ; les droits de lecture du média
-- suivent donc la cible (hdar_can_read_media : fil privé, ou salon < 24 h). Mêmes règles que l'envoi normal :
-- profil requis pour les messages privés et les médias, blocages, salon fermé, bannis, limites de fréquence.
-- Discrétion : un message venu d'un salon (public) garde « Transféré de <pseudo> » ; venu d'un message privé,
-- seulement « Transféré » (l'auteur d'un message privé n'est jamais nommé ailleurs). Un message transféré ne se modifie pas.
-- Additif.

alter table hdar.live_messages add column if not exists fwd text;
alter table hdar.salon_messages add column if not exists fwd text;

create or replace function public.hdar_forward(p_src text, p_id uuid, p_dst text, p_to text) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); k text; b text; med text; d int; author text; label text; ps text; t text; sal uuid;
begin
  if s is null then raise exception 'Session requise'; end if;
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  -- 1) Source : il faut pouvoir la lire.
  if p_src = 'dm' then
    select m.kind, m.body, m.media, m.duration, m.from_id, m.fwd into k, b, med, d, author, label from hdar.live_messages m
      where m.id = p_id and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s);
    if k is null then raise exception 'Message introuvable'; end if;
    label := coalesce(label, '');                    -- privé : jamais de pseudo
    if med is not null then
      if med not like 'sb:%' then raise exception 'Ce média ancien ne peut pas être transféré'; end if;
      med := substr(med, 4);
    end if;
  elsif p_src = 'salon' then
    select m.kind, m.body, m.media, m.duration, m.from_id, coalesce(m.fwd, m.pseudo) into k, b, med, d, author, label
      from hdar.salon_messages m join hdar.salons x on x.id = m.salon_id
      where m.id = p_id and not m.removed and not x.removed and m.created_at > now() - interval '24 hours';
    if k is null then raise exception 'Message introuvable ou expiré'; end if;
    if hdar.is_blocked(s, author) then raise exception 'Message introuvable'; end if;
  else
    raise exception 'Source invalide';
  end if;
  k := coalesce(k, 'text');
  if k not in ('text', 'image', 'video', 'audio') then raise exception 'Ce type de message ne se transfère pas'; end if;
  if k = 'text' and coalesce(trim(b), '') = '' then raise exception 'Message vide'; end if;
  if k <> 'text' and med is null then raise exception 'Média indisponible'; end if;
  if author = s and label = '' and p_src = 'salon' then label := 'Toi'; end if;
  perform hdar.rate_check(s, 'forward', 10, interval '1 minute');

  -- 2) Cible.
  if p_dst = 'dm' then
    perform hdar.require_profile(s);
    t := lower(left(coalesce(p_to, ''), 80));
    if t = '' or t = s then raise exception 'Destinataire invalide'; end if;
    if hdar.is_blocked(s, t) then raise exception 'Impossible d''envoyer à ce profil'; end if;
    perform hdar.rate_check(s, 'msg', 20, interval '1 minute');
    if k <> 'text' then perform hdar.rate_check(s, 'media', 8, interval '1 minute'); perform hdar.flood_check(s); end if;
    if (select count(*) from hdar.live_messages where from_id = s and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'Trop de messages, patiente un peu';
    end if;
    insert into hdar.live_messages (thread_id, from_id, body, kind, media, duration, fwd)
    values (hdar.thread_of(s, t), s, case when k = 'text' then left(b, 500) else '' end, k,
            case when k = 'text' then null else 'sb:' || med end, case when k in ('video', 'audio') then d end, label);
  elsif p_dst = 'salon' then
    begin sal := p_to::uuid; exception when others then raise exception 'Salon invalide'; end;
    if not exists (select 1 from hdar.salons x where x.id = sal and not x.removed) then raise exception 'Ce salon est fermé'; end if;
    perform hdar.rate_check(s, 'salon', 10, interval '1 minute');
    if k <> 'text' then perform hdar.require_profile(s); perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute'); end if;
    select coalesce(nullif(p.pseudo, ''), 'Anonyme') into ps from hdar.profiles p where p.user_id = s and p.profile_at is not null;
    insert into hdar.salon_messages (salon_id, from_id, pseudo, body, kind, media, duration, fwd)
    values (sal, s, coalesce(ps, 'Anonyme'), case when k = 'text' then left(b, 500) else '' end,
            case when k = 'text' then 'text' else k end, case when k = 'text' then null else med end,
            case when k in ('video', 'audio') then d end, label);
    update hdar.salons set last_at = now() where id = sal;
    perform hdar.bump_msg('salon');
  else
    raise exception 'Destination invalide';
  end if;
end $$;
revoke all on function public.hdar_forward(text, uuid, text, text) from public, anon;
grant execute on function public.hdar_forward(text, uuid, text, text) to authenticated;

-- Un message transféré ne se modifie pas (le contenu reste celui d'origine).
create or replace function hdar.forward_edit_guard() returns trigger language plpgsql set search_path to '' as $$
begin
  if old.fwd is not null and new.body is distinct from old.body then raise exception 'Un message transféré ne se modifie pas'; end if;
  return new;
end $$;
drop trigger if exists live_messages_fwd_guard on hdar.live_messages;
create trigger live_messages_fwd_guard before update on hdar.live_messages for each row execute function hdar.forward_edit_guard();
drop trigger if exists salon_messages_fwd_guard on hdar.salon_messages;
create trigger salon_messages_fwd_guard before update on hdar.salon_messages for each row execute function hdar.forward_edit_guard();

-- Fils : on renvoie « fwd » (signature et reste du contenu inchangés).
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
      'at', m.created_at::text, 'kind', m.kind, 'duration', m.duration, 'reply_to', m.reply_to, 'edited_at', m.edited_at, 'fwd', m.fwd,
      'reply', (select hdar.reply_preview(case when r.from_id = s then 'Toi' else coalesce(nullif(pp.pseudo, ''), 'Anonyme') end,
                                          r.body, r.kind, false)
                from hdar.live_messages r left join hdar.profiles pp on pp.user_id = r.from_id
                where r.id = m.reply_to and r.thread_id = th),
      'reactions', hdar.reactions_of('dm', m.id, s))
      order by m.created_at)
    from (select * from hdar.live_messages lm where lm.thread_id = th and (since is null or lm.created_at > since)
          order by lm.created_at desc limit 200) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_salon_messages(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
      'kind', m.kind, 'duration', m.duration, 'at', m.created_at, 'mine', m.from_id = s, 'reply_to', m.reply_to, 'edited_at', m.edited_at, 'fwd', m.fwd,
      'reply', (select hdar.reply_preview(r.pseudo, r.body, r.kind, r.removed) from hdar.salon_messages r where r.id = m.reply_to),
      'reactions', hdar.reactions_of('salon', m.id, s),
      'photo', exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved'))
      order by m.created_at)
    from (select * from hdar.salon_messages m where m.salon_id = p_id and not m.removed and not hdar.is_blocked(s, m.from_id)
            and m.created_at > now() - interval '24 hours'
          order by m.created_at desc limit 200) m), '[]'::jsonb);
end $$;
