/** Offre de lancement FIRST : feuille d'achat remplacée, bienvenue après le profil, fête fondateur avec confettis. */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useHdar } from "@/lib/hdar/store";
import { usePremium } from "@/lib/hdar/premium";
import { playFavoriteSound } from "@/lib/hdar/sounds";
import { approxGeo } from "@/lib/hdar/recent";
import { regionFromPos } from "@/lib/hdar/ads";
import {
  FIRST_CODE, adminFirstStats, firstAdBoost, firstRegion, type FirstRegion, firstBoost, firstMe, firstRedeem, firstRemaining, placesLabel, shareFirst, useLaunchOffer, type FirstMe,
} from "@/lib/hdar/payments";

const demo = () => (import.meta.env.DEV && typeof location !== "undefined" ? new URLSearchParams(location.search).get("firstdemo") : null);

export function useFirstRemaining() {
  const [n, setN] = useState<number | null>(demo() ? 873 : null);
  useEffect(() => { if (!demo()) void firstRemaining().then(setN); }, []);
  return n;
}

/** Région de l'utilisateur (position ou ville réseau) + abonnements à vie restants. */
export function useFirstRegion() {
  const [c, setC] = useState<FirstRegion | null>(demo() ? { region: "occitanie", name: "Occitanie", quota: 451, remaining: 438, global: 4873 } : null);
  useEffect(() => {
    if (demo()) return;
    const st = useHdar.getState();
    const at = st.here ?? st.customCenter;
    const go = (lat: number, lng: number) => void firstRegion(regionFromPos(lat, lng)).then(setC);
    if (at) go(at.lat, at.lng); else void approxGeo().then((g) => g && go(g.lat, g.lng));
  }, []);
  return c;
}
export function RegionTeaser({ c, className = "" }: { c: FirstRegion | null; className?: string }) {
  if (!c || c.global <= 0) return null;
  const used = c.quota - c.remaining;
  return (
    <p className={"rounded-2xl border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-3 py-2 text-center text-sm text-[#f5d27a] " + className}>
      {c.remaining <= 0 ? <>Quota de {c.name} atteint : encore <b>{c.global}</b> abonnements à vie au national · code FIRST</>
        : used === 0 ? <>🔥 <b>Sois le premier en {c.name}</b> · code FIRST = hdar+ offert à vie</>
        : <>🔥 Plus que <b>{c.remaining}</b> abonnements à vie offerts en {c.name} · code FIRST</>}
    </p>
  );
}

export function ShareFirstButton({ remaining, region, className = "" }: { remaining: number | null; region?: FirstRegion | null; className?: string }) {
  return (
    <button type="button" onClick={() => void shareFirst(region ? region.remaining : remaining, region?.name).then((r) => r === "copied" && toast("Lien copié 📋"))}
      className={"flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#3ddc97]/50 bg-[#3ddc97]/10 font-bold text-[#3ddc97] " + className}>
      📣 Partage le bon plan à tes potes
    </button>
  );
}

/** Champ code + activation (profil requis). */
function RedeemFirst({ region, onDone }: { region: FirstRegion | null; onDone: (rank: number, city: string | null) => void }) {
  const [code, setCode] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("hdar-code")) || FIRST_CODE);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      if (!region) throw new Error("Région introuvable : active ta position ou choisis ta ville sur la carte");
      const r = await firstRedeem(code, region.region);
      localStorage.removeItem("hdar-code");
      void usePremium.getState().refresh();
      onDone(r.rank, r.city);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 flex gap-2">
      <input aria-label="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 24))} className="h-12 min-w-0 flex-1 rounded-full border border-line bg-night px-4 font-mono text-lg tracking-[0.3em] uppercase outline-none focus-visible:border-[#fbbf24]" />
      <button type="button" disabled={busy || !code.trim()} onClick={() => void go()} className="h-12 rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] px-5 font-display font-extrabold text-night disabled:opacity-50">
        {busy ? "…" : "Activer"}
      </button>
    </div>
  );
}

const PERKS = ["👑 hdar+ à vie : filtres, qui m'a vu, 10 annonces, 20 photos…", "🚀 3 boosts profil d'1 h offerts chaque jour", "📌 1 boost d'annonce France 24 h chaque jour", "❤️ Cœurs rechargés à 100 chaque mois"];

