// Test de charge hdar : simule N personnes connectées qui envoient les requêtes de fond de l'appli
// (mélange relevé dans les journaux Supabase du 8-9 nov.), en lecture seule : aucun message, aucune
// présence, rien d'affiché aux vrais utilisateurs. Montée par paliers, arrêt automatique si la base
// souffre (plus de 2 % d'erreurs ou 95 % des réponses au-delà de 3 s).
import { appendFileSync } from "node:fs";

const URL = "https://hoomzhgqzwuystwburfa.supabase.co";
const KEY = "sb_publishable_BWmk7ZH_jG2Vp2muud3w_w_TllpzneU";
const STAGES = (process.env.STAGES || "25,50,100,200,300").split(",").map(Number);
const STAGE_MS = Number(process.env.STAGE_SECONDS || 120) * 1000;
const PER_USER_MIN = 22; // requêtes par personne et par minute (mesuré)
const SESSIONS = 5;

const lat = 43.611, lng = 3.877, b = { p_s: lat - 0.05, p_w: lng - 0.05, p_n: lat + 0.05, p_e: lng + 0.05 };
const since = () => new Date(Date.now() - 3600_000).toISOString();
// [nom, poids relevé, paramètres, réservé aux sessions]
const MIX = [
  ["hdar_signal_poll", 480, () => ({ p_self: "", p_after: 0 }), true],
  ["hdar_recent_activity", 196, () => ({ p_lat: lat, p_lng: lng }), false],
  ["hdar_first_remaining", 199, () => ({}), false],
  ["hdar_first_region", 186, () => ({ p_region: "occitanie" }), false],
  ["hdar_map_recent", 141, () => b, true],
  ["hdar_live_map", 140, () => ({}), true],
  ["hdar_conversations", 139, () => ({ p_self: "" }), true],
  ["hdar_spot_list", 131, () => ({ p_self: "", p_lat: lat, p_lng: lng }), true],
  ["hdar_tick", 127, () => ({ p_lat: lat, p_lng: lng, p_area_since: since(), p_pos_lat: lat, p_pos_lng: lng }), true],
  ["hdar_salons_inbox", 126, () => ({ p_seen: {} }), true],
  ["hdar_my_premium", 122, () => ({}), true],
  ["hdar_ads_list", 97, () => ({ p_region: null, p_city: null, p_category: null }), true],
  ["hdar_places", 79, () => b, false],
  ["hdar_toilets", 73, () => b, true],
  ["hdar_ads_counts", 40, () => ({}), false],
];

const out = (s) => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };

async function signIn() {
  const r = await fetch(`${URL}/auth/v1/signup`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: "{}" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { err: `${r.status} ${j.msg || j.error_description || j.message || ""}` };
  const c = await fetch(`${URL}/rest/v1/rpc/hdar_claim`, { method: "POST", headers: { apikey: KEY, authorization: `Bearer ${j.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ p_device: null }) });
  if (!c.ok) return { err: `claim ${c.status} ${(await c.text()).slice(0, 120)}` };
  return { token: j.access_token };
}

const tokens = [];
for (let i = 0; i < SESSIONS; i++) {
  const s = await signIn();
  if (s.token) tokens.push(s.token); else { out(`Session visiteur impossible : ${s.err}`); break; }
}
const mix = MIX.filter((m) => tokens.length || !m[3]);
const total = mix.reduce((a, m) => a + m[1], 0);
out(`## Test de charge hdar\n\nSessions visiteurs : ${tokens.length}/${SESSIONS} · requêtes simulées : ${mix.map((m) => m[0].replace("hdar_", "")).join(", ")}\n`);
out(`| Personnes simulées | Requêtes/min | Erreurs serveur | Médiane | 95 % sous | Plus lente | Codes 4xx |\n|---|---|---|---|---|---|---|`);

function pick() { let x = Math.random() * total; for (const m of mix) { if ((x -= m[1]) <= 0) return m; } return mix[0]; }
let stats, stop = false;
const by4xx = {};
async function call() {
  const [name, , params, auth] = pick();
  const t = tokens.length ? tokens[Math.floor(Math.random() * tokens.length)] : null;
  const h = { apikey: KEY, "content-type": "application/json" };
  if (t) h.authorization = `Bearer ${t}`;
  const t0 = performance.now();
  try {
    const r = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: "POST", headers: h, body: JSON.stringify(params()), signal: AbortSignal.timeout(15000) });
    await r.arrayBuffer();
    const ms = performance.now() - t0;
    stats.lat.push(ms); stats.n++;
    if (r.status >= 500) stats.err++;
    else if (r.status >= 400) { stats.c4++; by4xx[`${name} ${r.status}`] = (by4xx[`${name} ${r.status}`] || 0) + 1; }
  } catch { stats.n++; stats.err++; stats.lat.push(15000); }
}
async function user(until) {
  await new Promise((r) => setTimeout(r, Math.random() * 3000));
  while (!stop && Date.now() < until) {
    await call();
    await new Promise((r) => setTimeout(r, (60_000 / PER_USER_MIN) * (0.5 + Math.random())));
  }
}
const q = (a, p) => Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0);
for (const n of STAGES) {
  stats = { n: 0, err: 0, c4: 0, lat: [] };
  const t0 = Date.now(), until = t0 + STAGE_MS;
  const watch = setInterval(() => {
    const l = [...stats.lat].sort((a, b) => a - b);
    if (stats.n > 100 && (stats.err / stats.n > 0.02 || q(l, 0.95) > 3000)) stop = true;
  }, 5000);
  await Promise.all(Array.from({ length: n }, () => user(until)));
  clearInterval(watch);
  const l = stats.lat.sort((a, b) => a - b), min = (Date.now() - t0) / 60000;
  out(`| ${n} | ${Math.round(stats.n / min)} | ${stats.err} (${((stats.err / Math.max(1, stats.n)) * 100).toFixed(1)} %) | ${q(l, 0.5)} ms | ${q(l, 0.95)} ms | ${q(l, 1)} ms | ${stats.c4} |`);
  if (stop) { out(`\n**Arrêt automatique à ${n} personnes : la base ralentit ou renvoie des erreurs.**`); break; }
  await new Promise((r) => setTimeout(r, 15000)); // souffle entre deux paliers
}
if (Object.keys(by4xx).length) out(`\nRefus (paramètres ou droits) : ${JSON.stringify(by4xx)}`);
