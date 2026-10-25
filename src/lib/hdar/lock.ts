import { supabase } from "./session";
import { useHdar } from "./store";

/** Verrou PIN local : seul un hash PBKDF2 salé est stocké sur l'appareil, jamais le code. */
const PIN_KEY = "hdar-pin";
const FAILS_KEY = "hdar-pin-fails";
const HIDDEN_KEY = "hdar-pin-hidden-at";
export const MAX_TRIES = 5;
const ITER = 150_000;

type Stored = { salt: string; hash: string; iter: number; delay: number };
export type LockDelay = 0 | 60_000 | 300_000;

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, key, 256));
}
function read(): Stored | null {
  try { const v = JSON.parse(localStorage.getItem(PIN_KEY) || "null") as Stored | null; return v?.hash && v.salt ? v : null; } catch { return null; }
}
export const pinEnabled = () => !!read();
export const pinDelay = (): LockDelay => (read()?.delay ?? 0) as LockDelay;
export const pinFails = () => Number(localStorage.getItem(FAILS_KEY) || 0);

export async function setPin(pin: string, delay: LockDelay) {
  if (!/^\d{4}$/.test(pin)) throw new Error("Le code doit faire 4 chiffres");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(PIN_KEY, JSON.stringify({ salt: b64(salt), hash: await derive(pin, salt, ITER), iter: ITER, delay } satisfies Stored));
  localStorage.removeItem(FAILS_KEY);
}
export function setPinDelay(delay: LockDelay) {
  const s = read(); if (s) localStorage.setItem(PIN_KEY, JSON.stringify({ ...s, delay }));
}
export function clearPin() { localStorage.removeItem(PIN_KEY); localStorage.removeItem(FAILS_KEY); }

/** true si bon code ; sinon incrémente le compteur d'essais (persistant, un rechargement ne le remet pas à zéro). */
export async function verifyPin(pin: string) {
  const s = read(); if (!s) return true;
  const ok = (await derive(pin, unb64(s.salt), s.iter)) === s.hash;
  if (ok) localStorage.removeItem(FAILS_KEY); else localStorage.setItem(FAILS_KEY, String(pinFails() + 1));
  return ok;
}

export function markHidden() { try { sessionStorage.setItem(HIDDEN_KEY, String(Date.now())); } catch { /* rien */ } }
/** Faut-il redemander le code au retour au premier plan ? */
export function shouldRelock() {
  const s = read(); if (!s) return false;
  const at = Number(sessionStorage.getItem(HIDDEN_KEY) || 0);
  return !at || Date.now() - at >= s.delay;
}

/** Déconnexion complète de l'appareil : session Supabase + toutes les données hdar locales (stockage, caches, IndexedDB). */
export async function logoutDevice() {
  try { useHdar.getState().reset(); } catch { /* rien */ }
  try { await supabase().auth.signOut({ scope: "local" }); } catch { /* session déjà absente */ }
  for (const k of Object.keys(localStorage)) {
    if (k === "hdar-adult") continue; // le choix 18+ reste mémorisé
    if (k.startsWith("hdar") || k.startsWith("sb-")) localStorage.removeItem(k);
  }
  try { sessionStorage.clear(); } catch { /* rien */ }
  try { if ("caches" in window) for (const n of await caches.keys()) await caches.delete(n); } catch { /* rien */ }
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(dbs.map((d) => d.name && new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null); })));
  } catch { /* rien */ }
  window.location.replace("/");
}
