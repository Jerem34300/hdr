import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fenêtre flottante commune (même geste que l'aperçu caméra déplaçable du Live, généralisé) :
 * glisser au doigt, aimantage doux sur le bord gauche/droit le plus proche, redimensionnement par pincement ou par la
 * poignée d'angle (≈100 px → 80 % de la largeur), taille et position gardées (localStorage, par clé).
 * Toucher sans glisser = onTap. Le contenu reçoit sa largeur via children(w).
 */
type Box = { x: number; y: number; w: number };
const load = (k: string): Box | null => { try { const v = JSON.parse(localStorage.getItem(`hdar-float-${k}`) || "null"); return v && Number.isFinite(v.w) ? v : null; } catch { return null; } };
export function FloatingWindow({ id, ratio, defaultW, onTap, children, overlay, ringClass = "ring-[#FA6F6C]", testid, active = true, fullClass = "fixed inset-0 z-50" }: {
  active?: boolean; fullClass?: string; id: string; ratio: number; defaultW: number; onTap: () => void; children: (w: number) => ReactNode; overlay?: ReactNode; ringClass?: string; testid?: string;
}) {
  const [vp, setVp] = useState({ w: 412, h: 915 });
  const [box, setBox] = useState<Box | null>(null);
  const [anim, setAnim] = useState(false);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ x: number; y: number; ox: number; oy: number; ow: number; d: number; moved: boolean; resize: boolean } | null>(null);
  useEffect(() => { const f = () => setVp({ w: window.innerWidth, h: window.innerHeight }); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const minW = 100, maxW = Math.round(vp.w * 0.8);
  const fit = (b: Box): Box => { const w = Math.min(maxW, Math.max(minW, b.w)), h = w * ratio; return { w, x: Math.min(Math.max(8, b.x), vp.w - w - 8), y: Math.min(Math.max(8, b.y), vp.h - h - 8) }; };
  useEffect(() => { setBox(fit(load(id) ?? { w: defaultW, x: vp.w - defaultW - 12, y: vp.h - defaultW * ratio - 110 })); }, [vp.w, vp.h]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return <div className={fullClass}>{children(0)}</div>;
  if (!box) return null;
  const b = fit(box), h = b.w * ratio;
  const save = (n: Box) => { setBox(n); try { localStorage.setItem(`hdar-float-${id}`, JSON.stringify(n)); } catch { /* */ } };
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const down = (e: React.PointerEvent, resize = false) => {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); setAnim(false);
    const p = [...pts.current.values()];
    g.current = { x: e.clientX, y: e.clientY, ox: b.x, oy: b.y, ow: b.w, d: p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0, moved: !!g.current?.moved || p.length >= 2, resize };
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current; if (!s || !pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    if (p.length >= 2 && s.d) { const k = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / s.d; const w = s.ow * k; setBox(fit({ w, x: s.ox - (w - s.ow) / 2, y: s.oy - (w - s.ow) * ratio / 2 })); return; }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < 8) return; s.moved = true;
    if (s.resize) setBox(fit({ ...b, w: s.ow + dx, x: s.ox, y: s.oy })); // poignée en bas à droite
    else setBox(fit({ w: s.ow, x: s.ox + dx, y: s.oy + dy }));
  };
  const up = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId); const s = g.current;
    if (pts.current.size) return;
    g.current = null; if (!s) return;
    if (!s.moved) return onTap();
    // aimantage doux : vers le bord gauche ou droit le plus proche
    const cur = fit(box); const left = cur.x + cur.w / 2 < vp.w / 2;
    setAnim(!reduce); save(fit({ ...cur, x: left ? 12 : vp.w - cur.w - 12 }));
  };
  // (inactive ci-dessus) même arbre en plein écran et en vignette : le contenu n'est jamais remonté.
  return (
    <div data-testid={testid} className={`fixed z-[80] overflow-hidden rounded-2xl bg-black shadow-[0_8px_30px_rgba(0,0,0,.6)] ring-2 ${ringClass}`}
      style={{ left: b.x, top: b.y, width: b.w, height: h, transition: anim ? "left .25s ease-out, top .25s ease-out" : undefined }}>
      {children(b.w)}
      <div role="button" aria-label="Agrandir" className="absolute inset-0 touch-none" onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {overlay}
      <div aria-label="Redimensionner" className="absolute end-0 bottom-0 z-10 flex size-7 touch-none items-end justify-end p-1" onPointerDown={(e) => down(e, true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <svg viewBox="0 0 12 12" className="size-3.5 text-white/90" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M11 5 5 11M11 9 9 11" /></svg>
      </div>
    </div>
  );
}
