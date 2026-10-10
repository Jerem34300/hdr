import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { App } from "@/components/hdar/app";
import { SEO_CITIES, SITE_URL } from "@/lib/hdar/seo";
import { ensureClock, useHdar } from "@/lib/hdar/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
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
  return <App />;
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
