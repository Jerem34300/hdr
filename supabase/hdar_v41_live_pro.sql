-- v41 : Live Pro (lieux partenaires actifs) + Cadeaux pro 🎁
alter table hdar.live_queue add column if not exists pro_place uuid;
alter table hdar.profiles add column if not exists pro_gifts_off boolean not null default false;

create table if not exists hdar.pro_gifts (
  id bigserial primary key,
  place_id uuid not null references hdar.places(id) on delete cascade,
  from_id text not null,
  to_id text not null,
  title text not null,
  description text,
  code text,
  expires_at timestamptz not null,
  via text not null default 'live',
  reported boolean not null default false,
  report_reason text,
  created_at timestamptz not null default now()
);
create index if not exists pro_gifts_place_day on hdar.pro_gifts (place_id, created_at);
create table if not exists hdar.pro_gift_blocks (user_id text not null, place_id uuid not null, created_at timestamptz not null default now(), primary key (user_id, place_id));
alter table hdar.user_notices add column if not exists pro_gift_id bigint;
alter table hdar.pro_gifts enable row level security;
alter table hdar.pro_gift_blocks enable row level security;

-- lieu partenaire actif possédé par l'appelant
create or replace function hdar.pro_place_check(s text, p uuid) returns hdar.places
language plpgsql stable security definer set search_path to '' as $$
declare r hdar.places;
begin
  select * into r from hdar.places where id = p and owner_id = s and status = 'approved' and partner_until > now();
  if r.id is null then raise exception 'pro_inactive: Live Pro réservé aux lieux partenaires actifs'; end if;
  return r;
end $$;

create or replace function hdar.live_card(p_user text, p_role text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'iam', p.iam, 'seeking', p.seeking, 'note', p.note,
    'premium', hdar.is_premium(p.user_id), 'role', p_role,
    'pro', (select jsonb_build_object('place', pl.id, 'name', pl.name, 'kind', pl.kind)
              from hdar.live_queue q join hdar.places pl on pl.id = q.pro_place
              where q.user_id = p.user_id and pl.partner_until > now()))
  from hdar.profiles p where p.user_id = p_user $$;

