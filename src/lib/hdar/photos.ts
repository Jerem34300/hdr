import { useEffect, useState } from "react";
import { deviceId } from "./device";
import { getProfile, photosOf } from "./live";

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; photo: Promise<string> }>();

// Les avatars demandés dans le même instant partent ensemble : une requête pour toute une liste (v139).
let queue = new Map<string, (photo: string) => void>();
let flushTimer = 0;
function flush() {
  flushTimer = 0;
  const batch = queue;
  queue = new Map();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    void photosOf(part)
      .then(async (map) => {
        if (map) return map;
        // Base pas encore à jour : ancien appel, un par personne.
        const pairs = await Promise.all(part.map((id) => getProfile(deviceId(), id).then((p) => [id, p?.photo ?? ""] as const, () => [id, ""] as const)));
        return Object.fromEntries(pairs);
      })
      .catch(() => ({}) as Record<string, string>)
      .then((map) => {
        for (const id of part) {
          if (!(id in map)) cache.delete(id); // erreur ou bloqué : redemander plus tard
          batch.get(id)?.(map[id] ?? "");
        }
      });
  }
}

/** Profile photo of another user, fetched once (batched with the others shown at the same time) and kept for a few minutes. */
export function photoOf(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.photo;
  const photo = new Promise<string>((resolve) => {
    queue.set(id, resolve);
    if (!flushTimer) flushTimer = window.setTimeout(flush, 30);
  });
  cache.set(id, { at: Date.now(), photo });
  return photo;
}

export function usePhoto(id: string | null | undefined) {
  const [photo, setPhoto] = useState("");
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void photoOf(id).then((p) => alive && setPhoto(p));
    return () => {
      alive = false;
    };
  }, [id]);
  return photo;
}
