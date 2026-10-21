-- hdar v74 — Offre de lancement « FIRST » (paiements suspendus). Additif.
-- 1000 premiers profils : hdar+ à vie, 1 boost profil 1 h / 24 h, 1 boost annonce Région 24 h / 7 jours,
-- cœurs remis à 100 chaque mois (top-up, pas de cumul). Compteur atomique (verrou), 1 fois par profil.
create table if not exists hdar.founders (
  user_id text primary key,
  rank int not null unique check (rank between 1 and 1000),
  at timestamptz not null default now(),
  hearts_month date
);
create table if not exists hdar.founder_boosts (
  user_id text not null,
  kind text not null check (kind in ('profile','ad')),
  at timestamptz not null default now(),
  ref text
);
create index if not exists founder_boosts_idx on hdar.founder_boosts (user_id, kind, at desc);
alter table hdar.founders enable row level security;
alter table hdar.founder_boosts enable row level security;
revoke all on hdar.founders, hdar.founder_boosts from anon, authenticated;

create or replace function public.hdar_first_remaining() returns int
language sql stable security definer set search_path to '' as $$ select greatest(0, 1000 - (select count(*) from hdar.founders))::int $$;

-- Recharge mensuelle des cœurs (solde porté à 100 s'il est plus bas, une fois par mois).
create or replace function hdar.founder_refill(u text) returns void language plpgsql security definer set search_path to '' as $$
begin
  update hdar.founders set hearts_month = date_trunc('month', now())::date
    where user_id = u and (hearts_month is null or hearts_month < date_trunc('month', now())::date);
  if found then
    insert into hdar.hearts_wallet as w (user_id, balance) values (u, 100)
      on conflict (user_id) do update set balance = greatest(w.balance, 100), updated_at = now();
  end if;
end $$;

create or replace function public.hdar_first_me() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); f hdar.founders; pb timestamptz; ab timestamptz;
begin
  select * into f from hdar.founders where user_id = s;
  if f.user_id is null then return jsonb_build_object('founder', false, 'remaining', public.hdar_first_remaining()); end if;
  perform hdar.founder_refill(s);
  select max(at) into pb from hdar.founder_boosts where user_id = s and kind = 'profile';
  select max(at) into ab from hdar.founder_boosts where user_id = s and kind = 'ad';
  return jsonb_build_object('founder', true, 'rank', f.rank, 'remaining', public.hdar_first_remaining(),
    'profile_boost_at', pb + interval '24 hours', 'ad_boost_at', ab + interval '7 days');
end $$;

create or replace function public.hdar_first_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int; r int;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'first_redeem', 10, interval '1 hour');
  if upper(btrim(coalesce(p_code, ''))) <> 'FIRST' then raise exception 'Code invalide'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_first'));
  select rank into r from hdar.founders where user_id = s;
  if r is not null then raise exception 'Tu es déjà membre fondateur (n° %)', r; end if;
  select count(*) into n from hdar.founders;
  if n >= 1000 then raise exception 'Les 1000 places fondateur sont parties 😢'; end if;
  insert into hdar.founders (user_id, rank) values (s, n + 1);
  insert into hdar.premium as pm (user_id, until, status) values (s, '2999-12-31', 'founder')
    on conflict (user_id) do update set until = '2999-12-31', status = case when pm.stripe_subscription is null then 'founder' else pm.status end, updated_at = now();
  perform hdar.founder_refill(s);
  return jsonb_build_object('rank', n + 1, 'remaining', 1000 - n - 1,
    'title', 'Bienvenue dans hdar+ 🎉', 'body', 'Membre fondateur n° ' || (n + 1) || ' : hdar+ à vie, boosts et cœurs offerts.');
end $$;

-- Boost profil fondateur : 1 h, une fois par 24 h.
create or replace function public.hdar_first_boost() returns timestamptz
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); st timestamptz;
begin
  if not exists (select 1 from hdar.founders where user_id = s) then raise exception 'Réservé aux membres fondateurs (code FIRST)'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_fb:' || s));
  if exists (select 1 from hdar.founder_boosts where user_id = s and kind = 'profile' and at > now() - interval '24 hours') then
    raise exception 'Ton boost fondateur revient 24 h après le précédent'; end if;
  select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.boosts where user_id = s and not cancelled;
  insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note) values (s, st, st + interval '1 hour', 0, 'Fondateur');
  insert into hdar.founder_boosts (user_id, kind) values (s, 'profile');
  return st + interval '1 hour';
