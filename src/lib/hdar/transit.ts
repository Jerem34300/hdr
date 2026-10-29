// Transports (monde entier) : gares, métro/tram et aéroports issus d'OpenStreetMap (Overpass, par zone visible),
// et salons « à bord » temporaires (train / avion / ligne de métro). Aucune position n'est partagée.
import { useEffect, useRef, useState } from "react";
import { rpcCall } from "./live";
import type { Salon } from "./live";

export type TransitKind = "station" | "metro" | "airport";
export type TransitStop = { ref: string; kind: TransitKind; name: string; lat: number; lng: number; iata?: string };
export type TripKind = "train" | "flight" | "metro" | "bus";
export type Trip = Salon & { trip_kind: TripKind; expires_at: string; aboard: number; me_aboard: boolean };
export type TransitLine = { ref: string; label: string; network: string; colour?: string };

export const TRIP_FOR: Record<TransitKind, TripKind> = { station: "train", metro: "metro", airport: "flight" };
export const TRIP_LABEL: Record<TripKind, string> = {
  train: "Je suis dans le train",
  flight: "Je suis dans l'avion",
  metro: "Je suis dans le métro",
  bus: "Je suis dans le bus",
};
export const TRANSIT_KINDS: Record<TransitKind, { label: string; color: string }> = {
  station: { label: "Gare", color: "#60a5fa" },
  metro: { label: "Station métro / tram", color: "#c084fc" },
  airport: { label: "Aéroport", color: "#fbbf24" },
};

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

export function isTransitDemo() {
  return import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("transitdemo");
}

/** Les deux serveurs en parallèle, 20 s max chacun : le premier qui répond gagne, l'autre est annulé. */
async function overpass(q: string, signal?: AbortSignal): Promise<{ elements: OsmEl[] }> {
  const ctrls = OVERPASS.map(() => new AbortController());
  const onAbort = () => ctrls.forEach((c) => c.abort());
  signal?.addEventListener("abort", onAbort);
  const timer = window.setTimeout(onAbort, 20_000);
  try {
    return await Promise.any(
      OVERPASS.map(async (url, i) => {
        const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), signal: ctrls[i].signal, headers: { "content-type": "application/x-www-form-urlencoded" } });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { elements: OsmEl[] };
        ctrls.forEach((c, k) => k !== i && c.abort());
        return j;
      }),
    );
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
// Cache persistant (7 jours, 60 zones max) : les gares ne bougent pas.
const LS = "hdar-transit-cache";
const TTL = 7 * 86400_000;
function lsGet(k: string): TransitStop[] | null {
  try {
    const all = JSON.parse(localStorage.getItem(LS) || "{}") as Record<string, { t: number; v: TransitStop[] }>;
    const e = all[k];
    return e && Date.now() - e.t < TTL ? e.v : null;
  } catch {
    return null;
  }
}
function lsSet(k: string, v: TransitStop[]) {
  try {
    const all = JSON.parse(localStorage.getItem(LS) || "{}") as Record<string, { t: number; v: TransitStop[] }>;
    all[k] = { t: Date.now(), v };
    const keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
    for (const old of keys.slice(60)) delete all[old];
    localStorage.setItem(LS, JSON.stringify(all));
  } catch {
    /* quota : tant pis */
  }
}
type OsmEl = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

function classify(t: Record<string, string>): TransitKind | null {
  if (t.aeroway === "aerodrome") return t.iata ? "airport" : null;
  if (t.railway === "tram_stop") return "metro";
  if (t.railway === "station" || t.railway === "halt") {
    if (/subway|light_rail|monorail/.test(t.station ?? "") || t.subway === "yes") return "metro";
    return "station";
  }
  return null;
}

