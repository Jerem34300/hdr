-- v32 — « Live » : vidéo aléatoire façon roulette. WebRTC pair-à-pair, signalisation via hdar.rtc_signals.
-- Appariement : au hasard dans un rayon régional (~150 km), jamais à moins de 2 km, puis repli national/global.
-- Aucune position ni distance n'est jamais renvoyée au client.
create table if not exists hdar.live_queue (
  user_id text primary key,
  peer_id text,
  role text,
  matched_at timestamptz,
  seen_at timestamptz not null default now(),
  joined_at timestamptz not null default now()
);
alter table hdar.live_queue enable row level security;
revoke all on hdar.live_queue from public, anon, authenticated;

create table if not exists hdar.live_history (
  user_id text not null, peer_id text not null, at timestamptz not null default now(),
  primary key (user_id, peer_id)
);
alter table hdar.live_history enable row level security;
revoke all on hdar.live_history from public, anon, authenticated;

create or replace function hdar.live_km(a1 double precision, o1 double precision, a2 double precision, o2 double precision)
returns double precision language sql immutable set search_path to '' as $$
  select 6371 * 2 * asin(sqrt(power(sin(radians(a2 - a1) / 2), 2) + cos(radians(a1)) * cos(radians(a2)) * power(sin(radians(o2 - o1) / 2), 2)));
$$;

create or replace function hdar.live_card(p_user text, p_role text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'iam', p.iam, 'seeking', p.seeking,
    'note', p.note, 'premium', hdar.is_premium(p.user_id), 'role', p_role)
  from hdar.profiles p where p.user_id = p_user;
$$;
revoke all on function hdar.live_card(text, text) from public, anon, authenticated;

create or replace function hdar.live_require(s text) returns void
language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.require_profile(s);
  if not exists (select 1 from hdar.profiles where user_id = s and photo_status = 'approved' and photo is not null) then
    raise exception 'live_photo: le Live est réservé aux profils avec une photo validée';
  end if;
end $$;
revoke all on function hdar.live_require(text) from public, anon, authenticated;

-- Quitte la conversation en cours (prévient l'autre).
create or replace function public.hdar_live_leave(p_stay boolean default false) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text;
begin
  select peer_id into o from hdar.live_queue where user_id = s;
  if o is not null then
    update hdar.live_queue set peer_id = null, role = null, matched_at = null where user_id = o and peer_id = s;
    insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (o, s, 'live-bye', '');
  end if;
  if p_stay then update hdar.live_queue set peer_id = null, role = null, matched_at = null, seen_at = now() where user_id = s;
  else delete from hdar.live_queue where user_id = s; end if;
end $$;
revoke all on function public.hdar_live_leave(boolean) from public, anon;
grant execute on function public.hdar_live_leave(boolean) to authenticated;

-- Cherche quelqu'un. Filtres et « revenir en arrière » : hdar+ uniquement (vérifié ici).
create or replace function public.hdar_live_next(p_iam text[] default null, p_min_age int default null, p_max_age int default null, p_back text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); me hdar.profiles; prem boolean; pick text; filt boolean;
begin
  perform hdar.live_require(s);
  perform hdar.rate_check(s, 'live_next', 60, interval '1 minute');
  prem := hdar.is_premium(s);
  filt := coalesce(cardinality(p_iam), 0) > 0 or p_min_age is not null or p_max_age is not null;
  if (filt or p_back is not null) and not prem then perform hdar.require_premium(s); end if;
  perform public.hdar_live_leave(true);
  insert into hdar.live_queue (user_id) values (s) on conflict (user_id) do update set seen_at = now();
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
        and p.photo_status = 'approved' and not hdar.is_blocked(s, q.user_id)
        and not exists (select 1 from hdar.live_history h where h.user_id = s and h.peer_id = q.user_id and h.at > now() - interval '15 minutes')
        and (not filt or ((coalesce(cardinality(p_iam), 0) = 0 or p.iam = any(p_iam))
             and (p_min_age is null or p.age >= p_min_age) and (p_max_age is null or p.age <= p_max_age)))
        -- jamais à moins de ~2 km (on ne veut pas se recroiser dans la rue)
        and (me.lat is null or p.lat is null or hdar.live_km(me.lat, me.lng, p.lat, p.lng) > 2)
      order by
        -- région d'abord (~150 km), sinon plus large, sinon partout ; au hasard dans chaque cercle
        case when me.lat is null or p.lat is null then 2
             when hdar.live_km(me.lat, me.lng, p.lat, p.lng) <= 150 then 0
             when hdar.live_km(me.lat, me.lng, p.lat, p.lng) <= 600 then 1 else 2 end,
        -- hdar+ : affinité « Je cherche » des deux côtés en priorité
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
end $$;
revoke all on function public.hdar_live_next(text[], int, int, text) from public, anon;
grant execute on function public.hdar_live_next(text[], int, int, text) to authenticated;

-- Battement de cœur : dit si quelqu'un m'a choisi.
create or replace function public.hdar_live_poll() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); q hdar.live_queue; n int;
begin
  update hdar.live_queue set seen_at = now() where user_id = s returning * into q;
  select count(*) into n from hdar.live_queue where seen_at > now() - interval '15 seconds';
  if q.user_id is null then return jsonb_build_object('in_queue', false, 'online', n); end if;
  if q.peer_id is null then return jsonb_build_object('waiting', true, 'online', n); end if;
  return hdar.live_card(q.peer_id, q.role) || jsonb_build_object('online', n);
