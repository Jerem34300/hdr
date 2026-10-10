import { useEffect, useState } from "react";
import { deviceId } from "./device";
import { getProfile } from "./live";

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; photo: Promise<string> }>();

/** Profile photo of another user, fetched once and kept for a few minutes. */
export function photoOf(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.photo;
  const photo = getProfile(deviceId(), id)
    .then((p) => p?.photo ?? "")
    .catch(() => {
      cache.delete(id);
      return "";
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
