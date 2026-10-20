import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdultGate } from "@/components/hdar/adult-gate";
import { App } from "@/components/hdar/app";
import { ensureClock, useHdar } from "@/lib/hdar/store";

/** Petites annonces dans l'appli : derrière l'écran 18+, jamais indexées (noindex + robots.txt + hors sitemap). */
export function AnnoncesShell({ focus }: { focus: string | null }) {
  return <AnnoncesRoute focus={focus} />;
}

export const Route = createFileRoute("/annonces/")({
  head: () => ({ meta: [{ title: "Petites annonces — hdar." }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
  component: () => <AnnoncesRoute focus={null} />,
});

function AnnoncesRoute({ focus: initial }: { focus: string | null }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.resolve(useHdar.persist.rehydrate()).then(() => {
      const now = Date.now();
      const focus = initial ?? new URLSearchParams(window.location.search).get("annonce");
      useHdar.setState((s) => ({ now, cover: false, clock: ensureClock(s.clock, now), view: { name: "annonces", focus }, returnTo: null }));
      setReady(true);
    });
  }, []);
  if (!ready) return <main className="h-dvh bg-night" />;
  return (
    <AdultGate>
      <App />
    </AdultGate>
  );
}
