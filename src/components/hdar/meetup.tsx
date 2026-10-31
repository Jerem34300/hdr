import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Crosshair, Navigation2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { t, tf } from "@/lib/hdar/i18n";
import { approxDistance, askCompass, bearingDeg, distanceM, warmth, type useMeetup } from "@/lib/hdar/meetup";

type Meet = ReturnType<typeof useMeetup>;
export const MEET_COLORS = ["#FA6F6C", "#3EE08F", "#FACC15", "#38BDF8", "#A78BFA", "#FFFFFF"];
const QUICK = ["Je suis au bar", "Je suis devant l'entrée", "J'arrive", "Tu me vois ?", "Je suis en veste rouge"];

function useClock(until?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!until) return "";
  const s = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Bandeau compact sous l'en-tête du chat privé : demande, réponse ou boussole active. Le chat reste utilisable dessous. */
export function MeetBar({ pseudo, meet, onQuick }: { pseudo: string; meet: Meet; onQuick: (text: string) => void }) {
  const { st } = meet;
  const [show, setShow] = useState(false);
  const prev = useRef(st?.status);
  useEffect(() => {
    if (prev.current === "active" && st?.status === "ended") toast(st.ended_by === "timeout" ? "Les 15 min sont écoulées : partage arrêté" : st.ended_by === "other" ? tf("{n} a arrêté le partage", pseudo) : "Partage arrêté");
    if (prev.current === "pending" && st?.status === "ended" && st.mine && st.ended_by === "other") toast(tf("{n} a refusé", pseudo));
    prev.current = st?.status;
  }, [st?.status, st?.ended_by, st?.mine, pseudo]);
  if (!st?.status || st.status === "ended") return null;

  if (st.status === "pending" && st.mine)
    return (
      <div data-act="meet-bar" className="flex items-center gap-2 border-b border-line bg-surface/70 px-3 py-2 text-sm">
        <Navigation2 className="size-4 shrink-0 text-signal" aria-hidden />
        <p className="min-w-0 flex-1 leading-snug">{tf("Demande envoyée à {n}. En attente de son accord…", pseudo)}</p>
        <button type="button" onClick={() => void meet.stop()} className="h-9 shrink-0 rounded-full border border-line px-3 text-xs font-semibold">Annuler</button>
      </div>
    );

  if (st.status === "pending")
    return (
      <div data-act="meet-bar" className="border-b border-line bg-surface/80 px-3 py-2.5 text-sm">
        <p className="flex items-start gap-2 font-semibold leading-snug"><Navigation2 className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />{tf("{n} propose de se retrouver", pseudo)}</p>
        <p className="mt-1 text-xs leading-snug text-muted">15 min max. Vos positions précises sont partagées entre vous deux uniquement, jamais enregistrées. Chacun peut arrêter à tout moment.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => void meet.stop()} className="h-10 flex-1 rounded-full border border-line px-3 text-sm font-semibold">Refuser</button>
          <button type="button" data-act="meet-accept" onClick={() => void meet.accept().catch((e: Error) => toast(e.message))} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-signal px-3 text-sm font-bold text-night"><Check className="size-4" aria-hidden />Accepter</button>
        </div>
      </div>
    );

  return (
    <>
      <Compass pseudo={pseudo} meet={meet} onShow={() => setShow(true)} />
      {show && <ShowSheet pseudo={pseudo} onClose={() => setShow(false)} onFlash={(c) => { meet.sendFlash(c); toast(tf("L'écran de {n} clignote", pseudo)); }} onQuick={(t) => { onQuick(t); setShow(false); }} />}
    </>
  );
}

