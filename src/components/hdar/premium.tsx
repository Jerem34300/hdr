import { PAYMENTS_ENABLED } from "@/lib/hdar/payments";
import { FounderCard } from "./launch-offer";
import { useEffect, useState } from "react";
import { ShinyCta } from "./hearts";
import { checkoutWithWaiver } from "@/lib/hdar/consent";
import { WaiverCheckbox } from "@/components/hdar/waiver";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Crown, Eye, Heart, Search, SlidersHorizontal, X } from "lucide-react";
import {
  admirers, filtersOn, GENDERS, NO_FILTERS, openBillingPortal, paymentsEnabled, pricing, searchPseudo, startCheckout,
  type Admirer, type Admirers, type MapFilters, type PriceRow, type SearchHit,
} from "@/lib/hdar/live";
import { DESIRES, PLACES } from "@/lib/hdar/data";
import { useHdar } from "@/lib/hdar/store";
import { usePremium } from "@/lib/hdar/premium";
import { Bokeh } from "./boost";
import { PinFace } from "./map-view";
import { Wordmark } from "./logo";

const GOLD = "#fbbf24";
const MINT = "#A1E3C3";
const CORAL = "#FA6F6C";
const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const per = (p: PriceRow) => (/sem|week/i.test(p.label + p.product) ? "/ semaine" : /mois|month/i.test(p.label + p.product) ? "/ mois" : "");

/** Petit badge discret hdar+. */
export function PremiumBadge({ className = "" }: { className?: string }) {
  return (
    <span className={"premium-badge inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold text-night " + className}>
      <Crown className="size-2.5" />+
    </span>
  );
}

const PERKS = [
  ["🔎", "Filtres de la carte", "Âge, H/F/X/Couple, envies, lieu, en ligne maintenant, avec photo : ne vois que ceux qui te correspondent."],
  ["👀", "Qui t'a vu", "La liste de ceux qui ont ouvert ton profil ces 30 derniers jours."],
  ["⭐", "Qui t'a mis en favori", "Découvre qui t'a ajouté à ses favoris."],
  ["🔤", "Recherche par pseudo", "Retrouve quelqu'un que tu as croisé, sans jamais voir sa position exacte."],
  ["📸", "20 photos d'album", "Au lieu de 5. Toujours privé, jamais de grille publique."],
  ["👑", "Badge hdar+", "Un petit badge discret sur ton pin, ta fiche et tes petites annonces."],
  ["📌", "Petites annonces illimitées ou presque", "Jusqu'à 10 annonces en ligne (au lieu de 3), diffusées jusqu'à 30 jours."],
  ["🚀", "1 boost d'annonce offert par mois", "Ton annonce en tête de toute ta région pendant 24 h, chaque mois."],
  ["🎁", "Invite un ami", "3 jours de hdar+ offerts pour toi et ton ami dès que son profil est validé (Paramètres → Invite un ami)."],
  ["🎥", "Live : revenir en arrière", "Tu as zappé trop vite ? Reviens sur la personne d'avant si elle est encore dans le Live."],
  ["🎚️", "Filtres du Live", "H/F/X/Couple et tranche d'âge : choisis qui tu croises en vidéo."],
  ["⚡", "Matching prioritaire", "Tu tombes d'abord sur ceux qui cherchent ce que tu es, et que tu cherches."],
  ["👀", "Demande à se voir", "Caméra floutée ? Envoie une demande. Seule l'autre personne décide de se montrer."],
] as const;

