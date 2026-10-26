-- v89 : liste « En ligne » + visiteurs sans profil nommés « Discret N » (numéro court et stable, calculé côté serveur).
-- Règle inchangée : aucun message privé sans profil (hdar.require_profile dans tous les hdar_send*).
-- Les fonctions redéfinies ici sont des copies des versions prod du 26/10/2026 ; seuls les libellés « Anonyme » changent.

create or replace function hdar.discreet_name(p_id text) returns text
language sql immutable set search_path to '' as $$
  select 'Discret ' || ((('x' || substr(md5('hdar-discret:' || coalesce(p_id, '')), 1, 8))::bit(32)::bigint % 900) + 100)::text
$$;

-- Pseudo affiché pour un expéditeur : pseudo du profil créé, sinon « Discret N ».
create or replace function hdar.display_name(p_id text) returns text
language sql stable set search_path to '' as $$
  select coalesce((select nullif(btrim(p.pseudo), '') from hdar.profiles p where p.user_id = p_id and p.profile_at is not null), hdar.discreet_name(p_id))
$$;

CREATE OR REPLACE FUNCTION public.hdar_area_send2(p_lat double precision, p_lng double precision, p_pseudo text, p_body text, p_reply uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); b text := left(trim(coalesce(p_body, '')), 300);
begin
  if s is null then raise exception 'Session requise'; end if;
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  if b = '' then return; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position inconnue';
  end if;
  insert into hdar.area_messages (from_id, pseudo, lat, lng, body, reply_to)
  values (s, hdar.display_name(s),
          round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision, b,
          (select r.id from hdar.area_messages r where r.id = p_reply and r.created_at > now() - interval '24 hours'));
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_area_send_media(p_lat double precision, p_lng double precision, p_pseudo text, p_kind text, p_path text, p_duration integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); p text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'room', 10, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position inconnue';
  end if;
  insert into hdar.area_messages (from_id, pseudo, lat, lng, body, kind, media, duration)
  values (s, hdar.display_name(s),
          round(p_lat::numeric, 3)::double precision, round(p_lng::numeric, 3)::double precision, '',
          p_kind, p, case when p_kind = 'image' then null else least(60, greatest(1, coalesce(p_duration, 1))) end);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_salon_send2(p_id uuid, p_body text, p_reply uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); b text := left(trim(coalesce(p_body, '')), 1000); ps text;
begin
  if s is null then raise exception 'Session requise'; end if;
  if b = '' then return; end if;
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  if not exists (select 1 from hdar.salons x where x.id = p_id and not x.removed) then raise exception 'Ce salon est fermé'; end if;
  perform hdar.rate_check(s, 'salon', 12, interval '1 minute');
  select nullif(p.pseudo, '') into ps from hdar.profiles p where p.user_id = s and p.profile_at is not null;
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body, reply_to)
  values (p_id, s, coalesce(ps, hdar.discreet_name(s)), b,
          (select r.id from hdar.salon_messages r where r.id = p_reply and r.salon_id = p_id));
  update hdar.salons set last_at = now() where id = p_id;
  perform hdar.bump_msg('salon');
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_salon_send_media(p_id uuid, p_kind text, p_path text, p_duration integer, p_reply uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); p text; ps text;
begin
  perform hdar.require_profile(s);
  if exists (select 1 from hdar.bans z where z.user_id = s and z.active) then raise exception 'Compte suspendu'; end if;
  if not exists (select 1 from hdar.salons x where x.id = p_id and not x.removed) then raise exception 'Ce salon est fermé'; end if;
  perform hdar.rate_check(s, 'salon', 12, interval '1 minute');
  perform hdar.rate_check(s, 'pubmedia', 4, interval '1 minute');
  p := hdar.own_media(p_path, p_kind);
  select nullif(pr.pseudo, '') into ps from hdar.profiles pr where pr.user_id = s;
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body, kind, media, duration, reply_to)
  values (p_id, s, coalesce(ps, hdar.discreet_name(s)), '', p_kind, p,
          case when p_kind = 'image' then null else least(60, greatest(1, coalesce(p_duration, 1))) end,
          (select r.id from hdar.salon_messages r where r.id = p_reply and r.salon_id = p_id));
  update hdar.salons set last_at = now() where id = p_id;
  perform hdar.bump_msg('salon');
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_conversations(p_self text)
 RETURNS TABLE(other_id text, pseudo text, last_kind text, last_body text, last_at text, last_mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id();
begin
  return query
    select c.other, coalesce(nullif(p.pseudo, ''), hdar.discreet_name(c.other)), c.kind, case when c.kind = 'location' then '' else c.body end, c.created_at::text, c.from_id = s
    from (
      select distinct on (m.thread_id)
        case when split_part(m.thread_id, ':', 1) = s then split_part(m.thread_id, ':', 2)
             else split_part(m.thread_id, ':', 1) end as other,
        m.kind, m.body, m.created_at, m.from_id
      from hdar.live_messages m
      where split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s
      order by m.thread_id, m.created_at desc
    ) c
    left join hdar.profiles p on p.user_id = c.other
    left join hdar.hidden_threads h on h.user_id = s and h.other_id = c.other
    where not hdar.is_blocked(s, c.other)
      and (h.hidden_at is null or c.created_at > h.hidden_at)
    order by c.created_at desc
    limit 100;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_thread2(p_with text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); w text := lower(left(coalesce(p_with, ''), 80)); since timestamptz; th text;
begin
  if w = '' or w = s then return '[]'::jsonb; end if;
  th := hdar.thread_of(s, w);
  select h.hidden_at into since from hdar.hidden_threads h where h.user_id = s and h.other_id = w;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'from_id', m.from_id, 'bubble', (select bp.bubble from hdar.profiles bp where bp.user_id = m.from_id), 
      'body', case when m.kind = 'location' and m.duration > 0 and m.created_at + make_interval(mins => m.duration) < now() then '' else m.body end,
      'at', m.created_at::text, 'kind', m.kind, 'duration', m.duration, 'reply_to', m.reply_to, 'edited_at', m.edited_at, 'fwd', m.fwd,
      'reply', (select hdar.reply_preview(case when r.from_id = s then 'Toi' else coalesce(nullif(pp.pseudo, ''), hdar.discreet_name(r.from_id)) end,
                                          r.body, r.kind, false)
                from hdar.live_messages r left join hdar.profiles pp on pp.user_id = r.from_id
                where r.id = m.reply_to and r.thread_id = th),
      'reactions', hdar.reactions_of('dm', m.id, s))
      order by m.created_at)
    from (select * from hdar.live_messages lm where lm.thread_id = th and (since is null or lm.created_at > since)
          order by lm.created_at desc limit 200) m), '[]'::jsonb);
