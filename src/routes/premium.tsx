import { createFileRoute } from "@tanstack/react-router";
import { AdultGate } from "@/components/hdar/adult-gate";
import { PremiumPage } from "@/components/hdar/premium";

export const Route = createFileRoute("/premium")({
  head: () => ({ meta: [{ title: "hdar+ — Premium" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdultGate>
      <PremiumPage />
    </AdultGate>
  ),
});
