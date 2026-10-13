import { createFileRoute } from "@tanstack/react-router";
import { AdultGate } from "@/components/hdar/adult-gate";
import { RouletteScreen } from "@/components/hdar/roulette";

export const Route = createFileRoute("/live")({
  head: () => ({ meta: [{ title: "Live — hdar." }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdultGate>
      <RouletteScreen demo={import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("demo") ? {
        peer: { id: "demo", pseudo: "Theo_31", age: 27, iam: "H", seeking: "H,X", note: "Chill, on papote ☕", premium: true, role: "answer" },
        premium: location.search.includes("prem"), unblurred: location.search.includes("clear"), online: 38 } : undefined} pro={typeof location !== "undefined" ? new URLSearchParams(location.search).get("pro") ?? undefined : undefined} />
    </AdultGate>
  ),
});
