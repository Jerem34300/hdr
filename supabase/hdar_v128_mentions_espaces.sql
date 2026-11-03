-- hdar v128 — Mentions de pseudos contenant un espace (« @Beau goss »).
-- Format délimité @[Pseudo avec espace] : le robot d'accueil l'emploie pour les pseudos qui ne sont pas
-- un seul mot ; le rendu du chat l'affiche « @Pseudo avec espace », en entier et cliquable.
-- Les pseudos d'un seul mot restent @pseudo (inchangé). Rétrocompatible : l'ancien format reste lu.

-- Pseudo « propre » à l'enregistrement : espaces insécables/fins/tabulations → espace, espaces multiples réduits, bords
-- coupés, crochets retirés (réservés au format @[…]). Clé de comparaison = la même chose en minuscules.
create or replace function hdar.pseudo_clean(p text) returns text
language sql immutable set search_path to '' as $$
  select btrim(regexp_replace(translate(coalesce(p, ''), E'\u00a0\u2007\u2009\u202f\u3000\t\r\n[]', '        '), ' {2,}', ' ', 'g'))
$$;
create or replace function hdar.pseudo_key(p text) returns text
language sql immutable set search_path to '' as $$ select lower(hdar.pseudo_clean(p)) $$;
revoke all on function hdar.pseudo_clean(text), hdar.pseudo_key(text) from public, anon;
grant execute on function hdar.pseudo_clean(text), hdar.pseudo_key(text) to authenticated;

create or replace function hdar.mention_tag(p text) returns text
language sql immutable set search_path to '' as $$
  select case when btrim(p) ~ '^[[:alnum:]_.\-]+$' then '@' || btrim(p) else '@[' || btrim(p) || ']' end
$$;

create or replace function hdar.bot_flush_salon() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; sid uuid; names text[]; ids text[]; txt text; m text; c text; total int := 0;
begin
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.enabled then return 0; end if;
  update hdar.bot_welcome w set salon_at = now()
    where w.salon_at is null and exists (select 1 from hdar.bot_welcome o where o.user_id <> w.user_id
      and lower(btrim(o.pseudo)) = lower(btrim(w.pseudo)) and o.salon_at > now() - interval '24 hours');
  for c in select distinct coalesce(w.cc, 'FR') from hdar.bot_welcome w where w.salon_at is null and w.at > now() - interval '24 hours' loop
    sid := hdar.bot_country_salon(c);
    continue when sid is null;
    continue when exists (select 1 from hdar.salon_messages x where x.salon_id = sid and x.from_id = hdar.bot_id() and x.created_at > now() - interval '10 minutes');
    names := null; ids := null;
    select array_agg(w.pseudo order by w.at), array_agg(w.user_id order by w.at) into names, ids from (select d.* from (
      select distinct on (lower(btrim(w.pseudo))) w.* from hdar.bot_welcome w
      join hdar.profiles p on p.user_id = w.user_id and p.profile_at is not null
      where w.salon_at is null and w.at > now() - interval '24 hours' and coalesce(w.cc, 'FR') = c
        and not exists (select 1 from hdar.bans b where b.user_id = w.user_id and b.active)
      order by lower(btrim(w.pseudo)), w.at) d
      order by d.at limit 5) w;
    continue when names is null;
    update hdar.bot_welcome w set salon_at = now() where w.salon_at is null and coalesce(w.cc, 'FR') = c
      and lower(btrim(w.pseudo)) = any(select lower(btrim(x)) from unnest(names) x);
    m := case array_length(names, 1)
           when 1 then hdar.mention_tag(names[1])
           else array_to_string((select array_agg(hdar.mention_tag(x)) from unnest(names[1:array_length(names, 1) - 1]) x), ', ') || ' et ' || hdar.mention_tag(names[array_length(names, 1)]) end;
    txt := replace(case when array_length(names, 1) = 1 then coalesce(nullif(btrim(cfg.salon_text_one), ''), cfg.salon_text) else cfg.salon_text end, '{mentions}', m);
    insert into hdar.salon_messages (salon_id, from_id, pseudo, body) values (sid, hdar.bot_id(), 'hdar', left(txt, 1000));
    update hdar.salons set last_at = now() where id = sid;
    update hdar.bot_welcome set salon_at = now() where user_id = any(ids);
    total := total + array_length(names, 1);
  end loop;
  return total;
end $$;
revoke all on function hdar.bot_flush_salon() from public, anon, authenticated;

-- Notification : lit aussi @[Pseudo avec espace].
create or replace function public.hdar_mention_notify(p_scope text, p_ref text) returns int
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); mid uuid; body text; author text; apseudo text; at timestamptz;
  th text; sid uuid; sname text; mlat double precision; mlng double precision;
  nm text; t record; n int := 0; ctx text; okread boolean;
