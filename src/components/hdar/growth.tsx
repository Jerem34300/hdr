import { GiftReveal } from "./gift-reveal";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { codeRedeem, myRef, refClaim, shareReward, surprise } from "@/lib/hdar/live";
import { usePremium } from "@/lib/hdar/premium";

const REF_KEY = "hdar-ref";
/** Mémorise ?r=CODE à l'arrivée. */
export function captureRef() {
  if (typeof location === "undefined") return;
  const q = new URLSearchParams(location.search);
  const gc = q.get("code"); if (gc && /^[A-Za-z0-9-]{3,24}$/.test(gc)) localStorage.setItem("hdar-code", gc.toUpperCase());
  const r = q.get("r");
  if (r && /^[A-Za-z0-9]{4,12}$/.test(r) && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, r.toUpperCase());
}
/** Rattache le parrainage une fois le profil créé (réessayé à chaque ouverture). */
export async function tryRefClaim() {
  const c = typeof localStorage !== "undefined" ? localStorage.getItem(REF_KEY) : null;
  if (!c) return;
  try { const r = await refClaim(c); if (r.ok || r.reason) localStorage.removeItem(REF_KEY); } catch { /* profil pas encore créé */ }
}

/** Image « story » 1080×1920 : carte de nuit, pins lumineux, radar, code cadeau. */
export async function storyImage(code: string): Promise<Blob> {
  const W = 1080, H = 1920;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  // fond nuit
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#07070c"); bg.addColorStop(0.55, "#120d1a"); bg.addColorStop(1, "#07070c");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // rues façon carte
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineCap = "round";
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = i % 7 === 0 ? "rgba(161,227,195,.16)" : "rgba(255,255,255,.07)"; g.lineWidth = i % 7 === 0 ? 7 : 2 + rnd() * 3;
    g.beginPath(); const x = rnd() * W, y = rnd() * 1500 + 120, ang = rnd() * Math.PI;
    g.moveTo(x - Math.cos(ang) * 900, y - Math.sin(ang) * 900);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 300, y + (rnd() - 0.5) * 300, x + Math.cos(ang) * 900, y + Math.sin(ang) * 900); g.stroke();
  }
  // fleuve
  g.strokeStyle = "rgba(80,120,200,.18)"; g.lineWidth = 46; g.beginPath(); g.moveTo(-50, 1180); g.bezierCurveTo(300, 1020, 650, 1350, 1130, 1150); g.stroke();
  // radar
  const cx = 540, cy = 760;
  for (let r = 120; r <= 520; r += 130) { g.strokeStyle = `rgba(250,111,108,${0.5 - r / 1400})`; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  const sweep = g.createConicGradient ? g.createConicGradient(-Math.PI / 2, cx, cy) : null;
  if (sweep) { sweep.addColorStop(0, "rgba(250,111,108,.45)"); sweep.addColorStop(0.18, "rgba(250,111,108,0)"); sweep.addColorStop(1, "rgba(250,111,108,0)"); g.fillStyle = sweep; g.beginPath(); g.arc(cx, cy, 520, 0, Math.PI * 2); g.fill(); }
  const glow = (x: number, y: number, r: number, col: string) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  // moi au centre
  glow(cx, cy, 90, "rgba(250,111,108,.8)"); g.fillStyle = "#FA6F6C"; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 6; g.stroke();
  // pins
  const pins: [number, number, string, string][] = [[300, 560, "#3EE08F", "🔥"], [800, 520, "#f472b6", "💬"], [250, 960, "#fbbf24", "🎥"], [820, 900, "#3EE08F", ""], [640, 440, "#FA6F6C", ""], [420, 1130, "#f472b6", "⭐"], [930, 700, "#fbbf24", ""], [160, 720, "#FA6F6C", ""], [700, 1100, "#3EE08F", "🍸"]];
  for (const [x, y, col, e] of pins) {
    glow(x, y, 75, col + "88");
    g.fillStyle = "#16161e"; g.beginPath(); g.arc(x, y, 38, 0, Math.PI * 2); g.fill(); g.strokeStyle = col; g.lineWidth = 7; g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill();
    if (e) { g.font = "44px serif"; g.textAlign = "center"; g.fillText(e, x + 34, y - 30); }
  }
  // voile haut/bas
  const top = g.createLinearGradient(0, 0, 0, 420); top.addColorStop(0, "rgba(7,7,12,.95)"); top.addColorStop(1, "rgba(7,7,12,0)"); g.fillStyle = top; g.fillRect(0, 0, W, 420);
  const bot = g.createLinearGradient(0, 1150, 0, H); bot.addColorStop(0, "rgba(7,7,12,0)"); bot.addColorStop(0.35, "rgba(7,7,12,.92)"); bot.addColorStop(1, "#07070c"); g.fillStyle = bot; g.fillRect(0, 1150, W, H - 1150);
  // logo + titre
  g.textAlign = "center"; g.fillStyle = "#f5f5f5"; g.font = "800 120px system-ui, sans-serif";
  const lw = g.measureText("hdar").width; g.fillText("hdar", 540 - 22, 200); g.fillStyle = "#FA6F6C"; g.fillText(".", 540 + lw / 2 + 4, 200);
  g.fillStyle = "#f5f5f5"; g.font = "800 84px system-ui, sans-serif"; g.fillText("Qui est autour,", 540, 330); g.fillStyle = "#3EE08F"; g.fillText("maintenant.", 540, 425);
  // carte cadeau
  const x0 = 110, y0 = 1330, w = 860, h = 360;
  const cg = g.createLinearGradient(x0, y0, x0 + w, y0 + h); cg.addColorStop(0, "#FA6F6C"); cg.addColorStop(0.55, "#f472b6"); cg.addColorStop(1, "#3EE08F");
  g.save(); g.shadowColor = "rgba(250,111,108,.7)"; g.shadowBlur = 60; g.fillStyle = cg; g.beginPath(); g.roundRect(x0, y0, w, h, 50); g.fill(); g.restore();
  g.fillStyle = "rgba(11,11,16,.88)"; g.beginPath(); g.roundRect(x0 + 10, y0 + 10, w - 20, h - 20, 42); g.fill();
  g.font = "700 50px system-ui, sans-serif"; g.fillStyle = "#fbbf24"; g.fillText("🎁 3 jours hdar+ offerts", 540, y0 + 95);
  g.font = "500 36px system-ui, sans-serif"; g.fillStyle = "rgba(245,245,245,.7)"; g.fillText("avec mon code d'invitation", 540, y0 + 150);
  g.font = "800 120px ui-monospace, Menlo, monospace"; g.fillStyle = "#3EE08F"; g.fillText(code, 540, y0 + 285);
  // url
  g.fillStyle = "#FA6F6C"; g.beginPath(); g.roundRect(290, 1745, 500, 110, 55); g.fill();
  g.fillStyle = "#0b0b10"; g.font = "800 54px system-ui, sans-serif"; g.fillText("hdar.chat", 540, 1818);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
}

