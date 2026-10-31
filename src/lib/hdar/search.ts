import { rpcCall } from "./live";
import { useLang } from "./i18n";
import type { TransitKind } from "./transit";

/** Résultat de la recherche « GPS » : une ville/adresse (Photon, OSM) ou un de nos lieux en base. */
export type SearchHit = {
  key: string;
  type: "city" | "address" | TransitKind | "place";
  name: string;
  sub: string;
  lat: number;
  lng: number;
  zoom: number;
  stop?: { ref: string; kind: TransitKind; name: string; lat: number; lng: number; iata?: string };
  placeId?: string;
  placeKind?: string;
};

const TRANSIT = new Set(["station", "metro", "bus", "airport"]);
type Row = { id: string; ref: string | null; kind: string; name: string; lat: number; lng: number; code: string | null };

async function ours(q: string, at: { lat: number; lng: number } | null): Promise<SearchHit[]> {
  const rows = await rpcCall<Row[]>("hdar_search", { p_q: q, p_lat: at?.lat ?? null, p_lng: at?.lng ?? null }).catch(() => [] as Row[]);
  return (rows ?? []).map((r) => {
    const tr = TRANSIT.has(r.kind) && r.ref;
    return {
      key: "db:" + r.id,
      type: tr ? (r.kind as TransitKind) : "place",
      name: r.name,
      sub: r.code ?? "",
      lat: r.lat, lng: r.lng,
      zoom: r.kind === "airport" ? 14 : 16,
      stop: tr ? { ref: r.ref!, kind: r.kind as TransitKind, name: r.name, lat: r.lat, lng: r.lng, iata: r.code ?? undefined } : undefined,
      placeId: tr ? undefined : r.id,
      placeKind: tr ? undefined : r.kind,
    };
  });
}

type PF = { geometry: { coordinates: [number, number] }; properties: { osm_id: number; osm_type: string; osm_key: string; osm_value: string; type?: string; name?: string; city?: string; county?: string; state?: string; country?: string; postcode?: string; street?: string; housenumber?: string } };

/** Photon (komoot, données OSM) : fait pour l'autocomplétion. Appelé avec debounce, 6 résultats max, jamais en boucle. */
async function photon(q: string, at: { lat: number; lng: number } | null, signal: AbortSignal): Promise<SearchHit[]> {
  const lang = useLang.getState().lang;
  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "6");
  if (["en", "de", "fr", "it"].includes(lang)) u.searchParams.set("lang", lang);
  if (at) { u.searchParams.set("lat", at.lat.toFixed(2)); u.searchParams.set("lon", at.lng.toFixed(2)); }
  const r = await fetch(u, { signal });
  if (!r.ok) return [];
  const j = (await r.json()) as { features: PF[] };
  return j.features.map((f) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const city = p.osm_key === "place" || p.type === "city" || p.type === "district" || p.type === "locality";
    const rail = p.osm_key === "railway" || (p.osm_key === "public_transport" && p.osm_value === "station");
    const air = p.osm_key === "aeroway";
    const name = p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ");
    const sub = [city ? null : p.city, p.state ?? p.county, p.country].filter((x) => x && x !== name).join(", ");
    const type: SearchHit["type"] = air ? "airport" : rail ? (p.osm_value === "subway_entrance" ? "metro" : "station") : city ? "city" : "address";
    const zoom = city ? (p.osm_value === "city" ? 12 : p.osm_value === "town" ? 13 : 14) : air ? 14 : 16;
    return { key: `ph:${p.osm_type}${p.osm_id}`, type, name, sub, lat, lng, zoom };
  }).filter((h) => h.name);
}

const near = (a: SearchHit, b: SearchHit) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lng - b.lng) < 0.014;

/** Nos lieux d'abord (ils ouvrent leur fiche), puis les villes/adresses OSM sans doublon. */
export async function searchAll(q: string, at: { lat: number; lng: number } | null, signal: AbortSignal): Promise<SearchHit[]> {
  const [a0, b] = await Promise.all([ours(q, at), photon(q, at, signal).catch(() => [] as SearchHit[])]);
  // Même nom + même type à moins d'1 km (doublons OSM : quais, entrées) : une seule ligne.
  const a = a0.filter((h, i) => a0.findIndex((x) => x.type === h.type && x.name.toLowerCase() === h.name.toLowerCase() && near(x, h)) === i);
  const ql = q.toLowerCase();
  const cities = b.filter((h, i) => h.type === "city" && b.findIndex((x) => x.type === "city" && x.name === h.name && x.sub === h.sub) === i);
  const lead = cities.filter((h) => h.name.toLowerCase().startsWith(ql));
  const rest = cities.filter((h) => !lead.includes(h));
  const others = b.filter((h) => h.type !== "city" && !a.some((x) => near(x, h) && x.name.toLowerCase() === h.name.toLowerCase()));
  return [...lead.slice(0, 4), ...a, ...rest.slice(0, 3), ...others].slice(0, 12);
}
