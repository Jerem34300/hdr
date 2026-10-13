import { SurprisePopup } from "./growth";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RecoverLink } from "./recover";
import {
  TURNSTILE_SITE_KEY,
  adultConfirmed,
  confirmAdult,
  ensureSession,
  hasSession,
  setCaptchaToken,
} from "@/lib/hdar/session";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<Turnstile | null> | null = null;
function loadTurnstile(): Promise<Turnstile | null> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      if (window.turnstile) return resolve(window.turnstile);
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve(window.turnstile ?? null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
      window.setTimeout(() => resolve(window.turnstile ?? null), 10000);
    });
  }
  return scriptPromise;
}

/**
 * One-time 18+ confirmation (remembered on this device) + Cloudflare Turnstile,
 * then silent anonymous sign-in. Shown again (without the 18+ box) only if the
 * device lost its session.
 */
export function AdultGate({ children }: { children: ReactNode }) {
  if (import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("reveal=")) return <SurprisePopup />;
  return <AdultGateInner>{children}</AdultGateInner>;
}
function AdultGateInner({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ask" | "ok">("loading");
  const [adult, setAdult] = useState(false);
  const [checked, setChecked] = useState(false);
  const [token, setToken] = useState("");
  const [widgetFailed, setWidgetFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    const isAdult = adultConfirmed();
    setAdult(isAdult);
    if (!isAdult) return setState("ask");
    void hasSession()
      .then((ok) => {
        if (ok) {
          setState("ok");
          void ensureSession().catch(() => undefined);
        } else setState("ask");
      })
      .catch(() => setState("ask"));
  }, []);

  useEffect(() => {
    if (state !== "ask") return;
    let alive = true;
    void loadTurnstile().then((ts) => {
      if (!alive) return;
      if (!ts || !box.current) return setWidgetFailed(true);
      try {
        widget.current = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          language: "fr",
          callback: (t: string) => {
            setToken(t);
            setError("");
          },
          "expired-callback": () => setToken(""),
          "error-callback": () => {
            setToken("");
            setError("Vérification anti-robot échouée, réessaie.");
          },
        });
      } catch {
        setWidgetFailed(true);
      }
    });
    // Fallback only if the widget never loaded at all (script blocked/unreachable).
    const t = window.setTimeout(() => alive && !widget.current && setWidgetFailed(true), 15000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [state]);

  if (state === "ok") return <>{children}</>;
  if (state === "loading") return null;
  const needsAdult = !adult;
  const ready = (!needsAdult || checked) && (token || widgetFailed) && !busy;

  return (
    <main className="grid min-h-screen place-items-center bg-night p-6 text-ink">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (needsAdult && !checked) return setError("Hdar est réservé aux 18 ans et plus.");
          if (!token && !widgetFailed) return setError("Patiente une seconde, vérification anti-robot…");
          setBusy(true);
          setError("");
          setCaptchaToken(token || undefined);
          if (needsAdult) confirmAdult();
          ensureSession()
            .then(() => setState("ok"))
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Connexion impossible, réessaie");
              setToken("");
              if (widget.current) window.turnstile?.reset(widget.current);
            })
            .finally(() => setBusy(false));
        }}
      >
        <h1 className="font-display text-3xl font-extrabold">hdar.</h1>
        <p className="text-sm text-muted">Anonyme, sans inscription. Réservé aux adultes.</p>
        {needsAdult && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            J'ai 18 ans ou plus
          </label>
        )}
        <div ref={box} className="min-h-[65px]" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={!ready} className="h-12 w-full rounded-full bg-signal text-night disabled:opacity-40">
          {busy ? "Connexion…" : "Entrer"}
        </button>
        <RecoverLink captchaToken={token || undefined} onUsed={() => { setToken(""); if (widget.current) window.turnstile?.reset(widget.current); }} />
        <p className="text-center text-xs text-muted">
          En entrant, tu acceptes les <a className="underline" href="/cgu">conditions d'utilisation</a> et la{" "}
          <a className="underline" href="/confidentialite">politique de confidentialité</a>.
        </p>
      </form>
    </main>
  );
}
