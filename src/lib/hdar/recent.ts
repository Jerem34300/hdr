/** Activité anonyme des dernières 24 h (carreaux ~5 km) + position approximative (IP, ville).
 *  Sert à ne jamais afficher une carte vide, y compris avant l'écran 18+ (clé publique, sans session). */
import { SUPABASE_KEY, SUPABASE_URL } from "./session";
import { pubGet, round1 } from "./pub";

export type RecentCell = { lat: number; lng: number; n: number; h: number };
export type Recent = { total: number; near: number; cells: RecentCell[]; nearest: { lat: number; lng: number; km: number } | null };

async function recentDirect(lat: string | null, lng: string | null): Promise<Recent | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_recent_activity`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_lat: lat == null ? null : Number(lat), p_lng: lng == null ? null : Number(lng) }),
  });
  return res.ok ? ((await res.json()) as Recent) : null;
}

/** Même réponse pour tout le quartier (0,1°) : servie par le CDN, la base n'est lue qu'une fois toutes les 2 min. */
const recentMemo = new Map<string, { at: number; p: Promise<Recent | null> }>();
export function recentActivity(lat: number | null, lng: number | null): Promise<Recent | null> {
  // L'écran 18+ et la carte demandent la même chose au même moment : une seule requête par minute et par quartier.
  const key = `${round1(lat)},${round1(lng)}`;
  const hit = recentMemo.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = loadRecent(lat, lng);
  recentMemo.set(key, { at: Date.now(), p });
  void p.then((r) => { if (!r && recentMemo.get(key)?.p === p) recentMemo.delete(key); });
  return p;
}
async function loadRecent(lat: number | null, lng: number | null): Promise<Recent | null> {
  try {
    const la = round1(lat), ln = round1(lng);
    const r = la != null && ln != null ? await pubGet("recent", { lat: la, lng: ln }, () => recentDirect(la, ln)) : await pubGet("recent", {}, () => recentDirect(null, null));
    if (!r) return null;
    return { total: Number(r.total) || 0, near: Number(r.near) || 0, cells: (r.cells ?? []).map((c) => ({ lat: Number(c.lat), lng: Number(c.lng), n: Number(c.n), h: Number(c.h) })), nearest: r.nearest ?? null };
  } catch {
    return null;
  }
}

export type ApproxGeo = { city: string | null; lat: number; lng: number };
let geoPromise: Promise<ApproxGeo | null> | null = null;
/** Ville approximative d'après le réseau (rien n'est stocké côté serveur). */
export function approxGeo(): Promise<ApproxGeo | null> {
  geoPromise ??= fetch("/api/geo")
    .then((r) => r.json() as Promise<{ city: string | null; lat: number | null; lng: number | null }>)
    .then((g) => (g.lat != null && g.lng != null ? { city: g.city, lat: g.lat, lng: g.lng } : null))
    .catch(() => null);
  return geoPromise;
}

/** Libellé « il y a 3 h » pour un carreau. */
export const agoLabel = (h: number) => (h <= 0 ? "il y a moins d'1 h" : `il y a ${h} h`);

/** Nombre total de personnes avec l'appli ouverte (5 dernières minutes). Anonyme. */
export async function onlineCount(): Promise<number> {
  try {
    return Number(await pubGet("online", {}, async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_online_count`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
        body: "{}",
      });
      return res.ok ? Number(await res.json()) || 0 : 0;
    })) || 0;
  } catch {
    return 0;
  }
}
