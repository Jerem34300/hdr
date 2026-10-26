/**
 * Provenance des liens partenaires : hdar.chat/?ref=next1 (compatible avec &code=FIRST, géré à part).
 * La 1re ref vue est gardée 30 jours sur l'appareil (localStorage). Côté serveur : un simple compteur
 * jour × ref (aucune IP, aucun identifiant d'appareil), puis la ref est rattachée au profil à sa création.
 * Voir supabase/hdar_v77_ref_sources.sql.
 */
import { SUPABASE_KEY, SUPABASE_URL, accessToken, authUserId } from "./session";

const KEY = "hdar-src";
const SENT = "hdar-src-visit";
const DONE = "hdar-src-done";
const TTL = 30 * 24 * 3600_000;
const RE = /^[a-z0-9_-]{1,32}$/;

type Stored = { ref: string; at: number };

function read(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as Stored | null;
    if (!v || !RE.test(v.ref) || Date.now() - v.at > TTL) return null;
    return v;
  } catch {
    return null;
  }
}

/** Ref active (30 jours après la 1re visite), sinon null. */
export const sourceRef = () => (typeof window === "undefined" ? null : read()?.ref ?? null);

async function call(fn: string, args: Record<string, unknown>, anonOk = false) {
  // Avant l'écran 18+ il n'y a pas encore de session : la visite part avec la simple clé publique.
  const token = anonOk && !(await authUserId().catch(() => null)) ? SUPABASE_KEY : await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    keepalive: true,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json().catch(() => null) as Promise<unknown>;
}

/** À l'arrivée : mémorise ?ref= (la 1re gagne pendant 30 jours) et compte 1 visite par jour et par appareil. */
export function captureSourceRef() {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(location.search);
    // ?code=FIRST (ou autre code cadeau) est gardé aussi dès l'arrivée, avant l'écran 18+, comme dans growth.tsx.
    const gc = q.get("code");
    if (gc && /^[A-Za-z0-9-]{3,24}$/.test(gc)) localStorage.setItem("hdar-code", gc.toUpperCase());
    const raw = (q.get("ref") || "").trim().toLowerCase().slice(0, 32);
    let cur = read();
    let fresh = false;
    if (raw && RE.test(raw) && !cur) {
      fresh = true;
      cur = { ref: raw, at: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(cur));
      localStorage.removeItem(DONE);
    }
    if (!cur) return;
    // Seulement les visites qui arrivent par un lien ?ref= (pas chaque retour sur le site).
    if (!raw || raw !== cur.ref) return;
    const day = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
    const mark = `${day}:${cur.ref}`;
    if (localStorage.getItem(SENT) === mark) return;
    localStorage.setItem(SENT, mark);
    void call("hdar_ref_visit", { p_ref: cur.ref, p_new: fresh }, true).catch(() => localStorage.removeItem(SENT));
  } catch {
    /* stockage indisponible : statistique facultative */
  }
}

/** Rattache la ref : avant le profil elle est gardée en attente côté serveur (v94), puis liée à sa création (réessayé à chaque ouverture tant que ça n'a pas marché). */
export async function attachSourceRef() {
  // Venu par le lien d'invitation d'un membre (?r=CODE) sans autre ref : provenance « parrainage ».
  const ref = sourceRef() ?? (localStorage.getItem("hdar-ref") ? "parrainage" : null);
  if (!ref || localStorage.getItem(DONE) === ref) return;
  try {
    await call("hdar_ref_profile", { p_ref: ref });
    localStorage.setItem(DONE, ref);
  } catch {
    /* profil pas encore créé */
  }
}
