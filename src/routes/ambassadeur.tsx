import { createFileRoute } from "@tanstack/react-router";
import { AdultGate } from "@/components/hdar/adult-gate";
import { AmbassadorPage } from "@/components/hdar/amb-landing";

export const Route = createFileRoute("/ambassadeur")({
  head: () => ({ meta: [{ title: "hdar. ambassadeur — gagne des boosts et du hdar+ en faisant connaître hdar" }, { name: "description", content: "Deviens ambassadeur hdar : ton lien, ton QR, des codes cadeaux, et des boosts et du hdar+ pour chaque inscrit et chaque lieu." }] }),
  component: () => import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("demo") ? <AmbassadorPage /> : (
    <AdultGate>
      <AmbassadorPage />
    </AdultGate>
  ),
});
