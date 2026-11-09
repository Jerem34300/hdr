import { GateRadar } from "@/components/hdar/gate-radar";
import { AdultGate } from "@/components/hdar/adult-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { App } from "@/components/hdar/app";
import { SEO_CITIES, SITE_URL } from "@/lib/hdar/seo";
import { ensureClock, useHdar, hydrateHdar } from "@/lib/hdar/store";

export const Route = createFileRoute("/")({
  head: ({ match }) => {
    const search = match?.search as { r?: string; lang?: string } | undefined;
    const invite = Boolean(search?.r);
    // ?lang=xx is a client i18n switch on the same homepage — noindex to avoid duplicate URLs.
    const langDup = Boolean(search?.lang);
    return {
      meta: [
        ...(invite
          ? [
              { property: "og:title", content: "Viens sur hdar. : 3 jours hdar+ offerts 🎁" },
              { property: "og:description", content: "La carte des sorties et rencontres en direct, pour tout le monde, 100 % discret. Ton ami t'invite : 3 jours de hdar+ offerts pour vous deux." },
              { property: "og:image", content: `${SITE_URL}/og-invite.png?v=discret2` },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: `${SITE_URL}/og-invite.png?v=discret2` },
            ]
          : [
              { property: "og:title", content: "hdar. — Sorties et rencontres autour de toi, pour tout le monde" },
              { property: "og:description", content: "Sorties et rencontres autour de toi. Gratuit, anonyme, 18+. Carte en direct, chat du quartier." },
              { property: "og:url", content: `${SITE_URL}/` },
              { property: "og:type", content: "website" },
              { property: "og:locale", content: "fr_FR" },
            ]),
        { title: "hdar. — Sorties et rencontres autour de toi, pour tout le monde" },
        {
          name: "description",
          content:
            "Sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, 18+. Vois qui est visible et où sortir autour de toi : carte en direct, lieux, chat du quartier, messages, vocaux et vidéo.",
        },
        { name: "robots", content: langDup ? "noindex, follow" : "index, follow" },
      ],
      // Always canonical to apex without query string (covers ?lang=xx duplicates).
      links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    };
  },
  component: Home,
});

function Home() {
  // Wait for the saved state (last position, profile) before mounting the map,
  // otherwise it opens on the default city and jumps.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.resolve(hydrateHdar()).then(() => {
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
  // Même fond que l'écran d'entrée : le premier écran visible est le radar (liens villes gardés pour les moteurs, masqués).
  return (
    <main className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-[#0b0d12] px-6 text-center text-ink" aria-busy="true">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <span className="absolute -top-[10%] -left-[25%] size-[75vw] max-h-[520px] max-w-[520px] rounded-full bg-[#FA6F6C] opacity-35 blur-[70px]" />
        <span className="absolute top-[30%] -right-[30%] size-[70vw] max-h-[480px] max-w-[480px] rounded-full bg-[#A78BFA] opacity-25 blur-[80px]" />
      </div>
      <GateRadar className="relative aspect-square w-[clamp(110px,min(70vw,34dvh),300px)]" />
      <h1 className="sr-only">hdar. Sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, 18+.</h1>
      <nav aria-label="Villes" className="sr-only">
        {SEO_CITIES.filter((c) => c.slug !== "cap-d-agde").map((c) => (
          <a key={c.slug} href={`/rencontre/${c.slug}`}>{c.name}</a>
        ))}
        <a href="/rencontre/region/occitanie">Occitanie</a>
        <a href="/rencontre/region/ile-de-france">Île-de-France</a>
        <a href="/rencontre/region/provence-alpes-cote-d-azur">PACA</a>
        <a href="/rencontre">Toutes les villes</a>
      </nav>
    </main>
  );
}
