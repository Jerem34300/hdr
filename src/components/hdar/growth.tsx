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

/** Image « story » 1080×1920 avec le code d'invitation. */
export async function storyImage(code: string): Promise<Blob> {
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 1080, 1920); bg.addColorStop(0, "#0b0b10"); bg.addColorStop(1, "#1d1022");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1920);
  const glow = (x: number, y: number, r: number, col: string) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "transparent"); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1920); };
  glow(180, 300, 600, "rgba(250,111,108,.45)"); glow(950, 1500, 700, "rgba(161,227,195,.30)");
  g.textAlign = "center"; g.fillStyle = "#f5f5f5";
  g.font = "800 190px system-ui, sans-serif"; g.fillText("hdar", 500, 520); g.fillStyle = "#FA6F6C"; g.fillText(".", 760, 520);
  g.fillStyle = "#f5f5f5"; g.font = "800 110px system-ui, sans-serif"; g.fillText("Viens sur hdar", 540, 860);
  g.font = "500 52px system-ui, sans-serif"; g.fillStyle = "rgba(245,245,245,.8)"; g.fillText("La carte gay en direct, 100 % anonyme", 540, 950);
  g.fillStyle = "#16161e"; g.strokeStyle = "#fbbf24"; g.lineWidth = 6;
  g.beginPath(); g.roundRect(140, 1080, 800, 420, 60); g.fill(); g.stroke();
  g.fillStyle = "#fbbf24"; g.font = "700 56px system-ui, sans-serif"; g.fillText("🎁 3 jours hdar+ offerts", 540, 1190);
  g.fillStyle = "rgba(245,245,245,.7)"; g.font = "500 44px system-ui, sans-serif"; g.fillText("ton code d'invitation", 540, 1280);
  g.fillStyle = "#3EE08F"; g.font = "800 130px ui-monospace, monospace"; g.fillText(code, 540, 1430);
  g.fillStyle = "#FA6F6C"; g.beginPath(); g.roundRect(240, 1600, 600, 140, 70); g.fill();
  g.fillStyle = "#0b0b10"; g.font = "800 60px system-ui, sans-serif"; g.fillText("hdar.chat", 540, 1692);
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
    await navigator.clipboard.writeText(`${text} ${url}`); toast("Lien copié 📋"); void thankShare();
  } catch (e) { toast(e instanceof Error ? e.message : "Crée d'abord ton profil"); }
}

export async function downloadStory() {
  try {
    const { code } = await myRef();
    const a = document.createElement("a"); a.href = URL.createObjectURL(await storyImage(code)); a.download = `hdar-${code}.png`; a.click(); void thankShare();
  } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); }
}

export function InviteCard() {
  const [n, setN] = useState<{ code: string; invited: number; rewarded: number } | null>(null);
  useEffect(() => void myRef().then(setN).catch(() => undefined), []);
  if (!n) return null;
  return (
    <div className="mt-4 rounded-3xl border border-[#A1E3C3]/50 bg-surface p-4">
      <button type="button" onClick={() => void shareInvite()} className="flex w-full items-center gap-3 text-left">
        <span className="text-3xl">🎁</span>
        <span className="min-w-0 flex-1"><b className="block font-display">Invite un ami</b>
          <span className="text-xs text-muted">Partage = un petit cadeau tout de suite, +3 jours hdar+ quand ton ami s'inscrit{n.rewarded > 0 ? ` · ${n.rewarded} réussi(s)` : ""}</span></span>
        <span className="text-sm font-bold text-[#A1E3C3]">Partager ›</span>
      </button>
      <p className="mt-2 text-xs text-muted">Ton code : <b className="font-mono text-ink">{n.code}</b> · <button type="button" className="underline" onClick={() => void downloadStory()}>Image pour ta story</button></p>
    </div>
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