end $$;
revoke all on function public.hdar_live_poll() from public, anon;
grant execute on function public.hdar_live_poll() to authenticated;

-- Signalement en Live : bloque tout de suite, bannit automatiquement à 3 personnes différentes en 7 jours.
create or replace function public.hdar_live_report(p_other text, p_reason text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text := lower(left(coalesce(p_other, ''), 80)); n int;
begin
  perform public.hdar_report_reason(s, o, 'Live — ' || left(coalesce(p_reason, ''), 180));
  if exists (select 1 from hdar.live_queue where user_id = s and peer_id = o) then perform public.hdar_live_leave(true); end if;
  select count(distinct reporter_id) into n from hdar.live_reports
    where target_id = o and reason like 'Live — %' and created_at > now() - interval '7 days';
  if n >= 3 and not exists (select 1 from hdar.bans where user_id = o and active) then
    insert into hdar.bans (user_id, reason, at, active) values (o, 'Auto : 3 signalements en Live', now(), true);
    delete from hdar.live_queue where user_id = o;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.hdar_live_report(text, text) from public, anon;
grant execute on function public.hdar_live_report(text, text) to authenticated;

-- Signalisation : accepte les messages du Live (uniquement vers son partenaire actuel).
create or replace function public.hdar_signal_send(p_self text, p_to text, p_kind text, p_payload text)
returns void language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  t text := hdar.check_id(p_to);
begin
  if p_kind = 'offer' then perform hdar.require_profile(s); end if;
  if p_kind like 'live-%' then
    if p_kind not in ('live-offer', 'live-answer', 'live-bye') then return; end if;
    if not exists (select 1 from hdar.live_queue where user_id = s and peer_id = t) then return; end if;
    perform hdar.rate_check(s, 'live_signal', 120, interval '1 minute');
    if length(coalesce(p_payload, '')) > 20000 then raise exception 'Signal trop gros'; end if;
    insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (t, s, p_kind, coalesce(p_payload, ''));
    return;
  end if;
  perform hdar.rate_check(s, 'signal', 120, interval '1 minute');
  if t = s or p_kind not in ('offer', 'answer', 'hangup') then return; end if;
  if length(coalesce(p_payload, '')) > 20000 then raise exception 'Signal trop gros'; end if;
  if hdar.is_blocked(s, t) then return; end if;
  if (select count(*) from hdar.rtc_signals where from_id = s and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop d''appels, patiente un peu';
  end if;
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (t, s, p_kind, coalesce(p_payload, ''));
end $$;
