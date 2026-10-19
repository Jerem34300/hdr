import { createFileRoute } from "@tanstack/react-router";

/** Ville approximative du visiteur, d'après la géolocalisation de Netlify (en-tête x-nf-geo).
 *  Rien n'est stocké ici : ni IP ni coordonnées. Renvoie le nom de ville et un point arrondi à 0,1°
 *  (~10 km), utilisé seulement pour centrer la carte quand la position est refusée. */
export const Route = createFileRoute("/api/geo")({
  server: {
    handlers: {
      GET: ({ request }) => {
        let city: string | null = null;
        let lat: number | null = null;
        let lng: number | null = null;
        try {
          const raw = request.headers.get("x-nf-geo");
          if (raw) {
            const g = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { city?: string; country?: { code?: string }; subdivision?: { code?: string }; latitude?: number; longitude?: number };
            if (typeof g.latitude === "number" && typeof g.longitude === "number") {
              lat = Math.round(g.latitude * 10) / 10;
              lng = Math.round(g.longitude * 10) / 10;
            }
            if (g.city) city = [g.city, g.country?.code && g.country.code !== "FR" ? g.country.code : null].filter(Boolean).join(", ");
          }
        } catch {
          city = null;
        }
        return new Response(JSON.stringify({ city, lat, lng }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      },
    },
  },
});
