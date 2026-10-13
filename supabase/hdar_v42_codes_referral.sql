-- v42 : codes cadeaux, parrainage, surprises
create or replace function hdar.grant_gift(u text, p_kind text, p_amount int, p_note text default 'Cadeau') returns text
language plpgsql security definer set search_path to '' as $$
declare st timestamptz;
begin
  if p_kind = 'premium' then
    insert into hdar.premium as pm (user_id, until, status) values (u, now() + make_interval(days => p_amount), 'gift')
      on conflict (user_id) do update set until = greatest(now(), pm.until) + make_interval(days => p_amount), updated_at = now();
    return p_amount || ' jour' || case when p_amount > 1 then 's' else '' end || ' de hdar+';
  elsif p_kind = 'boost' then
    select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.boosts where user_id = u and not cancelled;
    insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note) values (u, st, st + make_interval(hours => p_amount), 0, p_note);
    return case p_amount when 1 then 'un boost d''1 h' when 24 then 'un boost de 24 h' else 'un boost de ' || p_amount || ' h' end;
  elsif p_kind = 'hearts' then
    insert into hdar.hearts_wallet as w (user_id, balance) values (u, p_amount)
      on conflict (user_id) do update set balance = w.balance + p_amount, updated_at = now();
    return p_amount || ' cœurs';
  end if;
  raise exception 'Type de cadeau inconnu';
end $$;
revoke all on function hdar.grant_gift(text, text, int, text) from public, anon, authenticated;

-- Codes cadeaux --------------------------------------------------------------
create table if not exists hdar.gift_codes (
  code text primary key, kind text not null check (kind in ('premium','boost','hearts')), amount int not null check (amount > 0),
  max_uses int not null default 1, uses int not null default 0, expires_at timestamptz, note text, created_at timestamptz not null default now());
create table if not exists hdar.gift_code_uses (code text not null references hdar.gift_codes(code) on delete cascade, user_id text not null, at timestamptz not null default now(), primary key (code, user_id));
alter table hdar.gift_codes enable row level security; alter table hdar.gift_code_uses enable row level security;

