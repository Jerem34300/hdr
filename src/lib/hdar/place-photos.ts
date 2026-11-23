import { useEffect, useState } from "react";
import { mergePlaceFacts, textOrNull, type PlaceFacts, type PlaceFactsSource } from "./place-facts";

/** Photo d'un lieu : fichier/stockage + URL d'origine (pour retrait sur demande). */
export type PlacePhoto = {
  url: string;
  source_url: string | null;
};

export type PlaceManifestInfo = {
  photos: PlacePhoto[];
  hours: string | null;
  entry: string | null;
  events: unknown;
};

type ManifestRow = {
  place_id?: string;
  id?: string;
  name?: string;
  city?: string;
  hours?: unknown;
  entry?: unknown;
  events?: unknown;
  photos?: Array<{
    url_storage_ou_fichier?: string;
    url?: string;
    file?: string;
    source_url?: string | null;
    sourceUrl?: string | null;
  }>;
};

const DEV_MANIFEST = "/__place-photos/photos.json";
const COLUMN_CACHE = "/__column-photos.json";
const PHOTOS_PREFIX = "/__place-photos/";

function normName(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, " ").trim();
}

function nameKey(name: string, city?: string | null): string {
  return `name:${normName(name)}|${normName(city || "")}`;
}


let manifestPromise: Promise<Map<string, PlaceManifestInfo>> | null = null;

function resolveUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u) || u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.startsWith(PHOTOS_PREFIX)) return u;
  // Chemins écrits par l'agent photos (absolu ou relatif sous photos/).
  const cleaned = u.replace(/^file:\/\//, "").replace(/^\/workspace\/hdar-seo\/decouvrir\/photos\//, "");
  if (cleaned.startsWith("/")) {
    if (cleaned.startsWith("/workspace/hdar-seo/decouvrir/photos/")) {
      return PHOTOS_PREFIX + cleaned.slice("/workspace/hdar-seo/decouvrir/photos/".length);
    }
    // Autre chemin local : ne pas l'exposer tel quel dans le navigateur.
    const base = cleaned.split("/photos/").pop();
    return base ? PHOTOS_PREFIX + base.replace(/^\//, "") : "";
  }
  return PHOTOS_PREFIX + cleaned.replace(/^\.\//, "");
}

function rowsFromUnknown(data: unknown): ManifestRow[] {
  if (Array.isArray(data)) return data as ManifestRow[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.places)) return o.places as ManifestRow[];
    if (Array.isArray(o.items)) return o.items as ManifestRow[];
    // { [place_id]: { photos: [...] } | [...] }
    return Object.entries(o).map(([place_id, v]) => {
      if (Array.isArray(v)) return { place_id, photos: v as ManifestRow["photos"] };
      if (v && typeof v === "object") return { place_id, ...(v as ManifestRow) };
      return { place_id, photos: [] };
    });
  }
  return [];
}

function emptyInfo(): PlaceManifestInfo {
  return { photos: [], hours: null, entry: null, events: null };
}

function writeInfo(map: Map<string, PlaceManifestInfo>, key: string, photos: PlacePhoto[], row: ManifestRow) {
  const prev = map.get(key) ?? emptyInfo();
  map.set(key, {
    photos: mergePhotos(prev.photos, photos),
    hours: textOrNull(row.hours) ?? prev.hours,
    entry: textOrNull(row.entry) ?? prev.entry,
    events: row.events !== undefined && row.events !== null ? row.events : prev.events,
  });
}

function addRows(map: Map<string, PlaceManifestInfo>, rows: ManifestRow[]) {
  for (const row of rows) {
    const photos: PlacePhoto[] = [];
    for (const p of row.photos ?? []) {
      const raw = p.url_storage_ou_fichier || p.url || p.file || "";
      const url = resolveUrl(raw);
      if (!url) continue;
      photos.push({ url, source_url: p.source_url ?? p.sourceUrl ?? null });
    }
    const id = row.place_id || row.id;
    if (id) writeInfo(map, id, photos, row);
    if (row.name) writeInfo(map, nameKey(row.name, row.city), photos, row);
  }
}

function pickInfo(map: Map<string, PlaceManifestInfo>, place: { id: string; name?: string | null; city?: string | null }): PlaceManifestInfo {
  const byId = map.get(place.id);
  const byName = place.name ? map.get(nameKey(place.name, place.city)) : undefined;
  return {
    photos: byId?.photos.length ? byId.photos : (byName?.photos ?? []),
    hours: byId?.hours ?? byName?.hours ?? null,
    entry: byId?.entry ?? byName?.entry ?? null,
    events: byId?.events ?? byName?.events ?? null,
  };
}

async function loadOne(url: string, map: Map<string, PlaceManifestInfo>) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return;
    addRows(map, rowsFromUnknown(await r.json()));
  } catch {
    /* source absente */
  }
}

async function loadManifest(): Promise<Map<string, PlaceManifestInfo>> {
  const map = new Map<string, PlaceManifestInfo>();
  // Cache local des photos déjà en colonne (dev, sans session) + manifest de l'agent photos.
  await loadOne(COLUMN_CACHE, map);
  await loadOne(DEV_MANIFEST, map);
  return map;
}

function manifestMap(): Promise<Map<string, PlaceManifestInfo>> {
  if (!manifestPromise) manifestPromise = loadManifest();
  return manifestPromise;
}

/** Recharge le manifest (après écriture par l'agent photos, en local). */
export function resetPlacePhotoManifest() {
  manifestPromise = null;
}

function fromColumn(photos: string[] | undefined | null): PlacePhoto[] {
  return (photos ?? [])
    .map((url) => url?.trim())
    .filter((url): url is string => !!url && !url.startsWith("/places/cover-"))
    .map((url) => ({ url, source_url: null }));
}

function mergePhotos(column: PlacePhoto[], extra: PlacePhoto[]): PlacePhoto[] {
  const out: PlacePhoto[] = [];
  const seen = new Set<string>();
  for (const p of [...column, ...extra]) {
    const key = p.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function useManifest(place: { id: string; name?: string | null; city?: string | null }): PlaceManifestInfo {
  const [info, setInfo] = useState<PlaceManifestInfo>(emptyInfo);
  useEffect(() => {
    let stop = false;
    void manifestMap().then((m) => {
      if (!stop) setInfo(pickInfo(m, place));
    });
    return () => {
      stop = true;
    };
  }, [place.id, place.name, place.city]);
  return info;
}

/** Photos d'une fiche : colonne `photos` + manifest local (dev), sans couverture générique. */
export function usePlacePhotos(place: { id: string; name?: string | null; city?: string | null; photos?: string[] | null }): PlacePhoto[] {
  const column = fromColumn(place.photos);
  const extra = useManifest(place);
  return mergePhotos(column, extra.photos);
}

/** Horaires, entrée, soirées : colonnes du lieu, puis champs du manifest s'ils arrivent. */
export function usePlaceFacts(place: PlaceFactsSource & { id: string; name?: string | null; city?: string | null }): PlaceFacts {
  const extra = useManifest(place);
  return mergePlaceFacts(place, extra);
}

export function sourceHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
