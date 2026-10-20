import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = new URL(request.url).origin;
        const bots = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended", "Bingbot", "Googlebot"];
        const body = bots.map((b) => `User-agent: ${b}\nAllow: /\nDisallow: /admin\nDisallow: /annonces\n`).join("\n") + `\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /annonces\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
