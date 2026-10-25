-- hdar v81 — Menu de message identique partout.
-- 1) hdar_forward accepte aussi le Chat du quartier comme source (public : « Transféré de <pseudo> »).
-- 2) hdar_dm_remove : retirer son propre message privé (supprimé côté serveur pour les deux personnes,
--    ses réactions avec ; le média reste tant qu'une copie transférée y fait référence, sinon la purge le retire). Additif.

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
  elsif p_src = 'area' then
    select m.kind, m.body, m.media, m.duration, m.from_id, m.pseudo into k, b, med, d, author, label
      from hdar.area_messages m
      where m.id = p_id and not m.removed and m.created_at > now() - interval '24 hours';
    if k is null then raise exception 'Message introuvable ou expiré'; end if;
    if hdar.is_blocked(s, author) then raise exception 'Message introuvable'; end if;
  else
    raise exception 'Source invalide';
  end if;
  k := coalesce(k, 'text');
  if k not in ('text', 'image', 'video', 'audio') then raise exception 'Ce type de message ne se transfère pas'; end if;
  if k = 'text' and coalesce(trim(b), '') = '' then raise exception 'Message vide'; end if;
  if k <> 'text' and med is null then raise exception 'Média indisponible'; end if;
  if author = s and label = '' and p_src in ('salon', 'area') then label := 'Toi'; end if;
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

create or replace function public.hdar_dm_remove(p_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int;
begin
  if s is null then raise exception 'Session requise'; end if;
  perform hdar.rate_check(s, 'dm_remove', 30, interval '1 minute');
  delete from hdar.live_messages m where m.id = p_id and m.from_id = s
    and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Message introuvable'; end if;
  delete from hdar.message_reactions r where r.scope = 'dm' and r.message_id = p_id;
end $$;
revoke all on function public.hdar_dm_remove(uuid) from public, anon;
grant execute on function public.hdar_dm_remove(uuid) to authenticated;
