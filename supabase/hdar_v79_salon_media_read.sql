-- hdar v79 — Photos/vidéos/vocaux des salons lisibles par les autres membres (« Photo indisponible » sinon).
-- hdar_can_read_media ne couvrait pas hdar.salon_messages : seuls l'auteur et les admins pouvaient signer l'URL.
-- Même règle que le chat du quartier et les lieux : message non retiré, salon actif, moins de 24 h (fenêtre de la purge). Additif.
create or replace function public.hdar_can_read_media(p_name text)
 returns boolean language plpgsql stable security definer set search_path to '' as $function$
declare s text;
begin
  if auth.uid() is null then return false; end if;
  begin s := hdar.self_id(); exception when others then s := null; end;
  if split_part(p_name, '/', 1) = auth.uid()::text then return true; end if;
  if exists (select 1 from hdar.admins a where a.auth_user_id = auth.uid()) then return true; end if;
  return (s is not null and exists (select 1 from hdar.live_messages m where m.media = 'sb:' || p_name
            and (split_part(m.thread_id, ':', 1) = s or split_part(m.thread_id, ':', 2) = s)))
    or exists (select 1 from hdar.area_messages a where a.media = p_name and not a.removed and a.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.place_messages p where p.media = p_name and not p.removed and p.created_at > now() - interval '24 hours')
    or exists (select 1 from hdar.spot_messages p where p.media = p_name and not p.removed)
    or exists (select 1 from hdar.salon_messages m join hdar.salons sa on sa.id = m.salon_id
               where m.media = p_name and not m.removed and not sa.removed and m.created_at > now() - interval '24 hours')
    or (s is not null and exists (select 1 from hdar.ads d where p_name = any(d.photos) and not d.hidden and d.expires_at > now()));
end $function$;
