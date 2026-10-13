import { AdultGate } from "@/components/hdar/adult-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { App } from "@/components/hdar/app";
import { SEO_CITIES, SITE_URL } from "@/lib/hdar/seo";
import { ensureClock, useHdar } from "@/lib/hdar/store";

export const Route = createFileRoute("/")({
  head: ({ match }) => ({
    meta: [
      ...((match?.search as { r?: string } | undefined)?.r
        ? [
            { property: "og:title", content: "Viens sur hdar. : 3 jours hdar+ offerts 🎁" },
            { property: "og:description", content: "La carte gay en direct, 100 % anonyme. Ton ami t'invite : 3 jours de hdar+ offerts pour vous deux." },
            { property: "og:image", content: `${SITE_URL}/og-invite.png` },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { name: "twitter:card", content: "summary_large_image" },
            { name: "twitter:image", content: `${SITE_URL}/og-invite.png` },
          ]
        : []),
      { title: "hdar. — Rencontre gay autour de toi, en direct" },
      {
        name: "description",
        content:
          "Appli de rencontre gay géolocalisée : vois qui est connecté autour de toi, chat du quartier, messages, photos, vocaux et vidéo. Gratuit, sans inscription, 18+.",
      },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: Home,
});

function Home() {
  // Wait for the saved state (last position, profile) before mounting the map,
  // otherwise it opens on the default city and jumps.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.resolve(useHdar.persist.rehydrate()).then(() => {
      const now = Date.now();
      useHdar.setState((s) => ({
        now,
        cover: false,
        clock: ensureClock(s.clock, now),
      }));
      setReady(true);
    });
  }, []);
  if (!ready) return <Splash />;
  return (
    <AdultGate>
      <App />
    </AdultGate>
  );
}

/**
 * Shown for a split second while saved state loads, and what search engines
 * read from the server-rendered page: what hdar is, plus links to city pages.
 */
function Splash() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center bg-night px-6 text-center text-ink" aria-busy="true">
      <p className="font-display text-4xl font-extrabold tracking-tight">
        hdar<span className="text-signal">.</span>
      </p>
      <h1 className="mt-3 text-sm text-muted">Rencontre gay autour de toi, en direct</h1>
      <nav aria-label="Villes" className="absolute inset-x-6 bottom-6 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted">
        {SEO_CITIES.map((c) => (
          <Link key={c.slug} to="/fr/rencontre-gay-{$ville}" params={{ ville: c.slug }}>
            {c.name}
          </Link>
        ))}
      </nav>
    </main>
  );
}