function Compass({ pseudo, meet, onShow }: { pseudo: string; meet: Meet; onShow: () => void }) {
  const { me, other, heading, gpsErr, st } = meet;
  const clock = useClock(st?.expires_at);
  const lastD = useRef<number[]>([]);
  const d = me && other ? distanceM(me, other) : null;
  const acc = me && other ? Math.round(Math.max(me.acc, other.acc)) : me ? Math.round(me.acc) : null;
  if (d != null) { const l = lastD.current; if (!l.length || Math.abs(l[l.length - 1]! - d) > 1) l.push(d); if (l.length > 4) l.shift(); }
  const l = lastD.current;
  const trend = l.length >= 2 ? l[l.length - 1]! - l[0]! : 0;
  const w = d != null ? warmth(d) : null;
  const rot = me && other ? bearingDeg(me, other) - (heading ?? 0) : 0;
  const weak = acc != null && acc > 40;
  return (
    <div data-act="meet-compass" className="flex items-center gap-3 border-b border-line px-3 py-2" style={w ? { background: `linear-gradient(90deg, ${w.color}26, transparent 70%)` } : undefined}>
      <div className="relative grid size-14 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: w?.color ?? "rgba(255,255,255,.15)" }}>
        {heading == null && <span className="absolute top-0.5 text-[9px] font-bold text-muted">N</span>}
        {me && other ? (
          <Navigation2 className="size-7 transition-transform duration-500" style={{ transform: `rotate(${rot}deg)`, color: w?.color, fill: w?.color }} aria-label={tf("Direction de {n}", pseudo)} />
        ) : (
          <Crosshair className="size-6 animate-pulse text-muted" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {d != null ? (
          <p className="font-display text-xl font-extrabold leading-tight" style={{ color: w?.color }}><bdi dir="ltr">{approxDistance(d, acc ?? 10)}</bdi></p>
        ) : (
          <p className="text-sm font-semibold leading-snug">{gpsErr === "denied" ? "Autorise ta position pour voir la boussole" : me ? tf("En attente de la position de {n}…", pseudo) : "Recherche de ta position…"}</p>
        )}
        <p className="text-[11px] leading-snug text-muted">
          {d != null && Math.abs(trend) > 3 && <span className="whitespace-nowrap font-semibold" style={{ color: w?.color }}>{trend < 0 ? "Plus chaud" : "Plus froid"} · </span>}
          {acc != null && <span className={weak ? "text-amber-300" : undefined}>{tf("Précision GPS ±{n} m", acc).replace(/ (m|م)$/, "\u00a0$1")}{weak && <> · <span>approximatif</span></>} · </span>}
          {heading == null && me && other && <button type="button" className="underline" onClick={() => void askCompass()}>Nord en haut</button>}
          {heading == null && me && other && " · "}
          <span>{tf("Fin dans {n}", clock)}</span>
        </p>
      </div>
      <button type="button" data-act="meet-show" onClick={onShow} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-signal/15 px-3 text-xs font-bold text-signal ring-1 ring-signal/40">
        <Sparkles className="size-4" aria-hidden /><span>Fais-toi voir</span>
      </button>
      <button type="button" aria-label="Arrêter le partage" title="Arrêter le partage" onClick={() => void meet.stop()} className="grid size-9 shrink-0 place-items-center rounded-full border border-line"><X className="size-4" /></button>
    </div>
  );
}

function ShowSheet({ pseudo, onClose, onFlash, onQuick }: { pseudo: string; onClose: () => void; onFlash: (c: string) => void; onQuick: (t: string) => void }) {
  const [c, setC] = useState(MEET_COLORS[0]!);
  const [txt, setTxt] = useState("");
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60" onClick={onClose} data-sheet-root data-act="show-sheet">
      <div className="w-full max-w-md rounded-t-3xl border-t border-line bg-surface px-4 pt-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-extrabold">Fais-toi voir</h3>
          <button type="button" aria-label="Fermer" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-white/5"><X className="size-4" /></button>
        </div>
        <p className="mt-0.5 text-xs text-muted">{tf("Fais clignoter l'écran de {n}, puis lève ton téléphone.", pseudo)}</p>
        <div className="mt-3 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Couleur">
          {MEET_COLORS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={c === x} aria-label={x} onClick={() => setC(x)} className={`size-10 rounded-full ring-offset-2 ring-offset-surface ${c === x ? "ring-2 ring-white" : "ring-1 ring-line"}`} style={{ background: x }} />
          ))}
        </div>
        <button type="button" data-act="meet-flash" onClick={() => onFlash(c)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 font-bold text-night" style={{ background: c }}>
          <Sparkles className="size-5" aria-hidden />Faire clignoter son écran
        </button>
        <p className="mt-4 text-xs font-semibold text-muted">Message rapide</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK.map((q) => <button key={q} type="button" onClick={() => onQuick(t(q))} className="rounded-full border border-line px-3 py-2 text-xs font-semibold">{q}</button>)}
        </div>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (txt.trim()) onQuick(txt.trim()); }}>
          <input value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={140} placeholder="Ex. je suis au bar, veste rouge" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 text-sm" />
          <button type="submit" className="h-11 shrink-0 rounded-full bg-signal px-4 text-sm font-bold text-night">Envoyer</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** Écran qui clignote (≈ 2 fois par seconde, sous le seuil photosensible de 3 Hz) pendant 6 s. Toucher pour arrêter. */
export function MeetFlash({ color, pseudo, onDone }: { color: string; pseudo: string; onDone: () => void }) {
  useEffect(() => { const id = setTimeout(onDone, 6000); return () => clearTimeout(id); }, [onDone]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <button type="button" data-act="meet-flash-screen" onClick={onDone} className="meet-flash fixed inset-0 z-[95] flex flex-col items-center justify-end pb-24 text-center" style={{ background: color }}>
      <span className="rounded-full bg-black/70 px-5 py-3 font-display text-lg font-bold text-white">{tf("{n} te cherche : lève ton téléphone", pseudo)}</span>
      <span className="mt-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">Touche pour arrêter</span>
    </button>,
    document.body,
  );
}