const cache = new Map<string, TransitStop[]>();
/** Arrêts dans la zone : aéroports dès le zoom 8, gares et métro dès 12, arrêts de tram dès 14. */
export async function fetchTransit(b: { s: number; w: number; n: number; e: number }, zoom: number, signal?: AbortSignal, onPartial?: (s: TransitStop[]) => void) {
  const g = zoom >= 12 ? 0.05 : 0.5;
  const r = (v: number, up: boolean) => (up ? Math.ceil(v / g) : Math.floor(v / g)) * g;
  const bb = `${r(b.s, false).toFixed(2)},${r(b.w, false).toFixed(2)},${r(b.n, true).toFixed(2)},${r(b.e, true).toFixed(2)}`;
  const key = `${bb}|${zoom >= 14 ? 14 : zoom >= 12 ? 12 : 8}`;
  if (isTransitDemo()) return DEMO_STOPS.filter((x) => x.lat >= b.s - 0.2 && x.lat <= b.n + 0.2 && x.lng >= b.w - 0.3 && x.lng <= b.e + 0.3);
  const hit = cache.get(key) ?? lsGet(key);
  if (hit) {
    cache.set(key, hit);
    return hit;
  }
  const db = await fromDb(b, zoom).catch(() => null);
  if (db && db.length) {
    cache.set(key, db);
    return db;
  }
  // Secours rapide (≈1 s) pendant qu'Overpass répond (ou pas) : arrêts Transitous de la zone.
  let opDone = false;
  const tr = zoom >= 12 ? transitousStops(b, signal).catch(() => [] as TransitStop[]) : Promise.resolve([] as TransitStop[]);
  void tr.then((x) => !opDone && x.length && onPartial?.(x));
  let out: TransitStop[];
  try {
    out = await overpassStops(bb, zoom, signal);
  } catch (e) {
    opDone = true;
    const x = await tr;
    if (!x.length) throw e;
    cache.set(key, x); // mémoire seulement : on retentera Overpass au prochain lancement
    return x;
  }
  opDone = true;
  const merged = mergeStops(out, await tr);
  cache.set(key, merged);
  lsSet(key, merged);
  return merged;
}

async function overpassStops(bb: string, zoom: number, signal?: AbortSignal) {
  const parts = [`nwr["aeroway"="aerodrome"]["iata"](${bb});`];
  if (zoom >= 12) parts.push(`nwr["railway"~"^(station|halt)$"]["name"](${bb});`);
  if (zoom >= 14) parts.push(`node["railway"="tram_stop"]["name"](${bb});`);
  const res = await overpass(`[out:json][timeout:20];(${parts.join("")});out center tags 500;`, signal);
  const seen = new Set<string>();
  const out: TransitStop[] = [];
  for (const el of res.elements) {
    const t = el.tags ?? {};
    const kind = classify(t);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const name = (t["name:fr"] || t.name || "").trim();
    if (!kind || lat == null || lng == null || !name) continue;
    const dk = `${kind}|${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`; // gare = nœud + bâtiment : un seul pin
    if (seen.has(dk)) continue;
    seen.add(dk);
    out.push({ ref: `osm:${el.type}/${el.id}`, kind, name, lat, lng, iata: t.iata });
  }
  return out;
}

