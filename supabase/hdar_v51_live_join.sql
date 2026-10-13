-- v51 : « Rejoindre son live » depuis un profil — le ciblage direct (p_back) n'est plus réservé à hdar+ ; les filtres le restent.
do $$ declare d text := pg_get_functiondef('public.hdar_live_next'::regproc);
begin
  d := replace(d, 'if (filt or p_back is not null) and not prem then', 'if filt and not prem then');
  execute d;
end $$;

-- v51b : hdar_live_poll libère un appariement dont le partenaire ne donne plus signe de vie depuis 20 s (peer_gone).
-- (définition complète appliquée via la migration hdar_v51b_live_poll_ghost)
