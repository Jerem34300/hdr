/**
 * Qui est là dans un salon ou dans le chat du quartier. L'écran de discussion ouvert signale sa
 * présence toutes les 15 s (en ligne = passé dans le salon ces 5 dernières minutes) ; la liste des discussions lit
 * les compteurs toutes les 20 s.
 */
import { useEffect, useState } from "react";
import { roomHere, roomsOnline, type RoomPerson } from "./live";

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
      timer = window.setTimeout(tick, 15000);
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

type Online = { area: number; area_last?: string | null; salons: Record<string, number> } | null;
let online: Online = null;
const listeners = new Set<() => void>();
let users = 0;
let timer = 0;
let pos: { lat: number | null; lng: number | null } = { lat: null, lng: null };

async function poll() {
  window.clearTimeout(timer);
  if (document.visibilityState === "visible") {
    try {
      online = await roomsOnline(pos.lat, pos.lng);
      listeners.forEach((l) => l());
    } catch {
      /* hors ligne : on garde les derniers compteurs */
    }
  }
  if (users > 0) timer = window.setTimeout(() => void poll(), 20000);
}

/** Compteurs « en ligne » (hors moi) pour la liste des discussions, un seul sondage partagé. */
export function useRoomsOnline(lat: number | null, lng: number | null): Online {
  const [, force] = useState(0);
  const la = lat == null ? null : Number(lat.toFixed(3));
  const ln = lng == null ? null : Number(lng.toFixed(3));
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    users++;
    const moved = pos.lat !== la || pos.lng !== ln;
    pos = { lat: la, lng: ln };
    if (users === 1 || moved) void poll();
    return () => {
      listeners.delete(l);
      users--;
      if (users === 0) window.clearTimeout(timer);
    };
  }, [la, ln]);
  return online;
}
