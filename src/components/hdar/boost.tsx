import { PAYMENTS_ENABLED } from "@/lib/hdar/payments";
import { locale } from "@/lib/hdar/i18n";
import { useEffect, useState } from "react";
import { ShinyCta } from "./hearts";
import { checkoutWithWaiver } from "@/lib/hdar/consent";
import { WaiverCheckbox } from "@/components/hdar/waiver";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { myBoosts, mySpots, paymentsEnabled, pricing, type MyBoost, type MySpot, type PriceRow } from "@/lib/hdar/live";
import { deviceId } from "@/lib/hdar/device";
import { useHdar } from "@/lib/hdar/store";
import { PinFace } from "./map-view";
import { Wordmark } from "./logo";

const CORAL = "#FA6F6C";
const MINT = "#A1E3C3";
const euros = (c: number) => (c / 100).toLocaleString(locale(), { style: "currency", currency: "EUR" });

export function fmtLeft(ms: number) {
  if (ms <= 0) return "terminé";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d} j ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, "0")}`;
  return `${m} min ${String(s % 60).padStart(2, "0")} s`;
}
export function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
/** Boost actif de l'utilisateur (null si aucun / pas de profil). */
export function useActiveBoost() {
  const [b, setB] = useState<MyBoost | null>(null);
  useEffect(() => void myBoosts().then((r) => setB(r.find((x) => x.active) ?? null)).catch(() => undefined), []);
  return b;
}

export function Bokeh() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute -top-16 -start-10 size-56 rounded-full opacity-40 blur-3xl" style={{ background: CORAL }} />
      <span className="absolute top-40 -end-16 size-64 rounded-full opacity-25 blur-3xl" style={{ background: MINT }} />
      <span className="absolute top-[38rem] start-1/4 size-48 rounded-full opacity-20 blur-3xl" style={{ background: "#f472b6" }} />
    </div>
  );
}

/** Le vrai pin de l'appli (même classes que map-view), boosté ou non. */
function Pin({ boosted, size = 52 }: { boosted: boolean; size?: number }) {
  const me = useHdar((s) => s.me);
  return (
    <span
      className={"relative block overflow-hidden rounded-full border-2 border-white bg-surface " + (boosted ? "partner-glow" : "")}
      style={{ width: size, height: size }}
    >
      <PinFace id={deviceId()} pseudo={me.pseudo || "Toi"} />
    </span>
  );
}

function Tiles() {
  const z = 15, x0 = 16736, y0 = 11956;
  return (
    <div className="absolute" style={{ left: -150, top: -230, width: 768, height: 768 }}>
      {[0, 1, 2].flatMap((dy) => [0, 1, 2].map((dx) => (
        <img key={`${dx}-${dy}`} alt="" src={`/tiles/plan/${z}/${x0 + dx}/${y0 + dy}.png`} className="absolute size-64 select-none" style={{ left: dx * 256, top: dy * 256 }} draggable={false} />
      )))}
    </div>
  );
}
const ghost = "absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-surface/90 flex items-center justify-center font-display text-xs font-bold";

function MapPreview({ boosted, label }: { boosted: boolean; label: string }) {
  return (
    <div className="relative h-44 overflow-hidden rounded-3xl border border-line bg-night">
      <Tiles />
      <div className="absolute inset-0 bg-night/35" />
      {[["18%", "30%", "M"], ["78%", "24%", "J"], ["70%", "74%", "L"], ["24%", "78%", "R"]].map(([l, t, c]) => (
        <span key={c} className={ghost} style={{ left: l, top: t, opacity: boosted ? 0.55 : 1 }}>{c}</span>
      ))}
      <span className={"absolute -translate-x-1/2 -translate-y-1/2 " + (boosted ? "z-10" : "")} style={{ left: "50%", top: "50%" }}>
        <Pin boosted={boosted} size={boosted ? 50 : 36} />
      </span>
      <span className={"absolute start-2 top-2 rounded-full px-3 py-1 text-[11px] font-bold " + (boosted ? "text-night" : "bg-night/80 text-muted")} style={boosted ? { background: `linear-gradient(90deg, ${CORAL}, #f472b6, #fbbf24)` } : undefined}>{label}</span>
    </div>
  );
}