begin
  if s is null then raise exception 'Session requise'; end if;
  -- Le message visé = mon dernier message de ce fil (le client l'appelle juste après l'envoi).
  if p_scope = 'dm' then
    select m.id, m.body, m.from_id, m.created_at, m.thread_id into mid, body, author, at, th from hdar.live_messages m
      where m.thread_id = hdar.thread_of(s, p_ref) and m.from_id = s order by m.created_at desc limit 1;
  elsif p_scope = 'salon' then
    select m.id, m.body, m.from_id, m.created_at, m.salon_id, sa.name into mid, body, author, at, sid, sname
      from hdar.salon_messages m join hdar.salons sa on sa.id = m.salon_id
      where m.salon_id = p_ref::uuid and m.from_id = s and not m.removed and not sa.removed order by m.created_at desc limit 1;
  elsif p_scope = 'area' then
    select m.id, m.body, m.from_id, m.created_at, m.lat, m.lng into mid, body, author, at, mlat, mlng
      from hdar.area_messages m where m.from_id = s and not m.removed order by m.created_at desc limit 1;
  else raise exception 'Fil inconnu'; end if;
  if author is null or author <> s then return 0; end if;
  if at < now() - interval '2 minutes' or position('@' in body) = 0 then return 0; end if;
  select p.pseudo into apseudo from hdar.profiles p where p.user_id = s;
  if apseudo is null then return 0; end if; -- sans profil, pas de mention
  ctx := case p_scope when 'dm' then 'en privé' when 'salon' then 'dans ' || coalesce(sname, 'un salon') else 'dans le Chat du quartier' end;
  for nm in select distinct lower(btrim(coalesce(x[1], x[2]))) from regexp_matches(body, '(?:^|[^[:alnum:]_@])@(?:\[([^][\n]{2,30})\]|([[:alnum:]_.\-]{2,30}))', 'g') x limit 5 loop
    select p.user_id, p.pseudo, p.lat, p.lng into t from hdar.profiles p
      where hdar.pseudo_key(p.pseudo) = hdar.pseudo_key(nm) and p.user_id <> s order by p.updated_at desc limit 1;
    continue when t.user_id is null;
    continue when hdar.is_blocked(s, t.user_id);
    continue when exists (select 1 from hdar.bans b where b.user_id = t.user_id and b.active);
    okread := case p_scope
      when 'dm' then t.user_id in (split_part(th, ':', 1), split_part(th, ':', 2))
      when 'salon' then true -- les salons sont lisibles par toute session
      else t.lat is not null and abs(t.lat - mlat) < 0.03 and abs(t.lng - mlng) < 0.045 end;
    continue when not okread;
    perform hdar.rate_check(s, 'mention', 10, interval '1 minute');
    insert into hdar.mention_log (msg_id, user_id) values (mid, t.user_id) on conflict do nothing;
    continue when not found;
    insert into hdar.user_notices (user_id, title, body, kind, ref) values (t.user_id,
      apseudo || ' t''a mentionné ' || ctx, left(body, 140), 'mention',
      jsonb_build_object('scope', p_scope, 'salon', sid, 'title', sname, 'from', case when p_scope = 'dm' then s end, 'pseudo', apseudo));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Suggestions : garde les espaces (« @Beau g » propose « Beau goss »), échappe les jokers LIKE.
create or replace function public.hdar_mention_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); q text := hdar.pseudo_key(p_q);
begin
  if s is null then raise exception 'Session requise'; end if;
  q := regexp_replace(replace(replace(q, '%', ''), '_', '\_'), '[][\n]', '', 'g');
  if length(q) < 1 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'pseudo', x.pseudo, 'photo', x.photo))
    from (select p.user_id, p.pseudo, (p.photo is not null and p.photo_status = 'approved') photo
          from hdar.profiles p
          where hdar.pseudo_key(p.pseudo) like q || '%' and p.user_id <> s and not hdar.is_blocked(s, p.user_id)
            and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
          order by length(p.pseudo), p.updated_at desc limit 8) x), '[]'::jsonb);
end $$;

revoke all on function public.hdar_mention_search(text), public.hdar_mention_notify(text, text) from public, anon;
grant execute on function public.hdar_mention_search(text), public.hdar_mention_notify(text, text) to authenticated;

