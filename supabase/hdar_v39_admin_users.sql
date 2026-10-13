-- v39 — Admin « Utilisateurs » : liste, détail étendu (sans contenu de messages ni position précise),
-- cadeaux (hdar+, boost, cœurs) journalisés, notifications in-app « Cadeau de hdar 🎁 ».
create table if not exists hdar.user_notices (
  id bigserial primary key, user_id text not null, title text not null, body text, at timestamptz not null default now(), seen_at timestamptz
);
create index if not exists user_notices_user on hdar.user_notices (user_id) where seen_at is null;
alter table hdar.user_notices enable row level security;
revoke all on hdar.user_notices from public, anon, authenticated;

create or replace function hdar.region_label(p_lat double precision, p_lng double precision) returns text
language sql stable security definer set search_path to '' as $$
  select label from hdar.geo_cache where k = round(p_lat::numeric, 1) || ',' || round(p_lng::numeric, 1);
$$;
revoke all on function hdar.region_label(double precision, double precision) from public, anon, authenticated;

create or replace function public.hdar_admin_users(p_key text, p_q text default null, p_offset int default 0, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return (select jsonb_build_object('total', (select count(*) from hdar.profiles p where p.profile_at is not null
      and (p_q is null or p.pseudo ilike '%' || p_q || '%' or p.user_id like lower(p_q) || '%')),
    'rows', coalesce(jsonb_agg(r order by r ->> 'last' desc nulls last), '[]'::jsonb))
  from (
    select jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'iam', p.iam, 'has_photo', p.photo is not null,
      'photo_status', p.photo_status, 'created', p.created_at, 'last', greatest(p.updated_at, p.visible_until),
      'region', hdar.region_label(p.lat, p.lng), 'premium', hdar.is_premium(p.user_id),
      'boosts', (select count(*) from hdar.boosts b where b.user_id = p.user_id and not b.cancelled),
      'hearts', (select jsonb_build_object('balance', w.balance, 'received', w.received) from hdar.hearts_wallet w where w.user_id = p.user_id),
      'spent', (select coalesce(sum(amount_cents), 0) from hdar.payments y where y.user_id = p.user_id),
      'reports', (select count(*) from hdar.live_reports x where x.target_id = p.user_id),
      'banned', exists (select 1 from hdar.bans z where z.user_id = p.user_id and z.active)) r
    from hdar.profiles p
    where p.profile_at is not null and (p_q is null or p.pseudo ilike '%' || p_q || '%' or p.user_id like lower(p_q) || '%')
    order by greatest(p.updated_at, p.visible_until) desc nulls last
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
  ) q(r));
end $$;
revoke all on function public.hdar_admin_users(text, text, int, int) from public, anon;
grant execute on function public.hdar_admin_users(text, text, int, int) to authenticated;

create or replace function public.hdar_admin_user_extra(p_key text, p_id text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u text := lower(p_id);
begin
  perform hdar.admin_check(p_key);
  return (select jsonb_build_object(
    'region', hdar.region_label(p.lat, p.lng), 'iam', p.iam, 'seeking', p.seeking, 'created', p.created_at,
    'album', coalesce(p.album, '[]'::jsonb), 'bio', p.bio, 'note', p.note,
    'premium_until', (select until from hdar.premium where user_id = u),
    'hearts', (select jsonb_build_object('balance', balance, 'received', received, 'bought', bought) from hdar.hearts_wallet where user_id = u),
    'activity', jsonb_build_object(
      'sessions_30d', (select coalesce(sum(sessions), 0) from hdar.daily_visits where device = u and day > current_date - 30),
      'days_active_30d', (select count(*) from hdar.daily_visits where device = u and day > current_date - 30),
      'private_msgs', (select count(*) from hdar.live_messages where from_id = u),
      'area_msgs', (select count(*) from hdar.area_messages where from_id = u),
      'place_msgs', (select count(*) from hdar.place_messages where from_id = u),
      'spots_created', (select count(*) from hdar.spots where creator_id = u),
      'live_matches', (select count(*) from hdar.live_history where user_id = u),
      'hearts_sent', (select count(*) from hdar.hearts_log where from_id = u)),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'product', product, 'kind', kind, 'cents', amount_cents, 'ref', stripe_ref) order by created_at desc) from hdar.payments where user_id = u), '[]'::jsonb),
    'gifts', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'detail', detail) order by at desc) from hdar.admin_audit where action = 'gift' and detail ->> 'user' = u), '[]'::jsonb))
  from hdar.profiles p where p.user_id = u);
end $$;
revoke all on function public.hdar_admin_user_extra(text, text) from public, anon;
grant execute on function public.hdar_admin_user_extra(text, text) to authenticated;

