// Horaires ouverts, gratuits, sans clé : Transitous (MOTIS, api.transitous.org), agrégateur communautaire de GTFS
// publics du monde entier (SNCF, IDFM, DB, Trenitalia, CFF, OpenOV…). Appel direct depuis le navigateur (CORS ouvert).
// Tout est facultatif : si rien n'est trouvé, on rejoint quand même le salon par numéro.
const isTransitDemo = () => !!import.meta.env?.DEV && typeof location !== "undefined" && location.search.includes("transitdemo") && !location.search.includes("realtt");

const API = "https://api.transitous.org/api/v1";
const RAIL = "HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_FAST_RAIL,REGIONAL_RAIL,RAIL";
const FAST = "HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL";
const REGIO = "REGIONAL_FAST_RAIL,REGIONAL_RAIL,RAIL";
const URBAN = "SUBWAY,TRAM,METRO";

type Place = { name: string; stopId: string; lat: number; lon: number; tz?: string; departure?: string; arrival?: string; modes?: string[]; importance?: number };
type StopTime = {
  place: Place; mode: string; headsign: string; tripFrom?: Place; tripTo?: Place; tripId: string; agencyName?: string;
  routeShortName?: string; routeColor?: string; tripShortName?: string; displayName?: string; cancelled?: boolean; realTime?: boolean;
};

async function get<T>(path: string, ms = 8000): Promise<T> {
  const r = await fetch(API + path, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

/** Arrêts Transitous autour d'un point (≈ d degrés), filtrés par modes. */
async function stopsNear(lat: number, lng: number, d: number, modes: string[]) {
  const all = await get<Place[]>(`/map/stops?min=${lat - d},${lng - d * 1.5}&max=${lat + d},${lng + d * 1.5}`);
  return all
    .filter((p) => p.modes?.some((m) => modes.includes(m)))
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
}

export type TrainInfo = {
  label: string; // « TGV INOUI 6201 »
  from: string; to: string;
  stop: string; // gare où l'on a trouvé le train
  time: string; // ISO, départ (ou arrivée) à cette gare
  day: string; // jour de service AAAA-MM-JJ (gère les trains partis la veille)
  realTime: boolean; cancelled: boolean;
};

function serviceDay(tripId: string, fallbackIso: string) {
  const m = /^(\d{4})(\d{2})(\d{2})_/.exec(tripId);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : fallbackIso.slice(0, 10);
}
function digits(code: string) {
  return (/(\d{1,6})[A-Z]?$/.exec(code.toUpperCase().replace(/\s+/g, "")) ?? [])[1] ?? "";
}

/**
 * Cherche le train par son numéro dans les passages des gares proches (de la gare ouverte, sinon de la position) :
 * fenêtre de -4 h à +4 h autour de maintenant, donc un train parti avant minuit est retrouvé avec sa vraie date.
 */
export async function lookupTrain(code: string, at: { lat: number; lng: number }, near = 0.004): Promise<TrainInfo | null> {
  if (isTransitDemo()) return demoTrain(code);
  const n = digits(code);
  if (!n) return null;
  let stops = await stopsNear(at.lat, at.lng, near, RAIL.split(","));
  if (!stops.length && near < 0.03) stops = await stopsNear(at.lat, at.lng, 0.03, RAIL.split(","));
  const since = new Date(Date.now() - 4 * 3600_000).toISOString();
  // Grandes lignes d'abord (sinon les RER / S-Bahn saturent la fenêtre), régional ensuite ; TER/RE/RB : l'inverse.
  const groups = [FAST, REGIO];
  if (/^(TER|RE|RB|R|S|IR|REG|RV)\b/i.test(code.trim())) groups.reverse();
  for (const s of stops.slice(0, 2)) for (const modes of groups) {
    const r = await get<{ stopTimes: StopTime[] }>(`/stoptimes?stopId=${encodeURIComponent(s.stopId)}&time=${since}&n=400&radius=200&mode=${modes}`);
    const hit = r.stopTimes.find((x) => (x.tripShortName ?? "").replace(/\D/g, "") === n || digits(x.displayName ?? "") === n);
    if (hit) {
      const time = hit.place.departure ?? hit.place.arrival ?? since;
      return {
        label: hit.displayName || `${hit.routeShortName ?? ""} ${n}`.trim(),
        from: hit.tripFrom?.name ?? "", to: hit.tripTo?.name ?? hit.headsign ?? "",
        stop: hit.place.name, time, day: serviceDay(hit.tripId, time),
        realTime: !!hit.realTime, cancelled: !!(hit.cancelled),
      };
    }
  }
  return null;
}

export type LineDirections = { label: string; mode: "Métro" | "Tram"; colour?: string; network: string; directions: string[]; next: string[] };
/** Lignes de métro / tram à la station, avec leurs directions (terminus) et prochains passages. */
export async function stationLines(at: { lat: number; lng: number }, network = ""): Promise<LineDirections[]> {
  if (isTransitDemo()) return DEMO_DIRS;
  const stops = await stopsNear(at.lat, at.lng, 0.0025, URBAN.split(","));
  if (!stops.length) return [];
  const r = await get<{ stopTimes: StopTime[] }>(`/stoptimes?stopId=${encodeURIComponent(stops[0].stopId)}&n=120&radius=250&mode=${URBAN}`);
  const m = new Map<string, LineDirections>();
  for (const x of r.stopTimes) {
    const ref = x.routeShortName?.trim();
    if (!ref) continue;
    const mode = x.mode === "TRAM" ? "Tram" : "Métro";
    const label = /^\d/.test(ref) ? `${mode} ${ref}` : ref; // « Métro 14 », « T3 », « U5 », « S1 »
    const l = m.get(label) ?? { label, mode, colour: x.routeColor ? "#" + x.routeColor : undefined, network: (x.agencyName || network).slice(0, 40), directions: [], next: [] };
    if (x.headsign && !l.directions.includes(x.headsign)) l.directions.push(x.headsign);
    if (l.next.length < 3 && x.place.departure) l.next.push(x.place.departure);
    m.set(label, l);
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

/** Jour du trajet sans le demander : celui du train trouvé, sinon aujourd'hui (la veille entre minuit et 4 h pour un train). */
export function autoDay(kind: "train" | "flight" | "metro", info: TrainInfo | null, now = new Date()) {
  if (info) return info.day;
  const d = new Date(now);
  if (kind === "train" && d.getHours() < 4) d.setDate(d.getDate() - 1);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------- Démo (DEV, captures)
function demoTrain(code: string): TrainInfo | null {
  const n = digits(code);
  if (n.length < 3) return null;
  const t = new Date();
  t.setMinutes(t.getMinutes() + 23);
  if (n === "9999") return null;
  return { label: `TGV INOUI ${n}`, from: "Paris Gare de Lyon", to: "Marseille Saint-Charles", stop: "Paris Gare de Lyon", time: t.toISOString(), day: autoDay("train", null), realTime: false, cancelled: false };
}
const soon = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const DEMO_DIRS: LineDirections[] = [
  { label: "Métro 6", mode: "Métro", colour: "#82dc73", network: "RATP", directions: ["Charles de Gaulle - Étoile", "Nation"], next: [soon(2), soon(5), soon(8)] },
  { label: "Métro 14", mode: "Métro", colour: "#640082", network: "RATP", directions: ["Saint-Denis - Pleyel", "Aéroport d'Orly"], next: [soon(1), soon(3), soon(4)] },
];
