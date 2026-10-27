-- hdar v94 — Bienvenue selon la provenance + boosts gratuits de parrainage.
-- 1) La ref (?ref=, /x/…, ?r=) est gardée côté serveur dès l'arrivée (avant le profil) dans hdar.pending_refs,
--    puis rattachée au profil à sa création : le message d'accueil connaît donc la provenance.
-- 2) Message privé du robot : tout le monde reçoit son lien de PARRAINAGE + boost offert par ami inscrit ;
--    la place conseillée suit la provenance (bio Telegram, bio X… ou « dans ta bio ou sur tes réseaux »).
-- 3) Parrainage : +1 boost gratuit (en réserve) par filleul dès son vrai profil créé (sans photo),
--    10 max / 30 jours, jamais deux fois pour la même personne. Les 3 jours hdar+ gardent la photo validée.
-- Confidentialité : le parrain ne voit que des nombres (jamais qui, ni quand) ; le filleul ne voit pas son parrain.
-- RGPD : aucune donnée sensible ; pending_refs supprimé avec le compte (purge 30 j).

create table if not exists hdar.pending_refs (
  user_id text primary key,
  ref text not null check (ref ~ '^[a-z0-9_-]{1,32}$'),
  at timestamptz not null default now()
);
alter table hdar.pending_refs enable row level security;
revoke all on hdar.pending_refs from anon, authenticated;

create table if not exists hdar.boost_credits (
  user_id text primary key references hdar.profiles (user_id) on delete cascade,
  earned int not null default 0,
  used int not null default 0,
  updated_at timestamptz not null default now()
);
alter table hdar.boost_credits enable row level security;
revoke all on hdar.boost_credits from anon, authenticated;

