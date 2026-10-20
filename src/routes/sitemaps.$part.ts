import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemaps/$part")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const origin = new URL(request.url).origin;
        const { allUrls } = await import("@/lib/hdar/seo-geo/geo.server");
        const u = allUrls();
        const m = /^villes-(\d+)\.xml$/.exec(params.part);
        let urls: string[];
        if (params.part === "core.xml") urls = ["/", "/pro", "/ambassadeur", "/live-coquin", "/webcam-gay-live", "/alternative-chatroulette", "/alternative-omegle", "/tchat-webcam-aleatoire", "/cam-to-cam", "/fr/sortir-rencontrer-cap-d-agde", ...u.lists, ...u.themes, ...u.annonces];
        else if (m) urls = u.cities.slice((+m[1] - 1) * 10000, +m[1] * 10000);
        else urls = [];
        // villes-2..4 ont été soumis avant la réduction : on garde un sitemap vide valide plutôt qu'une 404.
        if (!urls.length && !(m && +m[1] <= 4)) return new Response("Not found", { status: 404 });
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls.map((p) => `  <url><loc>${origin}${p}</loc><lastmod>2026-10-15</lastmod></url>`).join("\n") + `\n</urlset>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
      },
    },
  },
});
