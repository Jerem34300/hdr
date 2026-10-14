import { CardHead, cardCls, cardStyle } from "./profile-card";
import { captureAmb, tryAmbAttach } from "./ambassador";
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
  g.fillStyle = "rgba(245,245,245,.8)"; g.font = "600 40px system-ui, sans-serif"; g.fillText("Sorties et rencontres, pour tout le monde", 540, 500); g.font = "500 32px system-ui, sans-serif"; g.fillStyle = "rgba(245,245,245,.6)"; g.fillText("Gratuit · anonyme · 18+ · 🏳️‍🌈 LGBT-friendly", 540, 552);
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

export function InviteCard({ demo, onAction }: { demo?: string; onAction?: () => void }) {
  const [n, setN] = useState<{ code: string; invited: number; rewarded: number } | null>(demo ? { code: demo, invited: 0, rewarded: 0 } : null);
  useEffect(() => { if (!demo) void myRef().then(setN).catch(() => undefined); }, [demo]);
  if (!n) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(`https://hdar.chat/?r=${n.code}`); toast("Lien copié 📋"); } catch { toast(n.code); } };
  return (
    <div className={cardCls} style={cardStyle("#FA6F6C")}>
      <div>
        <CardHead icon="🎁" accent="#FA6F6C" chevron={false} title="Invite un ami" sub={`+3 jours hdar+ pour vous deux${n.rewarded > 0 ? ` · ${n.rewarded} réussi(s)` : ""}`} />
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-dashed border-white/20 bg-black/30 px-4 py-2.5">
          <div><p className="text-[10px] font-bold tracking-[0.25em] text-muted uppercase">Ton code</p>
            <p className="font-mono text-2xl font-extrabold tracking-[0.2em] text-[#FA6F6C]">{n.code}</p></div>
          <button type="button" onClick={() => void copy()} className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">📋 Copier</button>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => { void shareInvite(); onAction?.(); }} className="h-11 flex-1 rounded-full bg-[#FA6F6C] font-display font-extrabold text-night">Partager</button>
          <button type="button" onClick={() => { void downloadStory(); onAction?.(); }} className="h-11 rounded-full border border-white/15 px-4 text-sm font-bold">📸 Story</button>
        </div>
      </div>
    </div>
  );
}

/** Carte hdar+ visible sur le Profil. */
export function PremiumCard() {
  const premium = usePremium((s) => s.premium);
  return (
    <Link to="/premium" className={cardCls} style={cardStyle("#fbbf24")}>
      <CardHead icon="👑" accent="#fbbf24" title={<>hdar<span className="text-[#fbbf24]">+</span>{premium ? " · actif" : ""}</>} sub={premium ? "Mon espace · filtres, qui t'a vu, Live+" : "Essayer · filtres, qui t'a vu, Live+"} />
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
      {!open ? <button type="button" onClick={() => setOpen(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-surface font-display font-bold text-ink active:scale-[.98]">🎟️ J'ai un code</button> : (
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
    captureRef(); captureAmb();
    const t = setTimeout(() => {
      void tryRefClaim(); void tryAmbAttach();
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

const GIFT_HIDE = "hdar-gift-hide-until";
/** Bouton 🎁 de la carte : ouvre la carte cadeau en feuille, puis se cache 3 jours. */
export function MapGiftButton({ demoOpen }: { demoOpen?: boolean }) {
  const [hidden, setHidden] = useState(() => { try { return Number(localStorage.getItem(GIFT_HIDE) || 0) > Date.now(); } catch { return false; } });
  const [open, setOpen] = useState(!!demoOpen);
  const hide = () => { try { localStorage.setItem(GIFT_HIDE, String(Date.now() + 3 * 86400000)); } catch { /* */ } setOpen(false); setHidden(true); };
  if (hidden && !open) return null;
  return (
    <>
      <button type="button" aria-label="Invite un ami 🎁" onClick={() => setOpen(true)} className="gift-wiggle relative flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-[#3EE08F] to-[#FA6F6C] text-xl shadow-[0_0_16px_#3EE08F]">🎁</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={hide}>
          <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Fermer" onClick={hide} className="absolute -top-3 right-2 z-10 flex size-9 items-center justify-center rounded-full bg-night text-lg shadow">✕</button>
            <InviteCard demo={demoOpen ? "E610477" : undefined} onAction={hide} />
          </div>
        </div>
      )}
    </>
  );
}