const revealBus = typeof EventTarget !== "undefined" ? new EventTarget() : null;
/** Après un partage réussi : petit cadeau immédiat (serveur : 1 fois / 7 jours). */
async function thankShare() {
  try {
    const r = await shareReward();
    if (r) { void usePremium.getState().refresh(); revealBus?.dispatchEvent(new CustomEvent("reveal", { detail: r.label })); }
  } catch { /* */ }
}

export async function shareInvite() {
  try {
    const { code } = await myRef();
    const url = `https://hdar.chat/?r=${code}`;
    const text = "Viens sur hdar. : 3 jours de hdar+ offerts pour toi et moi 🎁";
    let files: File[] = [];
    try { files = [new File([await storyImage(code)], `hdar-${code}.png`, { type: "image/png" })]; } catch { /* */ }
    const ok = (p: Promise<void>) => p.then(() => true, () => false);
    if (files.length && navigator.canShare?.({ files })) { if (await ok(navigator.share({ files, text: `${text} ${url}` }))) void thankShare(); return; }
    if (navigator.share) { if (await ok(navigator.share({ title: "hdar.", text, url }))) void thankShare(); return; }
    await navigator.clipboard.writeText(`${text} ${url}`); toast("Lien copié 📋");
  } catch (e) { toast(e instanceof Error ? e.message : "Crée d'abord ton profil"); }
}

export async function downloadStory() {
  try {
    const { code } = await myRef();
    const a = document.createElement("a"); a.href = URL.createObjectURL(await storyImage(code)); a.download = `hdar-${code}.png`; a.click();
  } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); }
}

export function InviteCard({ demo }: { demo?: string }) {
  const [n, setN] = useState<{ code: string; invited: number; rewarded: number } | null>(demo ? { code: demo, invited: 0, rewarded: 0 } : null);
  useEffect(() => { if (!demo) void myRef().then(setN).catch(() => undefined); }, [demo]);
  if (!n) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(`https://hdar.chat/?r=${n.code}`); toast("Lien copié 📋"); } catch { toast(n.code); } };
  return (
    <div className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#FA6F6C] via-[#f472b6] to-[#3EE08F] p-[2px] shadow-[0_0_30px_rgba(250,111,108,.35)]">
      <div className="relative rounded-[22px] bg-[#0b0b10]/90 p-4">
        <span aria-hidden className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-[#3EE08F]/25 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-12 -left-10 size-36 rounded-full bg-[#FA6F6C]/30 blur-2xl" />
        <p className="relative font-display text-lg font-extrabold">Invite un ami 🎁</p>
        <p className="relative text-xs text-white/75">Partage = un petit cadeau tout de suite, +3 jours hdar+ quand ton ami s'inscrit{n.rewarded > 0 ? ` · ${n.rewarded} réussi(s)` : ""}</p>
        <div className="relative mt-3 flex items-center justify-between gap-2 rounded-2xl border-2 border-dashed border-[#fbbf24]/80 bg-black/40 px-4 py-3">
          <div><p className="text-[10px] font-bold tracking-[0.25em] text-[#fbbf24] uppercase">Ton code</p>
            <p className="font-mono text-3xl font-extrabold tracking-[0.2em] text-[#3EE08F]">{n.code}</p></div>
          <button type="button" onClick={() => void copy()} className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">📋 Copier</button>
        </div>
        <div className="relative mt-3 flex gap-2">
          <button type="button" onClick={() => void shareInvite()} className="boost-cta h-11 flex-1 rounded-full font-display font-extrabold text-night">Partager</button>
          <button type="button" onClick={() => void downloadStory()} className="h-11 rounded-full border border-white/30 px-4 text-sm">📸 Story</button>
        </div>
      </div>
    </div>
  );
}

