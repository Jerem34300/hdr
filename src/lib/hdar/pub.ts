/**
 * Lecture des données publiques par le CDN (v141, voir routes/api/pub.$fn.ts) : même origine (pas de requête
 * préalable CORS), réponse partagée entre tous les visiteurs. Si le CDN ou la base ne répond pas, on repasse par
 * l'appel direct habituel (`direct`), comme avant.
 */
export async function pubGet<T>(fn: string, params: Record<string, string | number | null | undefined>, direct: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") return direct();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, String(v));
  const qs = q.toString();
  try {
    const r = await fetch(`/api/pub/${fn}${qs ? `?${qs}` : ""}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return (await r.json()) as T;
  } catch {
    /* repli ci-dessous */
  }
  return direct();
}

/** Coordonnée arrondie à 0,1° (~10 km) : même clé de cache pour tout le quartier. */
export const round1 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : (Math.round(v * 10) / 10).toFixed(1));