const BENEFITS = [
  ["✨", "Un halo qui brille", "Ton pin s'illumine et pulse : impossible de passer à côté sur la carte."],
  ["🔝", "Au premier plan", "Ton pin passe au-dessus des autres, même quand la carte est chargée."],
  ["👀", "Plus de regards", "Plus de visites de ton profil, plus de conversations qui démarrent."],
  ["📊", "Tes stats en direct", "Vues de ton profil et messages reçus pendant ton boost."],
] as const;

const FAQ = [
  ["Quand mon boost est-il visible ?", "Dès le paiement confirmé, et chaque fois que tu es visible sur la carte. Si tu te caches, personne ne voit ton pin, boosté ou non."],
  ["Les durées s'additionnent ?", "Oui. Si tu reprends un boost alors qu'un autre est en cours, le temps s'ajoute à la fin."],
  ["C'est un abonnement ?", "Non, chaque boost est un paiement unique, sans renouvellement automatique."],
  ["Ma vie privée ?", "Rien ne change : pas de nom, pas de numéro. Le paiement est géré par Stripe, hdar ne voit jamais ta carte."],
  ["Comment je paie ?", PAYMENTS_ENABLED ? "Carte bancaire, Apple Pay, Google Pay ou Link, sur la page sécurisée de Stripe." : "Tu ne paies rien : pendant le lancement, les boosts sont offerts avec le code FIRST."],
] as const;

