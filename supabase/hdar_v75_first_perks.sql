-- hdar v75 — Avantages FIRST : 3 boosts profil d'1 h / 24 h glissantes ; boost d'annonce France 24 h, 1 / 24 h. Additif.

create or replace function public.hdar_first_boost() returns timestamptz
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); st timestamptz;
begin
  if not exists (select 1 from hdar.founders where user_id = s) then raise exception 'Réservé aux membres FIRST (entre le code FIRST)'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_fb:' || s));
  if (select count(*) from hdar.founder_boosts where user_id = s and kind = 'profile' and at > now() - interval '24 hours') >= 3 then
    raise exception 'Tes 3 boosts offerts sont utilisés : le prochain revient 24 h après le plus ancien'; end if;
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
  if exists (select 1 from hdar.founder_boosts where user_id = s and kind = 'ad' and at > now() - interval '24 hours') then
    raise exception 'Ton boost d''annonce offert revient 24 h après le précédent'; end if;
  if not exists (select 1 from hdar.ads where id = p_id and user_id = s and expires_at > now() and not hidden) then
    raise exception 'Annonce introuvable ou expirée'; end if;
  update hdar.ads set
    boost_scope = case when boost_until > now() and boost_scope in ('france','monde') then boost_scope else 'france' end,
    boost_until = greatest(now(), coalesce(boost_until, now())) + interval '24 hours'
  where id = p_id returning boost_until into en;
  update hdar.ads set expires_at = greatest(expires_at, en) where id = p_id;
  insert into hdar.founder_boosts (user_id, kind, ref) values (s, 'ad', p_id::text);
  return en;
end $$;

create or replace function public.hdar_first_me() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); f hdar.founders; pb timestamptz; ab timestamptz;
begin
  select * into f from hdar.founders where user_id = s;
  if f.user_id is null then return jsonb_build_object('founder', false, 'remaining', public.hdar_first_remaining()); end if;
  perform hdar.founder_refill(s);
  -- 3 boosts profil par 24 h glissantes : prochain dispo = plus ancien des 3 derniers + 24 h (null si dispo).
  select case when count(*) >= 3 then min(at) end into pb from (select at from hdar.founder_boosts where user_id = s and kind = 'profile' and at > now() - interval '24 hours' order by at desc limit 3) t;
  select max(at) into ab from hdar.founder_boosts where user_id = s and kind = 'ad';
  return jsonb_build_object('founder', true, 'rank', f.rank, 'city', f.city, 'region', (select name from hdar.first_quotas where region = f.region),
    'remaining', public.hdar_first_remaining(), 'profile_boost_at', pb + interval '24 hours', 'ad_boost_at', ab + interval '24 hours', 'profile_boosts_left', 3 - (select count(*) from hdar.founder_boosts where user_id = s and kind = 'profile' and at > now() - interval '24 hours'));
end $$;
