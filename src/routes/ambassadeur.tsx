import { createFileRoute } from "@tanstack/react-router";
import { AdultGate } from "@/components/hdar/adult-gate";
import { AmbassadorPage } from "@/components/hdar/amb-landing";

export const Route = createFileRoute("/ambassadeur")({
  head: () => ({ meta: [{ title: "hdar. ambassadeur — gagne de l'argent en faisant connaître hdar" }, { name: "description", content: "Deviens ambassadeur hdar : ton lien, ton QR, des codes cadeaux et une commission sur l'argent réellement encaissé." }] }),
  component: () => (
    <AdultGate>
      <AmbassadorPage />
    </AdultGate>
  ),
});
