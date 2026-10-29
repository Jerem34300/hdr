import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export type TipArrow = "up" | "down" | "left" | "right";

/** Pointe : petit carré tourné à 45°, mêmes bord et fond que la bulle. Le côté indique où est la cible. */
const POINTER: Record<TipArrow, string> = {
  down: "-bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b",
  up: "-top-1.5 left-1/2 -translate-x-1/2 border-l border-t",
  right: "top-1/2 -right-1.5 -translate-y-1/2 border-t border-r",
  left: "top-1/2 -left-1.5 -translate-y-1/2 border-b border-l",
};

/**
 * Bulle d'aide unique de l'appli (style du bouton « Se montrer ») : fond nuit, bord et halo corail,
 * pointe vers la cible, léger flottement (coupé si « réduire les animations »).
 */
export function TipBubble({ arrow, children, onClose, onClick, className, testId, pointerShift = 0 }: {
  /** Décalage de la bulle (px) pour rester dans l'écran : la pointe est recalée sur la cible. */ pointerShift?: number;
  arrow: TipArrow; children: ReactNode; onClose?: () => void; onClick?: () => void; className?: string; testId?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <div className={cn("vis-tip pointer-events-auto relative", arrow === "left" || arrow === "right" ? "vis-tip-x" : "", className)} data-testid={testId}>
      <Tag
        {...(onClick ? { type: "button" as const, onClick } : {})}
        className={cn(
          "relative block w-max max-w-52 rounded-2xl border border-signal/50 bg-night/95 px-3 py-2 text-center text-sm font-bold text-ink shadow-[0_0_28px_rgba(250,111,108,.45)]",
          onClose && "pr-7",
        )}
      >
        {children}
        <span aria-hidden className={cn("absolute size-3 rotate-45 border-signal/50 bg-night/95", POINTER[arrow])} style={pointerShift ? { left: `calc(50% - ${pointerShift}px)` } : undefined} />
      </Tag>
      {onClose && (
        <button type="button" aria-label="Fermer" onClick={onClose} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full text-muted hover:text-ink">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