// ---------------------------------------------------------------- Secours Transitous (GTFS ouverts, sans clé)
const RAIL_MODES = ["HIGHSPEED_RAIL", "LONG_DISTANCE", "NIGHT_RAIL", "REGIONAL_FAST_RAIL", "REGIONAL_RAIL", "RAIL"];
const URBAN_MODES = ["SUBWAY", "METRO", "TRAM"];
type TrPlace = { name: string; stopId: string; parentId?: string; lat: number; lon: number; modes?: string[]; importance?: number };
function normName(n: string) {
  return n
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(gare( de| d')?|station|hall \d.*|bahnhof|bhf|hbf|stazione( di)?|estacion( de)?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(x, b.lat - a.lat) * 111.2;
}
function titleCase(n: string) {
  return n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase()) : n;
}
/** Gares et stations métro/tram de la zone via Transitous, dédupliquées (plusieurs flux GTFS par gare). */
async function transitousStops(b: { s: number; w: number; n: number; e: number }, signal?: AbortSignal): Promise<TransitStop[]> {
  const ctl = AbortSignal.timeout(8000);
  const r = await fetch(`https://api.transitous.org/api/v1/map/stops?min=${b.s},${b.w}&max=${b.n},${b.e}`, { signal: signal ? AbortSignal.any([signal, ctl]) : ctl });
  if (!r.ok) throw new Error(String(r.status));
  const rows = ((await r.json()) as TrPlace[]).sort((x, y) => (y.importance ?? 0) - (x.importance ?? 0));
  const out: (TransitStop & { nn: string })[] = [];
  for (const p of rows) {
    const rail = p.modes?.some((m) => RAIL_MODES.includes(m));
    const urban = p.modes?.some((m) => URBAN_MODES.includes(m));
    if (!rail && !urban) continue;
    const kind: TransitKind = rail ? "station" : "metro";
    const nn = normName(p.name);
    const at = { lat: p.lat, lng: p.lon };
    // Même nom (ou presque) à moins de 400 m = même arrêt.
    const same = (o: { nn: string }) => o.nn === nn || (nn.length > 3 && o.nn.length > 3 && (o.nn.includes(nn) || nn.includes(o.nn)));
    const dup = out.find((o) => (km(o, at) < 0.8 && same(o)) || (km(o, at) < 0.12 && o.kind === kind));
    if (dup) {
      if (kind === "station") dup.kind = "station";
      continue;
    }
    out.push({ ref: `tr:${p.parentId || p.stopId}`, kind, name: titleCase(p.name).replace(/\s+Hall\s.*$/i, ""), lat: p.lat, lng: p.lon, nn });
  }
  return out.slice(0, 300).map(({ nn: _nn, ...x }) => x);
}
/** OSM d'abord ; on ajoute les arrêts Transitous sans équivalent OSM à 300 m. */
function mergeStops(osm: TransitStop[], tr: TransitStop[]) {
  return [...osm, ...tr.filter((t) => !osm.some((o) => o.kind !== "airport" && km(o, t) < 0.3))];
}

/** Arrêts importés en base (v99, comme les toilettes) ; vide tant que l'import n'a pas couvert la zone. */
async function fromDb(b: { s: number; w: number; n: number; e: number }, zoom: number): Promise<TransitStop[]> {
  const rows = await rpcCall<{ ref: string; kind: TransitKind; name: string; lat: number; lng: number; iata: string | null }[]>("hdar_transit", {
    p_s: b.s, p_w: b.w, p_n: b.n, p_e: b.e, p_zoom: Math.floor(zoom),
  });
  return rows.map((r) => ({ ...r, iata: r.iata ?? undefined }));
}

const LAYER = "hdar-transit-layer";
export function transitLayerOn() {
  return typeof localStorage === "undefined" || localStorage.getItem(LAYER) !== "off";
}
export function setTransitLayer(on: boolean) {
  localStorage.setItem(LAYER, on ? "on" : "off");
}

export function useTransit(on: boolean, b: { s: number; w: number; n: number; e: number }, zoom: number) {
  const [stops, setStops] = useState<TransitStop[]>([]);
  const k = `${b.s.toFixed(2)},${b.w.toFixed(2)},${b.n.toFixed(2)},${b.e.toFixed(2)},${Math.floor(zoom)}`;
  const box = useRef(b);
  box.current = b;
  useEffect(() => {
    if (!on || zoom < 8) {
      setStops([]);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void fetchTransit(box.current, zoom, ac.signal, setStops).then(setStops).catch(() => undefined);
    }, 700);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [on, k]);
  return zoom >= 12 ? stops : stops.filter((s) => s.kind === "airport");
}

/** Lignes OSM (métro, tram, RER…) passant à moins de 250 m de la station. */
export async function stopLines(s: TransitStop): Promise<TransitLine[]> {
  if (isTransitDemo()) return DEMO_LINES;
  const q = `[out:json][timeout:15];rel["route"~"^(subway|tram|light_rail|monorail)$"](around:250,${s.lat},${s.lng});out tags 40;`;
  const res = await overpass(q);
  const m = new Map<string, TransitLine>();
  for (const el of res.elements) {
    const t = el.tags ?? {};
    const ref = (t.ref || "").trim();
    if (!ref) continue;
    const mode = t.route === "tram" ? "Tram" : "Métro";
    const network = (t.operator || t.network || "").split(";")[0].trim().slice(0, 40);
    const label = `${mode} ${ref}`;
    const id = `${label}|${network}`;
    if (!m.has(id)) m.set(id, { ref, label, network, colour: t.colour });
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

export function normalizeTrip(kind: TripKind, code: string) {
  const c = code.toUpperCase();
  return kind === "flight" ? c.replace(/[^A-Z0-9]/g, "") : c.trim().replace(/\s+/g, " ").slice(0, 30);
}
export function validTrip(kind: TripKind, code: string) {
  const c = normalizeTrip(kind, code);
  if (kind === "metro" || kind === "bus") return c.length >= 1;
  if (kind === "flight") return /^[A-Z0-9]{2}[A-Z]?[0-9]{1,4}[A-Z]?$/.test(c);
  if (kind === "train") return /^([A-Z]{1,10} ?)?[0-9]{1,6}[A-Z]?$/.test(c);
  return c.length >= 1;
}
export function todayISO(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------- RPC
export async function ensureStop(s: TransitStop): Promise<string> {
  if (isTransitDemo()) return `demo-stop-${s.kind}-` + s.ref.replace(/[^a-z0-9]/gi, "");
  return rpcCall<string>("hdar_transit_stop", { p_ref: s.ref, p_kind: s.kind, p_name: s.name, p_lat: s.lat, p_lng: s.lng });
}
export async function tripJoin(kind: TripKind, code: string, day: string, placeId: string | null, network: string | null): Promise<Trip> {
  if (isTransitDemo()) {
    const c = normalizeTrip(kind, code);
    const name = kind === "flight" ? `Vol ${c}` : kind === "metro" || kind === "bus" ? `${code}${network ? " · " + network : ""}` : c;
    const t = { ...demoTrip(name, kind, 1), me_aboard: true, aboard: kind === "flight" ? 4 : kind === "metro" ? 7 : 3 };
    demoMine = [t, ...demoMine.filter((x) => x.name !== name)];
    return t;
  }
  return rpcCall<Trip>("hdar_trip_join", { p_kind: kind, p_code: code, p_day: day, p_place: placeId, p_network: network });
}
export async function tripLeave(id: string) {
  if (isTransitDemo()) {
    demoMine = demoMine.filter((x) => x.id !== id);
    return;
  }
  await rpcCall("hdar_trip_leave", { p_id: id });
}
export async function tripsAt(placeId: string): Promise<Trip[]> {
  if (isTransitDemo()) return placeId.includes("airport") ? DEMO_AT.air : demoAt(placeId.includes("metro"));
  return rpcCall<Trip[]>("hdar_trips_at", { p_place: placeId });
}
export async function tripsMine(): Promise<Trip[]> {
  if (isTransitDemo()) return demoMine;
  return rpcCall<Trip[]>("hdar_trips_mine", {});
}

// ---------------------------------------------------------------- Démo (DEV, captures)
function demoTrip(name: string, kind: TripKind, aboard: number): Trip {
  return {
    id: "demo-trip-" + name.replace(/\W/g, ""), name, description: null, emoji: null, official: false, mine: false,
    last_at: new Date().toISOString(), recent: 0, people: 0, trip_kind: kind,
    expires_at: new Date(Date.now() + 10 * 3600_000).toISOString(), aboard, me_aboard: false,
  };
}
let demoMine: Trip[] = [];
const DEMO_LINES: TransitLine[] = [
  { ref: "1", label: "Métro 1", network: "Paris", colour: "#FFCD00" },
  { ref: "4", label: "Métro 4", network: "Paris", colour: "#C04191" },
  { ref: "14", label: "Métro 14", network: "Paris", colour: "#62259D" },
];
const DEMO_AT: Record<string, Trip[]> = {
  air: [demoTrip("Vol AF1234", "flight", 4), demoTrip("Vol U24812", "flight", 2)],
};
function demoAt(metro: boolean) {
  if (metro) return [demoTrip("Métro 1 · Paris", "metro", 7), demoTrip("Métro 4 · Paris", "metro", 2)];
  return [demoTrip("TGV 6201", "train", 3), demoTrip("TER 87512", "train", 1), demoTrip("OUIGO 7810", "train", 2)];
}

// Arrêts réels (coordonnées OSM) pour les captures quand Overpass n'est pas joignable.
const DEMO_STOPS: TransitStop[] = [
  { ref: "osm:node/1001", kind: "station", name: "Paris Gare de Lyon", lat: 48.8443, lng: 2.3743 },
  { ref: "osm:node/1002", kind: "station", name: "Paris Austerlitz", lat: 48.8420, lng: 2.3655 },
  { ref: "osm:node/1003", kind: "station", name: "Paris Bercy Bourgogne", lat: 48.8392, lng: 2.3826 },
  { ref: "osm:node/1101", kind: "metro", name: "Gare de Lyon", lat: 48.8457, lng: 2.3731 },
  { ref: "osm:node/1102", kind: "metro", name: "Bercy", lat: 48.8402, lng: 2.3794 },
  { ref: "osm:node/1103", kind: "metro", name: "Quai de la Rapée", lat: 48.8465, lng: 2.3660 },
  { ref: "osm:node/1104", kind: "metro", name: "Ledru-Rollin", lat: 48.8513, lng: 2.3762 },
  { ref: "osm:node/1105", kind: "metro", name: "Reuilly-Diderot", lat: 48.8472, lng: 2.3862 },
  { ref: "osm:node/1106", kind: "metro", name: "Cour Saint-Émilion", lat: 48.8334, lng: 2.3866 },
  { ref: "osm:way/air1", kind: "airport", name: "Aéroport de Paris-Orly", lat: 48.7262, lng: 2.3652, iata: "ORY" },
  { ref: "osm:node/2001", kind: "station", name: "Berlin Hauptbahnhof", lat: 52.5251, lng: 13.3694 },
  { ref: "osm:node/2002", kind: "station", name: "Berlin Friedrichstraße", lat: 52.5203, lng: 13.3869 },
  { ref: "osm:node/2101", kind: "metro", name: "Bundestag", lat: 52.5200, lng: 13.3730 },
  { ref: "osm:node/2102", kind: "metro", name: "Brandenburger Tor", lat: 52.5163, lng: 13.3810 },
  { ref: "osm:node/2103", kind: "metro", name: "Hauptbahnhof (Tram)", lat: 52.5262, lng: 13.3683 },
  { ref: "osm:node/2104", kind: "metro", name: "Naturkundemuseum", lat: 52.5309, lng: 13.3812 },
  { ref: "osm:way/air2", kind: "airport", name: "Flughafen Berlin Brandenburg", lat: 52.3667, lng: 13.5033, iata: "BER" },
];
