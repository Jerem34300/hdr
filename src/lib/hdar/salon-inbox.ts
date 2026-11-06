/**
 * Salons dans la boîte de réception : liste, non lus et réponses à mes messages pour les salons
 * suivis sur cet appareil. Sonnette Realtime (nudge:u) + secours 30 s / idle 2 min.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { myTopic, salonsInbox, type InboxSalon } from "./live";
import { startPoll } from "./poll";
import { playMessageSound } from "./sounds";
import { useHdar } from "./store";

/** badge = nouveaux messages depuis la dernière ouverture de « Salons » (bouton du haut). */
type State = { salons: InboxSalon[] | null; unread: number; badge: number };
let state: State = { salons: null, unread: 0, badge: 0 };
const ACK_KEY = "hdar-salons-ack";
let perSalon: Record<string, number> = {};
function readAck(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(ACK_KEY) || "{}") as Record<string, number>; } catch { return {}; }
}
function badgeFrom(counts: Record<string, number>) {
  const ack = readAck();
  let n = 0, changed = false;
  for (const id of Object.keys(ack)) if (!(id in counts) || counts[id] < ack[id]) { ack[id] = counts[id] ?? 0; changed = true; } // salon lu ou quitté
  for (const [id, c] of Object.entries(counts)) n += Math.max(0, c - (ack[id] ?? 0));
  if (changed) localStorage.setItem(ACK_KEY, JSON.stringify(ack));
  return n;
}
/** Ouverture de la section Salons : le badge du bouton repart de zéro (les non-lus par salon restent). */
export function ackSalonsBadge() {
  localStorage.setItem(ACK_KEY, JSON.stringify(perSalon));
  if (state.badge) { state = { ...state, badge: 0 }; emit(); }
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const knownReplies = new Map<string, number>();
let started = false;

function seenMap() {
  const st = useHdar.getState();
  const out: Record<string, string> = {};
  for (const id of st.followedSalons) out[id] = new Date(st.salonSeen[id] ?? Date.now() - 24 * 3600 * 1000).toISOString();
  return out;
}

async function poll() {
  const st = useHdar.getState();
  if (document.visibilityState !== "visible") return;
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
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (!followed.has(r.id) || r.id === open) continue;
      unread += r.unread ?? 0;
      counts[r.id] = r.unread ?? 0;
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
    perSalon = counts;
    const cur = useHdar.getState();
    if (cur.view.name === "tabs" && cur.tab === "inbox") localStorage.setItem(ACK_KEY, JSON.stringify(counts));
    state = { salons: rows, unread, badge: badgeFrom(counts) };
    emit();
  } catch {
    /* hors ligne : on garde l'état précédent */
  }
}

let stopPoll: (() => void) | null = null;

/** Relance un sondage tout de suite (ex. après avoir ouvert ou quitté un salon). */
export function refreshSalonInbox() {
  if (!started) return;
  void poll();
}

/** À monter une fois dans l'appli. Sonnette Realtime (nudge:u dm/salon) + secours lent. */
export function useSalonInboxPolling() {
  useEffect(() => {
    if (started) return;
    started = true;
    // Avant : 5 s sur l'onglet Messages / 15 s sinon, sans Realtime → N×12 RPC/min/user.
    // Après : sonnette perso (v127 + v135 salon), secours 30 s / idle 2 min.
    stopPoll = startPoll(poll, {
      every: 30_000,
      idle: 120_000,
      topic: myTopic().catch(() => null),
      events: ["dm", "salon"],
    });
    return () => {
      started = false;
      stopPoll?.();
      stopPoll = null;
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
