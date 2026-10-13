import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useHdar } from "@/lib/hdar/store";
import { useCall } from "@/lib/hdar/call";

const KEY = "hdar-intro-seen";
const BASE = "/promo/user/";

/** Ouvre la vidéo de présentation (aussi depuis Profil → Comment ça marche). */
export const useIntro = create<{ open: boolean; manual: boolean }>(() => ({ open: false, manual: false }));
export const openIntro = () => useIntro.setState({ open: true, manual: true });

function seen() { try { return localStorage.getItem(KEY) === "1"; } catch { return true; } }
function markSeen() { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } }

/** Fenêtre vidéo de première visite, au-dessus de la carte. Aucun suivi : seulement un drapeau localStorage. */
export function IntroVideo() {
  const { open, manual } = useIntro();
  const onboarded = useHdar((s) => s.me.onboarded);
  const cover = useHdar((s) => s.cover);
  const phase = useCall((s) => s.phase);
  const inCall = phase !== "idle";
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const [portrait, setPortrait] = useState(true);

  useEffect(() => {
    if (onboarded || seen() || inCall || cover) return;
    if (location.pathname.startsWith("/live")) return;
    const t = window.setTimeout(() => { if (!useHdar.getState().me.onboarded && useCall.getState().phase === "idle") useIntro.setState({ open: true, manual: false }); }, 1200);
    return () => window.clearTimeout(t);
  }, [onboarded, inCall, cover]);

  useEffect(() => {
    if (!open) return;
    setEnded(false); setMuted(true);
    setPortrait(window.innerHeight >= window.innerWidth);
  }, [open]);

  useEffect(() => { if (open && inCall) close(); }, [open, inCall]);
  useEffect(() => { if (open && !manual && onboarded) close(); }, [open, manual, onboarded]);

  function close() { markSeen(); ref.current?.pause(); useIntro.setState({ open: false }); }
  if (!open) return null;
  const v = portrait ? "vertical_light_720x1280" : "horizontal_light_1280x720";
  const poster = portrait ? "poster_vertical.jpg" : "poster_horizontal.jpg";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Présentation de hdar">
      <div className={"relative overflow-hidden rounded-3xl border border-line bg-night shadow-2xl " + (portrait ? "h-[min(86dvh,calc((100vw-2rem)*16/9))] aspect-[9/16]" : "w-[min(92vw,calc(86dvh*16/9))] aspect-video")}>
        <video ref={ref} key={v} className="size-full object-cover" src={`${BASE}hdar_user_${v}.mp4`} poster={BASE + poster}
          autoPlay muted={muted} playsInline preload="metadata" onEnded={() => { setEnded(true); markSeen(); }} />
        {!ended && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
            <button type="button" onClick={() => { const nm = !muted; setMuted(nm); if (ref.current) { ref.current.muted = nm; void ref.current.play().catch(() => undefined); } }}
              className="flex h-10 items-center gap-1.5 rounded-full bg-black/55 px-3 text-sm font-bold text-white">{muted ? "🔊 Son" : "🔇 Couper"}</button>
            <button type="button" onClick={close} className="h-10 rounded-full bg-black/55 px-4 text-sm font-bold text-white">Passer ›</button>
          </div>
        )}
        {ended && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/85 p-6 text-center">
            <p className="font-display text-2xl font-extrabold text-ink">Prêt·e à rencontrer du monde tout près ?</p>
            {onboarded ? (
              <button type="button" onClick={close} className="h-14 w-full max-w-xs rounded-full bg-signal font-display text-lg font-extrabold text-night">C'est parti</button>
            ) : (
              <button type="button" onClick={() => { close(); useHdar.getState().openGate(); }}
                className="h-16 w-full max-w-xs rounded-full bg-signal font-display text-2xl font-extrabold text-night shadow-lg active:scale-[.98]">Inscris-toi</button>
            )}
            <button type="button" onClick={() => { const r = ref.current; if (r) { r.currentTime = 0; void r.play().catch(() => undefined); } setEnded(false); }} className="text-sm text-muted underline">Revoir</button>
            {!onboarded && <button type="button" onClick={close} className="text-sm text-muted">Plus tard</button>}
          </div>
        )}
      </div>
    </div>
  );
}
