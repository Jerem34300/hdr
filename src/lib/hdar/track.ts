/**
 * Parcours anonyme des visiteurs (admin « Visiteurs ») : quelles étapes un appareil a atteintes
 * (entrée, carte, position, onglets, profil, messages…), d'où il vient et sur quel appareil.
 * Aucun contenu, aucune position, aucun identifiant publicitaire. Voir supabase/hdar_v58_visitors_salons.sql.
 */
import { SUPABASE_KEY, SUPABASE_URL, accessToken } from "./session";

const LANDING_KEY = "hdar-landing";

type Landing = { source: string; landing: string };

/** Première arrivée sur le site (n'importe quelle page), gardée une seule fois par appareil. */
export function rememberLanding() {
  try {
    if (localStorage.getItem(LANDING_KEY)) return;
    const q = new URLSearchParams(location.search);
    let source = "direct";
    const utm = q.get("utm_source");
    if (utm) source = `utm:${utm}`;
    else if (q.get("r")) source = "parrainage";
    else if (document.referrer) {
      try {
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (!host.endsWith("hdar.chat")) source = host;
      } catch {
        /* referrer illisible */
      }
    }
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const landing: Landing = { source: source.toLowerCase().slice(0, 80), landing: path.slice(0, 120) };
    localStorage.setItem(LANDING_KEY, JSON.stringify(landing));
  } catch {
    /* stockage indisponible */
  }
}

function context() {
  let landing: Partial<Landing> = {};
  try {
    landing = JSON.parse(localStorage.getItem(LANDING_KEY) || "{}") as Partial<Landing>;
  } catch {
    /* rien */
  }
  const ua = navigator.userAgent;
  const platform = /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) ? "ios" : /mobile/i.test(ua) ? "mobile" : "ordinateur";
  const pwa = typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches;
  return { source: landing.source ?? null, landing: landing.landing ?? null, platform, pwa };
}

const sent = new Set<string>();
const queue: string[] = [];
let timer = 0;
let ctxSent = false;

async function flush() {
  timer = 0;
  const steps = queue.splice(0, 20);
  if (!steps.length) return;
  try {
    const token = await accessToken();
    const args: Record<string, unknown> = { p_steps: steps, p_ctx: ctxSent ? null : context() };
    ctxSent = true;
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_track`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      keepalive: true,
    });
  } catch {
    /* statistique facultative */
  }
  if (queue.length) timer = window.setTimeout(() => void flush(), 1500);
}

/** Note qu'une étape a été atteinte (une fois par chargement de page suffit). */
export function track(step: string) {
  if (typeof window === "undefined") return;
  const s = step.toLowerCase().replace(/[^a-z0-9_:.-]/g, "").slice(0, 40);
  if (!s || sent.has(s)) return;
  sent.add(s);
  queue.push(s);
  if (!timer) timer = window.setTimeout(() => void flush(), 1500);
}

const gateSent = new Set<string>();
/** Écran d'entrée 18+ : simple compteur sans identifiant (le visiteur n'a pas encore de session). */
export function trackGate(kind: "gate_view" | "gate_enter" | "gate_error") {
  if (typeof window === "undefined" || gateSent.has(kind)) return;
  gateSent.add(kind);
  void fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_gate`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_kind: kind }),
    keepalive: true,
  }).catch(() => undefined);
}