export function BoostPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [spotPrices, setSpotPrices] = useState<PriceRow[]>([]);
  const [payOk, setPayOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<MyBoost[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [on, setOn] = useState(true);
  const now = useNow();
  useEffect(() => {
    void pricing().then((p) => { setPrices(p.filter((x) => x.kind === "boost")); setSpotPrices(p.filter((x) => x.kind === "place_boost")); }).catch(() => undefined);
    void paymentsEnabled().then(setPayOk);
    void myBoosts().then(setRows).catch((e: Error) => setErr(e.message));
    const q = new URLSearchParams(location.search);
    if (q.get("paid")) toast("Paiement reçu, merci ! Ton boost s'active dans quelques secondes ✨");
    if (q.get("spot")) setTimeout(() => document.getElementById("lieux")?.scrollIntoView({ behavior: "smooth" }), 600);
    if (q.get("cancel")) toast("Paiement annulé.");
    const t = setInterval(() => setOn((v) => !v), 2200);
    return () => clearInterval(t);
  }, []);
  const active = rows?.find((b) => b.active);
  const pay = (product: string) => {
    if (!payOk) return toast("Paiement bientôt disponible");
    setBusy(product);
    checkoutWithWaiver(product, null).catch((e: Error) => toast(e.message.includes("profil") ? "Crée ton profil sur la carte pour pouvoir te booster." : e.message)).finally(() => setBusy(""));
  };
  const featured = (p: PriceRow) => /24/.test(p.label + p.product);
  const goPricing = () => document.getElementById("tarifs")?.scrollIntoView({ behavior: "smooth" });

  return (
    <main className="relative h-dvh overflow-y-auto bg-[#0B0B10] text-ink">
      <Bokeh />
      <div className="relative mx-auto max-w-xl px-5 pt-6 pb-16">
        <div className="flex items-center justify-between">
          <a href="/" className="text-sm text-muted">← Carte</a>
          <Wordmark />
        </div>

        {/* Hero */}
        <section className="mt-8 text-center">
          <p className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: MINT }}>Boost de profil</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight">
            Brille sur <span className="boost-text">la carte</span>
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted">Ton pin s'illumine, passe devant les autres et attire tous les regards autour de toi.</p>
          <div className="relative mx-auto mt-8 flex size-48 items-center justify-center">
            <span className="absolute inset-0 rounded-full opacity-50 blur-2xl" style={{ background: `radial-gradient(${CORAL}, transparent 70%)` }} />
            <Pin boosted size={92} />
            <Sparkles className="sparkle absolute top-6 end-8 size-5" style={{ color: "#fbbf24" }} />
            <Sparkles className="sparkle absolute bottom-8 start-7 size-4" style={{ color: MINT, animationDelay: ".8s" }} />
          </div>
          {active ? (
            <ActiveCard b={active} now={now} />
          ) : (
            <button type="button" onClick={goPricing} className="boost-cta mt-6 inline-flex h-14 items-center gap-2 rounded-full px-8 font-display text-lg font-extrabold text-night">
              <Sparkles className="size-5" /> Booster mon profil
            </button>
          )}
        </section>

        {/* Avant / après */}
        <section className="mt-12">
          <h2 className="text-center font-display text-2xl font-extrabold">Avant / après</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MapPreview boosted={false} label="Normal" />
            <MapPreview boosted label="✨ Boosté" />
          </div>
          <div className="mt-3">
            <MapPreview boosted={on} label={on ? "✨ Boosté" : "Normal"} />
          </div>
        </section>

        {/* Avantages */}
        <section className="mt-12 grid grid-cols-2 gap-3">
          {BENEFITS.map(([i, t, d]) => (
            <div key={t} className="rounded-3xl border border-line bg-surface/70 p-4 backdrop-blur">
              <span className="text-2xl">{i}</span>
              <h3 className="mt-2 font-display font-bold">{t}</h3>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </div>
          ))}
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="mt-12 scroll-mt-6">
          <h2 className="text-center font-display text-2xl font-extrabold">Choisis ta durée</h2>
          <p className="mt-1 text-center text-xs text-muted">Paiement unique, sans abonnement. Les durées s'additionnent.</p>
          {payOk === false && <p className="mt-3 rounded-2xl border border-[#fbbf24] px-4 py-2 text-center text-xs text-[#fbbf24]">💳 Paiement bientôt disponible</p>}
          <WaiverCheckbox className="mt-4" />
          <div className="mt-5 grid gap-3">
            {prices.map((p) => {
              const f = featured(p);
              return (
                <button
                  key={p.product}
                  type="button"
                  disabled={!!busy}
                  onClick={() => pay(p.product)}
                  className={"relative flex items-center justify-between rounded-3xl border p-5 " + (f ? "pt-8 " : "") + " text-start transition active:scale-[.98] disabled:opacity-60 " + (f ? "boost-card border-transparent" : "border-line bg-surface/70")}
                >
                  {f && <span className="absolute top-2 end-3 rounded-full bg-night/80 !text-[#fbbf24] px-3 py-0.5 text-[11px] font-extrabold text-night" >⭐ Le plus choisi</span>}
                  <span>
                    <b className="block font-display text-lg">{p.label}</b>
                    <span className={"text-xs " + (f ? "text-white/85" : "text-muted")}>{!PAYMENTS_ENABLED ? "Offert au lancement" : busy === p.product ? "Redirection vers Stripe…" : payOk ? "Payer avec Stripe" : "Bientôt disponible"}</span>
                  </span>
                  <span className="relative z-10 font-display text-2xl font-extrabold" style={{ color: f ? "#fff" : CORAL }}>{euros(p.price_cents)}</span>
                </button>
              );
            })}
          </div>
          {err && !active && <p className="mt-3 text-center text-xs text-muted">{err.includes("profil") ? "Crée ton profil sur la carte pour pouvoir te booster." : ""}</p>}
          <p className="mt-3 text-center text-[11px] text-muted">{PAYMENTS_ENABLED ? "🔒 Paiement sécurisé par Stripe · Carte, Apple Pay, Google Pay" : "🎁 Aucun paiement pendant le lancement"}</p>
        </section>

        <SpotBoost prices={spotPrices} payOk={payOk} now={now} />
        <section className="mt-12 rounded-3xl border border-[#fbbf24]/60 bg-surface p-5 text-center">
          <p className="text-xs font-bold tracking-[0.25em] text-[#fbbf24] uppercase">Pour les lieux partenaires</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">⭐ Boost Pro</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Pin doré sur la carte, en tête « À la une » des Lieux et priorité dans le Live Pro. 24 h 4,99 € · 7 j 19,99 € · 30 j 59,99 €.</p>
          <a href="/pro" className="boost-cta mt-4 inline-flex h-12 items-center rounded-full px-6 font-display font-extrabold text-night">Mon espace partenaire ›</a>
        </section>

        {rows && rows.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-extrabold">Mes boosts</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {rows.map((b) => (
                <li key={b.id} className="rounded-2xl border border-line bg-surface/70 p-3">
                  <p className="text-xs text-muted">
                    {new Date(b.starts_at).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" })} → {new Date(b.ends_at).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" })}
                    {b.active && <b style={{ color: CORAL }}> · en cours</b>}
                  </p>
                  <p className="mt-1">👀 {b.views} vues de profil · 💬 {b.messages} messages reçus</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold">Questions</h2>
          <div className="mt-3 space-y-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="rounded-2xl border border-line bg-surface/70 p-4">
                <summary className="cursor-pointer font-bold">{q}</summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {!active && (
          <div className="mt-10 text-center">
            <button type="button" onClick={goPricing} className="boost-cta inline-flex h-14 items-center gap-2 rounded-full px-8 font-display text-lg font-extrabold text-night">
              <Sparkles className="size-5" /> Je veux briller
            </button>
          </div>
        )}
        <a href="/premium" className="mt-10 flex items-center gap-3 rounded-3xl border border-[#fbbf24]/40 bg-surface/70 p-4 backdrop-blur">
          <span className="text-2xl">👑</span>
          <span className="min-w-0 flex-1">
            <b className="block font-display">Envie d'aller plus loin ? hdar<span className="premium-text">+</span></b>
            <span className="text-xs text-muted">Filtres carte et Live, qui t'a vu, recherche par pseudo, 20 photos, demande à se voir en Live.</span>
          </span>
          <span className="text-sm font-bold text-[#fbbf24]">›</span>
        </a>
        <ShinyCta href="/live" sub="Rencontre en vidéo, flouté par défaut">Entrer dans le Live 🎥</ShinyCta>
        <p className="mt-6 text-center text-xs text-muted">
          Tu as un établissement ? <a className="underline" href="/pro">Espace pro · lieux partenaires</a>
        </p>
      </div>
    </main>
  );
}