create or replace function public.hdar_admin_code_create(p_key text, p_kind text, p_amount int, p_max_uses int default 1, p_days int default 30, p_code text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c text := upper(nullif(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9-]', '', 'g'), ''));
begin
  perform hdar.admin_check(p_key);
  if p_kind = 'premium' and p_amount > 366 then raise exception 'Max 366 jours'; end if;
  if p_kind = 'hearts' and p_amount > 10000 then raise exception 'Max 10000 cœurs'; end if;
  if p_kind = 'boost' and p_amount > 168 then raise exception 'Boost : 168 h max'; end if;
  c := coalesce(left(c, 24), 'HDAR-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)));
  insert into hdar.gift_codes (code, kind, amount, max_uses, expires_at, note)
    values (c, p_kind, p_amount, greatest(1, least(coalesce(p_max_uses, 1), 100000)), case when p_days is null or p_days <= 0 then null else now() + make_interval(days => p_days) end, left(p_note, 200));
  insert into hdar.admin_audit (admin_uid, action, detail) values (auth.uid(), 'code_create', jsonb_build_object('code', c, 'kind', p_kind, 'amount', p_amount));
  return jsonb_build_object('code', c);
end $$;

create or replace function public.hdar_admin_codes(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from hdar.gift_codes c), '[]'::jsonb);
end $$;

create or replace function public.hdar_code_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c hdar.gift_codes; label text;
begin
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

-- Parrainage -------------------------------------------------------------------
alter table hdar.profiles add column if not exists ref_code text unique;
create table if not exists hdar.referrals (referred text primary key, referrer text not null, created_at timestamptz not null default now(), rewarded_at timestamptz);
alter table hdar.referrals enable row level security;

create or replace function public.hdar_my_ref() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c text;
begin
  perform hdar.require_profile(s);
  select ref_code into c from hdar.profiles where user_id = s;
  if c is null then
    loop
      c := upper(substr(md5(gen_random_uuid()::text), 1, 7));
      begin update hdar.profiles set ref_code = c where user_id = s; exit; exception when unique_violation then end;
    end loop;
  end if;
  return jsonb_build_object('code', c,
    'invited', (select count(*) from hdar.referrals where referrer = s),
    'rewarded', (select count(*) from hdar.referrals where referrer = s and rewarded_at is not null));
end $$;

create or replace function hdar.ref_settle(u text) returns void
language plpgsql security definer set search_path to '' as $$
declare r hdar.referrals; n int;
begin
  select * into r from hdar.referrals where referred = u and rewarded_at is null for update;
  if r.referred is null then return; end if;
  if not exists (select 1 from hdar.profiles where user_id = u and photo_status = 'approved') then return; end if;
  update hdar.referrals set rewarded_at = now() where referred = u;
  perform hdar.grant_gift(u, 'premium', 3);
  insert into hdar.user_notices (user_id, title, body) values (u, 'Cadeau de hdar 🎁', 'Bienvenue ! Tu reçois 3 jours de hdar+ grâce à ton parrain.');
  select count(*) into n from hdar.referrals where referrer = r.referrer and rewarded_at > now() - interval '30 days';
  if n <= 10 then
    perform hdar.grant_gift(r.referrer, 'premium', 3);
    insert into hdar.user_notices (user_id, title, body) values (r.referrer, 'Cadeau de hdar 🎁', 'Ton invitation a marché : tu reçois 3 jours de hdar+.');
  end if;
end $$;

create or replace function public.hdar_ref_claim(p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); ref hdar.profiles; me hdar.profiles;
begin
  select * into me from hdar.profiles where user_id = s;
  select * into ref from hdar.profiles where ref_code = upper(btrim(p_code));
  if ref.user_id is null or me.user_id is null then return jsonb_build_object('ok', false); end if;
  if ref.user_id = s or ref.auth_user_id = me.auth_user_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if coalesce(me.created_at, now()) < now() - interval '7 days' then return jsonb_build_object('ok', false, 'reason', 'old'); end if;
  if ref.created_at > me.created_at then return jsonb_build_object('ok', false); end if;
  insert into hdar.referrals (referred, referrer) values (s, ref.user_id) on conflict do nothing;
  perform hdar.ref_settle(s);
  return jsonb_build_object('ok', true);
end $$;

create or replace function hdar.ref_photo_trigger() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.photo_status = 'approved' and old.photo_status is distinct from 'approved' then perform hdar.ref_settle(new.user_id); end if;
  return new;
end $$;
drop trigger if exists ref_photo on hdar.profiles;
create trigger ref_photo after update of photo_status on hdar.profiles for each row execute function hdar.ref_photo_trigger();

-- Surprises ----------------------------------------------------------------------
create table if not exists hdar.surprises (id bigserial primary key, user_id text not null, kind text not null, amount int not null, at timestamptz not null default now());
create index if not exists surprises_user on hdar.surprises (user_id, at);
alter table hdar.surprises enable row level security;

create or replace function public.hdar_surprise() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); k text; a int; label text;
begin
  if hdar.is_premium(s) or not exists (select 1 from hdar.profiles where user_id = s and profile_at is not null and created_at < now() - interval '1 day') then return null; end if;
  if exists (select 1 from hdar.surprises where user_id = s and at > now() - interval '10 days') then return null; end if;
  perform hdar.rate_check(s, 'surprise', 3, interval '1 day');
  if random() > 0.12 then return null; end if;
  if random() < 0.5 then k := 'boost'; a := 1; else k := 'premium'; a := 1 + floor(random() * 3)::int; end if;
  insert into hdar.surprises (user_id, kind, amount) values (s, k, a);
  label := hdar.grant_gift(s, k, a, 'Surprise');
  return jsonb_build_object('kind', k, 'amount', a, 'label', label);
end $$;

create or replace function public.hdar_admin_growth_gifts(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'referrals', (select count(*) from hdar.referrals), 'ref_rewarded', (select count(*) from hdar.referrals where rewarded_at is not null),
    'surprises_30d', (select count(*) from hdar.surprises where at > now() - interval '30 days'));
end $$;

revoke all on function public.hdar_admin_code_create(text, text, int, int, int, text, text), public.hdar_admin_codes(text), public.hdar_code_redeem(text),
  public.hdar_my_ref(), public.hdar_ref_claim(text), public.hdar_surprise(), public.hdar_admin_growth_gifts(text) from public, anon;
grant execute on function public.hdar_admin_code_create(text, text, int, int, int, text, text), public.hdar_admin_codes(text), public.hdar_code_redeem(text),
  public.hdar_my_ref(), public.hdar_ref_claim(text), public.hdar_surprise(), public.hdar_admin_growth_gifts(text) to authenticated;
revoke all on function hdar.ref_settle(text) from public, anon, authenticated;
