import { createFileRoute } from "@tanstack/react-router";

/**
 * Données publiques, identiques pour tout le monde (v141) : servies par le CDN de Netlify au lieu d'aller à la base
 * pour chaque téléphone. 1 000 personnes qui ouvrent l'appli = au plus une lecture par région/compteur et par période,
 * le CDN sert le reste (et la version périmée pendant qu'il se met à jour).
 *
 * - Liste fermée de lectures anonymes, en lecture seule, sans donnée personnelle.
 * - Paramètres normalisés ici (coordonnées arrondies à 0,1°), le client envoie déjà les mêmes valeurs.
 * - Cache mémoire par instance en plus du CDN : des requêtes avec paramètres bidon ne tapent pas la base non plus.
 * - Échec côté base : 502 sans cache, le client repasse par l'appel direct habituel.
 */
type Spec = { rpc: string; ttl: number; args: (q: URLSearchParams) => Record<string, unknown> | null };

const coord = (v: string | null, lim: number) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= lim ? Math.round(n * 10) / 10 : undefined;
};

const PUB: Record<string, Spec> = {
  // Activité anonyme des dernières 24 h (carreaux ~5 km), centrée à 0,1° près.
  recent: {
    rpc: "hdar_recent_activity",
    ttl: 120,
    args: (q) => {
      const lat = coord(q.get("lat"), 90), lng = coord(q.get("lng"), 180);
      if (lat === undefined || lng === undefined) return null;
      return { p_lat: lat, p_lng: lng };
    },
  },
  "first-remaining": { rpc: "hdar_first_remaining", ttl: 300, args: () => ({}) },
  "first-region": {
    rpc: "hdar_first_region",
    ttl: 300,
    args: (q) => {
      const r = (q.get("r") ?? "").toLowerCase();
      return /^[a-z0-9-]{1,40}$/.test(r) ? { p_region: r } : null;
    },
  },
  online: { rpc: "hdar_online_count", ttl: 60, args: () => ({}) },
  "ads-counts": { rpc: "hdar_ads_counts", ttl: 600, args: () => ({}) },
  // Carte des lieux (monde) : hdar_places_world (v141), lecture du cache déjà calculé par la base.
  places: { rpc: "hdar_places_world", ttl: 600, args: () => ({}) },
};

const mem = new Map<string, { at: number; ttl: number; p: Promise<string | null> }>();

async function load(spec: Spec, args: Record<string, unknown>): Promise<string | null> {
  const { SUPABASE_URL, SUPABASE_KEY } = await import("@/lib/hdar/session");
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${spec.rpc}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(3000),
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

function cached(spec: Spec, args: Record<string, unknown>) {
  const key = `${spec.rpc}:${JSON.stringify(args)}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < hit.ttl * 1000) return hit.p;
  if (mem.size > 500) mem.clear();
  const p = load(spec, args);
  mem.set(key, { at: Date.now(), ttl: spec.ttl, p });
  // Échec : on réessaie au prochain appel plutôt qu'à la fin de la période.
  void p.then((v) => { if (v == null && mem.get(key)?.p === p) mem.delete(key); });
  return p;
}

export const Route = createFileRoute("/api/pub/$fn")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const spec = PUB[params.fn];
        const args = spec?.args(new URL(request.url).searchParams);
        if (!spec || !args) return new Response("{}", { status: 404, headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
        const body = await cached(spec, args);
        if (body == null) return new Response("{}", { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        return new Response(body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": `public, max-age=${Math.min(60, spec.ttl)}`,
            "netlify-cdn-cache-control": `public, durable, s-maxage=${spec.ttl}, stale-while-revalidate=${spec.ttl * 5}`,
          },
        });
      },
    },
  },
});
