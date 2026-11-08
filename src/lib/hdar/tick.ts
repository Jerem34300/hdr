/**
 * Battement commun (v138) : UNE requête toutes les 40-50 s (lancée par activity.ts) remplace sept relevés
 * séparés. Les écrans lisent ici leur part ; `requestTick()` relance un battement tout de suite (ex. juste
 * après avoir activé un boost). Les notifications, marquées lues côté serveur à la lecture, attendent ici
 * qu'un écran les prenne.
 */
import { useSyncExternalStore } from "react";
import type { Notice, TickData } from "./live";

let data: TickData = {};
let pending: Notice[] = [];
const listeners = new Set<() => void>();
const noticeListeners = new Set<() => void>();
let requester: (() => void) | null = null;

export function publishTick(t: TickData) {
  data = t;
  if (t.notices?.length) {
    pending = [...pending, ...t.notices];
    noticeListeners.forEach((l) => l());
  }
  listeners.forEach((l) => l());
}

export function setTickRequester(fn: (() => void) | null) {
  requester = fn;
}
export const requestTick = () => requester?.();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Une part du dernier battement (référence stable entre deux battements). */
export function useTick<T>(pick: (t: TickData) => T): T {
  return useSyncExternalStore(subscribe, () => pick(data), () => pick({}));
}

/** Prend les notifications en attente (une seule fois) et prévient quand il en arrive. */
export function takeNotices(): Notice[] {
  const out = pending;
  pending = [];
  return out;
}
export function onNotices(l: () => void) {
  noticeListeners.add(l);
  return () => void noticeListeners.delete(l);
}
