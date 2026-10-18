/**
 * Salons dans la boîte de réception : liste, non lus et réponses à mes messages pour les salons
 * suivis sur cet appareil. Un seul sondage partagé (toutes les 15 s, 5 s sur l'onglet Messages).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { salonsInbox, type InboxSalon } from "./live";
import { playMessageSound } from "./sounds";
import { useHdar } from "./store";

type State = { salons: InboxSalon[] | null; unread: number };
let state: State = { salons: null, unread: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const knownReplies = new Map<string, number>();
let started = false;
let timer = 0;

function seenMap() {
  const st = useHdar.getState();
  const out: Record<string, string> = {};
  for (const id of st.followedSalons) out[id] = new Date(st.salonSeen[id] ?? Date.now() - 24 * 3600 * 1000).toISOString();
  return out;
}

async function poll() {
  const st = useHdar.getState();
  if (document.visibilityState === "visible") {
    try {
      const open = st.view.name === "salon" ? st.view.id : null;
      if (open) st.markSalonSeen(open);
      const rows = await salonsInbox(seenMap());
      // Les salons où j'ai écrit dans les dernières 24 h sont suivis automatiquement, sauf ceux quittés à la main.
      for (const r of rows) {
        const now = useHdar.getState();
        if ((r.wrote || r.mine) && !now.followedSalons.includes(r.id) && !now.leftSalons.includes(r.id)) now.followSalon(r.id);
      }
      const followed = new Set(useHdar.getState().followedSalons);
      let unread = 0;
      for (const r of rows) {
        if (!followed.has(r.id) || r.id === open) continue;
        unread += r.unread ?? 0;
        const replies = r.replies ?? 0;
        const before = knownReplies.get(r.id) ?? 0;
        if (replies > before && state.salons !== null) {
          playMessageSound();
          toast(`${r.last?.pseudo ?? "Quelqu'un"} t'a répondu dans ${r.name}`, {
            action: { label: "Ouvrir", onClick: () => useHdar.getState().openSalon(r.id, r.name) },
          });
        }
        knownReplies.set(r.id, replies);
      }
      state = { salons: rows, unread };
      emit();
    } catch {
      /* hors ligne : on garde l'état précédent */
    }
  }
  const s = useHdar.getState();
  const fast = s.view.name === "tabs" && s.tab === "inbox";
  timer = window.setTimeout(() => void poll(), fast ? 5000 : 15000);
}

/** Relance un sondage tout de suite (ex. après avoir ouvert ou quitté un salon). */
export function refreshSalonInbox() {
  if (!started) return;
  window.clearTimeout(timer);
  void poll();
}

/** À monter une fois dans l'appli. */
export function useSalonInboxPolling() {
  useEffect(() => {
    if (started) return;
    started = true;
    void poll();
    const onVis = () => document.visibilityState === "visible" && refreshSalonInbox();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      started = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
}

export function useSalonInbox(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}