-- Cadeaux : p_kind = 'premium' (p_amount jours), 'boost' (p_amount heures : 1, 24, 168), 'hearts' (p_amount cœurs).
create or replace function public.hdar_admin_gift(p_key text, p_id text, p_kind text, p_amount int, p_msg text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u text := lower(p_id); st timestamptz; label text;
begin
  perform hdar.admin_check(p_key);
  if not exists (select 1 from hdar.profiles where user_id = u) then raise exception 'Profil introuvable'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Quantité invalide'; end if;
  if p_kind = 'premium' then
    if p_amount > 366 then raise exception 'Max 366 jours'; end if;
    insert into hdar.premium as pm (user_id, until, status) values (u, now() + make_interval(days => p_amount), 'gift')
      on conflict (user_id) do update set until = greatest(now(), pm.until) + make_interval(days => p_amount), updated_at = now();
    label := p_amount || ' jours de hdar+';
  elsif p_kind = 'boost' then
    if p_amount not in (1, 24, 168) then raise exception 'Boost : 1, 24 ou 168 heures'; end if;
    select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.boosts where user_id = u and not cancelled;
    insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note) values (u, st, st + make_interval(hours => p_amount), 0, 'Cadeau admin');
    label := case p_amount when 1 then 'un boost d''1 h' when 24 then 'un boost de 24 h' else 'un boost de 7 jours' end;
  elsif p_kind = 'hearts' then
    if p_amount > 10000 then raise exception 'Max 10000 cœurs'; end if;
    insert into hdar.hearts_wallet as w (user_id, balance) values (u, p_amount)
      on conflict (user_id) do update set balance = w.balance + p_amount, updated_at = now();
    label := p_amount || ' cœurs';
  else
    raise exception 'Type de cadeau inconnu';
  end if;
  insert into hdar.user_notices (user_id, title, body)
    values (u, 'Cadeau de hdar 🎁', 'Tu reçois ' || label || '.' || coalesce(' ' || nullif(btrim(left(p_msg, 300)), ''), ''));
  insert into hdar.admin_audit (admin_uid, action, detail)
    values (auth.uid(), 'gift', jsonb_build_object('user', u, 'kind', p_kind, 'amount', p_amount, 'msg', left(p_msg, 300)));
  return jsonb_build_object('ok', true, 'label', label);
end $$;
revoke all on function public.hdar_admin_gift(text, text, text, int, text) from public, anon;
grant execute on function public.hdar_admin_gift(text, text, text, int, text) to authenticated;

-- Notifications in-app non lues (marquées lues à la lecture).
create or replace function public.hdar_my_notices() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'at', at) order by at), '[]'::jsonb) into r
    from hdar.user_notices where user_id = s and seen_at is null;
  update hdar.user_notices set seen_at = now() where user_id = s and seen_at is null;
  return r;
end $$;
revoke all on function public.hdar_my_notices() from public, anon;
grant execute on function public.hdar_my_notices() to authenticated;

-- Les profils des admins (hdar.admins) sont hdar+ en permanence et ont des cœurs illimités.
create or replace function hdar.is_admin_user(p_user text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from hdar.identities i join hdar.admins a on a.auth_user_id = i.auth_user_id where i.user_id = p_user);
$$;
revoke all on function hdar.is_admin_user(text) from public, anon, authenticated;

create or replace function hdar.is_premium(p_user text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from hdar.premium where user_id = p_user and until > now()) or hdar.is_admin_user(p_user);
$$;

create or replace function public.hdar_my_premium() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('premium', hdar.is_premium(hdar.self_id()),
    'until', case when hdar.is_admin_user(hdar.self_id()) then null else p.until end, 'status', case when hdar.is_admin_user(hdar.self_id()) then 'admin' else p.status end,
    'photo_limit', case when hdar.is_premium(hdar.self_id()) then 20 else 5 end)
  from (select 1) x left join hdar.premium p on p.user_id = hdar.self_id();
$$;

create or replace function public.hdar_heart_send() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text; b int; adm boolean := hdar.is_admin_user(hdar.self_id());
begin
  select peer_id into o from hdar.live_queue where user_id = s;
  if o is null then raise exception 'Personne en face'; end if;
  perform hdar.rate_check(s, 'heart', 30, interval '1 minute');
  if exists (select 1 from hdar.hearts_log where from_id = s and at > now() - interval '2 seconds') then raise exception 'Doucement 🙂'; end if;
  if adm then b := 9999;
  else
    update hdar.hearts_wallet set balance = balance - 1, updated_at = now() where user_id = s and balance > 0 returning balance into b;
    if b is null then raise exception 'no_hearts: plus de cœurs'; end if;
  end if;
  insert into hdar.hearts_wallet as w (user_id, received) values (o, 1)
    on conflict (user_id) do update set received = w.received + 1, updated_at = now();
  insert into hdar.hearts_log (from_id, to_id) values (s, o);
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (o, s, 'live-heart', '');
  return jsonb_build_object('balance', b);
end $$;

create or replace function public.hdar_my_hearts() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('balance', case when hdar.is_admin_user(hdar.self_id()) then 9999 else coalesce(w.balance, 0) end, 'received', coalesce(w.received, 0))
  from (select 1) x left join hdar.hearts_wallet w on w.user_id = hdar.self_id();
$$;
