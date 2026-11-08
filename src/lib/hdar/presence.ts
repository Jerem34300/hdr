/**
 * Qui est là dans un salon ou dans le chat du quartier. L'écran de discussion ouvert signale sa
 * présence toutes les 30-40 s (en ligne = passé dans le salon ces 5 dernières minutes) ; la liste des discussions lit
 * les compteurs dans le battement commun.
 */
import { useEffect, useState } from "react";
import { roomHere, type RoomPerson } from "./live";
import { useTick } from "./tick";

export type RoomPresence = { n: number; people: RoomPerson[] };

/** `null` tant qu'on ne sait pas (ou base pas encore à jour) : rien n'est affiché. */
export function useRoomPresence(room: string, pseudo: string, lat: number | null = null, lng: number | null = null) {
  const [state, setState] = useState<RoomPresence | null>(null);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") {
        roomHere(room, pseudo || "Anonyme", lat, lng)
          .then((r) => alive && setState(r))
          .catch(() => undefined);
      }
      timer = window.setTimeout(tick, 45_000 + Math.random() * 15_000); // en ligne = vu ces 5 min : 45-60 s suffit
    };
    // On reste compté « dans le salon » 5 min après l'avoir quitté (comme « vu récemment »).
    const onVis = () => document.visibilityState === "visible" && tick();
    tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [room, pseudo, lat, lng]);
  return state;
}

/** Compteurs « en ligne » (hors moi) pour la liste des discussions : lus dans le battement commun (v138). */
export function useRoomsOnline() {
  return useTick((t) => t.rooms_online) ?? null;
}
