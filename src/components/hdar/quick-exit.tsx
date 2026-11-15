import { quickExit, useSafeCountry } from "@/lib/hdar/safe-mode";

/** Bouton discret, même famille que les chips du haut de la carte. Visible seulement dans un pays à risque. */
export function QuickExitButton({ className = "" }: { className?: string }) {
  const on = useSafeCountry();
  if (!on) return null;
  return (
    <button
      type="button"
      data-act="quick-exit"
      aria-label="Quitter tout de suite et ouvrir une page neutre"
      onClick={quickExit}
      className={
        "relative flex h-10 flex-[1_0_auto] items-center justify-center rounded-full bg-white/5 px-3 text-[11px] leading-tight font-semibold whitespace-nowrap text-muted ring-1 ring-white/15 " +
        className
      }
    >
      Sortie rapide
    </button>
  );
}
