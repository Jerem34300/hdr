import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
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
  useEffect(() => {
    void Promise.resolve(useHdar.persist.rehydrate()).then(() => {
      const now = Date.now();
      useHdar.setState((s) => ({
        now,
        cover: false,
        clock: ensureClock(s.clock, now),
      }));
    });
  }, []);
  return <App />;
}
