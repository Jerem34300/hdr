import { useEffect, useState } from "react";
import { PAYMENTS_ENABLED } from "@/lib/hdar/payments";
import { getWaiver, onWaiver, setWaiver } from "@/lib/hdar/consent";

export function WaiverCheckbox({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(getWaiver);
  useEffect(() => onWaiver(setOn), []);
  if (!PAYMENTS_ENABLED) return (
    <p className={"rounded-2xl border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-3 py-2 text-center text-xs text-[#f5d27a] " + className}>
      🎁 Aucun paiement : tout est <b>offert pendant le lancement</b> avec le code <b>FIRST</b>.
    </p>
  );
  return (
    <label className={"flex items-start gap-2 text-xs text-muted " + className}>
      <input type="checkbox" className="mt-0.5" checked={on} onChange={(e) => setWaiver(e.target.checked)} />
      <span>
        Je demande l'exécution immédiate du service et je renonce à mon droit de rétractation de 14 jours.{" "}
        <a href="/cgu" className="underline">CGU</a>
      </span>
    </label>
  );
}
