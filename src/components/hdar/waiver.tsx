import { useEffect, useState } from "react";
import { getWaiver, onWaiver, setWaiver } from "@/lib/hdar/consent";

export function WaiverCheckbox({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(getWaiver);
  useEffect(() => onWaiver(setOn), []);
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