const FAQ = [
  ["C'est un abonnement ?", "Oui, renouvelé automatiquement chaque semaine ou chaque mois. Tu résilies en deux clics depuis cette page, et tu gardes hdar+ jusqu'à la fin de la période payée."],
  ["Ma vie privée ?", PAYMENTS_ENABLED ? "Rien ne change : pas de nom, pas de numéro, pas de compte Google. Stripe gère le paiement, hdar ne voit jamais ta carte." : "Rien ne change : pas de nom, pas de numéro, pas de compte Google. Et aucun paiement pendant le lancement."],
  ["La recherche montre où sont les gens ?", "Non. Tu vois le pseudo et s'il est en ligne, jamais sa position. Les profils bloqués, bannis ou inactifs depuis 7 jours n'apparaissent pas."],
  ["Demande à se voir, ça défloute l'autre ?", "Jamais. L'autre reçoit une invitation « … aimerait te voir 👀 » et choisit « Me montrer » ou « Non merci ». Une seule demande par rencontre."],
  ["Le Live est réservé à hdar+ ?", "Non, le Live est gratuit pour tous les profils avec photo validée. hdar+ ajoute le retour en arrière, les filtres, le matching prioritaire et la demande à se voir."],
  ["Et les cœurs du Live ?", "Les cœurs s'achètent en packs (sans abonnement) et s'envoient dans le Live. Ils n'ont aucune valeur monétaire, ne sont ni remboursables ni échangeables contre de l'argent."],
  ["Et si je me cache ?", "Tu restes invisible : hdar+ ne change rien à ta visibilité."],
] as const;

