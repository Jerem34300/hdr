import { createFileRoute } from "@tanstack/react-router";
import { SEO_CITIES } from "@/lib/hdar/seo";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = new URL(request.url).origin;
        const urls = ["/", ...SEO_CITIES.map((c) => `/fr/sortir-rencontrer-${c.slug}`)];
        const body =
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls.map((u) => `  <url><loc>${origin}${u}</loc><lastmod>2026-10-12</lastmod></url>`).join("\n") +
          `\n</urlset>\n`;
        return new Response(body, {
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
