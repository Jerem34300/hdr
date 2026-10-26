import { BOT_DEFAULTS } from "./bot-demo";
import { LiveChat } from "./live-chat";
import { BotTab } from "./admin-bot";
import { BOT_ID } from "@/lib/hdar/live";
import { ProfileView } from "./profile-view";
import { FilterSheet } from "./premium";
import { GENDERS, identityLine } from "@/lib/hdar/live";
import { Toaster } from "sonner";
import { LeaveConfirm } from "./rich-text";
import { toast } from "sonner";
import { ConfirmSheet } from "./confirm-sheet";
import { useHdar } from "@/lib/hdar/store";
import { Around } from "./around";
import { Annonces, demoAds } from "./annonces";
import { regionFromPos, teaserAds, type TeaserAd } from "@/lib/hdar/ads";
import { AdsTab } from "./admin";
import { ProSpaceCard } from "./pro-tools";
import { AmbassadorsTab, demoAdminAmbs } from "./admin-ambassadors";
import { AmbOnboardPreview, AmbassadorSpace, BecomeAmbCard, demoAmb } from "./ambassador";
import { AmbLanding, ApplyQuiz } from "./amb-landing";
import { RevenueTab } from "./admin-revenue";
import { ProDashboard, demoDash } from "./pro-dashboard";
import { PremiumPage } from "./premium";
import { ProLanding } from "./pro-landing";
import { InviteCard, MapGiftButton, PremiumCard, SurprisePopup } from "./growth";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RecoverAccountSettings, RecoverLink } from "./recover";
import { LockScreen, LogoutButton, PinGate, PinSettings } from "./security";
import "@/lib/hdar/appearance";
import { AppearanceScreen } from "./appearance";
import { GroupChatDemo } from "./group-chat";
import { LiveChatDemo } from "./live-chat";
import { RefLinksDemo } from "./admin-ref-links";
import { SalonInboxRow } from "./salons";
import { trackGate } from "@/lib/hdar/track";
import { GateTeaser } from "./gate-teaser";
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
export function loadTurnstile(): Promise<Turnstile | null> {
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
  if (import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("adsdemo=")) return <AdsDemo />;
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
  const [teaser, setTeaser] = useState<{ city: string | null; near: number; total: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV && location.pathname === "/live" && location.search.includes("demo")) return setState("ok"); // capture d'écran de dev
    if (import.meta.env.DEV && location.search.includes("profiltab")) return setState("ok"); // capture d'écran de dev
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
    trackGate("gate_view");
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

  if (state === "ok") return <PinGate>{children}</PinGate>;
  if (state === "loading") return null;
  const needsAdult = !adult;
  const ready = (!needsAdult || checked) && (token || widgetFailed) && !busy;

  return (
    <main className="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-night text-ink sm:items-center sm:justify-center">
      <GateAdTicker onPick={(id) => {
        try { sessionStorage.setItem(PENDING_AD, id); } catch { /* privé */ }
        setError(needsAdult && !checked ? "Confirme que tu as 18 ans pour ouvrir l'annonce 👇" : "Touche Entrer pour ouvrir l'annonce 👇");
      }} />
      <GateTeaser onCity={(city, r) => setTeaser({ city, near: r?.near ?? 0, total: r?.total ?? 0 })} />
      <div className="relative z-10 px-6 pt-10 text-center sm:hidden" aria-live="polite">
        {teaser && (
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-night/85 px-4 py-2 text-sm font-bold shadow-lg">
            <span className="size-2 animate-pulse rounded-full bg-[#3EE08F]" />
            {teaser.near > 0
              ? `${teaser.near} ${teaser.near > 1 ? "personnes actives" : "personne active"} ces dernières 24 h${teaser.city ? ` près de ${teaser.city}` : ""}`
              : teaser.total > 0
                ? `${teaser.total} personnes actives ces dernières 24 h en France`
                : `Sois parmi les premiers${teaser.city ? ` à ${teaser.city}` : ""}`}
          </p>
        )}
      </div>
      <div className="flex-1 sm:hidden" />
      <form
        className="relative z-10 w-full space-y-4 rounded-t-[2rem] border-t border-line bg-night/90 p-6 pb-8 backdrop-blur-md sm:max-w-sm sm:rounded-[2rem] sm:border"
        onSubmit={(e) => {
          e.preventDefault();
          if (needsAdult && !checked) return setError("Hdar est réservé aux 18 ans et plus.");
          if (!token && !widgetFailed) return setError("Patiente une seconde, vérification anti-robot…");
          setBusy(true);
          setError("");
          setCaptchaToken(token || undefined);
          if (needsAdult) confirmAdult();
          ensureSession()
            .then(() => {
              trackGate("gate_enter");
              try {
                const ad = sessionStorage.getItem(PENDING_AD);
                if (ad) { sessionStorage.removeItem(PENDING_AD); useHdar.getState().openAnnonces(ad); }
              } catch { /* privé */ }
              setState("ok");
            })
            .catch((err: unknown) => {
              trackGate("gate_error");
              setError(err instanceof Error ? err.message : "Connexion impossible, réessaie");
              setToken("");
              if (widget.current) window.turnstile?.reset(widget.current);
            })
            .finally(() => setBusy(false));
        }}
      >
        <h1 className="font-display text-3xl font-extrabold">hdar.</h1>
        <p className="text-sm text-muted">Sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, 18+.</p>
        <p className="text-xs text-muted">Sans inscription. Ouvert à toutes et tous, LGBT-friendly 🏳️‍🌈</p>
        <ul className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted">
          <li className="rounded-2xl border border-line px-2 py-2">🗺️<br />Qui est là</li>
          <li className="rounded-2xl border border-line px-2 py-2">💬<br />Chat du quartier</li>
          <li className="rounded-2xl border border-line px-2 py-2">🎥<br />Live vidéo</li>
        </ul>
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
  if (location.search.includes("groupchat")) return <><GroupChatDemo /><LeaveConfirm /><Toaster theme="dark" position="top-center" /></>;
  if (location.search.includes("dmchat")) return <><LiveChatDemo /><LeaveConfirm /></>;
  if (location.search.includes("reflinks")) return <RefLinksDemo />;
  if (location.search.includes("mapfilters")) return <main className="h-dvh bg-night"><FilterSheet onClose={() => undefined} /></main>;
  if (location.search.includes("genres")) return <GenresDemo />;
  if (location.search.includes("botadmin")) return <main className="min-h-dvh bg-night px-4 py-5 text-ink"><p className="mb-3 font-display text-xl font-extrabold">Admin · Robot d'accueil</p><BotTab adminKey="demo" demo={{ enabled: true, dm_text: BOT_DEMO_DM, salon_text: "Bienvenue à {mentions} 👋 Faites-leur bon accueil !", reply_text: BOT_DEMO_REPLY, ...BOT_DEFAULTS, nudge_on: true, question_on: true, rules_on: true, tip_on: true, updated_at: new Date().toISOString(), welcomed: 128, pending: 2, salon: "Général", opted_out: 9 }} demoAnnounce={location.search.includes("annonce") ? { text: "Nouveau : choisis la couleur de tes bulles dans Profil → Apparence 🎨", target: "both", count: 1284 } : undefined} /><Toaster theme="dark" position="top-center" /></main>;
  if (location.search.includes("bulles")) {
    const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const B = ["Salut", "Ok", "Oui 👍", "Salut", "Ça va ?", "Top", "Regarde : https://www.example.com/une/adresse/vraiment/tres/longue/sans/aucun/espace?ref=hdar&utm_source=partage", "Un message un peu plus long pour vérifier que les retours à la ligne se font entre les mots et jamais au milieu."];
    const demo = B.map((body, i) => ({ id: `b${i}`, mine: i % 2 === 0, body, at: t(20 - i), kind: "text" as const, duration: null }));
    return <main className="flex h-dvh flex-col bg-night text-ink"><LiveChat userId="v539" pseudo="Discret 539" demo={demo} /></main>;
  }
  if (location.search.includes("dmdiscret")) {
    const asD = location.search.includes("asdiscret"), t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const demo = [
      { id: "m1", mine: !asD, body: "Salut ! Je t'ai vu dans la liste en ligne, tu es du coin ? 🙂", at: t(6), kind: "text" as const, duration: null },
      { id: "m2", mine: !asD, body: "Si tu crées ton profil on pourra discuter, c'est gratuit et discret.", at: t(5), kind: "text" as const, duration: null },
    ];
    return <main className="flex h-dvh flex-col bg-night text-ink"><LiveChat userId={asD ? "d1" : "v417"} pseudo={asD ? "Nina" : "Discret 417"} demo={demo} /></main>;
  }
  if (location.search.includes("botdm")) return <main className="flex h-dvh flex-col bg-night text-ink"><LiveChat userId={BOT_ID} pseudo="hdar" demo={location.search.includes("nudge") ? [{ id: "b1", mine: false, body: BOT_DEMO_DM.replace("{pseudo}", "Jeteken"), at: new Date(Date.now() - 4 * 86400_000).toISOString(), kind: "text", duration: null }, { id: "b2", mine: false, body: BOT_DEFAULTS.nudge1_text.replace("{pseudo}", "Jeteken"), at: new Date(Date.now() - 60_000).toISOString(), kind: "text", duration: null }] : [{ id: "b1", mine: false, body: BOT_DEMO_DM.replace("{pseudo}", "Jeteken"), at: new Date(Date.now() - 60_000).toISOString(), kind: "text", duration: null }]} /></main>;
  if (location.search.includes("profilview")) {
    const photo = location.search.includes("nophoto") ? "" : "/avatars/03.jpg";
    return <main className="flex h-dvh flex-col bg-night text-ink"><ProfileView userId="demo-p" pseudo="Soumisdu59" demo={{ id: "demo-p", pseudo: "Soumisdu59", age: 53, bio: "Curieux et bienveillant, j'aime les soirées qui finissent tard. Discrétion assurée 😉", tags: ["plan", "verre", "balade"], desires: ["plan", "dehors", "chez-toi"], photo, online: true, lat: null, lng: null, note: "Dispo ce soir vers Lille centre", premium: true, iam: "h", seeking: ["f", "c"] }} /></main>;
  }
  if (location.search.includes("appearance")) return <main className="flex h-dvh flex-col bg-night text-ink"><AppearanceScreen onBack={() => undefined} /></main>;
  if (location.search.includes("lockscreen")) return <LockScreen demoEmail={location.search.includes("noemail") ? null : "ton@email.fr"} onUnlock={() => toast("Déverrouillé")} />;
  if (location.search.includes("security")) return <main className="min-h-dvh bg-night px-4 pt-6 pb-10 text-ink"><h1 className="font-display text-3xl font-extrabold">Paramètres</h1><PinSettings /><section className="mt-8 border-t border-line pt-6"><LogoutButton demoEmail={location.search.includes("noemail") ? null : "ton@email.fr"} onProtect={() => toast("→ Protège ton profil")} /><RecoverAccountSettings /></section><ConfirmSheet /></main>;
  if (location.search.includes("recoversettings")) return <main className="min-h-dvh bg-night px-4 pt-6 text-ink"><h1 className="mb-4 font-display text-3xl font-extrabold">Paramètres</h1><RecoverAccountSettings /></main>;
  if (location.search.includes("salonrows")) {
    const iso = (m: number) => new Date(Date.now() - m * 60000).toISOString();
    const base = { description: null, official: true, mine: false, last_at: iso(2), recent: 12, people: 4 };
    return (
      <main className="min-h-dvh bg-night px-4 pt-6 text-ink">
        <ul className="space-y-2">
          <SalonInboxRow editing={false} s={{ ...base, id: "a", name: "Occitanie", emoji: "☀️", unread: 5, replies: 1, last: { pseudo: "Lucas34", body: "On se retrouve où ?", at: iso(2), mine: false } }} />
          <SalonInboxRow editing={false} s={{ ...base, id: "b", name: "LGBT+", emoji: "🏳️‍🌈", unread: 0, replies: 0, last: { pseudo: "Toi", body: "📷 Photo", at: iso(95), mine: true } }} />
        </ul>
      </main>
    );
  }
  if (location.search.includes("amblanding")) return <main className="h-dvh overflow-y-auto bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-md"><a href="/" className="text-sm text-muted underline">← Retour</a><AmbLanding status={null} onApply={() => undefined} /></div></main>;
  if (location.search.includes("ambquiz")) return <main className="min-h-dvh bg-night px-5 py-6 text-ink"><div className="mx-auto max-w-md"><ApplyQuiz demo start={Number(new URLSearchParams(location.search).get("step") ?? 0)} onBack={() => undefined} onDone={() => undefined} /></div></main>;
  if (location.search.includes("profilcards")) return <main className="min-h-dvh bg-night px-4 pt-6 text-ink"><p className="font-display text-xl font-extrabold">Profil (aperçu cartes)</p><ProSpaceCard demo /><PremiumCard /><InviteCard demo="X7K2Q9" /><a className="mt-6 block px-1 text-center text-[13px] text-muted">💸 Gagne de l'argent : <span className="font-bold text-[#3EE08F]">deviens ambassadeur ›</span></a></main>;
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

function AdsDemo() {
  const mode = new URLSearchParams(location.search).get("adsdemo");
  const ads = demoAds();
  if (mode === "map") return <main className="flex h-dvh flex-col bg-night text-ink"><Around demoTicker={ads} /><Toaster theme="dark" position="top-center" /></main>;
  if (mode === "admin") {
    const rows = ads.map((a, i) => ({ ...a, status: (i === 2 ? "hidden" : "active") as "active" | "hidden", replies: [4, 1, 0][i], reports: [0, 0, 3][i], open_reports: [0, 0, 3][i], reasons: i === 2 ? ["Spam", "Arnaque ou argent", "Autre"] : null, hidden: i === 2 }));
    return <main className="min-h-dvh bg-night px-4 py-5 text-ink"><p className="mb-3 font-display text-xl font-extrabold">Admin · Annonces <span className="text-xs text-[#fbbf24]">🧪 exemple</span></p><AdsTab adminKey="" onOpen={() => undefined} preview={rows} /></main>;
  }
  return <main className="flex h-dvh flex-col bg-night text-ink"><Annonces demo={ads} demoCreate={mode === "create"} demoAlerts={mode === "alerts" ? "sheet" : mode === "alertlist" ? "list" : undefined} /></main>;
}

const PENDING_AD = "hdar-gate-ad";
/** Bandeau des annonces sur l'écran 18+ : chargé après affichage (jamais dans le HTML serveur), titres + ville seulement. */
function GateAdTicker({ onPick }: { onPick: (id: string) => void }) {
  const [ads, setAds] = useState<TeaserAd[]>([]);
  useEffect(() => {
    let alive = true;
    if (import.meta.env.DEV && location.search.includes("tickerdemo")) {
      setAds(demoAds().map((a) => ({ id: a.id, title: a.title, city: a.city, boosted: !!a.boost_scope, has_photos: a.photos.length > 0 })).filter((a) => !/kink/i.test(a.title)));
      return;
    }
    const t = window.setTimeout(() => {
      void fetch("/api/geo", { cache: "no-store" }).then((r) => r.json() as Promise<{ lat: number | null; lng: number | null }>)
        .then((g) => (g.lat != null && g.lng != null ? regionFromPos(g.lat, g.lng) : ""))
        .catch(() => "")
        .then((region) => teaserAds(region))
        .then((r) => alive && setAds(r))
        .catch(() => undefined);
    }, 800);
    return () => { alive = false; window.clearTimeout(t); };
  }, []);
  if (!ads.length) return null;
  const row = (k: string) => ads.map((a) => (
    <button key={k + a.id} type="button" tabIndex={k === "b" ? -1 : 0} aria-hidden={k === "b" || undefined} onClick={() => onPick(a.id)} className="mx-3 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      {a.boosted && <span className="rounded-full bg-[#fbbf24] px-1.5 text-[10px] font-bold text-night">Boostée</span>}
      <span>📌 {a.title}{a.has_photos ? <span className="ml-1 opacity-80" role="img" aria-label="avec photos" title="Avec photos">📷</span> : null}</span><span className="text-muted">· {a.city}</span>
    </button>
  ));
  return (
    <div className="ad-ticker absolute inset-x-0 top-0 z-20 flex h-9 items-center overflow-hidden border-b border-line bg-night/90 text-xs backdrop-blur" role="region" aria-label="Petites annonces du moment">
      <span className="z-10 flex h-full shrink-0 items-center bg-signal px-2 text-[11px] font-extrabold tracking-wide text-night uppercase">Annonces</span>
      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
        <div className="ad-ticker-track flex w-max" style={{ ["--ticker-dur" as string]: `${Math.max(20, ads.length * 7)}s` }}>{row("a")}{row("b")}</div>
      </div>
    </div>
  );
}

/** Aperçu de dev : Je suis / Je cherche avec « Couple », et la ligne affichée sur la fiche. */
function GenresDemo() {
  const [iam, setIam] = useState("c");
  const [seeking, setSeeking] = useState<string[]>(["f", "c"]);
  const chip = (on: boolean) => "h-9 rounded-full border px-3 text-sm " + (on ? "border-transparent bg-ink font-bold text-night" : "border-line");
  return (
    <main className="min-h-dvh bg-night px-4 pt-6 text-ink">
      <h2 className="font-display text-lg font-bold">Je suis</h2>
      <div className="mt-2 flex flex-wrap gap-2">{GENDERS.map((g) => <button key={g.id} type="button" onClick={() => setIam(iam === g.id ? "" : g.id)} className={chip(iam === g.id)}>{g.label}</button>)}</div>
      <h2 className="mt-4 font-display text-lg font-bold">Je cherche</h2>
      <div className="mt-2 flex flex-wrap gap-2">{GENDERS.map((g) => <button key={g.id} type="button" onClick={() => setSeeking(seeking.includes(g.id) ? seeking.filter((x) => x !== g.id) : [...seeking, g.id])} className={chip(seeking.includes(g.id))}>{g.label}</button>)}</div>
      <p className="mt-8 text-xs text-muted">Sur la fiche :</p>
      <div className="mt-2 rounded-3xl bg-surface p-5">
        <p className="font-display text-2xl font-extrabold">Léa&Max, 31</p>
        <p className="mt-1 text-sm font-bold text-ink/90">{identityLine(iam, seeking)}</p>
      </div>
    </main>
  );
}

const BOT_DEMO_DM = `Bienvenue sur hdar, {pseudo} ! 🎉
Ravi de te compter parmi nous. L'essentiel pour bien démarrer :

🗺️ La carte : vois qui est dispo autour de toi, en restant discret (ta position est toujours approximative).
💬 Les salons et le Chat du quartier : discute avec ta région ou ton coin.
🎥 Le Live : des rencontres en vidéo, caméra floutée tant que tu veux.
👤 Ton profil : une photo et tes envies, et tu es bien plus visible.
🎨 Apparence : la couleur de tes bulles, la police, le fond.
🔒 Discrétion : active un code PIN et protège ton profil avec ton email (Paramètres).

Les règles sont simples : 18 ans et plus, respect et consentement toujours. Un souci ? Appui long sur un message ou « Signaler » sur un profil, l'équipe s'en occupe.

Toutes les réponses sont ici : hdar.chat/faq
Belle découverte ! 💜 L'équipe hdar

(Je suis le robot d'accueil : je ne lis pas les réponses.)`;
const BOT_DEMO_REPLY = "Je suis le robot d'accueil de hdar 🤖 : je ne peux pas lire ta réponse. La plupart des questions trouvent leur réponse ici : hdar.chat/faq — et pour écrire à l'équipe, c'est par ici : hdar.chat/contact";
