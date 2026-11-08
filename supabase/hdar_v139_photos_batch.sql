-- v139 : photos de profil par lots, en lecture seule. Chaque avatar affiché (salons, discussions,
-- listes) appelait hdar_profile_get, qui compte une VISITE de profil (bump_user + profile_views) :
-- les stats « qui a vu mon profil » étaient gonflées par les simples avatars, et une liste de 84
-- avatars faisait 84 requêtes et 168 écritures (8 nov., 11 h 40). hdar_photos renvoie seulement les
-- photos (validées, ou la sienne) d'au plus 100 personnes en une requête, sans rien compter.
-- À appliquer AVANT de mettre en ligne l'appli correspondante (sinon repli sur l'ancien appel).
-- Applied as migration hdar_v139_photos_batch.

create or replace function public.hdar_photos(p_ids text[]) returns table(id text, photo text)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  return query
    select p.user_id, case when p.user_id = s or p.photo_status = 'approved' then p.photo end
    from hdar.profiles p
    where p.user_id = any((p_ids)[1:100]) and not hdar.is_blocked(s, p.user_id);
end $$;
revoke all on function public.hdar_photos(text[]) from public, anon;
grant execute on function public.hdar_photos(text[]) to authenticated;
