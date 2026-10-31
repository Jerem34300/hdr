import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { TipBubble, useTipAllowed } from "./tip-bubble";

/** Paillettes autour du bouton caché : [x, y depuis le centre, délai, taille]. */
const SPARKS: [number, number, number, number][] = [[-40, -18, 0, 7], [34, -30, 0.7, 6], [42, 6, 1.4, 8], [-36, 14, 1.9, 5], [-8, -42, 1.1, 6]];
const TIP_KEY = "hdar-visibility-tip";
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Explosion d'étincelles (canvas, ~60 particules, ≈0,9 s) autour du bouton. */
function burst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const cx = W / 2, cy = H / 2;
  const colors = ["#fbbf24", "#fde68a", "#A1E3C3", "#3ddc97", "#ffffff"];
  const ps = Array.from({ length: 60 }, () => {
    const a = Math.random() * Math.PI * 2, v = 2.2 + Math.random() * 4.2;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, r: 1.2 + Math.random() * 2.4, c: colors[(Math.random() * colors.length) | 0], life: 1 };
  });
  let raf = 0;
  const step = () => {
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of ps) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.985; p.life -= 0.018;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c; ctx.shadowBlur = 8;
      ctx.beginPath();
      // petites étoiles : losange étiré dans la direction du mouvement
      ctx.ellipse(p.x, p.y, p.r * 2, p.r * 0.7, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
      ctx.fill();
    }
    if (alive) raf = requestAnimationFrame(step);
    else ctx.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * Œil au trait (même style que les icônes lucide de la barre : 24×24, trait 2, bouts ronds).
 * Fermé : paupière en arc vers le bas + cils ; il cligne / s'entrouvre de temps en temps.
 * Ouvert : la paupière remonte (transform, fluide aussi sur Safari), pupille + reflet apparaissent.
 */
export function EyeIcon({ open, className = "size-7" }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("eye", className, open ? "eye-open" : "eye-closed")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path className="eye-lower" d="M2.5 12 Q12 20 21.5 12" />
      <g className="eye-ball">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        <circle className="eye-glint" cx="13.3" cy="10.7" r="1" fill="#fff" stroke="none" />
      </g>
      <path className="eye-lid" d="M2.5 12 Q12 4 21.5 12" />
      <g className="eye-lashes">
        <path d="M6 15.2 L4.8 17.2" /><path d="M12 17.1 V19.4" /><path d="M18 15.2 L19.2 17.2" />
      </g>
    </svg>
  );
}

/**
 * Bouton central de la barre du bas : interrupteur de visibilité.
 * Caché (corail, « Se montrer ») ↔ Visible (vert hdar, « Visible »). La mise en ligne reste celle
 * d'avant : le toucher ouvre la même feuille (durée, envies) ou la gestion de la session en cours.
 */
export function VisibilityButton({ visible, label, bind }: { visible: boolean; label?: string; bind: Record<string, unknown> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const prev = useRef<boolean | null>(null);
  const [fx, setFx] = useState(0);
  const [tip, setTip] = useState(false);
  useEffect(() => {
    if (!visible && typeof localStorage !== "undefined" && !localStorage.getItem(TIP_KEY)) setTip(true);
  }, [visible]);
  useEffect(() => {
    const was = prev.current;
    prev.current = visible;
    if (was === null || was === visible) return;
    if (visible) {
      setTip(false);
      localStorage.setItem(TIP_KEY, "1");
      if (!reduced()) {
        setFx((n) => n + 1);
        if (canvas.current) burst(canvas.current);
        navigator.vibrate?.([18, 40, 28]);
      }
    } else toast("Tu es caché");
  }, [visible]);
  const tipOk = useTipAllowed("vis-tip", tip, '[data-act="tonight"]', "down");
  const closeTip = () => (setTip(false), localStorage.setItem(TIP_KEY, "1"));
  return (
    <div className="relative -mt-6 flex min-w-0 flex-col items-center pb-1">
      {tip && tipOk && (
        <div className="vis-tip absolute bottom-full z-30 mb-2 w-52">
          <TipBubble arrow="down" onClick={closeTip} testId="vis-tip">Touche pour te montrer sur la carte</TipBubble>
        </div>
      )}
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-30 size-56 -translate-x-1/2 -translate-y-[60%]" />
      <button type="button" data-act="tonight" data-tip="connect" {...bind} onPointerDown={tip ? closeTip : undefined}
        aria-pressed={visible}
        aria-label={visible ? "Tu es visible sur la carte. Touche pour gérer ou te cacher" : "Se montrer sur la carte"}
        className="hit relative flex flex-col items-center">
        <span key={fx} className={cn("vis-btn relative flex size-16 items-center justify-center overflow-hidden rounded-full", visible ? "vis-on" : "vis-off", fx > 0 && visible && "vis-pop")}>
          <span className={cn("relative z-10 flex flex-col items-center leading-none", visible ? "text-night" : "text-white")}>
            <EyeIcon open={visible} />
            {visible && label && <span className="mt-0.5 font-display text-[10px] font-extrabold">{label}</span>}
          </span>
          <span className="vis-shine" />
        </span>
        {!visible && <span className="vis-halo pointer-events-none absolute top-0 size-16 rounded-full" />}
        {!visible && SPARKS.map(([x, y, d, sz], i) => (
          <span key={i} aria-hidden className="vis-spark" style={{ left: `calc(50% + ${x}px)`, top: `${32 + y}px`, animationDelay: `${d}s`, width: sz, height: sz }} />
        ))}
        <span data-fit className={cn("fit mt-1 max-w-[4.5rem] text-xs font-bold leading-tight transition-colors", visible ? "text-[#A1E3C3]" : "text-signal")}>
          {visible ? "Visible" : "Se montrer"}
        </span>
        {visible && <span data-fit className="fit max-w-[4.5rem] text-[9px] leading-tight text-muted">touche pour te cacher</span>}
      </button>
    </div>
  );
}