/** Carte hdar+ visible sur le Profil. */
export function PremiumCard() {
  const premium = usePremium((s) => s.premium);
  return (
    <Link to="/premium" className="mt-3 flex items-center gap-3 rounded-3xl border border-[#fbbf24]/60 bg-gradient-to-r from-[#fbbf24]/15 to-transparent p-4 shadow-[0_0_24px_rgba(251,191,36,.18)]">
      <span className="text-3xl">👑</span>
      <span className="min-w-0 flex-1"><b className="block font-display">hdar<span className="text-[#fbbf24]">+</span>{premium ? " · actif" : ""}</b>
        <span className="text-xs text-muted">Filtres, qui t'a vu, recherche, Live+, 20 photos</span></span>
      <span className="text-sm font-bold text-[#fbbf24]">{premium ? "Mon espace ›" : "Essayer ›"}</span>
    </Link>
  );
}

export function RedeemCode() {
  const [code, setCode] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("hdar-code")) || "");
  const [open, setOpen] = useState(!!code);
  const [msg, setMsg] = useState<{ title: string; body: string } | null>(null);
  const go = async () => {
    try { const r = await codeRedeem(code); setCode(""); setOpen(false); localStorage.removeItem("hdar-code"); void usePremium.getState().refresh(); setMsg(r); }
    catch (e) { toast(e instanceof Error ? e.message : "Code invalide"); }
  };
  return (
    <div className="mt-4">
      {!open ? <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted underline">🎟️ J'ai un code</button> : (
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={24} className="min-w-0 flex-1 rounded-full bg-surface px-4 py-2 font-mono tracking-widest" />
          <button type="button" disabled={!code.trim()} onClick={() => void go()} className="rounded-full bg-[#FA6F6C] px-4 font-bold text-night disabled:opacity-50">Valider</button>
        </div>)}
      {msg && <GiftPopup title={msg.title} body={msg.body} onClose={() => setMsg(null)} />}
    </div>
  );
}

export function GiftPopup({ title, body, onClose, nudge }: { title: string; body: string; onClose: () => void; nudge?: boolean }) {
  return (
    <GiftReveal title={title} body={body} onClose={onClose}>
      {nudge && <div className="mt-3 flex gap-2 text-sm">
        <button type="button" onClick={() => { void shareInvite(); onClose(); }} className="flex-1 rounded-full border border-line py-2">Inviter un ami</button>
        <Link to="/premium" onClick={onClose} className="flex-1 rounded-full border border-[#fbbf24]/60 py-2 text-[#fbbf24]">Garder hdar+</Link>
      </div>}
    </GiftReveal>
  );
}

/** Parrainage à l'arrivée + surprise aléatoire décidée par le serveur (max 1 / 10 jours). */
export function SurprisePopup() {
  const [s, setS] = useState<{ label: string } | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setThanks((e as CustomEvent<string>).detail);
    revealBus?.addEventListener("reveal", on);
    return () => revealBus?.removeEventListener("reveal", on);
  }, []);
  useEffect(() => {
    captureRef();
    const t = setTimeout(() => {
      void tryRefClaim();
      if (usePremium.getState().premium) return;
      void surprise().then((r) => { if (r) { setS(r); void usePremium.getState().refresh(); } }).catch(() => undefined);
    }, 9000);
    return () => clearTimeout(t);
  }, []);
  const demo = import.meta.env.DEV && typeof location !== "undefined" ? new URLSearchParams(location.search).get("reveal") : null;
  if (demo) return <GiftPopup title="Cadeau de hdar 🎁" body={demo === "premium" ? "Tu reçois 7 jours de hdar+." : demo === "boost" ? "Tu reçois un boost de 24 h." : "Tu reçois 50 cœurs."} nudge={demo === "premium"} onClose={() => undefined} />;
  if (thanks) return <GiftPopup title="Merci pour le partage 🎁" body={`Tu reçois ${thanks}.`} onClose={() => setThanks(null)} />;
  if (!s) return null;
  return <GiftPopup title="Surprise 🎉" body={`hdar t'offre ${s.label}. Profite-en !`} nudge onClose={() => setS(null)} />;
}
