/**
 * Petites valeurs qui changent peu (compteurs d'annonces, offre FIRST) gardées sur le téléphone quelques
 * minutes, y compris d'une ouverture de l'appli à l'autre : rouvrir l'appli ne les redemande pas.
 */
const PREFIX = "hdar-cache:";
const inflight = new Map<string, Promise<unknown>>();

export function cachedRpc<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) {
      const { at, v } = JSON.parse(raw) as { at: number; v: T };
      if (Date.now() - at < ttl) return Promise.resolve(v);
    }
  } catch {
    /* stockage indisponible : on charge */
  }
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  const p = load().then((v) => {
    try {
      if (v != null) localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), v }));
    } catch {
      /* stockage plein ou privé */
    }
    return v;
  });
  inflight.set(key, p);
  void p.finally(() => inflight.delete(key)).catch(() => undefined);
  return p;
}

/** Oublie les valeurs gardées (ex. après avoir utilisé le code FIRST). */
export function clearCached(prefix: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX + prefix)) localStorage.removeItem(k);
    }
  } catch {
    /* rien */
  }
}
