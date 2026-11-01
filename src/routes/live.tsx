import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdultGate } from "@/components/hdar/adult-gate";
import { useLiveDock } from "@/lib/hdar/live-dock";
import { Toaster } from "sonner";

/** /live ouvre le Live dans l'hôte unique monté au-dessus du routeur (LiveDock) : réduire ou changer d'onglet ne le coupe pas. */
function LiveOpener() {
  useEffect(() => { useLiveDock.getState().openLive(location.search); }, []);
  return <div className="fixed inset-0 bg-black" />;
}

export const Route = createFileRoute("/live")({
  head: () => ({ meta: [{ title: "Live — hdar." }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdultGate>
      {/* le Live est hors de app.tsx : sans ce Toaster, aucun toast (partage, erreurs) ne s'affichait */}
      <Toaster theme="dark" position="top-center" />
      <LiveOpener />
    </AdultGate>
  ),
});