-- Retrouver un compte / un profil quand le pseudo contient un espace : comparaisons sur hdar.pseudo_key
-- (casse, bords, espaces multiples ou insécables) ; la recherche accepte aussi le pseudo tapé sans espace.
CREATE OR REPLACE FUNCTION public.hdar_profile_save(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photos jsonb, p_voice text, p_voice_sec integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  ps text := coalesce(nullif(left(hdar.pseudo_clean(p_pseudo), 24), ''), 'Anonyme');
  kept jsonb := '[]'::jsonb;
  item jsonb;
  v text := nullif(p_voice, '');
  lim int := case when hdar.is_premium(s) then 20 else 5 end;
begin
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) = 'array' then
    for item in select * from jsonb_array_elements(p_photos) loop
      exit when jsonb_array_length(kept) >= lim;
      if jsonb_typeof(item) = 'string' and item #>> '{}' ~ '^data:image/(jpeg|png|webp);base64,' and length(item #>> '{}') <= 400000 then
        kept := kept || jsonb_build_array(item);
      end if;
    end loop;
  end if;
  if v is not null and (v !~ '^data:audio/(webm|ogg|mp4|mpeg|aac|x-m4a)[^,]*;base64,' or length(v) > 300000) then v := null; end if;
  insert into hdar.profiles (user_id, pseudo, age, bio, tags, photo, album, voice, voice_sec, profile_at)
  values (s, ps, case when p_age between 18 and 99 then p_age end, left(coalesce(p_bio, ''), 300),
          left(coalesce(p_tags, ''), 200), kept ->> 0, kept, v,
          case when v is not null then least(10, greatest(1, coalesce(p_voice_sec, 1))) end, now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, age = excluded.age, bio = excluded.bio, tags = excluded.tags,
    photo = excluded.photo, album = excluded.album, voice = excluded.voice, voice_sec = excluded.voice_sec, profile_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_profile_set(p_self text, p_pseudo text, p_age integer, p_bio text, p_tags text, p_photo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s text := hdar.self_id();
  ps text := coalesce(nullif(left(hdar.pseudo_clean(p_pseudo), 24), ''), 'Anonyme');
  ph text := nullif(p_photo, '');
begin
  if ph is not null and (ph !~ '^data:image/(jpeg|png|webp);base64,' or length(ph) > 400000) then
    ph := null;
  end if;
  insert into hdar.profiles (user_id, pseudo, age, bio, tags, photo, profile_at)
  values (s, ps, case when p_age between 18 and 99 then p_age end, left(coalesce(p_bio, ''), 300),
          left(coalesce(p_tags, ''), 200), ph, now())
  on conflict (user_id) do update set
    pseudo = excluded.pseudo, age = excluded.age, bio = excluded.bio,
    tags = excluded.tags, photo = excluded.photo, profile_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_reattach(p_key text, p_pseudo text, p_target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare src text; n int; tgt text; ta uuid;
begin
  perform hdar.admin_check(p_key);
  select count(*), min(user_id) into n, src from hdar.profiles where hdar.pseudo_key(pseudo) = hdar.pseudo_key(p_pseudo) and profile_at is not null;
  if n = 0 then raise exception 'Aucun profil avec ce pseudo'; end if;
  if n > 1 then raise exception '% profils avec ce pseudo : précise avec l''ID support du profil d''origine', n; end if;
  select i.user_id, i.auth_user_id into tgt, ta from hdar.identities i where i.user_id like lower(btrim(p_target)) || '%' limit 2;
  if ta is null then raise exception 'ID support introuvable'; end if;
  perform hdar.transfer_identity(src, ta);
  insert into hdar.admin_audit (admin_uid, action, detail)
    values (auth.uid(), 'reattach', jsonb_build_object('pseudo', p_pseudo, 'profile', src, 'to_session', ta, 'from_target', tgt));
  return jsonb_build_object('ok', true, 'profile', src);
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_mention_lookup(p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); r jsonb;
begin
  if s is null then raise exception 'Session requise'; end if;
  select jsonb_build_object('user_id', p.user_id, 'pseudo', p.pseudo) into r from hdar.profiles p
    where hdar.pseudo_key(p.pseudo) = hdar.pseudo_key(p_pseudo) and not hdar.is_blocked(s, p.user_id)
      and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
    order by p.updated_at desc limit 1;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_search_pseudo(p_q text)
 RETURNS TABLE(id text, pseudo text, live boolean, photo boolean, premium boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); q text := left(hdar.pseudo_key(p_q), 24); qs text;
begin
  perform hdar.require_premium(s);
  perform hdar.rate_check(s, 'search', 30, interval '1 minute');
  if length(q) < 2 then return; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  qs := replace(q, ' ', '');
  return query
    select p.user_id, p.pseudo, coalesce(p.visible_until > now(), false),
      p.photo is not null and p.photo_status = 'approved', hdar.is_premium(p.user_id)
    from hdar.profiles p
    where p.user_id <> s and (hdar.pseudo_key(p.pseudo) like '%' || q || '%' or (length(qs) >= 2 and replace(hdar.pseudo_key(p.pseudo), ' ', '') like '%' || qs || '%')) and p.pseudo <> 'Anonyme'
      and (p.visible_until > now() or greatest(p.updated_at, p.profile_at) > now() - interval '7 days')
      and not hdar.is_blocked(s, p.user_id)
      and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
    order by (p.visible_until > now()) desc nulls last, (hdar.pseudo_key(p.pseudo) = hdar.pseudo_key(p_q)) desc, greatest(p.updated_at, p.profile_at) desc nulls last
    limit 20;
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_users(p_key text, p_q text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_q text := nullif(replace(replace(replace(hdar.pseudo_key(p_q), '\\', '\\\\'), '%', '\\%'), '_', '\\_'), '');
begin
  perform hdar.admin_check(p_key);
  return (select jsonb_build_object('total', (select count(*) from hdar.profiles p where p.profile_at is not null
      and (v_q is null or hdar.pseudo_key(p.pseudo) like '%' || v_q || '%' or replace(hdar.pseudo_key(p.pseudo), ' ', '') like '%' || replace(v_q, ' ', '') || '%' or p.user_id like v_q || '%')),
    'rows', coalesce(jsonb_agg(r order by r ->> 'last' desc nulls last), '[]'::jsonb))
  from (
    select jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'iam', p.iam, 'has_photo', p.photo is not null,
      'photo_status', p.photo_status, 'created', p.created_at, 'last', least(p.updated_at, now()),
      'region', hdar.region_label(p.lat, p.lng), 'city', p.city, 'premium', hdar.is_premium(p.user_id),
      'boosts', (select count(*) from hdar.boosts b where b.user_id = p.user_id and not b.cancelled),
      'hearts', (select jsonb_build_object('balance', w.balance, 'received', w.received) from hdar.hearts_wallet w where w.user_id = p.user_id),
      'spent', (select coalesce(sum(amount_cents), 0) from hdar.payments y where y.user_id = p.user_id),
      'reports', (select count(*) from hdar.live_reports x where x.target_id = p.user_id),
      'banned', exists (select 1 from hdar.bans z where z.user_id = p.user_id and z.active)) r
    from hdar.profiles p
    where p.profile_at is not null and (v_q is null or hdar.pseudo_key(p.pseudo) like '%' || v_q || '%' or replace(hdar.pseudo_key(p.pseudo), ' ', '') like '%' || replace(v_q, ' ', '') || '%' or p.user_id like v_q || '%')
    order by p.updated_at desc nulls last
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
  ) q(r));
end $function$;

CREATE OR REPLACE FUNCTION public.hdar_admin_amb_search(p_key text, p_q text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'pseudo', pseudo, 'amb', exists (select 1 from hdar.ambassadors a where a.user_id = p.user_id and a.active)))
    from (select * from hdar.profiles where hdar.pseudo_key(pseudo) like '%' || replace(replace(hdar.pseudo_key(p_q), '%', '\%'), '_', '\_') || '%' order by updated_at desc nulls last limit 15) p), '[]'::jsonb);
