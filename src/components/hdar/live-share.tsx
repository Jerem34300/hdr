import { useEffect, useMemo, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { liveShareCreate, liveShareDone, liveShareView, type LiveShareView } from "@/lib/hdar/live";
import { usePremium } from "@/lib/hdar/premium";
import { toast } from "sonner";
import { Wordmark } from "./logo";
import { PLACE_KINDS } from "./places-layer";
import { adultConfirmed, confirmAdult } from "@/lib/hdar/session";

/** Lien de partage préparé À L'AVANCE : navigator.share doit partir dans le geste (Chrome Android refuse après un await réseau). */
let shareCache: Promise<string> | null = null;
const shareCode = () => (shareCache ??= liveShareCreate().then((r) => r.code).catch((e) => { shareCache = null; throw e; }));
const shareUrl = (code: string) => `https://hdar.chat/live/${code}`;

async function copyText(t: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(t); return true; } } catch { /* repli */ }
  try { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch { return false; }
}

/**
 * Bouton « Partager mon live » (1:1, diffusion, spectateur). Cause du bug Android : on attendait la création du lien
 * (appel réseau) AVANT navigator.share ; le geste était « consommé », share() rejetait (NotAllowedError) et l'erreur
 * était avalée : rien ne se passait. Désormais le lien est préchargé au montage, share() part tout de suite dans le clic,
 * et sinon on copie le lien (toast « Lien copié »). AbortError (l'utilisateur ferme la feuille) : silencieux.
 */
export function ShareLiveButton({ compact }: { compact?: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => { let on = true; void shareCode().then((c) => on && setCode(c)).catch(() => undefined); return () => { on = false; }; }, []);
  const done = async (c: string) => { const r = await liveShareDone(c).catch(() => null); if (r) { void usePremium.getState().refresh(); toast(`Merci du partage 🎁 ${r.label}`); } };
  const fallback = async (url: string, c: string) => { if (await copyText(url)) { toast("Lien copié 📋"); void done(c); } else toast(`Copie impossible : ${url}`); };
  const go = () => {
    if (busy.current) return;
    const text = "Je suis en Live sur hdar. 🎥 Viens voir qui est dans le coin !";
    if (!code) { // lien pas encore prêt : on le crée puis on copie (le presse-papiers tolère mieux l'attente que share)
      busy.current = true;
      void shareCode().then((c) => { setCode(c); return fallback(shareUrl(c), c); }).catch((e) => toast(e instanceof Error ? e.message.replace(/^.*?: /, "") : "Partage impossible")).finally(() => (busy.current = false));
      return;
    }
    const url = shareUrl(code); const data = { title: "hdar. — mon live", text, url };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      busy.current = true;
      navigator.share(data).then(() => void done(code), (e: unknown) => {
        const n = (e as { name?: string })?.name;
        if (n === "AbortError") return; // fermé par l'utilisateur
        void fallback(url, code); // NotAllowedError (geste perdu), feuille indisponible…
      }).finally(() => (busy.current = false));
    } else void fallback(url, code);
  };
  return <button type="button" data-testid="share" aria-label="Partager mon live" onClick={go} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
    className={`flex h-9 items-center gap-1 rounded-full bg-black/50 text-xs font-bold backdrop-blur ${compact ? "w-9 justify-center" : "px-3"}`}><Share2 className="size-4" />{!compact && " Partager"}</button>;
}

const TILE = 256;
const proj = (lat: number, lng: number, z: number) => {
  const s = TILE * 2 ** z, r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s };
};

/** Page publique /live/<code> : carte réelle en lecture seule, pins floutés, compteur en direct. */
export function LiveSharePage({ code, demo }: { code: string; demo?: LiveShareView }) {
  const [adult, setAdult] = useState<boolean | null>(demo ? true : null);
  useEffect(() => { if (!demo) setAdult(adultConfirmed()); }, [demo]);
  if (adult === null) return <main className="min-h-dvh bg-night" />;
  if (!adult) return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-night px-6 text-center text-ink">
      <Wordmark /><p className="font-display text-2xl font-extrabold">On t'a partagé un live 🎥</p>
      <p className="text-sm text-white/70">Sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, 18+.</p>
      <button type="button" onClick={() => { confirmAdult(); setAdult(true); }} className="h-14 w-full max-w-sm rounded-full bg-[#FA6F6C] font-display text-lg font-extrabold text-night">J'ai 18 ans ou plus</button>
      <a href="https://www.google.com" className="text-sm text-white/50 underline">J'ai moins de 18 ans</a>
    </main>
  );
  return <LivePreview code={code} demo={demo} />;
}

