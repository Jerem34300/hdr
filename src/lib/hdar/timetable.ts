import { locale } from "@/lib/hdar/i18n";
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

export type LineDirections = { label: string; mode: "Métro" | "Tram" | "Bus"; colour?: string; network: string; directions: string[]; next: string[] };
/** Lignes de métro / tram à la station, avec leurs directions (terminus) et prochains passages. */
export async function stationLines(at: { lat: number; lng: number }, network = "", bus = false): Promise<LineDirections[]> {
  if (isTransitDemo()) return bus ? DEMO_BUS : DEMO_DIRS;
  const modes = bus ? "BUS,COACH" : URBAN;
  const stops = await stopsNear(at.lat, at.lng, bus ? 0.003 : 0.0025, modes.split(","));
  if (!stops.length) return [];
  // Bus : rayon de 400 m autour de l'arrêt le plus important (plusieurs arrêts proches).
  const r = await get<{ stopTimes: StopTime[] }>(`/stoptimes?stopId=${encodeURIComponent(stops[0].stopId)}&n=${bus ? 200 : 120}&radius=${bus ? 400 : 250}&mode=${modes}`);
  const m = new Map<string, LineDirections>();
  for (const x of r.stopTimes) {
    const ref = x.routeShortName?.trim();
    if (!ref) continue;
    const mode = bus ? "Bus" : x.mode === "TRAM" ? "Tram" : "Métro";
    const label = /^\d/.test(ref) ? `${mode} ${ref}` : ref; // « Métro 14 », « T3 », « U5 », « S1 »
    const l = m.get(label) ?? { label, mode, colour: x.routeColor ? "#" + x.routeColor : undefined, network: (x.agencyName || network).slice(0, 40), directions: [], next: [] };
    if (x.headsign && !l.directions.includes(x.headsign)) l.directions.push(x.headsign);
    if (l.next.length < 3 && x.place.departure) l.next.push(x.place.departure);
    m.set(label, l);
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

/** Jour du trajet sans le demander : celui du train trouvé, sinon aujourd'hui (la veille entre minuit et 4 h pour un train). */
export function autoDay(kind: "train" | "flight" | "metro" | "bus", info: TrainInfo | null, now = new Date()) {
  if (info) return info.day;
  const d = new Date(now);
  if (kind === "train" && d.getHours() < 4) d.setDate(d.getDate() - 1);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
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
const DEMO_BUS: LineDirections[] = [
  { label: "Bus 24", mode: "Bus", colour: "#8c6b32", network: "RATP", directions: ["École Vétérinaire de Maisons-Alfort", "Panthéon"], next: [soon(2), soon(9), soon(16)] },
  { label: "Bus 87", mode: "Bus", colour: "#00a88f", network: "RATP", directions: ["Porte de Reuilly", "Invalides"], next: [soon(4), soon(12), soon(20)] },
  { label: "Bus 61", mode: "Bus", colour: "#5c9ad2", network: "Transdev", directions: ["Place d'Italie", "Église de Pantin - Métro"], next: [soon(6), soon(18), soon(30)] },
];
const DEMO_DIRS: LineDirections[] = [
  { label: "Métro 6", mode: "Métro", colour: "#82dc73", network: "RATP", directions: ["Charles de Gaulle - Étoile", "Nation"], next: [soon(2), soon(5), soon(8)] },
  { label: "Métro 14", mode: "Métro", colour: "#640082", network: "RATP", directions: ["Saint-Denis - Pleyel", "Aéroport d'Orly"], next: [soon(1), soon(3), soon(4)] },
];

// ---------------------------------------------------------------- Tableau de gare (départs / arrivées)
export type BoardRow = {
  id: string;
  time: string; // heure prévue ou estimée à cette gare (départ si départ, sinon arrivée)
  arr?: string; dep?: string; // heures estimées
  delayMin: number; // retard estimé (temps réel), 0 sinon
  label: string; // « TGV INOUI 6260 », « Métro 14 »
  num: string; // numéro du train (clé du salon)
  line: string; // ligne (métro/tram/bus)
  colour?: string;
  network: string;
  from: string; to: string;
  track?: string;
  cancelled: boolean; realTime: boolean;
  day: string; // jour de service
  mode: string;
  schedDep?: string; schedArr?: string;
  sncf: boolean; rtSource?: "sncf" | "transitous";
};
const ALL_RAIL = "HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_FAST_RAIL,REGIONAL_RAIL,RAIL";
function cleanStop(n: string) {
  const c = n.replace(/\s+Hall\s.*$/i, "").trim();
  return c === c.toUpperCase() ? c.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase()) : c;
}
/** Prochains passages (≈3 h) à la gare / station, toutes sources GTFS dédupliquées. */
export async function stationBoard(at: { lat: number; lng: number }, urban: boolean): Promise<BoardRow[]> {
  if (isTransitDemo()) return demoBoard(urban);
  const modes = urban ? URBAN : ALL_RAIL;
  const stops = await stopsNear(at.lat, at.lng, urban ? 0.0025 : 0.004, modes.split(","));
  if (!stops.length) return [];
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  type BoardST = StopTime & { place: Place & { scheduledDeparture?: string; scheduledArrival?: string; track?: string; scheduledTrack?: string } };
  const later = new Date(Date.now() + 3 * 3600_000).toISOString();
  const q = (m: string, n: number, rad: number, arrive = false) =>
    get<{ stopTimes: BoardST[] }>(`/stoptimes?stopId=${encodeURIComponent(stops[0].stopId)}&time=${arrive ? later : since}${arrive ? "&arriveBy=true" : ""}&n=${n}&radius=${rad}&mode=${m}`, 12_000)
      .then((x) => x.stopTimes)
      .catch(() => [] as BoardST[]);
  // Grandes lignes et régional séparément (sinon les RER / S-Bahn remplissent toute la réponse).
  const parts = urban ? [await q(URBAN, 120, 250)] : await Promise.all([q(FAST, 120, 250), q(REGIO, 250, 250), q(FAST, 120, 250, true), q(REGIO, 250, 250, true)]); // arrivées : terminus compris
  const r = { stopTimes: parts.flat() };
  const until = Date.now() + 3 * 3600_000;
  const seen = new Set<string>();
  const out: BoardRow[] = [];
  for (const x of r.stopTimes) {
    const p = x.place;
    const t = p.departure ?? p.arrival;
    const tArr = p.arrival ?? p.departure;
    if (tArr && new Date(tArr).getTime() < Date.now() - 60_000 && (!p.departure || new Date(p.departure).getTime() < Date.now() - 60_000)) continue;
    if (!t || new Date(tArr ?? t).getTime() > until) continue;
    if (!urban && !ALL_RAIL.split(",").includes(x.mode)) continue;
    const num = (x.tripShortName ?? "").replace(/\D/g, "") || digits(x.displayName ?? "");
    const line = x.routeShortName?.trim() || "";
    const label = urban ? (/^\d/.test(line) ? `${x.mode === "TRAM" ? "Tram" : "Métro"} ${line}` : line) : x.displayName || `${line} ${num}`.trim();
    // Train « à numéro » seulement (TGV, TER, ICE…) : les RER / S-Bahn (« A », « D ») saturent le tableau.
    if (!urban && !/\d{3,}/.test(label)) continue;
    const key = `${label}|${t.slice(0, 16)}|${x.headsign}`;
    if (seen.has(key)) continue; // même train publié par plusieurs flux
    seen.add(key);
    const sched = p.scheduledDeparture ?? p.scheduledArrival ?? t;
    out.push({
      id: x.tripId + "|" + t, time: t, arr: p.arrival, dep: p.departure,
      delayMin: Math.max(0, Math.round((new Date(t).getTime() - new Date(sched).getTime()) / 60_000)),
      label, num, line, colour: x.routeColor ? "#" + x.routeColor : undefined, network: (x.agencyName ?? "").slice(0, 40),
      from: cleanStop(x.tripFrom?.name ?? ""), to: cleanStop(x.tripTo?.name ?? x.headsign ?? ""),
      track: p.track ?? p.scheduledTrack, cancelled: !!(x.cancelled || (x as { tripCancelled?: boolean }).tripCancelled),
      realTime: !!x.realTime, day: serviceDay(x.tripId, t), mode: x.mode,
      schedDep: p.departure ? p.scheduledDeparture ?? p.departure : undefined, schedArr: p.arrival ? p.scheduledArrival ?? p.arrival : undefined,
      sncf: /sncf|^\d{8}_[^_]*_fr-/i.test(x.tripId) || /sncf|ter|ouigo|inoui|intercit/i.test(x.agencyName ?? "") || /^(TER|TGV|OUIGO|IC|INTERCIT)/i.test(x.displayName ?? ""), rtSource: x.realTime ? "transitous" : undefined,
    });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  if (!urban) await mergeSncf(out).catch(() => undefined);
  return out;
}

function demoBoard(urban: boolean): BoardRow[] {
  const t = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const base = { arr: undefined, cancelled: false, realTime: true, sncf: false, day: autoDay("train", null), network: "SNCF", colour: undefined, line: "", mode: "REGIONAL_RAIL" };
  if (urban) return [
    { ...base, id: "u1", time: t(1), dep: t(1), delayMin: 0, label: "Métro 14", num: "", line: "14", colour: "#640082", network: "RATP", from: "Saint-Denis - Pleyel", to: "Aéroport d'Orly", mode: "SUBWAY" },
    { ...base, id: "u2", time: t(2), dep: t(2), delayMin: 0, label: "Métro 6", num: "", line: "6", colour: "#82dc73", network: "RATP", from: "Nation", to: "Charles de Gaulle - Étoile", mode: "SUBWAY" },
  ];
  return [
    { ...base, id: "d1", time: t(9), dep: t(9), arr: t(7), delayMin: 0, label: "TER 876620", num: "876620", from: "Narbonne", to: "Nîmes Centre", track: "1" },
    { ...base, id: "d2", time: t(24), dep: t(24), arr: t(21), delayMin: 5, label: "TGV INOUI 6260", num: "6260", from: "Perpignan", to: "Paris Gare de Lyon", track: "2" },
  ];
}

// ---------------------------------------------------------------- Temps réel SNCF (GTFS-RT ouvert, via edge function)
type RtTrain = { c: boolean; s: [number, number, number][] };
async function sncfRealtime(nums: string[]): Promise<Record<string, RtTrain>> {
  const local = import.meta.env?.DEV && typeof location !== "undefined" && location.search.includes("rtlocal");
  let url = "http://localhost:8787/";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!local) {
    const s = await import("./session");
    url = `${s.SUPABASE_URL}/functions/v1/hdar-sncf-rt`;
    headers.apikey = s.SUPABASE_KEY;
    headers.authorization = `Bearer ${await s.accessToken()}`;
  }
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ nums }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) return {}; // fonction non déployée : tableau inchangé
  return ((await r.json()) as { trains?: Record<string, RtTrain> }).trains ?? {};
}
/** Applique retards / suppressions SNCF : même numéro + horaire prévu à ±2 min à cette gare. */
export async function mergeSncf(rows: BoardRow[]) {
  const nums = [...new Set(rows.filter((r) => r.sncf && r.num).map((r) => r.num))].slice(0, 80);
  if (!nums.length) return;
  const rt = await sncfRealtime(nums);
  for (const r of rows) {
    const t = rt[r.num];
    if (!t) continue;
    const at = (iso?: string) => {
      if (!iso) return null;
      const sec = new Date(iso).getTime() / 1000;
      let best: [number, number, number] | null = null;
      for (const x of t.s) if (Math.abs(x[0] - sec) <= 120 && (!best || Math.abs(x[0] - sec) < Math.abs(best[0] - sec))) best = x;
      return best;
    };
    const d = at(r.schedDep), a = at(r.schedArr);
    if (!d && !a && !t.c) continue;
    const delay = (d ?? a)![1] ?? 0;
    const shift = (iso: string | undefined, x: [number, number, number] | null) => (iso && x ? new Date((x[0] + x[1]) * 1000).toISOString() : iso);
    if (r.schedDep) r.dep = shift(r.schedDep, d) ?? r.dep;
    if (r.schedArr) r.arr = shift(r.schedArr, a) ?? r.arr;
    r.delayMin = Math.max(0, Math.round(delay / 60));
    r.cancelled = r.cancelled || t.c || !!(d?.[2] || a?.[2]);
    r.realTime = true;
    r.rtSource = "sncf";
  }
}
