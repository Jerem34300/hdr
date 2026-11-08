-- v137 : sonnette Realtime pour les appels. Chaque signal d'appel (offre, réponse, raccrocher) sonne le
-- canal perso du destinataire (nudge:u:<id>, événement « call », broadcast vide). L'appli ne relit
-- plus les signaux toutes les 3 s au repos (c'était la requête la plus fréquente : ~1 000 en 20 min
-- pour une dizaine de personnes le 7 nov.) mais au coup de sonnette, avec un secours toutes les 30 s.
-- À appliquer AVANT de mettre en ligne l'appli correspondante (sinon un appel peut mettre 30 s à sonner).
-- Applied as migration hdar_v137_call_ring.

create or replace function hdar.rtc_signal_ring_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform hdar.nudge('nudge:u:' || new.to_id, 'call');
  return null;
exception when others then return null;
end $$;
revoke execute on function hdar.rtc_signal_ring_trg() from public, anon, authenticated;
drop trigger if exists rtc_signal_ring on hdar.rtc_signals;
create trigger rtc_signal_ring after insert on hdar.rtc_signals
  for each row execute function hdar.rtc_signal_ring_trg();
