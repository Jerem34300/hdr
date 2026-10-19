/** Activité anonyme des dernières 24 h (carreaux ~5 km) + position approximative (IP, ville).
 *  Sert à ne jamais afficher une carte vide, y compris avant l'écran 18+ (clé publique, sans session). */
import { SUPABASE_KEY, SUPABASE_URL } from "./session";

export type RecentCell = { lat: number; lng: number; n: number; h: number };
export type Recent = { total: number; near: number; cells: RecentCell[]; nearest: { lat: number; lng: number; km: number } | null };

export async function recentActivity(lat: number | null, lng: number | null): Promise<Recent | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_recent_activity`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ p_lat: lat, p_lng: lng }),
    });
    if (!res.ok) return null;
    const r = (await res.json()) as Recent;
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_online_count`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
      body: "{}",
    });
    return res.ok ? Number(await res.json()) || 0 : 0;
  } catch {
    return 0;
  }
}
