import { createFileRoute } from "@tanstack/react-router";

/** Index de sitemaps : core (pages principales, régions, départements, thèmes) + villes par tranches de 10 000. */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const { allUrls } = await import("@/lib/hdar/seo-geo/geo.server");
        const n = Math.ceil(allUrls().cities.length / 10000);
        const parts = ["core", ...Array.from({ length: n }, (_, i) => `villes-${i + 1}`)];
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          parts.map((p) => `  <sitemap><loc>${origin}/sitemaps/${p}.xml</loc></sitemap>`).join("\n") + `\n</sitemapindex>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
