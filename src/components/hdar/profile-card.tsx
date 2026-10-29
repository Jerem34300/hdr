import { useEffect, useState } from "react";
import { ambApplyStatus, ambMe } from "@/lib/hdar/live";
import { AmbassadorCard } from "./ambassador";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Structure commune des cartes du Profil : tuile icône + titre pleine largeur + sous-titre + chevron. */
export function CardHead({ icon, title, sub, accent, chevron = true }: { icon: ReactNode; title: ReactNode; sub: ReactNode; accent: string; chevron?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: `${accent}1f`, boxShadow: `inset 0 0 0 1px ${accent}33` }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate font-display text-[17px] leading-tight">{title}</b>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{sub}</span>
      </span>
      {chevron && <ChevronRight className="size-5 shrink-0" style={{ color: accent }} />}
    </span>
  );
}

export const cardCls = "mt-3 block w-full rounded-3xl border bg-surface p-4 text-start transition active:scale-[.98]";
export const cardStyle = (accent: string) => ({ borderColor: `${accent}40`, backgroundImage: `linear-gradient(135deg, ${accent}14, transparent 60%)` });

/* ── Ambassadeur : lien discret dans le Profil + popup occasionnel ── */

let ambQ: Promise<{ amb: boolean; applied: boolean }> | null = null;
const ambState = () => (ambQ ??= Promise.all([ambMe().catch(() => null), ambApplyStatus().catch(() => null)])
  .then(([m, s]) => ({ amb: !!m, applied: !!s })).catch(() => { ambQ = null; return { amb: false, applied: false }; }));

/** Ambassadeur → sa carte ; sinon un simple lien discret. */
export function ProfileAmb({ where }: { where: "top" | "bottom" }) {
  const [st, setSt] = useState<{ amb: boolean; applied: boolean } | null>(null);
  useEffect(() => void ambState().then(setSt), []);
  if (!st) return null;
  if (st.amb) return where === "top" ? <AmbassadorCard /> : null;
  if (where === "top") return null;
  return (
    <a href="/ambassadeur" className="mt-6 mb-4 block px-1 text-center text-[13px] text-muted">
      💸 Gagne de l'argent : <span className="font-bold text-[#3EE08F]">deviens ambassadeur ›</span>
    </a>
  );
}

const NK = "hdar-ambnudge";
/** Popup rare : après 3 sessions, au plus une fois tous les 5 jours, jamais aux ambassadeurs/candidats. */
export function AmbNudge() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const s = JSON.parse(localStorage.getItem(NK) || "{}") as { off?: boolean; n?: number; last?: number; seen?: string };
    if (s.off) return;
    const today = new Date().toDateString();
    if (s.seen !== today) { s.n = (s.n ?? 0) + 1; s.seen = today; localStorage.setItem(NK, JSON.stringify(s)); }
    if ((s.n ?? 0) < 3 || Date.now() - (s.last ?? 0) < 5 * 864e5) return;
    const t = setTimeout(() => void ambState().then((st) => {
      if (st.amb || st.applied) return;
      localStorage.setItem(NK, JSON.stringify({ ...s, last: Date.now() })); setOpen(true);
    }), 4000);
    return () => clearTimeout(t);
  }, []);
  if (!open) return null;
  const off = () => { const s = JSON.parse(localStorage.getItem(NK) || "{}"); localStorage.setItem(NK, JSON.stringify({ ...s, off: true })); setOpen(false); };
  return (
    <div role="dialog" aria-label="Deviens ambassadeur" className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-sm rounded-3xl border border-[#3EE08F]/40 bg-[#0b0b10]/95 p-4 shadow-[0_10px_40px_rgba(0,0,0,.6)] backdrop-blur">
      <CardHead icon="💸" accent="#3EE08F" chevron={false} title="Gagne de l'argent avec hdar" sub="Fais connaître l'appli, touche une commission" />
      <div className="mt-3 flex gap-2">
        <a href="/ambassadeur" onClick={() => setOpen(false)} className="flex h-10 flex-1 items-center justify-center rounded-full bg-[#3EE08F] font-display text-sm font-extrabold text-night">Découvrir</a>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full border border-white/15 px-4 text-sm font-bold">Plus tard</button>
      </div>
      <button type="button" onClick={off} className="mt-2 w-full text-center text-xs text-muted underline">Ne plus afficher</button>
    </div>
  );
}

/** Bordure dégradée lumineuse (style d'origine). */
export const glowOuter = (grad: string, glow: string) => ({ className: `mt-3 block rounded-3xl p-[2px] ${grad}`, style: { boxShadow: `0 0 26px ${glow}` } });
export const glowInner = "relative block overflow-hidden rounded-[22px] bg-[#0b0b10]/90 p-4";
