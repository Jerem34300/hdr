-- hdar v77b — Les visites ?ref= arrivent avant l'écran 18+, donc sans session : hdar_ref_visit doit
-- être appelable avec la simple clé publique (comme hdar_gate). Compteur jour × ref, aucune donnée personnelle.
grant execute on function public.hdar_ref_visit(text) to anon;
