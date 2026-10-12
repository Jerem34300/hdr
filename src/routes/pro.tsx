import { createFileRoute } from "@tanstack/react-router";
import { AdultGate } from "@/components/hdar/adult-gate";
import { ProSpace } from "@/components/hdar/pro";

export const Route = createFileRoute("/pro")({
  head: () => ({ meta: [{ title: "hdar. pro — lieux partenaires et boosts" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdultGate>
      <ProSpace />
    </AdultGate>
  ),
});
