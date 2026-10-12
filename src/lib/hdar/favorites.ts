import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deviceId } from "./device";
import { playFavoriteSound } from "./sounds";
import { listFavorites, toggleFavorite, type FavoriteRow } from "./live";

let rows: FavoriteRow[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const announced = new Set<string>();
const emit = () => listeners.forEach((l) => l());

export async function refreshFavorites() {
  try {
    rows = await listFavorites(deviceId());
    loaded = true;
    emit();
  } catch {
    // keep the last list
  }
}

export function isFavorite(id: string) {
  return rows.some((r) => r.id === id);
}

export async function toggleFav(id: string, pseudo: string) {
  const on = await toggleFavorite(deviceId(), id);
  if (on) rows = [{ id, pseudo, live: false, photo: false }, ...rows];
  else rows = rows.filter((r) => r.id !== id);
  emit();
  toast(on ? `${pseudo} ajouté aux favoris` : `${pseudo} retiré des favoris`);
  return on;
}

/** Called with each fresh live list: in-app notice when a favorite shows up on the map. */
export function noticeLiveFavorites(live: { id: string; pseudo: string }[]) {
  if (!loaded) {
    void refreshFavorites();
    return;
  }
  const liveIds = new Set(live.map((p) => p.id));
  for (const id of announced) if (!liveIds.has(id)) announced.delete(id);
  for (const p of live) {
    if (isFavorite(p.id) && !announced.has(p.id)) {
      announced.add(p.id);
      toast(`★ ${p.pseudo} est sur la carte`);
      playFavoriteSound();
    }
  }
}

export function useFavorites() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!loaded) void refreshFavorites();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return rows;
}