function FounderActions({ me, product, placeId, onClose }: { me: FirstMe; product: string | null; placeId: string | null; onClose: () => void }) {
  const ready = (at?: string | null) => !at || Date.parse(at) <= Date.now();
  const when = (at: string) => new Date(at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const p = product ?? "";
  if (p.startsWith("ad_boost") && placeId) return ready(me.ad_boost_at)
    ? <button type="button" className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night" onClick={() => void firstAdBoost(placeId).then(() => { toast("Annonce boostée en France pour 24 h 🚀"); onClose(); }).catch((e: Error) => toast(e.message))}>📌 Booster mon annonce (France, 24 h)</button>
    : <p className="mt-4 text-center text-sm text-muted">Prochain boost d'annonce : {when(me.ad_boost_at!)}</p>;
  if (p.startsWith("boost_")) return ready(me.profile_boost_at)
    ? <button type="button" className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night" onClick={() => void firstBoost().then(() => { toast("Boost d'1 h activé 🚀"); onClose(); }).catch((e: Error) => toast(e.message))}>🚀 Activer un boost d'1 h{me.profile_boosts_left != null ? ` (${me.profile_boosts_left}/3 aujourd'hui)` : ""}</button>
    : <p className="mt-4 text-center text-sm text-muted">Prochain boost profil : {when(me.profile_boost_at!)}</p>;
  if (p.startsWith("hearts")) return <p className="mt-4 text-center text-sm text-muted">Tes cœurs sont rechargés à 100 chaque mois ❤️</p>;
  if (/^(listing|place_boost|pro_boost)/.test(p)) return <p className="mt-4 text-center text-sm text-muted">Les offres lieux et partenaires sont gratuites pendant le lancement : <a href="/contact" className="underline">écris-nous</a> et on active ta fiche.</p>;
  return null;
}

export function LaunchOfferSheet() {
  const { open, product, placeId } = useLaunchOffer();
  const onboarded = useHdar((s) => s.me.onboarded) || demo() === "sheet";
  const remaining = useFirstRemaining();
  const region = useFirstRegion();
  const [me, setMe] = useState<FirstMe | null>(null);
  useEffect(() => { if (open && onboarded && !demo()) void firstMe().then(setMe).catch(() => setMe(null)); }, [open, onboarded]);
  useEffect(() => { if (demo() === "sheet") useLaunchOffer.setState({ open: true }); }, []);
  if (!open) return null;
  const close = () => useLaunchOffer.setState({ open: false });
  return (
    <div className="fixed inset-0 z-[85] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Offert pendant le lancement">
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/60" onClick={close} />
      <div className="relative mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-[#fbbf24]/40 bg-surface px-5 pt-5 pb-7">
        <button type="button" aria-label="Fermer" onClick={close} className="absolute top-3 right-3 grid size-9 place-items-center rounded-full"><X className="size-5" /></button>
        <p className="text-4xl">🎁</p>
        <p className="mt-1 font-display text-2xl font-extrabold">Offert pendant le lancement</p>
        <p className="mt-1 text-sm text-muted">Pas de paiement sur hdar pour l'instant. Les <b className="text-ink">5000 premiers profils</b> reçoivent tout, à vie, avec le code <b className="font-mono text-[#fbbf24]">FIRST</b>.</p>
        {remaining != null && <p className="mt-2 inline-block rounded-full bg-[#fbbf24]/15 px-3 py-1 text-xs font-bold text-[#f5d27a]">🔥 {placesLabel(remaining)}</p>}
        {!me?.founder && <RegionTeaser c={region} className="mt-3" />}
        {me?.founder ? (
          <>
            <p className="mt-4 rounded-2xl bg-[#fbbf24]/10 px-3 py-2 text-sm">⭐ Tu es <b>Membre FIRST n° {me.rank}</b>{me.city ? ` · ${me.city}` : ""}.</p>
            <FounderActions me={me} product={product} placeId={placeId} onClose={close} />
          </>
        ) : (
          <>
            <ul className="mt-3 space-y-1 text-sm">{PERKS.map((p) => <li key={p}>{p}</li>)}</ul>
            {onboarded ? <RedeemFirst region={region} onDone={(rank, c) => { close(); useLaunchOffer.setState({ celebrate: { rank, city: c } }); }} /> : (
              <div className="mt-4 rounded-2xl border border-line bg-night px-4 py-3 text-sm">
                <p><b>Crée ton profil</b> et entre le code <b className="font-mono text-[#fbbf24]">FIRST</b>.</p>
                <button type="button" className="mt-3 h-11 w-full rounded-full bg-signal font-bold text-night"
                  onClick={() => { localStorage.setItem("hdar-code", FIRST_CODE); close(); useHdar.setState({ sheet: "gate" }); }}>Créer mon profil</button>
              </div>
            )}
          </>
        )}
        <ShareFirstButton remaining={remaining} region={region} className="mt-3" />
      </div>
    </div>
  );
}

/** Après la création du profil : proposer FIRST une fois. */
export function WelcomeFirst() {
  const onboarded = useHdar((s) => s.me.onboarded);
  const was = useRef<boolean | null>(null);
  const { welcome } = useLaunchOffer();
  const remaining = useFirstRemaining();
  const region = useFirstRegion();
  useEffect(() => {
    if (demo() === "welcome") { useLaunchOffer.setState({ welcome: true }); return; }
    if (was.current === false && onboarded && localStorage.getItem("hdar-first-welcome") !== "1") {
      localStorage.setItem("hdar-first-welcome", "1");
      void firstMe().then((m) => { if (!m.founder && m.remaining > 0) useLaunchOffer.setState({ welcome: true }); }).catch(() => undefined);
    }
    was.current = onboarded;
  }, [onboarded]);
  if (!welcome) return null;
  const close = () => useLaunchOffer.setState({ welcome: false });
  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center bg-night/95 p-6 backdrop-blur" role="dialog" aria-modal="true" aria-label="Bienvenue">
      <div className="w-full max-w-sm text-center">
        <p className="text-6xl">👋</p>
        <p className="mt-3 font-display text-3xl font-extrabold">Bienvenue sur hdar.</p>
        <p className="mt-2 text-sm text-muted">Ton profil est prêt. Cadeau de lancement : <b className="text-ink">hdar+ à vie</b>, boosts et cœurs offerts aux 5000 premiers.</p>
        {remaining != null && <p className="mt-3 inline-block rounded-full bg-[#fbbf24]/15 px-3 py-1 text-xs font-bold text-[#f5d27a]">🔥 {placesLabel(remaining)}</p>}
        <RegionTeaser c={region} className="mt-3" />
        <div className="mt-4 rounded-2xl border border-[#fbbf24]/40 bg-[#fbbf24]/5 py-3 font-mono text-3xl font-extrabold tracking-[0.4em] text-[#fbbf24]">FIRST</div>
        <button type="button" className="mt-4 h-14 w-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] font-display text-lg font-extrabold text-night"
          onClick={() => void (region ? firstRedeem(FIRST_CODE, region.region) : Promise.reject(new Error("Région introuvable : active ta position"))).then((r) => { localStorage.removeItem("hdar-code"); void usePremium.getState().refresh(); close(); useLaunchOffer.setState({ celebrate: { rank: r.rank, city: r.city } }); }).catch((e: Error) => toast(e.message))}>
          Activer mon offre
        </button>
        <ShareFirstButton remaining={remaining} region={region} className="mt-3" />
        <button type="button" onClick={close} className="mt-4 text-sm text-muted underline">Plus tard</button>
      </div>
    </div>
  );
}

