import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fenêtre flottante commune (Live réduit, appel réduit).
 * - Verre dépoli, bord corail lumineux (lueur animée), coins très arrondis, ombre douce.
 * - Physique à ressort : glisser, lancer avec inertie, aimantage sur le bord le plus proche (vibration courte), pincement
 *   avec élastique aux limites (≈100 px → 80 % de la largeur), poignée d'angle. Taille et position gardées (localStorage).
 * - Transition morphée (FLIP) entre plein écran et vignette : c'est le MÊME nœud DOM dans les deux états, rien n'est remonté.
 * - Tout passe par transform / variables CSS pendant le geste (aucun rendu React par image → 60 fps).
 * - prefers-reduced-motion : pas de ressort ni de morph, positions appliquées directement.
 * Le contenu peut lire sa mise à l'échelle via la variable CSS --fw-scale (largeur / largeur d'écran).
 */
type Box = { x: number; y: number; w: number };
const KEY = (k: string) => `hdar-float-${k}`;
const load = (k: string): Box | null => { try { const v = JSON.parse(localStorage.getItem(KEY(k)) || "null"); return v && Number.isFinite(v.w) ? v : null; } catch { return null; } };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.2,.9,.25,1.08)";

export function FloatingWindow({ id, ratio, defaultW, onTap, children, overlay, glow = "coral", testid, active = true, fullClass = "fixed inset-0 z-50", morph = true }: {
  active?: boolean; fullClass?: string; id: string; ratio: number; defaultW: number; onTap: () => void; children: (w: number) => ReactNode;
  overlay?: ReactNode; glow?: "coral" | "online"; testid?: string; morph?: boolean;
}) {
  const [vp, setVp] = useState({ w: 412, h: 915 });
  const [w, setW] = useState(defaultW); // largeur « posée » (rendu React), le geste pilote le DOM directement
  const [ready, setReady] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const s = useRef({ x: 0, y: 0, w: defaultW, vx: 0, vy: 0, vw: 0, tx: 0, ty: 0, tw: defaultW, raf: 0, buzz: false });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ x: number; y: number; ox: number; oy: number; ow: number; d: number; moved: boolean; resize: boolean; hist: { x: number; y: number; t: number }[] } | null>(null);
  const prevActive = useRef(active);

  useEffect(() => { const f = () => setVp({ w: window.innerWidth, h: window.innerHeight }); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const minW = 100, maxW = Math.round(vp.w * 0.8), M = 12;
  const clampW = (x: number) => Math.min(maxW, Math.max(minW, x));
  const fit = (b: Box): Box => { const ww = clampW(b.w), h = ww * ratio; return { w: ww, x: Math.min(Math.max(M, b.x), vp.w - ww - M), y: Math.min(Math.max(M + 40, b.y), vp.h - h - M - 70) }; };

  const paint = () => {
    const n = el.current; if (!n || !prevActive.current) return; const c = s.current;
    n.style.transform = `translate3d(${c.x}px,${c.y}px,0)`;
    n.style.width = `${c.w}px`; n.style.height = `${c.w * ratio}px`;
    n.style.setProperty("--fw-scale", String(c.w / vp.w));
  };
  const save = () => { const c = s.current; try { localStorage.setItem(KEY(id), JSON.stringify({ x: c.tx, y: c.ty, w: c.tw })); } catch { /* */ } };
  const settle = () => { const c = s.current; c.x = c.tx; c.y = c.ty; c.w = c.tw; c.vx = c.vy = c.vw = 0; paint(); setW(Math.round(c.tw)); save(); };
  // ressort critique légèrement sous-amorti (petit rebond premium), intégration semi-implicite
  const spring = () => {
    cancelAnimationFrame(s.current.raf);
    if (reduced()) { if (s.current.buzz) navigator.vibrate?.(8); s.current.buzz = false; return settle(); }
    let last = performance.now();
    const step = (t: number) => {
      const c = s.current, dt = Math.min(0.032, (t - last) / 1000); last = t;
      const k = 320, d = 2 * Math.sqrt(k) * 0.78;
      for (const [p, v, tg] of [["x", "vx", "tx"], ["y", "vy", "ty"], ["w", "vw", "tw"]] as const) { c[v] += (k * (c[tg] - c[p]) - d * c[v]) * dt; c[p] += c[v] * dt; }
      if (c.buzz && Math.abs(c.x - c.tx) < 1.5) { c.buzz = false; navigator.vibrate?.(8); } // aimanté : petit retour haptique
      const done = Math.abs(c.x - c.tx) + Math.abs(c.y - c.ty) + Math.abs(c.w - c.tw) < 0.4 && Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.vw) < 4;
      if (done) return settle();
      paint(); c.raf = requestAnimationFrame(step);
    };
    s.current.raf = requestAnimationFrame(step);
  };

  useEffect(() => {
    const b = fit(load(id) ?? { w: defaultW, x: vp.w - defaultW - M, y: vp.h - defaultW * ratio - 110 });
    Object.assign(s.current, { x: b.x, y: b.y, w: b.w, tx: b.x, ty: b.y, tw: b.w }); setW(b.w); setReady(true); paint();
  }, [vp.w, vp.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);

  // FLIP : même nœud, on anime seulement transform (+ rayon) entre l'écran entier et la vignette
  useLayoutEffect(() => {
    const was = prevActive.current; prevActive.current = active; const n = el.current;
    if (!n || was === active || !ready) return;
    const c = s.current, k = c.w / vp.w;
    if (active) paint(); else { n.style.transform = ""; n.style.width = ""; n.style.height = ""; }
    if (reduced()) return;
    const box = `translate3d(${c.x}px,${c.y}px,0) scale(1)`;
    if (morph) {
      const full = `translate3d(0,0,0) scale(${1 / k})`;
      const frames = active
        ? [{ transform: full, borderRadius: "0px" }, { transform: box, borderRadius: "16px" }]
        : [{ transform: `translate3d(${c.x}px,${c.y}px,0) scale(${k})`, borderRadius: `${16 / k}px` }, { transform: "translate3d(0,0,0) scale(1)", borderRadius: "0px" }];
      n.animate(frames, { duration: 460, easing: EASE });
    } else if (active) n.animate([{ transform: `${box.replace("scale(1)", "scale(.6)")}`, opacity: 0 }, { transform: box, opacity: 1 }], { duration: 380, easing: EASE });
  }, [active, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return <div ref={el} className={fullClass} style={{ transformOrigin: "0 0", ["--fw-scale" as string]: 1 }}>{children(0)}</div>;

  const down = (e: React.PointerEvent, resize = false) => {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    cancelAnimationFrame(s.current.raf);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()], c = s.current;
    g.current = { x: e.clientX, y: e.clientY, ox: c.x, oy: c.y, ow: c.w, d: p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0, moved: !!g.current?.moved || p.length >= 2, resize, hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  };
  // élastique au-delà des limites (sensation physique)
  const rubber = (v: number, lo: number, hi: number) => v < lo ? lo - (lo - v) * 0.35 : v > hi ? hi + (v - hi) * 0.35 : v;
  const move = (e: React.PointerEvent) => {
    const st = g.current; if (!st || !pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()], c = s.current;
    if (p.length >= 2 && st.d) {
      const ww = rubber(st.ow * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / st.d, minW, maxW);
      c.w = ww; c.x = st.ox - (ww - st.ow) / 2; c.y = st.oy - (ww - st.ow) * ratio / 2; return paint();
    }
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.moved && Math.hypot(dx, dy) < 8) return; st.moved = true;
    st.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp }); if (st.hist.length > 6) st.hist.shift();
    if (st.resize) c.w = rubber(st.ow + dx, minW, maxW);
    else { c.x = st.ox + dx; c.y = st.oy + dy; }
    paint();
  };
  const up = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId); const st = g.current;
    if (pts.current.size) { if (st) { const c = s.current, q = [...pts.current.values()][0]; Object.assign(st, { x: q.x, y: q.y, ox: c.x, oy: c.y, ow: c.w, d: 0 }); } return; }
    g.current = null; if (!st) return;
    if (!st.moved) return onTap();
    const c = s.current, h0 = st.hist[0], h1 = st.hist[st.hist.length - 1], dt = Math.max(16, h1.t - h0.t);
    const vx = st.resize ? 0 : ((h1.x - h0.x) / dt) * 1000, vy = st.resize ? 0 : ((h1.y - h0.y) / dt) * 1000;
    const tw = clampW(c.w), projX = c.x + vx * 0.2, projY = c.y + vy * 0.2; // lancer : on projette l'inertie
    const left = projX + tw / 2 < vp.w / 2;
    const b = fit({ w: tw, x: left ? M : vp.w - tw - M, y: projY });
    Object.assign(c, { vx, vy, tx: b.x, ty: b.y, tw: b.w, buzz: !st.resize });
    spring();
  };

  const ring = glow === "online" ? "fw-glow-online" : "fw-glow";
  return (
    <div ref={el} data-testid={testid} className={`fw-glass ${ring} fixed start-0 top-0 z-[80] overflow-hidden rounded-2xl will-change-transform`}
      style={{ width: w, height: w * ratio, visibility: ready ? undefined : "hidden", transformOrigin: "0 0", ["--fw-scale" as string]: w / vp.w }}>
      {children(w)}
      <div role="button" aria-label="Agrandir" className="absolute inset-0 touch-none" onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {overlay}
      <div aria-label="Redimensionner" className="absolute end-0 bottom-0 z-10 flex size-9 touch-none items-end justify-end p-2" onPointerDown={(e) => down(e, true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <svg viewBox="0 0 12 12" className="size-3.5 text-white/90 drop-shadow" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M11 5 5 11M11 9 9 11" /></svg>
      </div>
    </div>
  );
}
