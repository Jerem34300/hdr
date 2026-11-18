import { createFileRoute } from "@tanstack/react-router";
import { GateOnDemand } from "@/components/hdar/gate-on-demand";
import { ProLanding } from "@/components/hdar/pro-landing";
import { ProSpace } from "@/components/hdar/pro";

export const Route = createFileRoute("/pro")({
  head: () => ({ meta: [{ title: "hdar. pro — lieux partenaires" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <GateOnDemand
      direct={() => /[?&](claim|paid|cancel|demo)\b/.test(location.search) || location.hash === "#boost"}
      preview={(start) => (
        // Présentation visible sans passer l'entrée 18+ ; l'espace (fiche, paiement) reste protégé.
        <main className="h-dvh overflow-y-auto bg-night px-5 py-8 text-ink">
          <div className="mx-auto max-w-2xl">
            <a href="/" className="text-sm text-muted underline">← Retour à hdar.</a>
            <ProLanding prices={[]} onCreate={start} />
            <p className="pb-10 text-center text-xs text-muted">
              Une question avant de vous lancer ?{" "}
              <a className="underline" href="/contact">Contactez-nous</a>.
            </p>
          </div>
        </main>
      )}
    >
      <ProSpace />
    </GateOnDemand>
  ),
});
