import { useState } from "react";
import { createPortal } from "react-dom";
import { Car, Compass, Map as MapIcon, Navigation, X } from "lucide-react";

type App = { id: "google" | "apple" | "waze"; name: string; hint: string; Icon: typeof MapIcon; href: (lat: number, lng: number) => string };
const APPS: App[] = [
  { id: "google", name: "Google Maps", hint: "Itinéraire", Icon: MapIcon, href: (a, b) => `https://www.google.com/maps/dir/?api=1&destination=${a},${b}` },
  { id: "apple", name: "Plans (Apple)", hint: "Itinéraire", Icon: Compass, href: (a, b) => `https://maps.apple.com/?daddr=${a},${b}` },
  { id: "waze", name: "Waze", hint: "Itinéraire en voiture", Icon: Car, href: (a, b) => `https://www.waze.com/ul?ll=${a},${b}&navigate=yes` },
];

/** Ordre selon l'appareil : Plans d'abord sur iPhone/iPad/Mac, Google Maps d'abord ailleurs (Android…). */
export function goApps(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): App[] {
  const apple = /iPhone|iPad|iPod|Macintosh/.test(ua);
  return apple ? [APPS[1]!, APPS[0]!, APPS[2]!] : APPS;
}

/** Bouton « Y aller » + petite feuille de choix d'appli d'itinéraire (coordonnées arrondies à 6 décimales). */
export function GoButton({ lat, lng, className, label = "Y aller" }: { lat: number; lng: number; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const a = lat.toFixed(6), b = lng.toFixed(6);
  return (
    <>
      <button type="button" data-act="go" onClick={() => setOpen(true)} className={className ?? "mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-signal"}>
        <Navigation className="size-4 shrink-0" aria-hidden />
        <span>{label}</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60" onClick={() => setOpen(false)} data-act="go-sheet">
          <div className="w-full max-w-md rounded-t-3xl border-t border-line bg-surface px-4 pt-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold">Y aller</h3>
              <button type="button" aria-label="Fermer" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full bg-white/5"><X className="size-4" /></button>
            </div>
            <p className="mt-0.5 text-xs text-muted">Choisis ton appli pour l'itinéraire</p>
            <ul className="mt-3 space-y-2">
              {goApps().map(({ id, name, hint, Icon, href }) => (
                <li key={id}>
                  <a href={href(Number(a), Number(b))} target="_blank" rel="noopener noreferrer" data-app={id} onClick={() => setOpen(false)}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-4 py-2 active:bg-white/5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 ring-1 ring-line"><Icon className="size-4" strokeWidth={2} aria-hidden /></span>
                    <span className="min-w-0"><span className="block font-semibold">{name}</span><span className="block text-xs text-muted">{hint}</span></span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