end $$;

-- Boost annonce fondateur : Région 24 h, une fois par 7 jours.
create or replace function public.hdar_first_ad_boost(p_id uuid) returns timestamptz
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); en timestamptz;
begin
  if not exists (select 1 from hdar.founders where user_id = s) then raise exception 'Réservé aux membres fondateurs (code FIRST)'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_fab:' || s));
  if exists (select 1 from hdar.founder_boosts where user_id = s and kind = 'ad' and at > now() - interval '7 days') then
    raise exception 'Ton boost d''annonce fondateur revient 7 jours après le précédent'; end if;
  if not exists (select 1 from hdar.ads where id = p_id and user_id = s and expires_at > now() and not hidden) then
    raise exception 'Annonce introuvable ou expirée'; end if;
  update hdar.ads set
    boost_scope = case when boost_until > now() and boost_scope in ('region','france','monde') then boost_scope else 'region' end,
    boost_until = greatest(now(), coalesce(boost_until, now())) + interval '24 hours'
  where id = p_id returning boost_until into en;
  update hdar.ads set expires_at = greatest(expires_at, en) where id = p_id;
  insert into hdar.founder_boosts (user_id, kind, ref) values (s, 'ad', p_id::text);
  return en;
end $$;

create or replace function public.hdar_admin_first_stats(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object('redeemed', (select count(*) from hdar.founders), 'remaining', public.hdar_first_remaining(),
    'today', (select count(*) from hdar.founders where at > now() - interval '24 hours'),
    'profile_boosts', (select count(*) from hdar.founder_boosts where kind = 'profile'),
    'ad_boosts', (select count(*) from hdar.founder_boosts where kind = 'ad'));
end $$;

-- RGPD : suppression du profil → statut fondateur supprimé (la place n'est pas rendue : rang unique).
create or replace function hdar.founders_profile_gone() returns trigger language plpgsql security definer set search_path to '' as $$
begin delete from hdar.founder_boosts where user_id = old.user_id; delete from hdar.founders where user_id = old.user_id; return old; end $$;
drop trigger if exists founders_profile_gone on hdar.profiles;
create trigger founders_profile_gone after delete on hdar.profiles for each row execute function hdar.founders_profile_gone();

revoke all on function hdar.founder_refill(text), hdar.founders_profile_gone() from public, anon, authenticated;
revoke all on function public.hdar_first_remaining(), public.hdar_first_me(), public.hdar_first_redeem(text), public.hdar_first_boost(),
  public.hdar_first_ad_boost(uuid), public.hdar_admin_first_stats(text) from public;
grant execute on function public.hdar_first_remaining() to anon, authenticated;
grant execute on function public.hdar_first_me(), public.hdar_first_redeem(text), public.hdar_first_boost(), public.hdar_first_ad_boost(uuid) to authenticated;
grant execute on function public.hdar_admin_first_stats(text) to anon, authenticated;

-- « J'ai un code » existant : FIRST passe par l'offre fondateur.
create or replace function public.hdar_code_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c hdar.gift_codes; label text;
begin
  if upper(btrim(coalesce(p_code, ''))) = 'FIRST' then return public.hdar_first_redeem(p_code); end if;
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'code_redeem', 10, interval '1 hour');
  select * into c from hdar.gift_codes where code = upper(btrim(p_code)) for update;
  if c.code is null or (c.expires_at is not null and c.expires_at < now()) then raise exception 'Code invalide ou expiré'; end if;
  if c.uses >= c.max_uses then raise exception 'Ce code a déjà été entièrement utilisé'; end if;
  if exists (select 1 from hdar.gift_code_uses where code = c.code and user_id = s) then raise exception 'Tu as déjà utilisé ce code'; end if;
  insert into hdar.gift_code_uses (code, user_id) values (c.code, s);
  update hdar.gift_codes set uses = uses + 1 where code = c.code;
  label := hdar.grant_gift(s, c.kind, c.amount, 'Code ' || c.code);
  return jsonb_build_object('title', 'Cadeau de hdar 🎁', 'body', 'Tu reçois ' || label || '.');
end $$;
