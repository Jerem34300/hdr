-- À LANCER AU DÉPLOIEMENT (pas une migration, pas encore exécuté).
-- Profils existants : Membre FIRST d'office (hdar+ à vie, boosts, cœurs) + message in-app du compte officiel
-- « Hdar admin ». Le push part tout seul via le trigger existant des messages (si la personne est abonnée). Aucun email.
-- Idempotent : ne touche que les profils pas encore Membre FIRST. Les admins sont exclus.
begin;
do $$
declare official text := '8e6ac18b-534f-4230-aec8-8934035df8e8';  -- profil « Hdar admin »
  p record; n int;
  msg text := 'Cadeau 🎁 Tu fais partie des premiers sur hdar : hdar+ est offert à vie, sans rien faire. Merci ! Partage le bon plan à tes potes pour faire vivre la carte.';
begin
  if not exists (select 1 from hdar.profiles where user_id = official) then raise exception 'Compte officiel introuvable'; end if;
  perform pg_advisory_xact_lock(hashtext('hdar_first'));
  select count(*) into n from hdar.founders;
  for p in select pr.user_id from hdar.profiles pr
           where not exists (select 1 from hdar.founders f where f.user_id = pr.user_id)
             and not hdar.is_admin_user(pr.user_id)
           order by pr.created_at loop
    n := n + 1;
    exit when n > (select sum(quota) from hdar.first_quotas);
    insert into hdar.founders (user_id, rank, region) values (p.user_id, n, null);  -- région inconnue : compte dans le total, pas dans un quota régional
    insert into hdar.premium as pm (user_id, until, status) values (p.user_id, '2999-12-31', 'founder')
      on conflict (user_id) do update set until = '2999-12-31', status = case when pm.stripe_subscription is null then 'founder' else pm.status end, updated_at = now();
    perform hdar.founder_refill(p.user_id);
    insert into hdar.live_messages (thread_id, from_id, body) values (hdar.thread_of(official, p.user_id), official, msg);
  end loop;
end $$;
-- Contrôle avant commit :
select count(*) as membres_first, count(*) filter (where region is null) as sans_region from hdar.founders;
commit;
