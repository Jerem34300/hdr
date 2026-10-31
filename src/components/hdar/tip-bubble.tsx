import { useEffect, useState, type ReactNode } from "react";
import { useHdar } from "@/lib/hdar/store";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export type TipArrow = "up" | "down" | "left" | "right";
type Zone = { left: number; top: number; right: number; bottom: number };

/**
 * File d'attente globale des bulles d'aide : une seule visible à la fois, jamais par-dessus
 * une feuille/fiche ouverte, le bandeau « Sois le premier… » ou une autre bulle.
 */
export function tipBlocked(id: string, zone?: Zone) {
  if (typeof document === "undefined") return true;
  if (useHdar.getState().sheet) return true;
  if (document.querySelector(".fixed.inset-0, [data-sheet-root]")) return true;
  if ([...document.querySelectorAll<HTMLElement>("[data-tip-bubble]")].some((e) => e.dataset.tipBubble !== id)) return true;
  const ban = document.querySelector('[data-act="empty-banner"]')?.getBoundingClientRect();
  return !!(ban && zone && zone.left < ban.right && zone.right > ban.left && zone.top < ban.bottom && zone.bottom > ban.top);
}

/** Rectangle probable d'une bulle (≈ 210 × 90 px) posée du côté `arrow` d'une cible. */
export function tipZone(t: DOMRect, arrow: TipArrow): Zone {
  const W = 210, H = 90, cx = (t.left + t.right) / 2, cy = (t.top + t.bottom) / 2;
  if (arrow === "up") return { left: cx - W / 2, right: cx + W / 2, top: t.bottom, bottom: t.bottom + H };
  if (arrow === "down") return { left: cx - W / 2, right: cx + W / 2, top: t.top - H, bottom: t.top };
  if (arrow === "right") return { left: t.left - W, right: t.left, top: cy - H / 2, bottom: cy + H / 2 };
  return { left: t.right, right: t.right + W, top: cy - H / 2, bottom: cy + H / 2 };
}

/** Vrai quand la bulle `id` a le droit de s'afficher (revérifié toutes les 500 ms). */
export function useTipAllowed(id: string, on: boolean, selector: string, arrow: TipArrow) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!on) { setOk(false); return; }
    const check = () => { const t = document.querySelector(selector)?.getBoundingClientRect(); setOk(!tipBlocked(id, t ? tipZone(t, arrow) : undefined)); };
    check();
    const iv = window.setInterval(check, 500);
    return () => window.clearInterval(iv);
  }, [id, on, selector, arrow]);
  return ok;
}

/** Pointe : petit carré tourné à 45°, mêmes bord et fond que la bulle. Le côté indique où est la cible. */
const POINTER: Record<TipArrow, string> = {
  down: "-bottom-1.5 left-1/2 -translate-x-1/2 border-e border-b",
  up: "-top-1.5 left-1/2 -translate-x-1/2 border-s border-t",
  right: "top-1/2 -end-1.5 -translate-y-1/2 border-t border-e",
  left: "top-1/2 -start-1.5 -translate-y-1/2 border-b border-s",
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
    <div className={cn("vis-tip pointer-events-auto relative", arrow === "left" || arrow === "right" ? "vis-tip-x" : "", className)} data-testid={testId} data-tip-bubble={testId ?? "tip"}>
      <Tag
        {...(onClick ? { type: "button" as const, onClick } : {})}
        className={cn(
          "relative block w-max max-w-52 rounded-2xl border border-signal/50 bg-night/95 px-3 py-2 text-center text-sm font-bold text-ink shadow-[0_0_28px_rgba(250,111,108,.45)]",
          onClose && "pe-7",
        )}
      >
        {children}
        <span aria-hidden className={cn("absolute size-3 rotate-45 border-signal/50 bg-night/95", POINTER[arrow])} style={pointerShift ? { left: `calc(50% - ${pointerShift}px)` } : undefined} />
      </Tag>
      {onClose && (
        <button type="button" aria-label="Fermer" onClick={onClose} className="absolute top-1 end-1 grid size-6 place-items-center rounded-full text-muted hover:text-ink">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
