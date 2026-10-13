import { useEffect, useRef, useState } from "react";
import { soundEnabled } from "@/lib/hdar/sounds";

export type RevealKind = "premium" | "boost" | "hearts" | "gift";
export function revealKind(text: string): RevealKind {
  const t = text.toLowerCase();
  return t.includes("hdar+") ? "premium" : t.includes("boost") ? "boost" : t.includes("cœur") ? "hearts" : "gift";
}
const HEAD: Record<RevealKind, { icon: string; headline: string; color: string }> = {
  premium: { icon: "👑", headline: "Bienvenue dans hdar+", color: "#fbbf24" },
  boost: { icon: "🚀", headline: "Boost activé 🚀", color: "#FA6F6C" },
  hearts: { icon: "❤️", headline: "Des cœurs pour toi", color: "#FA6F6C" },
  gift: { icon: "🎁", headline: "Cadeau !", color: "#3EE08F" },
};

function chime() {
  if (!soundEnabled()) return;
  try {
    const ac = new AudioContext();
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime + i * 0.09; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.start(t); o.stop(t + 0.55);
    });
    setTimeout(() => void ac.close(), 1500);
  } catch { /* */ }
}

/** Confettis / cœurs / étincelles sur canvas, ~2,5 s. */
function burst(cv: HTMLCanvasElement, kind: RevealKind) {
  const g = cv.getContext("2d"); if (!g) return () => undefined;
  const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio), d = devicePixelRatio;
  const cols = kind === "premium" ? ["#fbbf24", "#fde68a", "#FA6F6C", "#3EE08F"] : ["#FA6F6C", "#3EE08F", "#fbbf24", "#f472b6"];
  const ps = Array.from({ length: kind === "hearts" ? 70 : 140 }, () => {
    const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 10) * d;
    return kind === "hearts"
      ? { x: Math.random() * W, y: -Math.random() * H * 0.6, vx: (Math.random() - 0.5) * d, vy: (2 + Math.random() * 4) * d, r: (14 + Math.random() * 16) * d, c: "", s: "❤️", rot: 0, vr: 0 }
      : { x: W / 2, y: H * 0.45, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6 * d, r: (4 + Math.random() * 5) * d, c: cols[Math.floor(Math.random() * cols.length)], s: kind === "boost" && Math.random() < 0.3 ? "✨" : "", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 };
  });
  let raf = 0; const t0 = performance.now();
  const step = (t: number) => {
    const e = t - t0; g.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.vy += kind === "hearts" ? 0.05 * d : 0.25 * d; p.vx *= 0.99; p.rot += p.vr;
      g.globalAlpha = Math.max(0, 1 - e / 2800);
      if (p.s) { g.font = `${p.r * (p.s === "✨" ? 2.4 : 1)}px serif`; g.fillText(p.s, p.x, p.y); }
      else { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore(); }
    }
    if (e < 2900) raf = requestAnimationFrame(step); else g.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Révélation plein écran : boîte qui tremble → explose → carte qui se retourne. */