drop function if exists public.hdar_live_next(text[], integer, integer, text);
create or replace function public.hdar_live_next(p_iam text[] default null, p_min_age integer default null, p_max_age integer default null, p_back text default null, p_pro uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s text := hdar.self_id(); me hdar.profiles; prem boolean; pick text; filt boolean; pro boolean := p_pro is not null;
begin
  if pro then
    perform hdar.require_profile(s);
    perform hdar.pro_place_check(s, p_pro);
    if not exists (select 1 from hdar.live_terms where user_id = s and version >= 1) then raise exception 'live_terms: accepte les règles du Live'; end if;
  else
    perform hdar.live_require(s);
  end if;
  perform hdar.rate_check(s, 'live_next', 60, interval '1 minute');
  prem := hdar.is_premium(s);
  filt := not pro and (coalesce(cardinality(p_iam), 0) > 0 or p_min_age is not null or p_max_age is not null);
  if (filt or p_back is not null) and not prem then perform hdar.require_premium(s); end if;
  perform public.hdar_live_leave(true);
  insert into hdar.live_queue (user_id, pro_place) values (s, p_pro) on conflict (user_id) do update set seen_at = now(), pro_place = p_pro;
  delete from hdar.live_queue where seen_at < now() - interval '20 seconds';
  perform 1 from hdar.live_queue where user_id = s for update;
  select * into me from hdar.profiles where user_id = s;

  if p_back is not null then
    select q.user_id into pick from hdar.live_queue q
      where q.user_id = lower(p_back) and q.peer_id is null and q.user_id <> s and not hdar.is_blocked(s, q.user_id)
      for update skip locked;
    if pick is null then return jsonb_build_object('back_gone', true); end if;
  else
    select q.user_id into pick from hdar.live_queue q join hdar.profiles p on p.user_id = q.user_id
      where q.user_id <> s and q.peer_id is null and q.seen_at > now() - interval '12 seconds'
        and (p.photo_status = 'approved' or q.pro_place is not null)
        and not (pro and q.pro_place is not null) -- deux pros ne se croisent pas
        and not hdar.is_blocked(s, q.user_id)
        and not exists (select 1 from hdar.live_history h where h.user_id = s and h.peer_id = q.user_id and h.at > now() - interval '15 minutes')
        and (not filt or ((coalesce(cardinality(p_iam), 0) = 0 or p.iam = any(p_iam))
             and (p_min_age is null or p.age >= p_min_age) and (p_max_age is null or p.age <= p_max_age)))
        -- jamais à moins de ~2 km entre particuliers ; le Live Pro n'a pas de limite de distance
        and (pro or q.pro_place is not null or me.lat is null or p.lat is null or hdar.live_km(me.lat, me.lng, p.lat, p.lng) > 2)
      order by
        case when pro or q.pro_place is not null then 0
             when me.lat is null or p.lat is null then 2
             when hdar.live_km(me.lat, me.lng, p.lat, p.lng) <= 150 then 0
             when hdar.live_km(me.lat, me.lng, p.lat, p.lng) <= 600 then 1 else 2 end,
        case when prem and position(coalesce(me.iam, '?') in coalesce(p.seeking, '')) > 0
                       and position(coalesce(p.iam, '?') in coalesce(me.seeking, '')) > 0 then 0 else 1 end,
        random()
      limit 1 for update of q skip locked;
    if pick is null then return jsonb_build_object('waiting', true); end if;
  end if;

  update hdar.live_queue set peer_id = pick, role = 'offer', matched_at = now(), seen_at = now() where user_id = s;
  update hdar.live_queue set peer_id = s, role = 'answer', matched_at = now() where user_id = pick;
  insert into hdar.live_history values (s, pick, now()), (pick, s, now())
    on conflict (user_id, peer_id) do update set at = now();
  return hdar.live_card(pick, 'offer');
end $function$;
grant execute on function public.hdar_live_next(text[], integer, integer, text, uuid) to authenticated;

-- Envoi d'un cadeau pro (20 / jour / lieu)
create or replace function public.hdar_pro_gift_send(p_place uuid, p_to text, p_title text, p_desc text default null, p_code text default null, p_days integer default 7, p_via text default 'live')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); pl hdar.places; t text := lower(btrim(p_to)); n int; gid bigint; exp timestamptz; body text;
begin
  perform hdar.require_profile(s);
  pl := hdar.pro_place_check(s, p_place);
  if t = s or not exists (select 1 from hdar.profiles where user_id = t) then raise exception 'Profil introuvable'; end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'Donne un titre au cadeau'; end if;
  select count(*) into n from hdar.pro_gifts where place_id = p_place and created_at > now() - interval '1 day';
  if n >= 20 then raise exception 'Limite atteinte : 20 cadeaux pro par jour'; end if;
  if exists (select 1 from hdar.profiles where user_id = t and pro_gifts_off)
     or exists (select 1 from hdar.pro_gift_blocks where user_id = t and place_id = p_place)
     or hdar.is_blocked(s, t) then
    raise exception 'Cette personne ne reçoit pas de cadeaux pro';
  end if;
  if exists (select 1 from hdar.pro_gifts where place_id = p_place and to_id = t and created_at > now() - interval '1 day') then
    raise exception 'Déjà un cadeau envoyé à cette personne aujourd''hui';
  end if;
  exp := now() + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
  insert into hdar.pro_gifts (place_id, from_id, to_id, title, description, code, expires_at, via)
    values (p_place, s, t, left(btrim(p_title), 60), nullif(left(btrim(coalesce(p_desc, '')), 200), ''), nullif(upper(left(btrim(coalesce(p_code, '')), 24)), ''), exp,
            case when p_via = 'profile' then 'profile' else 'live' end)
    returning id into gid;
  body := left(btrim(p_title), 60);
  insert into hdar.user_notices (user_id, title, body, pro_gift_id) values (t, 'Cadeau pro 🎁 · ' || pl.name, body, gid);
  return jsonb_build_object('ok', true, 'left', 19 - n);
