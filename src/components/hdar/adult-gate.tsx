import { AmbassadorsTab, demoAdminAmbs } from "./admin-ambassadors";
import { AmbOnboardPreview, AmbassadorSpace, BecomeAmbCard, demoAmb } from "./ambassador";
import { AmbLanding, ApplyQuiz } from "./amb-landing";
import { RevenueTab } from "./admin-revenue";
import { ProDashboard, demoDash } from "./pro-dashboard";
import { PremiumPage } from "./premium";
import { ProLanding } from "./pro-landing";
import { InviteCard, MapGiftButton, PremiumCard, SurprisePopup } from "./growth";
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
  if (import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("prolanding")) return <div className="min-h-dvh bg-night px-4 text-ink"><ProLanding prices={[]} onCreate={() => undefined} /></div>;
  if (import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("devpreview")) return <DevPreview />;
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
    if (import.meta.env.DEV && location.pathname === "/live" && location.search.includes("demo")) return setState("ok"); // capture d'écran de dev
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
        <p className="text-sm text-muted">Sorties et rencontres autour de toi, pour tout le monde. Gratuit, anonyme, 18+.</p>
        <p className="text-xs text-muted">Sans inscription. Ouvert à toutes et tous, LGBT-friendly 🏳️‍🌈</p>
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

/** Aperçus de dev uniquement (captures d'écran). */
function DevPreview() {
  if (location.search.includes("amblanding")) return <main className="h-dvh overflow-y-auto bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-md"><a href="/" className="text-sm text-muted underline">← Retour</a><AmbLanding status={null} onApply={() => undefined} /></div></main>;
  if (location.search.includes("ambquiz")) return <main className="min-h-dvh bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-md"><ApplyQuiz demo start={Number(new URLSearchParams(location.search).get("step") ?? 0)} onBack={() => undefined} onDone={() => undefined} /></div></main>;
  if (location.search.includes("ambcard")) return <main className="min-h-dvh bg-night px-4 pt-6 text-ink"><p className="font-display text-xl font-extrabold">Profil</p><BecomeAmbCard /></main>;
  if (location.search.includes("ambadmin")) return <main className="min-h-dvh bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-2xl"><p className="mb-3 text-xs text-[#fbbf24]">🧪 Données d'exemple</p><AmbassadorsTab adminKey="" preview={demoAdminAmbs()} /></div></main>;
  if (location.search.includes("ambsign")) return <main className="min-h-dvh bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-md"><h1 className="mb-4 font-display text-3xl font-extrabold">🎯 Espace ambassadeur</h1><AmbOnboardPreview /></div></main>;
  if (location.search.includes("ambspace")) return <main className="min-h-dvh bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-md"><h1 className="mb-4 font-display text-3xl font-extrabold">🎯 Espace ambassadeur</h1><AmbassadorSpace demo={demoAmb()} /></div></main>;
  if (location.search.includes("revenus")) return <main className="min-h-dvh bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-2xl"><RevenueTab adminKey="" preview={{ gross: 0, refunds: 0, fees: 0, net: 0, count: 0, fees_estimated: true, series: [], sources: [], partners: [], spenders: [] }} /></div></main>;
  if (location.search.includes("dash")) return <main className="min-h-dvh bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-2xl"><ProDashboard id="demo" name="Le Néon (démo)" onBack={() => undefined} demo={demoDash()} /></div></main>;
  if (location.search.includes("gift")) return <div className="h-dvh bg-[#1a1a24]"><div className="absolute right-3 bottom-6"><MapGiftButton demoOpen /></div></div>;
  if (location.search.includes("premium")) return <PremiumPage demo={{ admirers: { views: 42, favs: 7, viewers: [], fans: [] } as never, hits: [], premium: true }} />;
  const pin = location.search.includes("pin");
  if (pin) return (
    <div className="relative h-dvh overflow-hidden bg-[#1a1a24]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.05) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.05) 2px, transparent 2px)", backgroundSize: "60px 60px" }}>
      <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: "50%", top: "45%" }}>
        <span className="radar-sweep block size-48" />
        <span className="partner-glow absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#fbbf24] bg-gradient-to-br from-[#FA6F6C] to-[#f472b6]" />
        <span className="absolute top-1/2 left-1/2 mt-7 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#FA6F6C] to-[#fbbf24] px-2 py-0.5 text-[10px] font-extrabold whitespace-nowrap text-night shadow">🚀 Boosté</span>
      </div>
      <span className="partner-glow absolute flex size-[50px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#fbbf24] bg-surface text-xl" style={{ left: "25%", top: "25%" }}>🙂</span>
      <span className="absolute -translate-x-1/2 rounded-full bg-gradient-to-r from-[#FA6F6C] to-[#fbbf24] px-1.5 text-[9px] font-extrabold text-night" style={{ left: "25%", top: "calc(25% + 22px)" }}>🚀</span>
      <span className="absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-surface" style={{ left: "75%", top: "65%" }}>😎</span>
    </div>
  );
  return <div className="min-h-dvh bg-night px-4 pt-6 text-ink"><a href="/boost" className="boost-cta mt-4 mb-3 flex h-14 items-center justify-center rounded-full font-display font-extrabold text-night">✨ Boost actif · 2 h 58</a><PremiumCard /><InviteCard demo="E610477" /></div>;
}
