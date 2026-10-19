-- v65 : verrouillage RLS de hdar.admins et hdar.identities (défense en profondeur).
-- Constat : RLS désactivé, mais aucun GRANT pour anon/authenticated/service_role.
-- Aucun accès direct depuis le front ni les edge functions : tout passe par
-- hdar.admin_check() / hdar.self_id(), appelées dans des fonctions SECURITY DEFINER
-- appartenant à postgres (propriétaire des tables => RLS non appliqué, pas de FORCE).
-- On active RLS sans aucune policy (= tout refusé hors propriétaire) et on
-- révoque explicitement tout droit, pour qu'un futur GRANT accidentel n'expose rien.
alter table hdar.admins     enable row level security;
alter table hdar.identities enable row level security;
revoke all on table hdar.admins     from public, anon, authenticated;
revoke all on table hdar.identities from public, anon, authenticated;
