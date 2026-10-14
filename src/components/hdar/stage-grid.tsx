import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Grille animée du diffuseur : les cases arrivent en grandissant, partent en rétrécissant,
 * et les autres glissent pour remplir la place (FLIP : First, Last, Invert, Play — sans dépendance).
 */
export type Tile = { key: string; node: ReactNode };

const MS = 320;
export function cols(n: number) { return n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4; }

export function StageGrid({ tiles, focus, onFocus }: { tiles: Tile[]; focus: string | null; onFocus: (k: string | null) => void }) {
  // les cases qui partent restent affichées le temps de rétrécir
  const [shown, setShown] = useState<(Tile & { out?: boolean })[]>(tiles);
  useEffect(() => {
    setShown((prev) => {
      const now = new Map(tiles.map((t) => [t.key, t]));
      const merged: (Tile & { out?: boolean })[] = prev.map((p) => now.get(p.key) ?? { ...p, out: true });
      tiles.forEach((t) => { if (!prev.some((p) => p.key === t.key)) merged.push(t); });
      return merged;
    });
    const t = setTimeout(() => setShown((s) => s.filter((x) => tiles.some((t) => t.key === x.key))), MS);
    return () => clearTimeout(t);
  }, [tiles]);
  const live = shown.filter((t) => !t.out);
  const n = live.length;
  const c = focus && live.some((t) => t.key === focus) ? Math.max(2, cols(n - 1)) : cols(n);
  const els = useRef(new Map<string, HTMLDivElement>());
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    els.current.forEach((el, k) => {
      const before = rects.current.get(k), after = el.getBoundingClientRect();
      if (before && (before.width !== after.width || before.left !== after.left || before.top !== after.top)) {
        el.animate([
          { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
          { transform: "none" },
        ], { duration: MS, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    });
    const m = new Map<string, DOMRect>();
    els.current.forEach((el, k) => m.set(k, el.getBoundingClientRect()));
    rects.current = m;
  });
  return (
    <div data-tiles={n} className="grid size-full gap-1.5" style={{ gridTemplateColumns: `repeat(${c}, minmax(0,1fr))`, gridAutoRows: "1fr" }}>
      {shown.map((t) => {
        const big = focus === t.key && !t.out;
        return (
          <div key={t.key} ref={(el) => { if (el) els.current.set(t.key, el); else els.current.delete(t.key); }}
            onClick={() => !t.out && onFocus(big ? null : t.key)}
            style={{ gridColumn: big ? "1 / -1" : undefined, gridRow: big ? "span 2" : undefined, transformOrigin: "center" }}
            className={`relative min-h-0 overflow-hidden rounded-2xl bg-night ring-1 ring-white/15 ${t.out ? "pointer-events-none animate-[tileout_.32s_ease-in_forwards]" : "animate-[tilein_.32s_cubic-bezier(.2,.8,.2,1)]"}`}>
            {t.node}
          </div>
        );
      })}
    </div>
  );
}
