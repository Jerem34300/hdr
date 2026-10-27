-- hdar v95 — Transférer une photo / un vocal privé tout juste envoyé.
-- Cause : en privé, photos et vocaux sont stockés EN LIGNE (data:…) dans live_messages.media ; seules les vidéos
-- passent par le stockage (« sb:chemin »). hdar_forward refusait tout ce qui n'était pas « sb: » avec
-- « Ce média ancien ne peut pas être transféré », donc toutes les photos privées, même neuves.
-- Correctif : média en ligne vers un privé → copié tel quel ; vers un salon (qui exige un fichier stocké) →
-- l'appli téléverse d'abord une copie dans le dossier du membre et la passe en p_path (vérifiée ici).
-- Le message « ancien » ne reste que pour un média réellement illisible.

drop function if exists public.hdar_forward(text, uuid, text, text);
create or replace function public.hdar_forward(p_src text, p_id uuid, p_dst text, p_to text, p_path text default null)
 returns void language plpgsql security definer set search_path to '' as $function$
declare s text := hdar.self_id(); k text; b text; med text; d int; author text; label text; ps text; t text; sal uuid;
  inline boolean := false;
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
      if med like 'sb:%' then med := substr(med, 4);
      elsif med ~ '^data:(image|audio)/' then inline := true;
      else raise exception 'Ce média ancien ne peut pas être transféré'; end if;
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
  -- Média privé en ligne vers un salon : il faut une copie stockée, téléversée par l'appli dans MON dossier.
  if inline and p_dst = 'salon' then
    if p_path is null then raise exception 'NEED_UPLOAD'; end if;
    if p_path !~ ('^' || auth.uid()::text || '/[0-9a-z]+\.(jpg|jpeg|png|webp|webm|ogg|mp4|mp3|m4a)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'hdar-media' and o.name = p_path) then
      raise exception 'Fichier invalide';
    end if;
    med := p_path; inline := false;
  end if;
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
            case when k = 'text' then null when inline then med else 'sb:' || med end, case when k in ('video', 'audio') then d end, label);
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
end $function$;
revoke all on function public.hdar_forward(text, uuid, text, text, text) from public, anon;
grant execute on function public.hdar_forward(text, uuid, text, text, text) to authenticated;