-- Ref : avant le profil → en attente ; après → rattachée (comme avant).
create or replace function public.hdar_ref_profile(p_ref text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r text := lower(left(trim(coalesce(p_ref, '')), 32)); n int;
begin
  if r !~ '^[a-z0-9_-]{1,32}$' then return false; end if;
  if not exists (select 1 from hdar.profiles p where p.user_id = s and p.profile_at is not null) then
    insert into hdar.pending_refs (user_id, ref) values (s, r) on conflict (user_id) do nothing;
    return true;
  end if;
  insert into hdar.profile_refs (user_id, ref) values (s, r) on conflict (user_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.hdar_ref_profile(text) from public, anon;
grant execute on function public.hdar_ref_profile(text) to authenticated;

-- À la création du profil : la ref en attente devient la provenance (trigger « aa_ » : passe avant bot_welcome).
create or replace function hdar.ref_pending_attach() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.profile_at is null or (tg_op = 'UPDATE' and old.profile_at is not null) then return null; end if;
  insert into hdar.profile_refs (user_id, ref) select new.user_id, ref from hdar.pending_refs where user_id = new.user_id
  on conflict (user_id) do nothing;
  delete from hdar.pending_refs where user_id = new.user_id;
  return null;
end $$;
drop trigger if exists aa_ref_pending on hdar.profiles;
create trigger aa_ref_pending after insert or update of profile_at on hdar.profiles for each row execute function hdar.ref_pending_attach();

-- Code de parrainage (créé si besoin, même format que hdar_my_ref).
create or replace function hdar.ensure_ref_code(u text) returns text language plpgsql security definer set search_path to '' as $$
declare c text;
begin
  select ref_code into c from hdar.profiles where user_id = u;
  while c is null loop
    c := upper(substr(md5(gen_random_uuid()::text), 1, 7));
    begin update hdar.profiles set ref_code = c where user_id = u; exception when unique_violation then c := null; end;
  end loop;
  return c;
end $$;

-- Bloc ajouté au message d'accueil selon la provenance.
create or replace function hdar.welcome_extra(u text) returns text language plpgsql security definer set search_path to '' as $$
declare r text; place text;
begin
  -- Tout le monde reçoit son lien de parrainage ; seule la place suggérée change selon la provenance.
  select ref into r from hdar.profile_refs where user_id = u;
  place := case
    when r is null then 'dans ta bio ou sur tes réseaux'
    when r ~ '(telegram|^next[0-9]*$)' then 'dans ta bio Telegram'
    when r ~ '(^x$|twit|^expose)' then 'dans ta bio X'
    when r ~ 'tiktok' then 'dans ta bio TikTok'
    when r ~ 'insta' then 'dans ta bio Instagram'
    when r ~ 'reddit' then 'sur ton profil Reddit'
    else 'dans ta bio ou sur tes réseaux' end;
  return E'\n\n🎁 Ton lien de parrainage : https://hdar.chat/?r=' || hdar.ensure_ref_code(u)
    || E'\nMets-le ' || place || E' : pour chaque ami qui crée son profil grâce à ton lien, tu gagnes un boost offert (jusqu''à 10 par mois). '
    || E'Tu retrouves tes boosts gratuits dans Profil → Parrainage, et tu les actives quand tu veux.';
end $$;

-- Accueil (v87) + bloc provenance. Le reste est identique.
create or replace function hdar.bot_welcome_trg() returns trigger language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings;
begin
  if new.user_id = hdar.bot_id() or new.profile_at is null or nullif(btrim(coalesce(new.pseudo, '')), '') is null then return new; end if;
  if tg_op = 'UPDATE' and old.profile_at is not null then return new; end if;
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.enabled then return new; end if;
  insert into hdar.bot_welcome (user_id, pseudo) values (new.user_id, new.pseudo) on conflict do nothing;
  if not found then return new; end if; -- déjà accueilli
  begin
    insert into hdar.live_messages (thread_id, from_id, body) values (hdar.thread_of(hdar.bot_id(), new.user_id), hdar.bot_id(),
      left(case when cfg.dm_text like '%{provenance}%'
                then replace(replace(cfg.dm_text, '{pseudo}', new.pseudo), '{provenance}', coalesce(hdar.welcome_extra(new.user_id), ''))
                else replace(cfg.dm_text, '{pseudo}', new.pseudo) || coalesce(hdar.welcome_extra(new.user_id), '') end, 2000));
    update hdar.bot_welcome set dm_at = now() where user_id = new.user_id;
    perform hdar.bot_flush_salon();
  exception when others then null; -- l'accueil ne doit jamais empêcher la création du profil
  end;
  return new;
end $$;

-- Le bloc provenance se place avant « Toutes les réponses… » dans le texte actuel (placeholder {provenance}).
update hdar.bot_settings set dm_text = replace(dm_text, E'\n\nToutes les réponses', E'{provenance}\n\nToutes les réponses')
where dm_text not like '%{provenance}%' and dm_text like E'%\n\nToutes les réponses%';

-- Parrainage validé (photo approuvée) : 3 jours hdar+ pour les deux, comme avant (le boost, lui, part dès le profil créé).
create or replace function hdar.ref_settle(u text) returns void language plpgsql security definer set search_path to '' as $$
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
    -- Confidentialité : aucune notification au parrain (l'heure trahirait le filleul) ; il voit seulement ses compteurs.
  end if;
end $$;

-- Boost de parrainage : dès qu'un vrai profil est créé avec le lien (pas besoin de photo).
-- Anti-abus : pas d'auto-parrainage (même compte ou même appareil), 10 max / 30 jours,
-- et une seule fois par personne parrainée, même si son profil est supprimé puis recréé
-- (empreinte md5 du compte, sans donnée lisible, gardée 1 an).
alter table hdar.referrals add column if not exists boost_at timestamptz;
create table if not exists hdar.referral_ledger (
  referred_hash text primary key,
  referrer text not null,
  at timestamptz not null default now()
);
alter table hdar.referral_ledger enable row level security;
revoke all on hdar.referral_ledger from anon, authenticated;

create or replace function hdar.ref_boost(u text) returns void language plpgsql security definer set search_path to '' as $$
declare r hdar.referrals; me hdar.profiles; par hdar.profiles; h text; n int;
begin
  select * into r from hdar.referrals where referred = u and boost_at is null for update;
  if r.referred is null then return; end if;
  select * into me from hdar.profiles where user_id = u;
  select * into par from hdar.profiles where user_id = r.referrer;
  if me.profile_at is null or par.user_id is null then return; end if;
  if me.user_id = par.user_id or me.auth_user_id = par.auth_user_id then return; end if;
  h := md5('hdar-ref:' || coalesce(me.auth_user_id::text, me.user_id));
  insert into hdar.referral_ledger (referred_hash, referrer) values (h, r.referrer) on conflict do nothing;
  if not found then return; end if; -- déjà compté une fois (profil recréé)
  update hdar.referrals set boost_at = now() where referred = u;
  select count(*) into n from hdar.referrals where referrer = r.referrer and boost_at > now() - interval '30 days';
  if n > 10 then return; end if;
  insert into hdar.boost_credits as b (user_id, earned) values (r.referrer, 1)
  on conflict (user_id) do update set earned = b.earned + 1, updated_at = now();
end $$;

-- Rattachement du parrainage (inchangé) + boost immédiat.
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
  perform hdar.ref_boost(s);
  perform hdar.ref_settle(s);
  return jsonb_build_object('ok', true);
end $$;

-- Admin : ce que rapportent les parrains selon le réseau par lequel ils sont eux-mêmes arrivés.
create or replace function public.hdar_admin_ref_network(p_key text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 400));
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(t order by t.filleuls desc) from (
    select coalesce(pr.ref, '(sans lien)') source, count(distinct r.referrer)::int parrains, count(*)::int filleuls,
           count(r.boost_at)::int boosts, count(r.rewarded_at)::int valides
    from hdar.referrals r left join hdar.profile_refs pr on pr.user_id = r.referrer
    where r.created_at >= since group by 1) t), '[]'::jsonb);
