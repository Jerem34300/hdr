-- v59 : salons façon « vraie messagerie » — régions, photos / vidéos / vocaux, réponses citées,
-- effacement plus rapide (messages 24 h, salons d'utilisateurs fermés après 48 h sans message).
-- Réponses citées aussi dans le chat du quartier. Applied as migration hdar_v59_salons_chat.

alter table hdar.salons add column if not exists region text;
alter table hdar.salon_messages
  add column if not exists kind text not null default 'text',
  add column if not exists media text,
  add column if not exists duration int,
  add column if not exists reply_to uuid;
alter table hdar.area_messages add column if not exists reply_to uuid;

-- Montpellier → salons par région (13 régions + Outre-mer).
update hdar.salons set removed = true where official and lower(name) = 'montpellier';
insert into hdar.salons (name, description, emoji, official, region)
select v.name, v.description, v.emoji, true, v.region from (values
  ('Occitanie', 'Montpellier, Toulouse, Nîmes, Perpignan…', '☀️', 'occitanie'),
  ('Provence-Alpes-Côte d''Azur', 'Marseille, Nice, Toulon, Avignon…', '🌊', 'paca'),
  ('Île-de-France', 'Paris et toute l''Île-de-France', '🗼', 'idf'),
  ('Auvergne-Rhône-Alpes', 'Lyon, Grenoble, Clermont, Annecy…', '⛰️', 'ara'),
  ('Nouvelle-Aquitaine', 'Bordeaux, Limoges, Poitiers, Biarritz…', '🍷', 'naq'),
  ('Hauts-de-France', 'Lille, Amiens, Dunkerque…', '🍟', 'hdf'),
  ('Grand Est', 'Strasbourg, Reims, Metz, Nancy…', '🥨', 'ge'),
  ('Bretagne', 'Rennes, Brest, Lorient, Saint-Malo…', '⚓', 'bre'),
  ('Pays de la Loire', 'Nantes, Angers, Le Mans…', '🏰', 'pdl'),
  ('Normandie', 'Rouen, Caen, Le Havre…', '🍎', 'nor'),
  ('Bourgogne-Franche-Comté', 'Dijon, Besançon…', '🍇', 'bfc'),
  ('Centre-Val de Loire', 'Tours, Orléans, Bourges…', '🌻', 'cvl'),
  ('Corse', 'Ajaccio, Bastia…', '🏝️', 'cor'),
  ('Outre-mer', 'Réunion, Antilles, Guyane, Mayotte…', '🌴', 'om')) v(name, description, emoji, region)
where not exists (select 1 from hdar.salons s where lower(s.name) = lower(v.name) and not s.removed);

create or replace function hdar.salon_row(p_id uuid, s text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'name', x.name, 'description', x.description, 'emoji', x.emoji,
    'official', x.official, 'region', x.region, 'mine', x.creator_id = s, 'last_at', x.last_at,
    'recent', (select count(*) from hdar.salon_messages m where m.salon_id = x.id and not m.removed and m.created_at > now() - interval '24 hours'),
    'people', (select count(distinct m.from_id) from hdar.salon_messages m where m.salon_id = x.id and not m.removed and m.created_at > now() - interval '24 hours'))
  from hdar.salons x where x.id = p_id;
$$;
revoke execute on function hdar.salon_row(uuid, text) from public, anon, authenticated;

-- Aperçu du message cité (pseudo + début du texte ou type de média).
create or replace function hdar.reply_preview(p_pseudo text, p_body text, p_kind text, p_removed boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('pseudo', p_pseudo,
    'body', case when p_removed then 'Message retiré'
                 when coalesce(p_kind, 'text') = 'image' then '📷 Photo'
                 when p_kind = 'video' then '🎥 Vidéo'
                 when p_kind = 'audio' then '🎤 Vocal'
                 else left(coalesce(p_body, ''), 120) end);
$$;

create or replace function public.hdar_salon_messages(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
      'kind', m.kind, 'duration', m.duration, 'at', m.created_at, 'mine', m.from_id = s, 'reply_to', m.reply_to,
      'reply', (select hdar.reply_preview(r.pseudo, r.body, r.kind, r.removed) from hdar.salon_messages r where r.id = m.reply_to),
      'photo', exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved'))
      order by m.created_at)
    from (select * from hdar.salon_messages m where m.salon_id = p_id and not m.removed and not hdar.is_blocked(s, m.from_id)
            and m.created_at > now() - interval '24 hours'
          order by m.created_at desc limit 200) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_salon_send2(p_id uuid, p_body text, p_reply uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); b text := left(trim(coalesce(p_body, '')), 1000); ps text;
begin
  if s is null then raise exception 'Session requise'; end if;
  if b = '' then return; end if;
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  if not exists (select 1 from hdar.salons x where x.id = p_id and not x.removed) then raise exception 'Ce salon est fermé'; end if;
  perform hdar.rate_check(s, 'salon', 12, interval '1 minute');
  select coalesce(nullif(p.pseudo, ''), 'Anonyme') into ps from hdar.profiles p where p.user_id = s and p.profile_at is not null;
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body, reply_to)
  values (p_id, s, coalesce(ps, 'Anonyme'), b,
          (select r.id from hdar.salon_messages r where r.id = p_reply and r.salon_id = p_id));
  update hdar.salons set last_at = now() where id = p_id;
  perform hdar.bump_msg('salon');
end $$;

-- Photos, vidéos, vocaux : profil requis (comme le chat du quartier).
create or replace function public.hdar_salon_send_media(p_id uuid, p_kind text, p_path text, p_duration int, p_reply uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); p text; ps text;
begin
  perform hdar.require_profile(s);
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  if not exists (select 1 from hdar.salons x where x.id = p_id and not x.removed) then raise exception 'Ce salon est fermé'; end if;
  perform hdar.rate_check(s, 'salon', 12, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  select coalesce(nullif(pr.pseudo, ''), 'Anonyme') into ps from hdar.profiles pr where pr.user_id = s;
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body, kind, media, duration, reply_to)
  values (p_id, s, coalesce(ps, 'Anonyme'), '', p_kind, p,
          case when p_kind = 'image' then null else least(60, greatest(1, coalesce(p_duration, 1))) end,
          (select r.id from hdar.salon_messages r where r.id = p_reply and r.salon_id = p_id));
  update hdar.salons set last_at = now() where id = p_id;
  perform hdar.bump_msg('salon');
end $$;

-- Médias des salons : lecture, signalement (retrait auto à 3), purge des fichiers.
create or replace function public.hdar_room_media(p_scope text, p_ids uuid[])
returns table(id uuid, kind text, media text, duration integer)
language plpgsql stable security definer set search_path to '' as $$
begin
  if p_scope = 'area' then
    return query select a.id, a.kind, a.media, a.duration from hdar.area_messages a where a.id = any(p_ids) and a.media is not null and not a.removed;
  elsif p_scope = 'place' then
    return query select a.id, a.kind, a.media, a.duration from hdar.place_messages a where a.id = any(p_ids) and a.media is not null and not a.removed;
  elsif p_scope = 'spot' then
    return query select a.id, a.kind, a.media, a.duration from hdar.spot_messages a where a.id = any(p_ids) and a.media is not null and not a.removed;
  elsif p_scope = 'salon' then
    return query select a.id, a.kind, a.media, a.duration from hdar.salon_messages a where a.id = any(p_ids) and a.media is not null and not a.removed;
  end if;
end $$;

create or replace function public.hdar_media_report(p_scope text, p_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int;
begin
  if s is null or p_scope not in ('area','place','spot','salon') then raise exception 'Signalement invalide'; end if;
  perform hdar.rate_check(s, 'report', 10, interval '10 minutes');
  insert into hdar.media_reports (scope, msg_id, user_id) values (p_scope, p_id, s) on conflict do nothing;
  select count(*) into n from hdar.media_reports where scope = p_scope and msg_id = p_id;
  if n >= 3 then
    if p_scope = 'area' then update hdar.area_messages set removed = true where id = p_id;
    elsif p_scope = 'place' then update hdar.place_messages set removed = true where id = p_id;
    elsif p_scope = 'salon' then update hdar.salon_messages set removed = true where id = p_id;
    else update hdar.spot_messages set removed = true where id = p_id; end if;
  end if;
end $$;

create or replace function public.hdar_media_orphans(p_limit integer default 500)
returns table(name text) language sql stable security definer set search_path to '' as $$
  select o.name from storage.objects o
  where o.bucket_id = 'hdar-media' and o.created_at < now() - interval '2 hours'
    and not exists (select 1 from hdar.live_messages m where m.media = 'sb:' || o.name
      and not (
        exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 1) and h.other_id = split_part(m.thread_id, ':', 2) and h.hidden_at > m.created_at)
        and exists (select 1 from hdar.hidden_threads h where h.user_id = split_part(m.thread_id, ':', 2) and h.other_id = split_part(m.thread_id, ':', 1) and h.hidden_at > m.created_at)))
    and not exists (select 1 from hdar.area_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.place_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.salon_messages a where a.media = o.name and not a.removed and a.created_at > now() - interval '24 hours')
    and not exists (select 1 from hdar.spot_messages a where a.media = o.name and not a.removed
      and exists (select 1 from hdar.spots s where s.id = a.spot_id))
  limit greatest(1, least(p_limit, 1000));
