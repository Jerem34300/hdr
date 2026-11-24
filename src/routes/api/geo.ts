import { createFileRoute } from "@tanstack/react-router";
import { isCountryCentroid } from "@/lib/hdar/map-pins";

/** Ville approximative du visiteur, d'après la géolocalisation de Netlify (en-tête x-nf-geo)
 *  ou un en-tête pays CDN (x-nf-country, x-country, cf-ipcountry…).
 *  Rien n'est stocké ici : ni IP ni coordonnées. Renvoie le nom de ville, un point arrondi à 0,1°
 *  (~10 km) et le code pays à deux lettres, utilisés pour centrer la carte et pour les protections
 *  des pays à risque. */
function countryFrom(request: Request): string | null {
  const h = request.headers;
  for (const name of ["x-nf-country", "x-country", "cf-ipcountry", "x-vercel-ip-country", "x-country-code"]) {
    const v = h.get(name)?.trim().toUpperCase();
    if (v && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1") return v;
  }
  try {
    const raw = h.get("x-nf-geo");
    if (!raw) return null;
    const g = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { country?: { code?: string } | string };
    const cc = (typeof g.country === "string" ? g.country : g.country?.code)?.trim().toUpperCase();
    if (cc && /^[A-Z]{2}$/.test(cc) && cc !== "XX" && cc !== "T1") return cc;
  } catch { /* en-tête absent ou illisible */ }
  return null;
}

export const Route = createFileRoute("/api/geo")({
  server: {
    handlers: {
      GET: ({ request }) => {
        let city: string | null = null;
        let lat: number | null = null;
        let lng: number | null = null;
        const country = countryFrom(request);
        try {
          const raw = request.headers.get("x-nf-geo");
          if (raw) {
            const g = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { city?: string; country?: { code?: string }; subdivision?: { code?: string }; latitude?: number; longitude?: number };
            if (typeof g.latitude === "number" && typeof g.longitude === "number") {
              lat = Math.round(g.latitude * 10) / 10;
              lng = Math.round(g.longitude * 10) / 10;
            }
            // Centroïde pays (ex. France → Sarzay) : ville inconnue, ne pas centrer la carte là.
            if (lat != null && lng != null && isCountryCentroid(lat, lng)) {
              lat = null;
              lng = null;
              city = null;
            } else if (g.city) {
              city = [g.city, g.country?.code && g.country.code !== "FR" ? g.country.code : null].filter(Boolean).join(", ");
            }
          }
        } catch {
          city = null;
        }
        return new Response(JSON.stringify({ city, lat, lng, country }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      },
    },
  },
});
