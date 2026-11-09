-- v142 : sonnette Realtime aussi pour les visiteurs sans profil. Un visiteur peut être contacté et
-- appelé par un profil, mais hdar_my_topic ne lui donnait pas de canal perso (profil exigé) : son
-- téléphone vérifiait donc les appels toutes les 8 s et ses discussions toutes les 15 s. Le 8-9 nov.,
-- la vérification des appels restait la requête la plus fréquente. Le canal nudge:u:<id> est déjà
-- réservé à son propriétaire (hdar.typing_topic_ok) et ne porte que des sonnettes vides (aucun contenu).
-- Côté appli rien ne change : avec un canal, les relectures passent au coup de sonnette + secours lent.
-- Applied as migration hdar_v142_visitor_doorbell.

create or replace function public.hdar_my_topic() returns text
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null then return null; end if;
  return 'nudge:u:' || s;
end $$;
revoke all on function public.hdar_my_topic() from public, anon;
grant execute on function public.hdar_my_topic() to authenticated;
