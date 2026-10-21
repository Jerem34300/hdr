-- hdar v74e — Rééquilibrage : quotas régionaux indicatifs, plafond dur national (5000). Additif.
create or replace function public.hdar_first_redeem(p_code text, p_region text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int; r int; c text; q hdar.first_quotas; used int;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'first_redeem', 10, interval '1 hour');
  if upper(btrim(coalesce(p_code, ''))) <> 'FIRST' then raise exception 'Code invalide'; end if;
  select * into q from hdar.first_quotas where region = lower(btrim(coalesce(p_region, '')));
  if q.region is null then raise exception 'Région inconnue : active ta position ou choisis ta ville'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_first'));
  select rank into r from hdar.founders where user_id = s;
  if r is not null then raise exception 'Tu es déjà Membre FIRST (n° %)', r; end if;
  select count(*) into used from hdar.founders where region = q.region;
  -- Quota régional = objectif d'affichage ; une région pleine puise dans les places nationales restantes (plafond dur : 5000).
  select count(*) into n from hdar.founders;
  if n >= (select sum(quota) from hdar.first_quotas) then raise exception 'Les places FIRST sont toutes parties 😢'; end if;
  insert into hdar.founders (user_id, rank, region) values (s, n + 1, q.region) returning city into c;
  insert into hdar.premium as pm (user_id, until, status) values (s, '2999-12-31', 'founder')
    on conflict (user_id) do update set until = '2999-12-31', status = case when pm.stripe_subscription is null then 'founder' else pm.status end, updated_at = now();
  perform hdar.founder_refill(s);
  return jsonb_build_object('rank', n + 1, 'remaining', public.hdar_first_remaining(), 'city', c, 'region', q.name,
    'region_remaining', greatest(0, q.quota - used - 1),
    'title', 'Bienvenue dans hdar+ 🎉', 'body', 'Membre FIRST n° ' || (n + 1) || ' : hdar+ à vie, boosts et cœurs offerts.');
end $$;