const COLORS = ["#ff5a4e", "#fbbf24", "#3ddc97", "#8b7cff", "#f472b6", "#ffffff"];
/** Fête FIRST : confettis CSS légers (désactivés si mouvement réduit), son joyeux si les sons sont activés. */
export function FounderCelebration() {
  const { celebrate } = useLaunchOffer();
  const remaining = useFirstRemaining();
  const region = useFirstRegion();
  useEffect(() => { if (demo() === "confetti") useLaunchOffer.setState({ celebrate: { rank: 127, city: "Montpellier" } }); }, []);
  useEffect(() => { if (celebrate && !demo()) playFavoriteSound(); }, [celebrate]);
  if (!celebrate) return null;
  const close = () => useLaunchOffer.setState({ celebrate: null });
  const bits = Array.from({ length: 70 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 14) * 0.18, dur: 2.6 + ((i * 7) % 10) / 6, color: COLORS[i % COLORS.length], rot: (i * 47) % 360, w: 6 + (i % 3) * 3,
  }));
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden bg-night p-6" role="dialog" aria-modal="true" aria-label="Bienvenue dans hdar+">
      <div className="confetti pointer-events-none absolute inset-0" aria-hidden="true">
        {bits.map((b, i) => <span key={i} style={{ left: `${b.left}%`, background: b.color, width: b.w, height: b.w * 1.6, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />)}
      </div>
      <div className="relative w-full max-w-sm text-center">
        <p className="text-6xl">🎉</p>
        <p className="mt-3 font-display text-3xl leading-tight font-extrabold">Bienvenue dans hdar+ 🎉</p>
        <p className="mt-2 inline-block rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] px-4 py-1 font-display font-extrabold text-night">⭐ Membre FIRST n° {celebrate.rank}{celebrate.city ? ` · ${celebrate.city}` : ""}</p>
        <p className="mt-4 text-sm leading-relaxed text-ink/90">
          hdar vient tout juste de naître : on est encore peu nombreux sur la carte. Tu fais partie des <b>5000 premiers</b>, alors tout est <b>offert à vie</b> : hdar+, boosts et cœurs.
        </p>
        <p className="mt-2 text-sm text-muted">Invite tes potes pour faire vivre la carte autour de toi 💫</p>
        <ShareFirstButton remaining={remaining} region={region} className="mt-5" />
        <button type="button" onClick={close} className="mt-3 h-12 w-full rounded-full bg-ink font-bold text-night">C'est parti !</button>
      </div>
    </div>
  );
}