/** Filtres de la carte (premium). */
export function FilterSheet({ onClose }: { onClose: () => void }) {
  const { premium, filters, setFilters } = usePremium();
  const nav = useNavigate();
  const [f, setF] = useState<MapFilters>(filters);
  const tog = (k: "desires" | "places" | "iam", v: string) =>
    setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const chip = (on: boolean) => "h-9 rounded-full border px-3 text-sm transition " + (on ? "border-transparent bg-ink text-night font-bold" : "border-line text-ink");
  const apply = () => {
    if (!premium) { onClose(); void nav({ to: "/premium" }); return; }
    setFilters(f);
    onClose();
  };
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-night/60" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
      <div className="max-h-[85%] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-[#0B0B10] p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><SlidersHorizontal className="size-5" /> Filtres <PremiumBadge /></h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-surface"><X className="size-4" /></button>
        </div>
        {!premium && <p className="mt-2 text-xs text-muted">Réservé à hdar+. Essaie les réglages, puis active hdar+ pour les appliquer.</p>}
        <h3 className="mt-5 text-xs font-bold tracking-widest text-muted uppercase">Âge</h3>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <input inputMode="numeric" placeholder="18" value={f.minAge ?? ""} onChange={(e) => setF({ ...f, minAge: e.target.value ? Math.max(18, Math.min(99, +e.target.value || 18)) : null })} className="h-10 w-20 rounded-xl border border-line bg-surface px-3" />
          <span className="text-muted">à</span>
          <input inputMode="numeric" placeholder="99" value={f.maxAge ?? ""} onChange={(e) => setF({ ...f, maxAge: e.target.value ? Math.max(18, Math.min(99, +e.target.value || 99)) : null })} className="h-10 w-20 rounded-xl border border-line bg-surface px-3" />
          <span className="text-muted">ans</span>
        </div>
        <h3 className="mt-5 text-xs font-bold tracking-widest text-muted uppercase">Profil</h3>
        <div className="mt-2 flex flex-wrap gap-2">{GENDERS.map((g) => <button key={g.id} type="button" className={chip(f.iam.includes(g.id))} onClick={() => tog("iam", g.id)}>{g.label}</button>)}</div>
        <h3 className="mt-5 text-xs font-bold tracking-widest text-muted uppercase">Envies</h3>
        <div className="mt-2 flex flex-wrap gap-2">{DESIRES.map((d) => <button key={d.id} type="button" className={chip(f.desires.includes(d.id))} onClick={() => tog("desires", d.id)}>{d.label}</button>)}</div>
        <h3 className="mt-5 text-xs font-bold tracking-widest text-muted uppercase">Lieu</h3>
        <div className="mt-2 flex flex-wrap gap-2">{PLACES.map((d) => <button key={d.id} type="button" className={chip(f.places.includes(d.id))} onClick={() => tog("places", d.id)}>{d.label}</button>)}</div>
        <div className="mt-5 space-y-1 text-sm">
          <label className="flex h-10 items-center justify-between"><span>🟢 En ligne maintenant</span><input type="checkbox" checked={f.online} onChange={(e) => setF({ ...f, online: e.target.checked })} /></label>
          <label className="flex h-10 items-center justify-between"><span>📸 Avec photo</span><input type="checkbox" checked={f.photo} onChange={(e) => setF({ ...f, photo: e.target.checked })} /></label>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => { setF(NO_FILTERS); if (premium) setFilters(NO_FILTERS); }} className="h-12 flex-1 rounded-full border border-line font-bold">Tout effacer</button>
          <button type="button" onClick={apply} className={"h-12 flex-[2] rounded-full font-display font-extrabold text-night " + (premium ? "bg-ink" : "premium-cta")}>
            {premium ? "Appliquer" : "Débloquer avec hdar+"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bouton filtres posé sur la carte. */
export function FilterButton({ onClick }: { onClick: () => void }) {
  const on = usePremium((s) => s.premium && filtersOn(s.filters));
  return (
    <button type="button" aria-label="Filtres" onClick={onClick}
      className={"relative flex size-11 items-center justify-center rounded-full text-ink " + (on ? "premium-cta !text-night" : "bg-night/90")}>
      <SlidersHorizontal className="size-5" />
      {on && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-night bg-signal" />}
    </button>
  );
}

function PersonRow({ p, sub, go }: { p: { id: string; pseudo: string; live: boolean; premium?: boolean }; sub?: string; go: (id: string, ps: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => go(p.id, p.pseudo)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface/70 p-2.5 text-left">
        <span className="size-10 shrink-0 overflow-hidden rounded-full border-2 border-white bg-night"><PinFace id={p.id} pseudo={p.pseudo} /></span>
        <span className="min-w-0 flex-1">
          <b className="flex items-center gap-1.5 truncate">{p.pseudo} {p.premium && <PremiumBadge />}</b>
          <span className="text-xs text-muted">{p.live ? <span className="text-online">● sur la carte</span> : "hors ligne"}{sub ? ` · ${sub}` : ""}</span>
        </span>
      </button>
    </li>
  );
}
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};

export function PremiumPage({ demo }: { demo?: { admirers: Admirers; hits: SearchHit[]; premium: boolean } } = {}) {
  const store = usePremium();
  const premium = demo ? demo.premium : store.premium;
  const nav = useNavigate();
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [payOk, setPayOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [adm, setAdm] = useState<Admirers | null>(demo?.admirers ?? null);
  const [tab, setTab] = useState<"viewers" | "fans">("viewers");
  const [q, setQ] = useState(demo ? "Ma" : "");
  const [hits, setHits] = useState<SearchHit[] | null>(demo?.hits ?? null);
  useEffect(() => {
    void pricing().then((p) => setPrices(p.filter((x) => x.kind === "premium"))).catch(() => undefined);
    void paymentsEnabled().then(setPayOk);
    if (demo) return;
    void store.refresh().then(() => admirers().then(setAdm).catch(() => undefined));
    const u = new URLSearchParams(location.search);
    if (u.get("paid")) {
      toast("Paiement reçu, bienvenue dans hdar+ 👑");
      const t = setTimeout(() => void store.refresh().then(() => admirers().then(setAdm).catch(() => undefined)), 4000);
      return () => clearTimeout(t);
    }
    if (u.get("cancel")) toast("Paiement annulé.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (demo || !premium || q.trim().length < 2) { if (!demo) setHits(null); return; }
    const t = setTimeout(() => void searchPseudo(q).then(setHits).catch((e: Error) => toast(e.message)), 350);
    return () => clearTimeout(t);
  }, [q, premium, demo]);
  const go = (id: string, ps: string) => { useHdar.getState().openProfile(id, ps); void nav({ to: "/" }); };
  const pay = (product: string) => {
    if (!payOk) return toast("Paiement bientôt disponible");
    setBusy(product);
    checkoutWithWaiver(product, null).catch((e: Error) => toast(e.message.includes("profil") ? "Crée ton profil sur la carte pour passer à hdar+." : e.message)).finally(() => setBusy(""));
  };
  const goPricing = () => document.getElementById("tarifs")?.scrollIntoView({ behavior: "smooth" });
  const list: Admirer[] = (tab === "viewers" ? adm?.viewers : adm?.fans) ?? [];
  const cancelling = store.status === "cancelling" || store.status === "cancelled" || store.status === "canceled";

  if (premium) return <PremiumSpace demo={!!demo} adm={adm} hits={hits} q={q} setQ={setQ} go={go} />;

  return (
    <main className="relative h-dvh overflow-y-auto bg-[#0B0B10] text-ink">
      <Bokeh />
      <div aria-hidden className="pointer-events-none absolute top-24 left-1/2 size-72 -translate-x-1/2 rounded-full opacity-25 blur-3xl" style={{ background: GOLD }} />
      <div className="relative mx-auto max-w-xl px-5 pt-6 pb-16">
        <div className="flex items-center justify-between">
          <a href="/" className="text-sm text-muted">← Carte</a>
          <Wordmark />
        </div>

        <section className="mt-8 text-center">
          <p className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: GOLD }}>{PAYMENTS_ENABLED ? "Abonnement" : "Offert pendant le lancement"}</p>
          <h1 className="mt-2 font-display text-5xl font-extrabold leading-tight">hdar<span className="premium-text">+</span></h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted">Filtre la carte et le Live, découvre qui t'a vu et qui t'a mis en favori, retrouve un pseudo. Ta vie privée reste privée.</p>
          <div className="relative mx-auto mt-6 flex size-36 items-center justify-center">
            <span className="absolute inset-0 rounded-full opacity-50 blur-2xl" style={{ background: `radial-gradient(${GOLD}, transparent 70%)` }} />
            <span className="premium-ring relative flex size-24 items-center justify-center rounded-full"><Crown className="size-10" style={{ color: GOLD }} /></span>
          </div>
          {!PAYMENTS_ENABLED && <FounderCard className="mx-auto mt-6 max-w-sm text-left" />}
          {premium ? (
            <div className="premium-card mx-auto mt-6 max-w-sm rounded-3xl p-5 text-left">
              <p className="text-xs font-bold tracking-widest text-white/80 uppercase">👑 Tu es hdar+</p>
              <p className="mt-1 text-sm text-white/90">
                {store.until ? `${cancelling ? "Actif jusqu'au" : "Prochain renouvellement vers le"} ${new Date(store.until).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : "Abonnement actif"}
              </p>
              <button type="button" onClick={() => openBillingPortal("premium").catch((e: Error) => toast(e.message))} className="mt-3 h-10 rounded-full bg-night/50 px-4 text-sm font-bold">
                Gérer mon abonnement
              </button>
            </div>
          ) : (
            <button type="button" onClick={goPricing} className="premium-cta mt-6 inline-flex h-14 items-center gap-2 rounded-full px-8 font-display text-lg font-extrabold text-night">
              <Crown className="size-5" /> Passer à hdar+
            </button>
          )}
        </section>

        {/* Live */}
        <section className="mt-12">
          <h2 className="text-center font-display text-2xl font-extrabold">Le Live, en mieux</h2>
          <p className="mt-1 text-center text-xs text-muted">Vidéo au hasard, floutée par défaut. Avec hdar+, tu prends la main.</p>
          <div className="relative mx-auto mt-4 h-80 max-w-xs overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(circle_at_50%_40%,#3b2a3a,#0b0b10)]">
            <div className="absolute inset-0 blur-[14px]"><div className="absolute top-[18%] left-1/2 size-28 -translate-x-1/2 rounded-full bg-[#c9a58c]/70" /><div className="absolute top-[52%] left-1/2 h-56 w-56 -translate-x-1/2 rounded-t-full bg-[#2b3a55]" /></div>
            <span className="absolute top-3 left-3 rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[10px] font-bold">● LIVE</span>
            <span className="absolute top-3 right-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px]">Flouté</span>
            <span className="absolute top-[46%] left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] px-4 py-2 text-sm font-bold whitespace-nowrap text-night shadow-[0_0_20px_#fbbf24]">Demande à se voir 👀</span>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
              {["↩︎", "🎚️", "⚡"].map((x) => <span key={x} className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur">{x}</span>)}
            </div>
          </div>
          <ul className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2 text-xs">
            <li className="rounded-2xl bg-surface/70 p-3"><b className="block">↩︎ Retour arrière</b>la personne d'avant</li>
            <li className="rounded-2xl bg-surface/70 p-3"><b className="block">🎚️ Filtres</b>H/F/X/Couple et âge</li>
            <li className="rounded-2xl bg-surface/70 p-3"><b className="block">⚡ Prioritaire</b>ceux qui te cherchent</li>
            <li className="rounded-2xl bg-surface/70 p-3"><b className="block">👀 Se voir</b>il choisit de se montrer</li>
          </ul>
        </section>

        {/* Qui m'a vu / favoris */}
        <section className="mt-12">
          <h2 className="text-center font-display text-2xl font-extrabold">Ils s'intéressent à toi</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setTab("viewers")} className={"rounded-3xl border p-4 text-left " + (tab === "viewers" ? "border-[#fbbf24] bg-surface" : "border-line bg-surface/70")}>
              <Eye className="size-5" style={{ color: GOLD }} /><b className="mt-1 block font-display text-3xl">{adm?.views ?? "–"}</b><span className="text-xs text-muted">vues de ton profil (30 j)</span>
            </button>
            <button type="button" onClick={() => setTab("fans")} className={"rounded-3xl border p-4 text-left " + (tab === "fans" ? "border-[#fbbf24] bg-surface" : "border-line bg-surface/70")}>
              <Heart className="size-5" style={{ color: CORAL }} /><b className="mt-1 block font-display text-3xl">{adm?.favs ?? "–"}</b><span className="text-xs text-muted">t'ont mis en favori</span>
            </button>
          </div>
          {premium ? (
            <ul className="mt-3 space-y-2">
              {list.length ? list.map((p) => <PersonRow key={p.id} p={p} sub={ago(p.at)} go={go} />) : <p className="py-4 text-center text-sm text-muted">Personne pour l'instant. Montre-toi sur la carte !</p>}
            </ul>
          ) : (
            <div className="relative mt-3 overflow-hidden rounded-3xl border border-line">
              <ul className="space-y-2 p-2 blur-[6px] select-none" aria-hidden>
                {["Marco", "Jules", "Theo"].map((n) => <li key={n} className="flex items-center gap-3 rounded-2xl bg-surface/70 p-2.5"><span className="size-10 rounded-full bg-night" /><b>{n}</b></li>)}
              </ul>
              <button type="button" onClick={goPricing} className="absolute inset-0 flex items-center justify-center bg-night/30 font-bold">👑 Débloque avec hdar+</button>
            </div>
          )}
        </section>

        {/* Recherche */}
        <section className="mt-12">
          <h2 className="text-center font-display text-2xl font-extrabold">Retrouve un pseudo</h2>
          <p className="mt-1 text-center text-xs text-muted">Pseudo et statut en ligne seulement, jamais de position.</p>
          <label className="mt-4 flex h-12 items-center gap-2 rounded-full border border-line bg-surface px-4">
            <Search className="size-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!premium} placeholder={premium ? "Pseudo…" : "Réservé à hdar+"} className="min-w-0 flex-1 bg-transparent text-sm outline-none" maxLength={24} />
          </label>
          {premium && hits && (
            <ul className="mt-3 space-y-2">
              {hits.length ? hits.map((h) => <PersonRow key={h.id} p={h} go={go} />) : <p className="py-3 text-center text-sm text-muted">Aucun profil récent avec ce pseudo.</p>}
            </ul>
          )}
        </section>

        {/* Avantages */}
        <section className="mt-12 grid grid-cols-2 gap-3">
          {PERKS.map(([i, t, d]) => (
            <div key={t} className="rounded-3xl border border-line bg-surface/70 p-4 backdrop-blur">
              <span className="text-2xl">{i}</span>
              <h3 className="mt-2 font-display font-bold">{t}</h3>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </div>
          ))}
        </section>

        {/* Tarifs */}
        {!premium && (
          <section id="tarifs" className="mt-12 scroll-mt-6">
            <h2 className="text-center font-display text-2xl font-extrabold">Choisis ta formule</h2>
            <p className="mt-1 text-center text-xs text-muted">Sans engagement, résiliable à tout moment.</p>
            {payOk === false && <p className="mt-3 rounded-2xl border border-[#fbbf24] px-4 py-2 text-center text-xs text-[#fbbf24]">💳 Paiement bientôt disponible</p>}
            <WaiverCheckbox className="mt-4" />
            <div className="mt-5 grid gap-3">
              {prices.map((p, i) => {
                const f = i === prices.length - 1;
                return (
                  <button key={p.product} type="button" disabled={!!busy} onClick={() => pay(p.product)}
                    className={"relative flex items-center justify-between rounded-3xl border p-5 text-left transition active:scale-[.98] disabled:opacity-60 " + (f ? "premium-card border-transparent pt-8" : "border-line bg-surface/70")}>
                    {f && <span className="absolute top-2 right-3 rounded-full bg-night/80 px-3 py-0.5 text-[11px] font-extrabold" style={{ color: GOLD }}>⭐ Meilleur prix</span>}
                    <span>
                      <b className="block font-display text-lg">{p.label}</b>
                      <span className={"text-xs " + (f ? "text-white/85" : "text-muted")}>{!PAYMENTS_ENABLED ? "Offert avec le code FIRST" : busy === p.product ? "Redirection vers Stripe…" : "Renouvelé automatiquement"}</span>
                    </span>
                    <span className="text-right">
                      <b className="block font-display text-2xl font-extrabold" style={{ color: f ? "#fff" : GOLD }}>{euros(p.price_cents)}</b>
                      <span className={"text-[11px] " + (f ? "text-white/85" : "text-muted")}>{per(p)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted">{PAYMENTS_ENABLED ? "🔒 Paiement sécurisé par Stripe · Carte, Apple Pay, Google Pay" : "🎁 Aucun paiement pendant le lancement"}</p>
          </section>
        )}

        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold">Questions</h2>
          <div className="mt-3 space-y-2">
            {FAQ.map(([qq, a]) => (
              <details key={qq} className="rounded-2xl border border-line bg-surface/70 p-4">
                <summary className="cursor-pointer font-bold">{qq}</summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
        <ShinyCta href="/boost" sub="Envie de briller tout de suite ? Dès 1,99 €">Booster mon profil</ShinyCta>
      </div>
    </main>
  );
}

/** Espace des membres hdar+ : statut + accès direct aux fonctions, sans argumentaire de vente. */
function PremiumSpace({ demo, adm, hits, q, setQ, go }: { demo: boolean; adm: Admirers | null; hits: SearchHit[] | null; q: string; setQ: (v: string) => void; go: (id: string, ps: string) => void }) {
  const store = usePremium();
  const nav = useNavigate();
  const [tab, setTab] = useState<"viewers" | "fans" | null>(null);
  const until = store.until ? new Date(store.until) : null;
  const lifetime = demo || !until || until.getFullYear() > 2090;
  const stripe = store.status === "active" || store.status === "cancelling";
  const cancelling = store.status === "cancelling" || store.status === "cancelled" || store.status === "canceled";
  const day = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const status = lifetime ? "hdar+ à vie ✨" : stripe && !cancelling ? `Abonnement actif · renouvellement le ${day(until!)}` : `Actif jusqu'au ${day(until!)}`;
  const toMap = (filters = false) => { if (filters) sessionStorage.setItem("hdar-open-filters", "1"); useHdar.getState().setTab("around"); void nav({ to: "/" }); };
  const toMe = () => { useHdar.getState().setTab("me"); void nav({ to: "/" }); };
  const list: Admirer[] = (tab === "viewers" ? adm?.viewers : tab === "fans" ? adm?.fans : []) ?? [];
  const F: [string, string, string, string, () => void][] = [
    ["🗺️", "Filtres de la carte", "Âge, envies, H/F/X/Couple, en ligne, avec photo", "Filtrer", () => toMap(true)],
    ["👀", "Qui t'a vu", `${adm?.views ?? "–"} vues sur 30 jours`, "Voir", () => setTab(tab === "viewers" ? null : "viewers")],
    ["⭐", "Qui t'a mis en favori", `${adm?.favs ?? "–"} personnes`, "Voir", () => setTab(tab === "fans" ? null : "fans")],
    ["🔎", "Recherche par pseudo", "Retrouve quelqu'un en un instant", "Chercher", () => document.getElementById("pseudo-search")?.focus()],
    ["📸", "20 photos d'album", "Au lieu de 5", "Mon album", toMe],
    ["↩️", "Live : retour arrière", "Reviens sur la personne d'avant", "Ouvrir", () => void nav({ to: "/live" })],
    ["🎚️", "Live : filtres", "H/F/X/Couple et tranche d'âge", "Filtrer", () => { location.href = "/live?filters=1"; }],
    ["⚡", "Live : matching prioritaire", "Ceux qui te cherchent d'abord", "Live", () => void nav({ to: "/live" })],
    ["👁️", "Demande à se voir", "Propose de se montrer dans le Live", "Live", () => void nav({ to: "/live" })],
  ];
  return (
    <main className="relative h-dvh overflow-y-auto bg-[#0B0B10] text-ink">
      <Bokeh />
      <div className="relative mx-auto max-w-xl px-5 pt-6 pb-16">
        <div className="flex items-center justify-between"><a href="/" className="text-sm text-muted">← Carte</a><Wordmark /></div>
        <section className="premium-card relative mt-6 overflow-hidden rounded-3xl p-6 text-center">
          <span aria-hidden className="pointer-events-none absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl" style={{ background: GOLD }} />
          <span className="premium-ring relative mx-auto flex size-20 items-center justify-center rounded-full"><Crown className="size-9" style={{ color: GOLD }} /></span>
          <p className="relative mt-3 text-xs font-bold tracking-[0.25em] text-white/85 uppercase">Ton espace</p>
          <h1 className="relative font-display text-4xl font-extrabold">hdar<span className="premium-text">+</span></h1>
          <p className="relative mt-2 inline-block rounded-full bg-night/50 px-4 py-1.5 text-sm font-bold">{status}</p>
        </section>
        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {F.map(([i, t, d, cta, fn]) => (
            <div key={t} className="flex items-center gap-3 rounded-3xl border border-[#fbbf24]/30 bg-surface/80 p-4">
              <span className="text-2xl">{i}</span>
              <span className="min-w-0 flex-1"><b className="block text-sm">{t}</b><span className="text-xs text-muted">{d}</span></span>
              <button type="button" onClick={fn} className="shrink-0 rounded-full bg-[#fbbf24] px-3 py-1.5 text-xs font-extrabold text-night">{cta}</button>
            </div>
          ))}
        </section>
        {tab && (
          <ul className="mt-3 space-y-2">
            {list.length ? list.map((p) => <PersonRow key={p.id} p={p} sub={ago(p.at)} go={go} />) : <p className="py-4 text-center text-sm text-muted">Personne pour l'instant. Montre-toi sur la carte !</p>}
          </ul>
        )}
        <label className="mt-6 flex h-12 items-center gap-2 rounded-full border border-line bg-surface px-4">
          <Search className="size-4 text-muted" />
          <input id="pseudo-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un pseudo…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" maxLength={24} />
        </label>
        {hits && <ul className="mt-3 space-y-2">{hits.length ? hits.map((h) => <PersonRow key={h.id} p={h} go={go} />) : <p className="py-3 text-center text-sm text-muted">Aucun profil récent avec ce pseudo.</p>}</ul>}
        {stripe && !lifetime && (
          <button type="button" onClick={() => openBillingPortal("premium").catch((e: Error) => toast(e.message))} className="mt-10 h-12 w-full rounded-full border border-line text-sm font-bold">
            Gérer mon abonnement
          </button>
        )}
      </div>
    </main>
  );
}
