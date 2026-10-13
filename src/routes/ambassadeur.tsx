import { createFileRoute } from "@tanstack/react-router";
import { AdultGate } from "@/components/hdar/adult-gate";
import { AmbassadorSpace } from "@/components/hdar/ambassador";

export const Route = createFileRoute("/ambassadeur")({
  head: () => ({ meta: [{ title: "hdar. ambassadeur" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdultGate>
      <main className="h-dvh overflow-y-auto bg-night px-5 py-6 pb-16 text-ink">
        <div className="mx-auto max-w-md">
          <a href="/" className="text-sm text-muted underline">← Retour</a>
          <h1 className="mt-2 mb-4 font-display text-3xl font-extrabold">🎯 Espace ambassadeur</h1>
          <AmbassadorSpace />
        </div>
      </main>
    </AdultGate>
  ),
});
