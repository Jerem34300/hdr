import { create } from "zustand";
import type { PlaceKind } from "./live";

/** Calques de la carte, un par catégorie (menu « couches »). Les lieux partenaires sont un calque à part. */
export type LayerKey = "station" | "metro" | "bus" | "airport" | "beach" | "nature" | "public" | "toilets" | "ads" | "partners";
export const LAYER_ORDER: LayerKey[] = ["partners", "station", "metro", "bus", "airport", "beach", "nature", "public", "toilets", "ads"];
export type Layers = Record<LayerKey, boolean>;
const KEY = "hdar-layers-v2";
const DEFAULTS: Layers = { station: true, metro: true, bus: true, airport: true, beach: true, nature: true, public: true, toilets: true, ads: false, partners: true };

/** Groupe d'un lieu de la carte (les partenaires ne sont jamais mélangés aux lieux publics). */
export function layerOfPlace(kind: PlaceKind, partner: boolean): LayerKey {
  if (partner || kind === "bar" || kind === "club" || kind === "sauna") return "partners";
  if (kind === "toilets") return "toilets";
  if (kind === "beach") return "beach";
  if (kind === "park" || kind === "garden" || kind === "viewpoint" || kind === "promenade") return "nature";
  return "public";
}

function load(): Layers {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const v = localStorage.getItem(KEY);
    if (v) return { ...DEFAULTS, ...(JSON.parse(v) as Partial<Layers>) };
    // Reprise des anciens réglages (un seul interrupteur par famille).
    const off = (k: string) => localStorage.getItem(k) === "off";
    const l = { ...DEFAULTS };
    if (off("hdar-places-layer")) l.beach = l.nature = l.public = l.partners = false;
    if (off("hdar-toilets-layer")) l.toilets = false;
    if (off("hdar-transit-layer")) l.station = l.metro = l.bus = l.airport = false;
    if (localStorage.getItem("hdar-ads-layer") === "on") l.ads = true;
    return l;
  } catch {
    return DEFAULTS;
  }
}

export const useLayers = create<{ layers: Layers; ready: boolean; init: () => void; set: (k: LayerKey, on: boolean) => void }>((set, get) => ({
  layers: DEFAULTS,
  ready: false,
  init: () => { if (!get().ready) set({ layers: load(), ready: true }); },
  set: (k, on) => {
    const layers = { ...get().layers, [k]: on };
    try { localStorage.setItem(KEY, JSON.stringify(layers)); } catch { /* stockage indisponible */ }
    set({ layers });
  },
}));
