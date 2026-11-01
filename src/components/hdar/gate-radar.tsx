import { useEffect, useRef } from "react";

/** Points « détectés » (angle en degrés, rayon 0–1, couleur). Purement décoratif : aucune vraie position. */
const DOTS: [number, number, string][] = [
  [28, 0.62, "#FA6F6C"], [74, 0.34, "#3EE08F"], [118, 0.82, "#FA6F6C"], [156, 0.5, "#FACC15"],
  [203, 0.7, "#3EE08F"], [241, 0.28, "#FA6F6C"], [287, 0.88, "#A78BFA"], [322, 0.46, "#3EE08F"], [8, 0.9, "#38BDF8"],
];
const R = 46;

/** Radar d'accueil : cercles, balayage qui tourne, points qui s'allument au passage. Mouvement réduit : image fixe. */
export function GateRadar({ className = "" }: { className?: string }) {
  const sweep = useRef<SVGGElement>(null);
  const dots = useRef<(SVGGElement | null)[]>([]);
  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const forced = import.meta.env.DEV && typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("gateframe") ?? NaN) : NaN;
    const P = 4200;
    const paint = (sa: number) => {
      sweep.current?.setAttribute("transform", `rotate(${sa.toFixed(1)})`);
      DOTS.forEach(([a], i) => {
        const since = (sa - a + 720) % 360;
        const g = reduce ? 0.75 : Math.max(0, 1 - since / 240);
        const el = dots.current[i];
        if (!el) return;
        el.style.opacity = (0.12 + g * 0.88).toFixed(2);
        el.setAttribute("transform", `scale(${(0.8 + g * 0.5).toFixed(2)})`);
      });
    };
    if (!Number.isNaN(forced)) return paint(forced);
    if (reduce) { sweep.current?.setAttribute("opacity", "0"); return paint(0); }
    let raf = 0;
    const tick = (now: number) => { paint(((now % P) / P) * 360); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg viewBox="-50 -50 100 100" aria-hidden className={className} data-act="gate-radar">
      <defs>
        <radialGradient id="grbg"><stop offset="0%" stopColor="#1a1216" stopOpacity=".9" /><stop offset="100%" stopColor="#0b0e12" stopOpacity=".55" /></radialGradient>
        <linearGradient id="grsw" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#FA6F6C" stopOpacity="0" /><stop offset="100%" stopColor="#FA6F6C" stopOpacity=".45" /></linearGradient>
        <clipPath id="grc"><circle r={R} /></clipPath>
      </defs>
      <circle r={R + 2} fill="url(#grbg)" stroke="#FA6F6C" strokeOpacity=".45" strokeWidth=".6" />
      {[0.33, 0.66, 1].map((k, i) => <circle key={k} r={R * k} fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth=".4" strokeDasharray={i < 2 ? "1.2 1.6" : undefined} />)}
      <line x1={-R} x2={R} y1="0" y2="0" stroke="#fff" strokeOpacity=".06" strokeWidth=".4" />
      <line y1={-R} y2={R} x1="0" x2="0" stroke="#fff" strokeOpacity=".06" strokeWidth=".4" />
      <g clipPath="url(#grc)">
        <g ref={sweep}>
          {/* traîne : quartier de 70° qui s'estompe derrière la ligne */}
          {Array.from({ length: 14 }, (_, i) => {
            const a0 = (-(i + 1) * 5 * Math.PI) / 180, a1 = (-i * 5 * Math.PI) / 180;
            return <path key={i} d={`M0 0 L${Math.sin(a0) * R} ${-Math.cos(a0) * R} A${R} ${R} 0 0 1 ${Math.sin(a1) * R} ${-Math.cos(a1) * R} Z`} fill="#FA6F6C" fillOpacity={(0.3 * (1 - i / 14)).toFixed(3)} />;
          })}
          <line x1="0" y1="0" x2="0" y2={-R} stroke="#FFB4A8" strokeWidth=".8" />
        </g>
      </g>
      {DOTS.map(([a, r, c], i) => {
        const t = (a * Math.PI) / 180;
        return (
          <g key={i} transform={`translate(${(Math.sin(t) * r * R).toFixed(2)} ${(-Math.cos(t) * r * R).toFixed(2)})`}>
            <g ref={(el) => { dots.current[i] = el; }} style={{ opacity: 0.15 }}>
              <circle r="4.2" fill={c} opacity=".35" style={{ filter: "blur(1.5px)" }} />
              <circle r="1.7" fill={c} />
            </g>
          </g>
        );
      })}
      <circle r="5" fill="#3EE08F" opacity=".25" className="gate-me-ping" />
      <circle r="2.3" fill="#3EE08F" stroke="#0b0e12" strokeWidth=".6" />
    </svg>
  );
}
