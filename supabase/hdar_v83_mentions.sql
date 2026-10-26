-- hdar v83 — Mentions @pseudo (salons, Chat du quartier, privé).
-- Le client envoie son message comme avant, puis appelle hdar_mention_notify : le serveur relit son dernier message,
-- vérifie l'auteur, extrait au plus 5 @pseudo, et notifie seulement les profils qui peuvent lire ce fil
-- et qui ne sont pas bloqués (dans un sens ou dans l'autre). Jamais d'email. Additif.
alter table hdar.user_notices add column if not exists kind text;
alter table hdar.user_notices add column if not exists ref jsonb;

create table if not exists hdar.mention_log (
  msg_id uuid not null, user_id text not null, at timestamptz not null default now(), primary key (msg_id, user_id));
alter table hdar.mention_log enable row level security;
revoke all on hdar.mention_log from public, anon, authenticated;

-- Suggestions quand on tape @ : pseudos qui commencent par p_q (8 max), sans soi, sans bloqués ni bannis.
create or replace function public.hdar_mention_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); q text := lower(btrim(coalesce(p_q, '')));
begin
  if s is null then raise exception 'Session requise'; end if;
  q := regexp_replace(q, '[^[:alnum:]_.\-]', '', 'g');
  if length(q) < 1 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'pseudo', x.pseudo, 'photo', x.photo))
    from (select p.user_id, p.pseudo, (p.photo is not null and p.photo_status = 'approved') photo
          from hdar.profiles p
          where lower(p.pseudo) like q || '%' and p.user_id <> s and not hdar.is_blocked(s, p.user_id)
            and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
          order by length(p.pseudo), p.updated_at desc limit 8) x), '[]'::jsonb);
end $$;

-- Toucher une mention : retrouve le profil par pseudo exact (insensible à la casse).
create or replace function public.hdar_mention_lookup(p_pseudo text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); r jsonb;
begin
  if s is null then raise exception 'Session requise'; end if;
  select jsonb_build_object('user_id', p.user_id, 'pseudo', p.pseudo) into r from hdar.profiles p
    where lower(p.pseudo) = lower(btrim(coalesce(p_pseudo, ''))) and not hdar.is_blocked(s, p.user_id)
      and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
    order by p.updated_at desc limit 1;
  return r;
end $$;

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
  for nm in select distinct lower(x[1]) from regexp_matches(body, '(?:^|[^[:alnum:]_@])@([[:alnum:]_.\-]{2,30})', 'g') x limit 5 loop
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

create or replace function public.hdar_my_notices() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'at', n.at, 'kind', n.kind, 'ref', n.ref,
      'gift', case when g.id is null then null else jsonb_build_object('id', g.id, 'place', pl.name, 'title', g.title, 'description', g.description, 'code', g.code, 'expires', g.expires_at) end)
      order by n.at), '[]'::jsonb) into r
    from hdar.user_notices n left join hdar.pro_gifts g on g.id = n.pro_gift_id left join hdar.places pl on pl.id = g.place_id
    where n.user_id = s and n.seen_at is null;
  update hdar.user_notices set seen_at = now() where user_id = s and seen_at is null;
  return r;
end $$;

revoke all on function public.hdar_mention_search(text), public.hdar_mention_lookup(text), public.hdar_mention_notify(text, text), public.hdar_my_notices() from public, anon;
grant execute on function public.hdar_mention_search(text), public.hdar_mention_lookup(text), public.hdar_mention_notify(text, text), public.hdar_my_notices() to authenticated;
