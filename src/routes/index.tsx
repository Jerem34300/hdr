import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { App } from "@/components/hdar/app";
import { ensureClock, useHdar } from "@/lib/hdar/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "hdar. — Who's around. Right now." },
      { name: "robots", content: "noindex, nofollow" },
    ],
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
  if (!ready) return <div className="h-dvh bg-night" aria-busy="true" />;
  return <App />;
}
