import { create } from "zustand";
import { useEffect, useState } from "react";
import { regionOf } from "./live";
import { useHdar } from "./store";

/** Pins actuellement visibles sur la carte + demande de « Voir sur la carte ». */
type S = { pins: Record<string, { lat: number; lng: number }>; liveIds: Set<string>; focus: { id: string; lat: number; lng: number; at: number } | null; fly: { lat: number; lng: number; zoom: number; at: number; mine?: boolean } | null };
export const useMapFocus = create<S>(() => ({ pins: {}, liveIds: new Set(), focus: null, fly: null }));

/** Centre la carte (quartier choisi, ou « autour de moi » si mine). */
export function flyTo(lat: number, lng: number, zoom = 14, mine = false) {
  useMapFocus.setState({ fly: { lat, lng, zoom, at: Date.now(), mine } });
  useHdar.getState().setTab("around");
}

export function showOnMap(id: string) {
  const p = useMapFocus.getState().pins[id];
  if (!p) return;
  useMapFocus.setState({ focus: { id, ...p, at: Date.now() } });
  useHdar.getState().setTab("around");
}

export function useRegion(id: string | null | undefined) {
  const [r, setR] = useState<string | null>(null);
  useEffect(() => { let a = true; setR(null); if (id) void regionOf(id).then((x) => a && setR(x)); return () => { a = false; }; }, [id]);
  return r;
}