$$;

-- Effacement plus rapide.
create or replace function hdar.salons_purge() returns void
language sql security definer set search_path = '' as $$
  delete from hdar.salon_messages where created_at < now() - interval '24 hours';
  update hdar.salons set removed = true where not official and not removed and last_at < now() - interval '48 hours';
  delete from hdar.device_steps where last_at < now() - interval '400 days';
  delete from hdar.gate_hourly where hour < now() - interval '400 days';
$$;
revoke execute on function hdar.salons_purge() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'hdar-salons-purge';
select cron.schedule('hdar-salons-purge', '*/15 * * * *', 'select hdar.salons_purge()');

---------------------------------------------------------------- Chat du quartier : réponses citées
create or replace function public.hdar_area_feed2(p_lat double precision, p_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_lat is null or p_lng is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'pseudo', m.pseudo, 'body', m.body,
      'kind', coalesce(m.kind, 'text'), 'duration', m.duration, 'at', m.created_at, 'mine', m.from_id = s,
      'lat', hdar.round_coord(m.lat), 'lng', hdar.round_coord(m.lng), 'reply_to', m.reply_to,
      'reply', (select hdar.reply_preview(r.pseudo, r.body, r.kind, r.removed) from hdar.area_messages r where r.id = m.reply_to),
      'photo', exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved'))
      order by m.created_at)
    from (select * from hdar.area_messages a
          where a.created_at > now() - interval '24 hours' and not a.removed
            and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045
            and not hdar.is_blocked(s, a.from_id)
          order by a.created_at desc limit 150) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_area_send2(p_lat double precision, p_lng double precision, p_pseudo text, p_body text, p_reply uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); b text := left(trim(coalesce(p_body, '')), 300);
begin
  if s is null then raise exception 'Session requise'; end if;
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  if b = '' then return; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position inconnue';
  end if;
  insert into hdar.area_messages (from_id, pseudo, lat, lng, body, reply_to)
  values (s, coalesce(nullif(left(trim(coalesce(p_pseudo, '')), 24), ''), 'Anonyme'),
          round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision, b,
          (select r.id from hdar.area_messages r where r.id = p_reply and r.created_at > now() - interval '24 hours'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['hdar_salon_send2(uuid, text, uuid)', 'hdar_salon_send_media(uuid, text, text, int, uuid)',
    'hdar_area_feed2(double precision, double precision)', 'hdar_area_send2(double precision, double precision, text, text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function hdar.reply_preview(text, text, text, boolean) from public, anon, authenticated;
