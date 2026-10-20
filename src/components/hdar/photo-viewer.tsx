import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

let live = 0; // instances montées (StrictMode monte/démonte deux fois en dev)

/** Visionneuse plein écran : fond noir, swipe entre photos (scroll-snap), pinch-zoom, × / bouton retour pour fermer. */
export function PhotoViewer({ urls, start = 0, onClose }: { urls: string[]; start?: number; onClose: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Bouton retour du téléphone : ferme la visionneuse au lieu de quitter l'écran.
  useEffect(() => {
    live++;
    if (!window.history.state?.hdarViewer) window.history.pushState({ ...window.history.state, hdarViewer: true }, "");
    let popped = false;
    const onPop = () => { popped = true; closeRef.current(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") window.history.back(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      live--;
      window.setTimeout(() => { if (live === 0 && !popped && window.history.state?.hdarViewer) window.history.back(); }, 0);
    };
  }, []);
  useEffect(() => { const el = strip.current; if (el) el.scrollLeft = start * el.clientWidth; }, [start]);

  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) pinch.current = { d: dist(e.touches), s: zoom.s };
    else if (zoom.s > 1) pan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: zoom.x, oy: zoom.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pinch.current && e.touches.length === 2) {
      const s = Math.min(4, Math.max(1, pinch.current.s * (dist(e.touches) / pinch.current.d)));
      setZoom((z) => (s === 1 ? { s: 1, x: 0, y: 0 } : { ...z, s }));
    } else if (pan.current && e.touches.length === 1) {
      const p = pan.current;
      setZoom((z) => ({ ...z, x: p.ox + e.touches[0].clientX - p.x, y: p.oy + e.touches[0].clientY - p.y }));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => { if (e.touches.length < 2) pinch.current = null; if (e.touches.length === 0) pan.current = null; };
  const toggleZoom = () => setZoom((z) => (z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
  const zoomed = zoom.s > 1;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Photos de l'annonce">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-4">
        <span className="px-2 text-sm font-semibold tabular-nums">{urls.length > 1 ? `${i + 1} / ${urls.length}` : ""}</span>
        <button type="button" aria-label="Fermer" onClick={() => window.history.back()} className="grid size-11 place-items-center rounded-full bg-white/15"><X className="size-6" /></button>
      </div>
      <div
        ref={strip}
        className={`flex flex-1 snap-x snap-mandatory ${zoomed ? "overflow-hidden" : "overflow-x-auto"} [scrollbar-width:none]`}
        style={{ touchAction: zoomed ? "none" : "pan-x" }}
        onScroll={(e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / el.clientWidth); if (n !== i) { setI(n); setZoom({ s: 1, x: 0, y: 0 }); } }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        {urls.map((u, k) => (
          <div key={u + k} className="grid h-full w-full shrink-0 snap-center place-items-center overflow-hidden">
            {u ? <img src={u} alt={`Photo ${k + 1}`} draggable={false} onDoubleClick={toggleZoom}
              className="max-h-full max-w-full object-contain select-none transition-transform duration-75"
              style={k === i ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` } : undefined} />
              : <span className="text-sm text-white/60">Chargement…</span>}
          </div>
        ))}
      </div>
      {urls.length > 1 && (
        <div className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),1rem)] flex justify-center gap-1.5">
          {urls.map((_, k) => <span key={k} className={`size-2 rounded-full ${k === i ? "bg-white" : "bg-white/35"}`} />)}
        </div>
      )}
    </div>,
    document.body,
  );
}