/** Carte profil / page hdar+ : badge « Membre FIRST » ou offre, + partage. */
export function FounderCard({ className = "mt-4" }: { className?: string }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const remaining = useFirstRemaining();
  const region = useFirstRegion();
  const [me, setMe] = useState<FirstMe | null>(demo() === "card" ? { founder: true, rank: 127, city: "Montpellier", remaining: 873 } : null);
  const celebrate = useLaunchOffer((s) => s.celebrate);
  useEffect(() => { if (onboarded && !demo()) void firstMe().then(setMe).catch(() => undefined); }, [onboarded, celebrate]);
  // Offre terminée : on ne garde la carte que pour les membres FIRST (leur statut).
  if (remaining === 0 && !me?.founder) return null;
  return (
    <section className={"rounded-3xl border border-[#fbbf24]/40 bg-gradient-to-br from-[#fbbf24]/10 to-[#FA6F6C]/10 p-4 " + className}>
      {me?.founder ? (
        <>
          <p className="font-display text-lg font-extrabold">⭐ Membre FIRST n° {me.rank}{me.city ? ` · ${me.city}` : ""}</p>
          <p className="mt-1 text-xs text-muted">hdar+ à vie · 3 boosts profil d'1 h par jour · 1 boost d'annonce France par jour · cœurs rechargés à 100 chaque mois</p>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-extrabold">🎁 hdar+ offert à vie aux 5000 premiers</p>
          <p className="mt-1 text-sm text-muted">Code <b className="font-mono text-[#fbbf24]">FIRST</b>{remaining != null ? ` · ${placesLabel(remaining)}` : ""}</p>
          <RegionTeaser c={region} className="mt-2" />
          <button type="button" onClick={() => useLaunchOffer.setState({ open: true, product: null, placeId: null })} className="mt-3 h-11 w-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] font-display font-extrabold text-night">Activer mon offre</button>
        </>
      )}
      <ShareFirstButton remaining={remaining} region={region} className="mt-3 h-11" />
    </section>
  );
}

export function AdminFirstStats({ adminKey }: { adminKey: string }) {
  const [s, setS] = useState<{ redeemed: number; total: number; remaining: number; today: number; profile_boosts: number; ad_boosts: number; regions: { region: string; quota: number; used: number }[] } | null>(null);
  useEffect(() => { if (adminKey) void adminFirstStats(adminKey).then(setS).catch(() => undefined); }, [adminKey]);
  if (!s) return null;
  return (
    <p className="mb-3 rounded-2xl border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-3 py-2 text-sm">
      ⭐ Code FIRST : <b>{s.redeemed}</b> / {s.total} activés ({s.today} en 24 h) · {s.remaining} places restantes · boosts offerts : {s.profile_boosts} profil, {s.ad_boosts} annonce
      <span className="mt-1 block text-xs text-muted">{(s.regions ?? []).map((r) => `${r.region} ${r.used}/${r.quota}`).join(" · ")}</span>
    </p>
  );
}

/** Popup du cadeau sur la carte tant que l'offre FIRST est ouverte. */
export function FirstGiftCard({ remaining, onAction }: { remaining: number; onAction?: () => void }) {
  const region = useFirstRegion();
  return (
    <section className="rounded-3xl border border-[#fbbf24]/50 bg-gradient-to-br from-[#2a2110] via-night to-[#2a1416] p-4 shadow-[0_0_30px_rgba(251,191,36,.25)]">
      <p className="font-display text-xl font-extrabold">🎁 Partage le code FIRST</p>
      <p className="mt-1 text-sm text-ink/90">Tes potes gagnent <b className="text-[#fbbf24]">hdar+ à vie</b> en s'inscrivant avec le code <b className="font-mono text-[#fbbf24]">FIRST</b>.</p>
      <p className="mt-1 text-xs text-muted">{placesLabel(region ? region.remaining : remaining)}{region ? ` en ${region.name}` : ""} · offre réservée aux 5000 premiers</p>
      <button type="button" onClick={() => { void shareFirst(region ? region.remaining : remaining, region?.name).then((r) => r === "copied" && toast("Lien copié 📋")); onAction?.(); }}
        className="mt-3 h-12 w-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] font-display font-extrabold text-night">📣 Partager le code FIRST</button>
    </section>
  );
}