end $function$;


-- Anciens messages publics d'expéditeurs sans profil : « Anonyme » → « Discret N ».
update hdar.salon_messages m set pseudo = hdar.discreet_name(m.from_id)
  where m.pseudo in ('Anonyme', '') and not exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.profile_at is not null);
update hdar.area_messages m set pseudo = hdar.discreet_name(m.from_id)
  where m.pseudo in ('Anonyme', '') and not exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.profile_at is not null);

-- Mon nom « Discret N » (pour l'afficher à un visiteur sans profil).
create or replace function public.hdar_my_discreet() returns text
language sql stable security definer set search_path to '' as $$ select hdar.discreet_name(hdar.self_id()) $$;
grant execute on function public.hdar_my_discreet() to anon, authenticated;

-- Liste « En ligne » : UNIQUEMENT ce que la carte montre déjà.
--  · profils : exactement les lignes de hdar_live_map (mêmes filtres, mêmes blocages, coordonnées arrondies) ;
--  · Discrets : les visiteurs des bulles de hdar_map_recent (carreaux ~1 km, < 48 h, même fenêtre limitée), blocages appliqués.
create or replace function public.hdar_online_list(p_s double precision, p_w double precision, p_n double precision, p_e double precision,
  p_min_age integer default null, p_max_age integer default null, p_desires text[] default null, p_places text[] default null,
  p_online boolean default false, p_photo boolean default false, p_iam text[] default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); ok boolean := p_s is not null and p_n - p_s <= 3 and p_e - p_w <= 4;
begin
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'pseudo', m.pseudo, 'lat', m.lat, 'lng', m.lng, 'premium', m.premium,
        'age', p.age, 'iam', p.iam, 'seeking', p.seeking,
        'photo', case when p.photo_status = 'approved' then p.photo end,
        'min', greatest(0, floor(extract(epoch from now() - p.updated_at) / 300) * 5)::int,
        'new', coalesce(p.profile_at > now() - interval '7 days', false),
        'since', date_trunc('day', p.profile_at)::date))
      from public.hdar_live_map(p_min_age, p_max_age, p_desires, p_places, p_online, p_photo, p_iam) m
      join hdar.profiles p on p.user_id = m.id), '[]'::jsonb),
    'visitors', case when not ok then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', v.device_id, 'name', hdar.discreet_name(v.device_id),
        'lat', v.lat, 'lng', v.lng, 'min', greatest(0, floor(extract(epoch from now() - v.at) / 300) * 5)::int) order by v.at desc)
      from (select * from hdar.visitor_pos x
            where x.at > now() - interval '48 hours' and x.device_id <> coalesce(s, '')
              and x.lat between p_s and p_n and x.lng between p_w and p_e
              and not exists (select 1 from hdar.profiles pr where pr.user_id = x.device_id)
              and (s is null or not hdar.is_blocked(s, x.device_id))
            order by x.at desc limit 80) v), '[]'::jsonb) end);
end $$;
grant execute on function public.hdar_online_list(double precision, double precision, double precision, double precision, integer, integer, text[], text[], boolean, boolean, text[]) to anon, authenticated;