end $$;
revoke all on function public.hdar_admin_ref_network(text, int) from public, anon;
grant execute on function public.hdar_admin_ref_network(text, int) to authenticated;

select cron.schedule('hdar_ref_ledger_purge', '23 4 * * *', $$delete from hdar.referral_ledger where at < now() - interval '1 year'$$);

-- Compteur du membre : boosts gagnés / utilisés / restants, filleuls.
create or replace function public.hdar_boost_credits() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); b hdar.boost_credits;
begin
  perform hdar.require_profile(s);
  select * into b from hdar.boost_credits where user_id = s;
  return jsonb_build_object('code', hdar.ensure_ref_code(s),
    'earned', coalesce(b.earned, 0), 'used', coalesce(b.used, 0), 'left', greatest(coalesce(b.earned, 0) - coalesce(b.used, 0), 0),
    'filleuls', (select count(*) from hdar.referrals where referrer = s),
    'validated', (select count(*) from hdar.referrals where referrer = s and rewarded_at is not null),
    'hours', 1);
end $$;
revoke all on function public.hdar_boost_credits() from public, anon;
grant execute on function public.hdar_boost_credits() to authenticated;

-- Utiliser un boost gratuit (1 h, s'ajoute après un boost en cours).
create or replace function public.hdar_boost_credit_use() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); b hdar.boost_credits; label text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'boost_credit', 10, interval '1 hour');
  select * into b from hdar.boost_credits where user_id = s for update;
  if b.user_id is null or b.earned - b.used <= 0 then raise exception 'Aucun boost gratuit disponible'; end if;
  update hdar.boost_credits set used = used + 1, updated_at = now() where user_id = s;
  label := hdar.grant_gift(s, 'boost', 1, 'Boost parrainage');
  return jsonb_build_object('label', label, 'left', b.earned - b.used - 1);
end $$;
revoke all on function public.hdar_boost_credit_use() from public, anon;
grant execute on function public.hdar_boost_credit_use() to authenticated;

-- Ménage : une ref en attente sans profil créé disparaît après 30 jours.
select cron.schedule('hdar_pending_refs_purge', '17 4 * * *', $$delete from hdar.pending_refs where at < now() - interval '30 days'$$);