end $$;

create or replace function public.hdar_my_notices() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'at', n.at,
      'gift', case when g.id is null then null else jsonb_build_object('id', g.id, 'place', pl.name, 'title', g.title, 'description', g.description, 'code', g.code, 'expires', g.expires_at) end)
      order by n.at), '[]'::jsonb) into r
    from hdar.user_notices n left join hdar.pro_gifts g on g.id = n.pro_gift_id left join hdar.places pl on pl.id = g.place_id
    where n.user_id = s and n.seen_at is null;
  update hdar.user_notices set seen_at = now() where user_id = s and seen_at is null;
  return r;
end $$;

-- Mes cadeaux pro valides (pour remontrer le code sur place)
create or replace function public.hdar_my_pro_gifts() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'place', pl.name, 'title', g.title, 'description', g.description, 'code', g.code, 'expires', g.expires_at) order by g.created_at desc), '[]'::jsonb)
  from hdar.pro_gifts g join hdar.places pl on pl.id = g.place_id
  where g.to_id = hdar.self_id() and g.expires_at > now() and not g.reported $$;

create or replace function public.hdar_pro_gift_block(p_gift bigint, p_report boolean default false, p_reason text default null)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); g hdar.pro_gifts;
begin
  select * into g from hdar.pro_gifts where id = p_gift and to_id = s;
  if g.id is null then raise exception 'Cadeau introuvable'; end if;
  insert into hdar.pro_gift_blocks (user_id, place_id) values (s, g.place_id) on conflict do nothing;
  if p_report then update hdar.pro_gifts set reported = true, report_reason = left(coalesce(p_reason, 'Signalé'), 200) where id = g.id; end if;
end $$;

create or replace function public.hdar_pro_gifts_pref(p_off boolean default null) returns boolean
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); v boolean;
begin
  if p_off is not null then update hdar.profiles set pro_gifts_off = p_off where user_id = s; end if;
  select pro_gifts_off into v from hdar.profiles where user_id = s;
  return coalesce(v, false);
end $$;

-- Le pro : ses lieux actifs + cadeaux restants aujourd'hui
create or replace function public.hdar_my_pro() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
    'left', 20 - (select count(*) from hdar.pro_gifts g where g.place_id = p.id and g.created_at > now() - interval '1 day'))), '[]'::jsonb)
  from hdar.places p where p.owner_id = hdar.self_id() and p.status = 'approved' and p.partner_until > now() $$;

create or replace function public.hdar_admin_pro_gifts(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'at', g.created_at, 'place', pl.name, 'to', pr.pseudo, 'to_id', g.to_id,
      'title', g.title, 'description', g.description, 'code', g.code, 'expires', g.expires_at, 'via', g.via, 'reported', g.reported, 'reason', g.report_reason) order by g.created_at desc)
    from (select * from hdar.pro_gifts order by created_at desc limit 300) g join hdar.places pl on pl.id = g.place_id left join hdar.profiles pr on pr.user_id = g.to_id), '[]'::jsonb);
end $$;

revoke all on function public.hdar_pro_gift_send(uuid, text, text, text, text, integer, text), public.hdar_my_pro_gifts(), public.hdar_pro_gift_block(bigint, boolean, text),
  public.hdar_pro_gifts_pref(boolean), public.hdar_my_pro(), public.hdar_admin_pro_gifts(text) from public, anon;
grant execute on function public.hdar_pro_gift_send(uuid, text, text, text, text, integer, text), public.hdar_my_pro_gifts(), public.hdar_pro_gift_block(bigint, boolean, text),
  public.hdar_pro_gifts_pref(boolean), public.hdar_my_pro(), public.hdar_admin_pro_gifts(text) to authenticated;
revoke all on function hdar.pro_place_check(text, uuid) from public, anon, authenticated;
