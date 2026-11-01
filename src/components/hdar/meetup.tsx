import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Navigation2, Smartphone, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { t, tf } from "@/lib/hdar/i18n";
import { approxDistance, askCompass, bearingDeg, distanceM, useMeetLive, useMeetup, useTrend, warmth, type MeetDemo } from "@/lib/hdar/meetup";
import { useHdar } from "@/lib/hdar/store";

type Meet = ReturnType<typeof useMeetup>;
export { type Meet };
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
export function MeetBar({ pseudo, photo, meet, onQuick }: { pseudo: string; photo?: string; meet: Meet; onQuick: (text: string) => void }) {
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
      <Compass pseudo={pseudo} photo={photo} meet={meet} onShow={() => setShow(true)} />
      {show && <ShowSheet pseudo={pseudo} onClose={() => setShow(false)} onFlash={(c) => { meet.sendFlash(c); toast(tf("L'écran de {n} clignote", pseudo)); }} onQuick={(t) => { onQuick(t); setShow(false); }} />}
    </>
  );
}

function Compass({ pseudo, photo, meet, onShow }: { pseudo: string; photo?: string; meet: Meet; onShow: () => void }) {
  const { me, other, heading, gpsErr, st } = meet;
  const clock = useClock(st?.expires_at);
  const d = me && other ? distanceM(me, other) : null;
  const acc = me && other ? Math.round(Math.max(me.acc, other.acc)) : me ? Math.round(me.acc) : null;
  const trend = useTrend(d);
  const w = d != null ? warmth(d) : null;
  const rot = me && other ? bearingDeg(me, other) - (heading ?? 0) : 0;
  const weak = acc != null && acc > 40;
  return (
    <div data-act="meet-compass" className="flex items-center gap-3 border-b border-line px-3 py-2" style={w ? { background: `radial-gradient(circle at 60px 50%, ${w.color}2e, transparent 70%)` } : undefined}>
      <Radar d={d} angle={me && other ? rot : null} color={w?.color ?? "#3EE08F"} initial={pseudo} photo={photo && /^(https?:|\/|data:)/.test(photo) ? photo : undefined} heading={heading} label={tf("Direction de {n}", pseudo)} />
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
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" data-act="meet-show" onClick={onShow} className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-signal px-3 py-1.5 text-[13px] font-extrabold leading-tight text-night shadow-[0_0_18px_rgba(250,111,108,.45)]">
            <Smartphone className="size-4 shrink-0" aria-hidden /><span>Fais clignoter son tél</span>
          </button>
          <button type="button" aria-label="Arrêter le partage" title="Arrêter le partage" onClick={() => void meet.stop()} className="grid size-9 shrink-0 place-items-center rounded-full border border-line"><X className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}

const SCALES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const fmtM = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

/** Radar : soi au centre, l'autre en point lumineux (direction + distance), balayage qui fait briller le point à chaque passage. */
export function Radar({ d, angle, color, initial, photo, heading, label, className = "size-[104px]" }: { d: number | null; angle: number | null; color: string; initial: string; photo?: string; heading: number | null; label: string; className?: string }) {
  const R = 44; // rayon utile (viewBox −50…50)
  const max = SCALES.find((x) => (d ?? 0) * 1.15 <= x) ?? SCALES[SCALES.length - 1]!;
  const rings = ({ 20: [5, 10, 20], 50: [10, 25, 50], 100: [25, 50, 100], 200: [50, 100, 200], 500: [100, 250, 500], 1000: [250, 500, 1000], 2000: [500, 1000, 2000], 5000: [1000, 2500, 5000], 10000: [2500, 5000, 10000] } as Record<number, number[]>)[max]!;
  const sweep = useRef<SVGGElement>(null);
  const dot = useRef<SVGGElement>(null);
  const glow = useRef<SVGCircleElement>(null);
  const target = useRef({ x: 0, y: 0, a: 0, on: false });
  const cur = useRef({ x: 0, y: 0, init: false });
  if (d != null && angle != null) {
    const r = Math.min(d / max, 1) * R, t = (angle * Math.PI) / 180;
    target.current = { x: Math.sin(t) * r, y: -Math.cos(t) * r, a: ((angle % 360) + 360) % 360, on: true };
  } else target.current.on = false;

  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const P = 2600; // un tour en 2,6 s
    const tick = (now: number) => {
      const T = target.current, C = cur.current;
      if (!C.init && T.on) { C.x = T.x; C.y = T.y; C.init = true; }
      const k = reduce ? 1 : 0.08; // le point glisse en douceur vers sa nouvelle place
      C.x += (T.x - C.x) * k; C.y += (T.y - C.y) * k;
      dot.current?.setAttribute("transform", `translate(${C.x.toFixed(2)} ${C.y.toFixed(2)})`);
      if (dot.current) dot.current.style.opacity = T.on ? "1" : "0";
      if (reduce) { sweep.current?.setAttribute("opacity", "0"); glow.current?.setAttribute("opacity", "0.55"); return; }
      const sa = ((now % P) / P) * 360;
      sweep.current?.setAttribute("transform", `rotate(${sa.toFixed(1)})`);
      const since = (sa - (Math.atan2(C.x, -C.y) * 180) / Math.PI + 720) % 360; // degrés depuis le passage du balayage
      const g = Math.max(0, 1 - since / 200);
      glow.current?.setAttribute("opacity", (0.15 + g * 0.85).toFixed(2));
      glow.current?.setAttribute("r", (9 + g * 6).toFixed(1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const n = heading != null ? -heading : 0;
  const id = "rg" + initial.length;
  return (
    <svg viewBox="-50 -50 100 100" className={className + " shrink-0"} role="img" aria-label={label} data-act="meet-radar">
      <defs>
        <radialGradient id={id + "bg"}><stop offset="0%" stopColor="#0b0e12" /><stop offset="100%" stopColor="#11161d" /></radialGradient>
        <clipPath id={id + "c"}><circle r={R + 4} /></clipPath>
      </defs>
      <circle r="49" fill={`url(#${id}bg)`} stroke={color} strokeOpacity="0.55" strokeWidth="1.5" />
      {rings.map((m, i) => (
        <g key={m}>
          <circle r={(R * m) / max} fill="none" stroke="#fff" strokeOpacity="0.13" strokeDasharray={i === 2 ? undefined : "2 2"} />
          <text x={((R * m) / max) * 0.6} y={((R * m) / max) * 0.6 + 2} fontSize="6.4" fill="#fff" fillOpacity="0.55" fontWeight="600">{fmtM(m)}</text>
        </g>
      ))}
      <line x1={-R} x2={R} y1="0" y2="0" stroke="#fff" strokeOpacity="0.07" />
      <line y1={-R} y2={R} x1="0" x2="0" stroke="#fff" strokeOpacity="0.07" />
      <g clipPath={`url(#${id}c)`}><g ref={sweep}><path d={`M0 0 L0 ${-R - 4} A${R + 4} ${R + 4} 0 0 0 ${-(R + 4) * Math.sin(Math.PI / 4)} ${-(R + 4) * Math.cos(Math.PI / 4)} Z`} fill={color} fillOpacity="0.22" /><line x1="0" y1="0" x2="0" y2={-R - 4} stroke={color} strokeWidth="1.2" strokeOpacity="0.9" /></g></g>
      <text transform={`rotate(${n}) translate(0 ${-R + 1})`} textAnchor="middle" fontSize="6" fill="#fff" fillOpacity="0.7" fontWeight="700">N</text>
      <circle r="3.2" fill="#3EE08F" stroke="#0b0e12" strokeWidth="1" />
      <g ref={dot} style={{ opacity: 0 }}>
        <circle ref={glow} r="11" fill={color} opacity="0.4" style={{ filter: "blur(2px)" }} />
        {photo ? (<><clipPath id={id + "p"}><circle r="6.5" /></clipPath><image href={photo} x="-6.5" y="-6.5" width="13" height="13" clipPath={`url(#${id}p)`} preserveAspectRatio="xMidYMid slice" /></>) : <circle r="6.5" fill="#0b0e12" />}
        <circle r="6.5" fill="none" stroke={color} strokeWidth="1.6" />
        {!photo && <text y="2.6" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={color}>{initial.trim().charAt(0).toUpperCase()}</text>}
      </g>
    </svg>
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
          <h3 className="font-display text-lg font-extrabold">Fais clignoter son tél</h3>
          <button type="button" aria-label="Fermer" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-white/5"><X className="size-4" /></button>
        </div>
        <p className="mt-0.5 text-xs text-muted">{tf("Tu ne trouves pas {n} ? Son écran clignote dans la couleur choisie et lui demande de lever son téléphone.", pseudo)}</p>
        <div className="mt-3 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Couleur">
          {MEET_COLORS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={c === x} aria-label={x} onClick={() => setC(x)} className={`size-10 rounded-full ring-offset-2 ring-offset-surface ${c === x ? "ring-2 ring-white" : "ring-1 ring-line"}`} style={{ background: x }} />
          ))}
        </div>
        <button type="button" data-act="meet-flash" onClick={() => onFlash(c)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 font-bold text-night" style={{ background: c }}>
          <Sparkles className="size-5" aria-hidden />Faire clignoter maintenant
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
      <span className="rounded-full bg-black/70 px-5 py-3 font-display text-lg font-bold text-white">{tf("{n} ne te trouve pas : lève ton téléphone", pseudo)}</span>
      <span className="mt-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">Touche pour arrêter</span>
    </button>,
    document.body,
  );
}

/** Fait tourner la session « Se retrouver » à la racine : elle survit quand on quitte le chat pour la carte. */
export function MeetRunner() {
  const target = useMeetLive((s) => s.target);
  const demo = mapDemo();
  const api = useMeetup(demo ? "demo" : target?.id ?? "", !demo && !!target, demo);
  useEffect(() => {
    if (demo && !useMeetLive.getState().target) useMeetLive.setState({ target: { id: "demo", pseudo: "Lucas34" } });
    useMeetLive.setState({ api: target || demo ? api : null });
  });
  // Fin de session hors du chat : tout disparaît.
  const st = api.st?.status;
  useEffect(() => {
    const s = useMeetLive.getState();
    if (!s.pinned && s.target && st !== "active" && st !== undefined) useMeetLive.setState({ target: null, api: null, follow: true });
  }, [st]);
  return api.flash && !useMeetLive.getState().pinned && target ? <MeetFlash color={api.flash} pseudo={target.pseudo} onDone={api.clearFlash} /> : null;
}
/** Aperçu de dev : ?profiltab&meetmap=far|near */
function mapDemo(): MeetDemo | undefined {
  if (!import.meta.env.DEV || typeof location === "undefined") return undefined;
  const k = new URLSearchParams(location.search).get("meetmap");
  if (!k) return undefined;
  const me = { lat: 43.6086, lng: 3.88, acc: 6, at: Date.now() };
  const other = k === "far" ? { lat: 43.6112, lng: 3.8832, acc: 9, at: Date.now() } : { lat: 43.60876, lng: 3.88015, acc: 5, at: Date.now() };
  return { state: { allowed: true, id: "d", status: "active", mine: true, expires_at: new Date(Date.now() + 760_000).toISOString() }, me, other, heading: 20 };
}

/** Mini radar flottant en haut de la carte pendant une session active. Toucher = retour à la discussion. */
export function MapMeetRadar({ hidden }: { hidden: boolean }) {
  const target = useMeetLive((s) => s.target);
  const api = useMeetLive((s) => s.api);
  const sheet = useHdar((s) => s.sheet);
  const me = api?.me, other = api?.other;
  const d = me && other ? distanceM(me, other) : null;
  const trend = useTrend(d);
  if (!target || api?.st?.status !== "active" || hidden || sheet) return null;
  const acc = me && other ? Math.round(Math.max(me.acc, other.acc)) : null;
  const w = d != null ? warmth(d) : null;
  const rot = me && other ? bearingDeg(me, other) - (api.heading ?? 0) : null;
  return (
    <button type="button" data-act="map-meet-radar" data-tip-bubble onPointerDown={(e) => e.stopPropagation()}
      onClick={() => useHdar.getState().openLive(target.id, target.pseudo)}
      aria-label={tf("Retour à la discussion avec {n}", target.pseudo)}
      className="absolute top-3 left-1/2 z-30 flex max-w-[calc(100%-8.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-night/90 py-1 ps-1 pe-3 text-start shadow-xl backdrop-blur"
      style={{ borderColor: (w?.color ?? "#3EE08F") + "88" }}>
      <Radar d={d} angle={rot} color={w?.color ?? "#3EE08F"} initial={target.pseudo} photo={target.photo} heading={api.heading} label={tf("Direction de {n}", target.pseudo)} className="size-[68px]" />
      <span className="min-w-0">
        <span className="block font-display text-base font-extrabold leading-tight" style={{ color: w?.color }}>{d != null ? <bdi dir="ltr">{approxDistance(d, acc ?? 10)}</bdi> : "…"}</span>
        {d != null && Math.abs(trend) > 3 && <span className="block text-[11px] font-semibold leading-tight" style={{ color: w?.color }}>{trend < 0 ? "Plus chaud" : "Plus froid"}</span>}
        <span className="block text-[10px] leading-tight text-muted">{tf("Retour à {n}", target.pseudo)}</span>
      </span>
    </button>
  );
}
