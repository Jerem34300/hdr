-- hdar v128 — Mentions de pseudos contenant un espace (« @Beau goss »).
-- Format délimité @[Pseudo avec espace] : le robot d'accueil l'emploie pour les pseudos qui ne sont pas
-- un seul mot ; le rendu du chat l'affiche « @Pseudo avec espace », en entier et cliquable.
-- Les pseudos d'un seul mot restent @pseudo (inchangé). Rétrocompatible : l'ancien format reste lu.

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
      where lower(p.pseudo) = nm and p.user_id <> s order by p.updated_at desc limit 1;
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
declare s text := hdar.self_id(); q text := lower(btrim(coalesce(p_q, '')));
begin
  if s is null then raise exception 'Session requise'; end if;
  q := regexp_replace(replace(replace(q, '%', ''), '_', '\_'), '[][\n]', '', 'g');
  if length(q) < 1 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'pseudo', x.pseudo, 'photo', x.photo))
    from (select p.user_id, p.pseudo, (p.photo is not null and p.photo_status = 'approved') photo
          from hdar.profiles p
          where lower(p.pseudo) like q || '%' and p.user_id <> s and not hdar.is_blocked(s, p.user_id)
            and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
          order by length(p.pseudo), p.updated_at desc limit 8) x), '[]'::jsonb);
end $$;

revoke all on function public.hdar_mention_search(text), public.hdar_mention_notify(text, text) from public, anon;
grant execute on function public.hdar_mention_search(text), public.hdar_mention_notify(text, text) to authenticated;

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
