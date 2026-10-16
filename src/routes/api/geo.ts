import { createFileRoute } from "@tanstack/react-router";

/** Ville approximative du visiteur, d'après la géolocalisation de Netlify (en-tête x-nf-geo).
 *  Rien n'est stocké ici : ni IP ni coordonnées, seulement le nom de ville renvoyé au client. */
export const Route = createFileRoute("/api/geo")({
  server: {
    handlers: {
      GET: ({ request }) => {
        let city: string | null = null;
        try {
          const raw = request.headers.get("x-nf-geo");
          if (raw) {
            const g = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { city?: string; country?: { code?: string }; subdivision?: { code?: string } };
            if (g.city) city = [g.city, g.country?.code && g.country.code !== "FR" ? g.country.code : null].filter(Boolean).join(", ");
          }
        } catch {
          city = null;
        }
        return new Response(JSON.stringify({ city }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      },
    },
  },
});
