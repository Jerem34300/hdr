import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { myBoosts } from "@/lib/hdar/live";
import { deviceId } from "@/lib/hdar/device";
import { useHdar } from "@/lib/hdar/store";
import { PinFace } from "./map-view";

const FIRST = "hdar-first-seen";
const LAST = "hdar-boost-nudge-at";
const EVERY = 3 * 86400e3; // au plus une fois tous les 3 jours
const DELAY = 25e3; // laisse le temps de regarder la carte avant

// "Pas à la première session" : la date de première visite doit exister AVANT ce chargement de page.
let returning = false;
if (typeof localStorage !== "undefined") {
  try {
    returning = !!localStorage.getItem(FIRST);
    if (!returning) localStorage.setItem(FIRST, String(Date.now()));
  } catch { /* stockage indisponible */ }
}

/** Petit pop-up animé, occasionnel, qui propose de booster son profil (utilisateurs connectés). */
export function BoostNudge() {
  const onboarded = useHdar((s) => s.me.onboarded);
  const pseudo = useHdar((s) => s.me.pseudo);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!onboarded) return;
    const force = new URLSearchParams(location.search).has("nudge");
    let last = 0;
    try { last = Number(localStorage.getItem(LAST) || 0); } catch { return; }
    if (!force && (!returning || Date.now() - last < EVERY)) return;
    let stop = false;
    const t = window.setTimeout(() => {
      void myBoosts()
        .then((r) => {
          if (stop || r.some((b) => b.active)) return;
          localStorage.setItem(LAST, String(Date.now()));
          setShow(true);
        })
        .catch(() => undefined);
    }, force ? 1500 : DELAY);
    return () => { stop = true; window.clearTimeout(t); };
  }, [onboarded]);
  if (!show) return null;
  return (
    <div role="dialog" aria-label="Booster mon profil" className="boost-nudge absolute inset-x-3 top-16 z-40 mx-auto max-w-sm">
      <div className="boost-card relative flex items-center gap-3 rounded-3xl p-3 pe-10 shadow-2xl">
        <span className="partner-glow relative block size-12 shrink-0 overflow-hidden rounded-full border-2 border-white bg-surface">
          <PinFace id={deviceId()} pseudo={pseudo || "Toi"} />
        </span>
        <a href="/boost" className="min-w-0 flex-1 text-white">
          <b className="flex items-center gap-1 font-display text-base font-extrabold"><Sparkles className="sparkle size-4" /> Fais-toi remarquer</b>
          <span className="block text-xs text-white/90">Ton pin brille sur la carte et passe devant tout le monde. Dès 1,99 €.</span>
          <span className="mt-1.5 inline-block rounded-full bg-night/85 px-3 py-1 text-xs font-bold text-[#fbbf24]">Booster mon profil →</span>
        </a>
        <button type="button" aria-label="Fermer" className="absolute top-2 end-2 flex size-8 items-center justify-center rounded-full bg-night/40 text-white" onClick={() => setShow(false)}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