end $function$;

-- Pseudos déjà enregistrés : même nettoyage (aucun changement si déjà propre).
update hdar.profiles set pseudo = hdar.pseudo_clean(pseudo) where pseudo <> hdar.pseudo_clean(pseudo) and hdar.pseudo_clean(pseudo) <> '';

-- Anciens messages du robot : « @Beau goss » → « @[Beau goss] » pour les pseudos accueillis qui contiennent
-- autre chose qu'une lettre/chiffre/_.- (plus longs d'abord, sans double délimitation).
do $$
declare r record; n int := 0; k int;
begin
  for r in select ps from (select distinct btrim(w.pseudo) ps from hdar.bot_welcome w
           where btrim(w.pseudo) !~ '^[[:alnum:]_.\-]+$' and length(btrim(w.pseudo)) between 2 and 30 and btrim(w.pseudo) !~ '[][\n]') d
           order by length(ps) desc loop
    update hdar.salon_messages m
      set body = regexp_replace(m.body, '@' || regexp_replace(r.ps, '([.^$*+?(){}|\[\]\\-])', '\\\1', 'g') || '(?![[:alnum:]_])', '@[' || r.ps || ']', 'g')
      where m.from_id = hdar.bot_id() and position('@' || r.ps in m.body) > 0 and position('@[' || r.ps || ']' in m.body) = 0;
    get diagnostics k = row_count; n := n + k;
  end loop;
  raise notice 'v128 : % message(s) du robot mis au format @[pseudo]', n;
end $$;
