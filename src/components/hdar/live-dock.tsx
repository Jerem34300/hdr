import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Minimize2, PictureInPicture2, X } from "lucide-react";
import { FloatingWindow } from "./floating-window";
import { useLiveDock } from "@/lib/hdar/live-dock";
import { RouletteScreen } from "./roulette";

/** Bouton « Réduire » du Live : la vidéo se replie en vignette, on retrouve la carte, rien n'est coupé. */
export function LiveMinimizeButton() {
  const nav = useNavigate();
  return (
    <button type="button" data-testid="live-min" aria-label="Réduire le Live" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
      onClick={() => { useLiveDock.getState().setMin(true); if (location.pathname === "/live") void nav({ to: "/" }); }}
      className="flex size-9 items-center justify-center rounded-full bg-black/50 backdrop-blur"><Minimize2 className="size-4" /></button>
  );
}

/**
 * Hôte unique du Live. Plein écran : le Live s'affiche normalement. Réduit : le même arbre est mis à l'échelle dans une
 * vignette déplaçable (transform → les éléments « fixed » du Live restent dans la vignette). Un calque capte les gestes :
 * toucher = rouvrir, glisser = déplacer ; croix = quitter le Live.
 */
export function LiveDock() {
  const { open, min, search } = useLiveDock();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [vp, setVp] = useState({ w: 412, h: 915 });
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f);
  }, []);
  // retour sur /live (lien, bouton Live) alors que le Live est réduit : on le rouvre en plein écran
  useEffect(() => { if (open && min && path === "/live") useLiveDock.getState().setMin(false); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const ratio = vp.h / vp.w;
  const q = new URLSearchParams(search);
  const demo = import.meta.env.DEV && q.has("demo") ? {
    peer: { id: "demo", pseudo: "Theo_31", age: 27, iam: "H", seeking: "H,X", note: "Chill, on papote", premium: true, role: "answer" as const },
    premium: q.has("prem"), unblurred: q.has("clear"), online: 38 } : undefined;
  const quit = () => {
    // l'arrêt propre (raccrocher, quitter le salon) est fait par le démontage du Live
    useLiveDock.getState().close();
    if (location.pathname === "/live") void nav({ to: "/" });
  };
  const pip = async () => {
    const v = [...document.querySelectorAll<HTMLVideoElement>("[data-live-host] video")].filter((x) => x.videoWidth > 0).sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0];
    try { if (v && document.pictureInPictureEnabled) await v.requestPictureInPicture(); } catch { /* non pris en charge */ }
  };
  const live = (scale: number | null) => (
    <div style={scale ? { width: vp.w, height: vp.h, transform: "scale(var(--fw-scale))", transformOrigin: "0 0" } : { width: "100%", height: "100%", transform: "translateZ(0)" }} className="relative" inert={scale ? true : undefined}>
      <RouletteScreen demo={demo} pro={q.get("pro") ?? undefined} />
    </div>
  );
  const reopen = () => useLiveDock.getState().setMin(false); // on reste sur la page en cours : la carte ne se démonte pas
  return (
    <div data-live-host data-min={min ? "1" : "0"}>
      <FloatingWindow id="live" testid="live-mini" active={min} ratio={ratio} defaultW={132} onTap={reopen}
        overlay={<>
          <span className="pointer-events-none absolute start-2 top-2 flex items-center gap-1 rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[9px] font-bold text-night backdrop-blur"><span className="fw-live-dot size-1.5 rounded-full bg-night" />LIVE</span>
          <button type="button" data-testid="live-mini-close" aria-label="Quitter le Live" onClick={quit} className="absolute end-1.5 top-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/15 backdrop-blur-md"><X className="size-4" /></button>
          {typeof document !== "undefined" && document.pictureInPictureEnabled && <button type="button" aria-label="Image dans l'image" onClick={() => void pip()} className="absolute start-1.5 bottom-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/15 backdrop-blur-md"><PictureInPicture2 className="size-3.5" /></button>}
        </>}>
        {(w) => live(min ? w / vp.w : null)}
      </FloatingWindow>
    </div>
  );
}
