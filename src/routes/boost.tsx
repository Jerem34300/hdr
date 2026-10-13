import { createFileRoute } from "@tanstack/react-router";
import { AdultGate } from "@/components/hdar/adult-gate";
import { BoostPage } from "@/components/hdar/boost";

export const Route = createFileRoute("/boost")({
  head: () => ({ meta: [{ title: "Booster mon profil — hdar." }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdultGate>
      <BoostPage />
    </AdultGate>
  ),
});