function LivePreview({ code, demo }: { code: string; demo?: LiveShareView }) {
  const [v, setV] = useState<LiveShareView | null | undefined>(demo);
  const [sheet, setSheet] = useState(false);
  const [size, setSize] = useState({ w: 400, h: 700 });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    const load = () => { if (document.visibilityState === "visible") void liveShareView(code).then((r) => alive && setV(r)).catch(() => alive && setV((o) => o ?? null)); };
    load(); const id = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(id); };
  }, [code, demo]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el);
    return () => ro.disconnect();
  }, [v === undefined]);
  const z = 14;
  const view = useMemo(() => (v ? proj(v.lat, v.lng, z) : null), [v?.lat, v?.lng]);
  const join = () => {
    try {
      if (v?.ref) localStorage.setItem("hdar-ref", v.ref);
      if (v) sessionStorage.setItem("hdar-near", `${v.lat.toFixed(2)},${v.lng.toFixed(2)}`);
    } catch { /* */ }
    location.href = v?.ref ? `/?r=${v.ref}` : "/";
  };
  if (v === undefined) return <main className="flex min-h-dvh items-center justify-center bg-night text-ink"><Wordmark /></main>;
  if (v === null) return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-night px-6 text-center text-ink">
      <Wordmark /><p className="text-lg font-bold">Ce lien n'existe pas (ou plus).</p>
      <a href="/" className="rounded-full bg-[#FA6F6C] px-6 py-3 font-display font-extrabold text-night">Découvrir hdar.</a>
    </main>
  );
  const left = view!.x - size.w / 2, top = view!.y - size.h / 2;
  const tiles = [];
  for (let x = Math.floor(left / TILE); x <= Math.floor((left + size.w) / TILE); x++)
    for (let y = Math.floor(top / TILE); y <= Math.floor((top + size.h) / TILE); y++) tiles.push({ x, y });
  const at = (lat: number, lng: number) => { const p = proj(lat, lng, z); return { left: p.x - left, top: p.y - top }; };
  const n = v.pins.length;
  return (
    <main className="relative h-dvh overflow-hidden bg-night text-ink" onClick={() => setSheet(true)}>
      <div ref={box} className="absolute inset-0">
        {tiles.map((t) => <img key={`${t.x}-${t.y}`} src={`/tiles/plan/${z}/${t.x}/${t.y}.png`} alt="" draggable={false} className="map-tile pointer-events-none absolute max-w-none" style={{ left: t.x * TILE - left, top: t.y * TILE - top, width: TILE, height: TILE }} />)}
        {v.places.map((p, i) => <span key={`p${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 text-lg drop-shadow" style={at(p.lat, p.lng)} title={p.name ?? ""}>{PLACE_KINDS[p.kind as keyof typeof PLACE_KINDS]?.icon ?? "📍"}</span>)}
        <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FA6F6C]/25" style={{ ...at(v.lat, v.lng), width: 140, height: 140 }} />
        {v.pins.map((p, i) => (
          <span key={i} className={`absolute size-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 ${p.live ? "border-red-500" : "border-white"} bg-gradient-to-br from-[#FA6F6C] to-[#7c5cff]`} style={at(p.lat, p.lng)}>
            <span className="block size-full bg-white/30 blur-sm" />
            {p.live && <span className="absolute -right-0.5 -top-0.5 text-[9px]">🎥</span>}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-night to-transparent px-4 pb-10 pt-4">
        <div className="flex items-center justify-between"><Wordmark /><span className="rounded-full bg-[#FA6F6C] px-2.5 py-1 text-xs font-bold text-white">● LIVE {v.live > 0 ? v.live : ""}</span></div>
        <p className="mt-3 font-display text-xl font-extrabold">{v.active ? `${v.pseudo} est en Live 🎥` : "Live terminé"}</p>
        <p className="text-sm text-white/70">{v.area ?? "Dans le coin"} · {n > 0 ? `${n} personne${n > 1 ? "s" : ""} autour en ce moment` : "ça bouge bientôt"}</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/90 to-transparent px-4 pb-6 pt-16">
        <button type="button" onClick={(e) => { e.stopPropagation(); join(); }} className="h-14 w-full rounded-full bg-[#FA6F6C] font-display text-lg font-extrabold text-night shadow-lg">
          {v.active ? "Inscris-toi et rejoins le live" : "Live terminé, rejoins quand même"}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/60">Gratuit, discret, 18+. Positions approximatives, jamais exactes.</p>
      </div>
      {sheet && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/50" onClick={(e) => { e.stopPropagation(); setSheet(false); }}>
          <div className="w-full rounded-t-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl font-extrabold">Inscris-toi pour discuter</p>
            <p className="mt-1 text-sm text-muted">Pseudos et profils sont floutés tant que tu n'es pas inscrit·e. C'est gratuit, discret, réservé aux 18+.</p>
            <button type="button" onClick={join} className="mt-4 h-12 w-full rounded-full bg-[#FA6F6C] font-display font-extrabold text-night">C'est parti</button>
          </div>
        </div>
      )}
    </main>
  );
}

/** À l'ouverture de la carte après inscription via un lien de live : centre sur la zone. */
export function consumeNear(): { lat: number; lng: number } | null {
  try { const s = sessionStorage.getItem("hdar-near"); if (!s) return null; sessionStorage.removeItem("hdar-near"); const [lat, lng] = s.split(",").map(Number); return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null; } catch { return null; }
}
