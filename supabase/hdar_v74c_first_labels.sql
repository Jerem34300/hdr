-- hdar v74c — Libellés « Membre FIRST » dans les messages serveur. Additif.

create or replace function public.hdar_first_boost() returns timestamptz
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); st timestamptz;
begin
  if not exists (select 1 from hdar.founders where user_id = s) then raise exception 'Réservé aux membres FIRST (entre le code FIRST)'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_fb:' || s));
  if exists (select 1 from hdar.founder_boosts where user_id = s and kind = 'profile' and at > now() - interval '24 hours') then
    raise exception 'Ton boost offert revient 24 h après le précédent'; end if;
  select greatest(now(), coalesce(max(ends_at), now())) into st from hdar.boosts where user_id = s and not cancelled;
  insert into hdar.boosts (user_id, starts_at, ends_at, price_cents, note) values (s, st, st + interval '1 hour', 0, 'FIRST');
  insert into hdar.founder_boosts (user_id, kind) values (s, 'profile');
  return st + interval '1 hour';
end $$;

create or replace function public.hdar_first_ad_boost(p_id uuid) returns timestamptz
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); en timestamptz;
begin
  if not exists (select 1 from hdar.founders where user_id = s) then raise exception 'Réservé aux membres FIRST (entre le code FIRST)'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_fab:' || s));
  if exists (select 1 from hdar.founder_boosts where user_id = s and kind = 'ad' and at > now() - interval '7 days') then
    raise exception 'Ton boost d''annonce offert revient 7 jours après le précédent'; end if;
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

create or replace function public.hdar_first_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int; r int; c text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'first_redeem', 10, interval '1 hour');
  if upper(btrim(coalesce(p_code, ''))) <> 'FIRST' then raise exception 'Code invalide'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_first'));
  select rank into r from hdar.founders where user_id = s;
  if r is not null then raise exception 'Tu es déjà Membre FIRST (n° %)', r; end if;
  select count(*) into n from hdar.founders;
  if n >= 1000 then raise exception 'Les 1000 places FIRST sont parties 😢'; end if;
  insert into hdar.founders (user_id, rank) values (s, n + 1) returning city into c;
  insert into hdar.premium as pm (user_id, until, status) values (s, '2999-12-31', 'founder')
    on conflict (user_id) do update set until = '2999-12-31', status = case when pm.stripe_subscription is null then 'founder' else pm.status end, updated_at = now();
  perform hdar.founder_refill(s);
  return jsonb_build_object('rank', n + 1, 'remaining', 1000 - n - 1, 'city', c,
    'title', 'Bienvenue dans hdar+ 🎉', 'body', 'Membre FIRST n° ' || (n + 1) || coalesce(' · ' || c, '') || ' : hdar+ à vie, boosts et cœurs offerts.');
end $$;
