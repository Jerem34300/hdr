import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { Mark } from "./logo";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "hdar-install-dismissed";
const WEEK = 7 * 24 * 3600 * 1000;
let deferred: BIPEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    localStorage.setItem(KEY, String(Date.now() + 10 * 365 * 24 * 3600 * 1000));
  });
}

function standalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}
function recentlyDismissed() {
  const t = Number(localStorage.getItem(KEY) || 0);
  return t > 0 && Date.now() - t < WEEK;
}

/** "Install the app" popup after entering (never on the 18+ screen). Re-shown at most once a week. */
export function InstallPrompt() {
  const [mode, setMode] = useState<"none" | "android" | "ios">("none");
  useEffect(() => {
    if (standalone() || recentlyDismissed()) return;
    const t = window.setTimeout(() => {
      if (standalone() || recentlyDismissed()) return;
      if (deferred) setMode("android");
      else if (isIos()) setMode("ios");
    }, 45000);
    return () => window.clearTimeout(t);
  }, []);
  if (mode === "none") return null;
  const dismiss = () => {
    localStorage.setItem(KEY, String(Date.now()));
    setMode("none");
  };
  return (
    <>
      <div
        className="hdar-fade fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-label="Installer hdar"
        className="hdar-sheet-up fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-[2rem] border border-b-0 border-line bg-gradient-to-b from-surface to-night p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,.6)]"
      >
        <span className="mx-auto mb-4 block h-1.5 w-10 rounded-full bg-line" />
        <button
          type="button"
          aria-label="Fermer"
          className="absolute top-2 right-2 flex size-10 items-center justify-center"
          onClick={dismiss}
        >
          <X className="size-5" />
        </button>
        <div className="flex items-center gap-4 pr-8">
          <img
            src="/icon-192.png"
            alt=""
            className="size-16 shrink-0 rounded-[1.1rem] shadow-lg ring-1 ring-white/10"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-display text-xl font-extrabold">
              <Mark className="size-5" /> hdar.
            </p>
            <p className="text-sm text-muted">
              Discrets, tout près. Installe l'appli : plein écran, ouverture en un geste,
              notifications.
            </p>
          </div>
        </div>
        {mode === "android" ? (
          <button
            type="button"
            className="mt-5 h-12 w-full rounded-full bg-signal font-display text-base font-bold text-night active:scale-[.98]"
            onClick={() => {
              const ev = deferred;
              if (!ev) return dismiss();
              void ev
                .prompt()
                .then(() => ev.userChoice)
                .finally(() => {
                  deferred = null;
                  dismiss();
                });
            }}
          >
            Installer hdar
          </button>
        ) : (
          <ol className="mt-5 space-y-2 text-sm">
            <li className="flex items-center gap-3 rounded-2xl bg-night px-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal font-bold text-night">
                1
              </span>
              <span className="flex items-center gap-1">
                Touche <Share className="mx-1 size-5 text-sky-400" /> <strong>Partager</strong> en
                bas de Safari
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl bg-night px-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal font-bold text-night">
                2
              </span>
              <span className="flex items-center gap-1">
                Puis <SquarePlus className="mx-1 size-5" /> <strong>Sur l'écran d'accueil</strong>
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl bg-night px-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal font-bold text-night">
                3
              </span>
              <span>
                Touche <strong>Ajouter</strong>, c'est fait.
              </span>
            </li>
          </ol>
        )}
        <button type="button" className="mt-3 h-10 w-full text-sm text-muted" onClick={dismiss}>
          Plus tard
        </button>
      </div>
    </>
  );
}