function ActiveCard({ b, now }: { b: MyBoost; now: number }) {
  return (
    <div className="boost-card mx-auto mt-6 max-w-sm rounded-3xl p-5">
      <p className="text-xs font-bold tracking-widest uppercase text-white/80">✨ Boost actif</p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{fmtLeft(new Date(b.ends_at).getTime() - now)}</p>
      <p className="text-xs text-white/80">restant</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className="rounded-2xl bg-night/40 py-2"><b className="block text-2xl">{b.views}</b><span className="text-[11px]">vues de profil</span></span>
        <span className="rounded-2xl bg-night/40 py-2"><b className="block text-2xl">{b.messages}</b><span className="text-[11px]">messages reçus</span></span>
      </div>
      <a href="#tarifs" className="mt-3 inline-block text-xs underline">Prolonger mon boost</a>
    </div>
  );
}

/** Boost d'un lieu privé (spot créé par l'utilisateur) : halo sur la carte, en tête de la liste Lieux, reste ouvert. */
function SpotBoost({ prices, payOk, now }: { prices: PriceRow[]; payOk: boolean | null; now: number }) {
  const [spots, setSpots] = useState<MySpot[] | null>(null);
  const [sel, setSel] = useState<string>(() => new URLSearchParams(location.search).get("spot") ?? "");
  const [busy, setBusy] = useState("");
  useEffect(() => void mySpots().then((r) => { setSpots(r); setSel((v) => (r.some((x) => x.id === v) ? v : r[0]?.id ?? "")); }).catch(() => setSpots([])), []);
  if (!prices.length) return null;
  const cur = spots?.find((x) => x.id === sel);
  const pay = (product: string) => {
    if (!payOk) return toast("Paiement bientôt disponible");
    if (!sel) return toast("Crée d'abord un lieu depuis l'onglet Lieux.");
    setBusy(product);
    checkoutWithWaiver(product, sel).catch((e: Error) => toast(e.message)).finally(() => setBusy(""));
  };
  return (
    <section id="lieux" className="mt-12 scroll-mt-6">
      <p className="text-center text-xs font-bold tracking-[0.25em] uppercase" style={{ color: MINT }}>Nouveau · Boost de lieu</p>
      <h2 className="mt-1 text-center font-display text-2xl font-extrabold">Mets ton lieu <span className="boost-text">à la une</span></h2>
      <p className="mx-auto mt-1 max-w-sm text-center text-xs text-muted">Ton lieu brille sur la carte, passe en tête de la liste Lieux et reste ouvert pendant tout le boost.</p>
      <div className="relative mt-5 h-40 overflow-hidden rounded-3xl border border-line bg-night">
        <Tiles />
        <div className="absolute inset-0 bg-night/35" />
        <span className="absolute flex h-8 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-spot bg-night/90 px-3 text-xs text-ink opacity-70" style={{ left: "24%", top: "28%" }}>Plage du soir</span>
        <span className="absolute flex h-8 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-spot bg-night/90 px-3 text-xs text-ink opacity-70" style={{ left: "76%", top: "76%" }}>Apéro chez moi</span>
        <span className="partner-glow absolute z-10 flex h-9 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border-2 border-spot bg-night/90 px-4 text-sm font-bold text-ink" style={{ left: "52%", top: "52%" }}>✨ {cur?.title ?? "Ton lieu"}</span>
        <span className="absolute start-2 top-2 rounded-full px-3 py-1 text-[11px] font-bold text-night" style={{ background: `linear-gradient(90deg, ${CORAL}, #f472b6, #fbbf24)` }}>✨ Lieu boosté</span>
      </div>
      {spots && spots.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-line bg-surface/70 p-4 text-center text-sm text-muted">
          Tu n'as pas de lieu ouvert. <a href="/" className="underline">Crée un lieu</a> depuis l'onglet Lieux, puis reviens le booster.
        </p>
      ) : (
        <>
          {spots && spots.length > 1 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {spots.map((x) => (
                <button key={x.id} type="button" onClick={() => setSel(x.id)} className={"h-9 rounded-full border px-3 text-sm " + (sel === x.id ? "border-spot bg-spot text-night" : "border-line")}>{x.title}</button>
              ))}
            </div>
          )}
          {cur?.boosted_until && (
            <p className="mt-3 text-center text-sm font-bold" style={{ color: CORAL }}>✨ « {cur.title} » est boosté encore {fmtLeft(new Date(cur.boosted_until).getTime() - now)}</p>
          )}
          <WaiverCheckbox className="mt-4" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {prices.map((p, i) => (
              <button key={p.product} type="button" disabled={!!busy} onClick={() => pay(p.product)}
                className={"rounded-3xl border p-4 text-start transition active:scale-[.98] disabled:opacity-60 " + (i === prices.length - 1 ? "boost-card border-transparent" : "border-line bg-surface/70")}>
                <b className="block font-display">{p.label}</b>
                <span className="relative z-10 font-display text-2xl font-extrabold" style={{ color: i === prices.length - 1 ? "#fff" : CORAL }}>{euros(p.price_cents)}</span>
                <span className={"block text-[11px] " + (i === prices.length - 1 ? "text-white/85" : "text-muted")}>{busy === p.product ? "Redirection…" : cur ? `pour « ${cur.title} »` : "Paiement unique"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