export function GiftReveal({ title, body, kind, amount, onClose, children }: { title: string; body: string; kind?: RevealKind; amount?: number; onClose: () => void; children?: React.ReactNode }) {
  const k = kind ?? revealKind(`${title} ${body}`);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [stage, setStage] = useState<0 | 1 | 2>(reduce ? 2 : 0);
  const cv = useRef<HTMLCanvasElement>(null);
  const n = amount ?? Number(/(\d+)\s*cœur/.exec(body)?.[1] ?? 0);
  const [count, setCount] = useState(reduce ? n : 0);
  useEffect(() => {
    if (reduce) { navigator.vibrate?.(60); return; }
    const a = setTimeout(() => { setStage(1); navigator.vibrate?.([30, 40, 80]); chime(); }, 900);
    const b = setTimeout(() => setStage(2), 1250);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [reduce]);
  useEffect(() => { if (stage === 1 && cv.current) return burst(cv.current, k); }, [stage, k]);
  useEffect(() => {
    if (stage !== 2 || k !== "hearts" || reduce || !n) return;
    let i = 0; const id = setInterval(() => { i = Math.min(n, i + Math.ceil(n / 30)); setCount(i); if (i >= n) clearInterval(id); }, 30);
    return () => clearInterval(id);
  }, [stage, k, n, reduce]);
  const h = HEAD[k];
  return (
    <div className="gr-root fixed inset-0 z-[90] flex items-center justify-center bg-[#0b0b10]/90 p-6" onClick={() => stage === 2 && onClose()}>
      <style>{CSS}</style>
      <span className="gr-flare" style={{ background: `radial-gradient(circle, ${h.color}66, transparent 60%)` }} />
      <span className="gr-flare gr-flare2" />
      <canvas ref={cv} className="pointer-events-none fixed inset-0 size-full" />
      {stage < 2 ? (
        <div className={stage === 0 ? "gr-box gr-shake" : "gr-box gr-pop"}>🎁</div>
      ) : (
        <div className={"gr-card relative w-full max-w-sm rounded-3xl border p-7 text-center " + (k === "premium" ? "gr-shimmer" : "")} style={{ borderColor: h.color, boxShadow: `0 0 60px ${h.color}88` }} onClick={(e) => e.stopPropagation()}>
          <p className="gr-icon text-7xl">{h.icon}</p>
          <p className="mt-3 text-xs font-bold tracking-[0.25em] uppercase" style={{ color: h.color }}>{title}</p>
          <p className="mt-2 font-display text-3xl font-extrabold">{h.headline}</p>
          {k === "hearts" && n > 0 && <p className="mt-2 font-display text-5xl font-extrabold text-[#FA6F6C]">+{count} ❤️</p>}
          <p className="mt-3 text-sm text-muted">{body}</p>
          {children}
          <button type="button" onClick={onClose} className="boost-cta mt-6 h-12 w-full rounded-full font-display font-extrabold text-night">Merci !</button>
        </div>
      )}
    </div>
  );
}

const CSS = `
.gr-root{animation:grfade .3s ease-out}
.gr-flare{position:fixed;left:50%;top:45%;width:140vmax;height:140vmax;transform:translate(-50%,-50%);pointer-events:none;animation:grspin 6s linear infinite;background:conic-gradient(from 0deg,transparent,#FA6F6C33,transparent 20%,#3EE08F33,transparent 40%,#fbbf2433,transparent 60%)}
.gr-flare2{animation-duration:9s;animation-direction:reverse;opacity:.6}
.gr-box{font-size:120px;filter:drop-shadow(0 0 30px #fbbf24)}
.gr-shake{animation:grshake .18s ease-in-out infinite alternate}
.gr-pop{animation:grpop .35s ease-out forwards}
.gr-card{background:#16161e;animation:grflip .6s cubic-bezier(.2,1.4,.4,1) both;transform-style:preserve-3d}
.gr-icon{animation:grbounce 1.2s ease-in-out infinite}
.gr-shimmer{background:linear-gradient(110deg,#16161e 40%,#fbbf2433 50%,#16161e 60%) #16161e;background-size:250% 100%;animation:grflip .6s cubic-bezier(.2,1.4,.4,1) both,grshim 2.2s linear .6s infinite}
@keyframes grfade{from{opacity:0}}
@keyframes grspin{to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes grshake{from{transform:rotate(-9deg) scale(1)}to{transform:rotate(9deg) scale(1.08)}}
@keyframes grpop{to{transform:scale(2.4);opacity:0}}
@keyframes grflip{from{transform:perspective(800px) rotateY(90deg) scale(.6);opacity:0}to{transform:none;opacity:1}}
@keyframes grbounce{50%{transform:translateY(-8px) scale(1.06)}}
@keyframes grshim{from{background-position:150% 0}to{background-position:-100% 0}}
@media (prefers-reduced-motion: reduce){.gr-root,.gr-flare,.gr-card,.gr-icon,.gr-shimmer{animation:none!important}}
`;
