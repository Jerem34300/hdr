import { useEffect, useState, type ReactNode } from "react";
import { AdultGate } from "./adult-gate";
import { adultConfirmed, hasSession } from "@/lib/hdar/session";

/**
 * Page publique d'abord (contact, espace pro…), entrée 18+ / captcha seulement
 * quand la personne veut agir. Déjà entrée sur cet appareil → directement le contenu.
 * Le contrôle n'est pas affaibli : `children` reste toujours derrière <AdultGate>.
 */
export function GateOnDemand({
  preview,
  children,
  direct,
}: {
  preview: (start: () => void) => ReactNode;
  children: ReactNode;
  /** Ouvre directement l'entrée (ex. lien de réclamation de fiche, retour de paiement). */
  direct?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (direct?.()) return setOpen(true);
    if (!adultConfirmed()) return;
    let alive = true;
    void hasSession()
      .then((ok) => { if (alive && ok) setOpen(true); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (open) return <AdultGate>{children}</AdultGate>;
  return <>{preview(() => setOpen(true))}</>;
}
