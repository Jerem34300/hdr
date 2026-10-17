import { useEffect, useState } from "react";
import { prospectPreview, type ProspectPreview } from "@/lib/hdar/live";
import { SUPABASE_URL } from "@/lib/hdar/session";
import { PLACE_KINDS, Stars } from "./places-layer";
import { Mark, Wordmark } from "./logo";

const CORAL = "#FA6F6C";
const MINT = "#A1E3C3";
const GOLD = "#fbbf24";
const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: c % 100 ? 2 : 0 });

/** Lien « exemple » des emails de test : aperçu sans base de données. */
const SAMPLE: ProspectPreview = {
  name: "Le Néon (exemple)", kind: "bar", segment: "gay", city: "Montpellier", lat: 43.6108, lng: 3.8767,
  description: "Bar gay à Montpellier.", website: "https://hdar.chat", contact: "@leneon", claimable: false, claimed: false, active: false, optout: false,
  prices: [{ label: "1 semaine", price_cents: 1500 }, { label: "1 mois", price_cents: 4900 }, { label: "3 mois", price_cents: 12900 }], boost_from: 499,
};

const FEATURES = [
  ["📍", "Votre pin lumineux sur la carte", "Vu en temps réel par les personnes connectées autour de vous, au moment où elles choisissent où sortir."],
  ["📝", "Votre page complète", "Description, horaires, ambiance, jusqu'à 4 photos, site web, téléphone, Instagram."],
  ["⭐", "Avis et étoiles", "Activés ou non, publics sur la fiche ou privés pour vous seul. Vous répondez à chaque commentaire."],
  ["💬", "Le chat de votre lieu", "Annoncez une soirée, un DJ, une happy hour ; répondez aux questions en direct."],
  ["🎥", "Live Pro", "Présentez votre lieu en vidéo à toute la France, sans limite de distance (sans nudité)."],
  ["🎁", "Cadeaux et messages pro", "Offrez un verre, une entrée ou un code promo ; écrivez aux utilisateurs qui le souhaitent."],
  ["🚀", "Boost Pro", "Pin doré, première place « À la une » des Lieux et priorité dans le Live Pro."],
  ["📊", "Tableau de bord", "Vues, visiteurs uniques, clics vers votre site, heures de pointe, zones d'origine, impact des boosts."],
] as const;

const STEPS = [
  ["Activez votre fiche", "Elle est ajoutée à votre espace pro, rien à remplir pour commencer."],
  ["Complétez-la", "Photos, horaires, description, contacts : tout se modifie à tout moment."],
  ["Choisissez votre formule", "Paiement sécurisé Stripe : votre pin s'allume sur la carte dans la foulée."],
] as const;

const FAQ = [
  ["Y a-t-il un engagement ?", "Non. La formule se renouvelle automatiquement et s'arrête en un clic depuis votre espace pro ; la fiche reste visible jusqu'à la fin de la période payée."],
  ["Puis-je tout modifier ?", "Oui : nom, description, photos, site, contacts, position, et l'activation des avis et commentaires."],
  ["Les utilisateurs restent-ils anonymes ?", "Oui. Vos statistiques sont regroupées par zone : vous mesurez votre audience sans jamais savoir qui est qui."],
  ["Qui voit ma fiche ?", "Les utilisateurs hdar (18 ans et plus) autour de votre établissement, sur la carte et dans la liste des Lieux, et toute la France pendant vos Live Pro."],
] as const;

const audience = (p: ProspectPreview) => (p.segment === "libertin" ? "les couples et célibataires ouverts d'esprit qui sortent autour de vous" : "la communauté gay et LGBT+ qui sort autour de vous");

function tileXY(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/** Extrait de la vraie carte hdar, centré sur l'établissement. */
function MapAt({ p }: { p: ProspectPreview }) {
  const z = 16;
  const { x, y } = tileXY(p.lat, p.lng, z);
  const tx = Math.floor(x), ty = Math.floor(y);
  const px = (x - tx + 1) * 256, py = (y - ty + 1) * 256;
  const k = PLACE_KINDS[p.kind] ?? PLACE_KINDS.bar;
  return (
    <div className="relative h-64 overflow-hidden rounded-3xl border border-line bg-night">
      <div className="absolute top-1/2 left-1/2" style={{ width: 768, height: 768, transform: `translate(${-px}px, ${-py}px)` }}>
        {[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (
          <img key={`${dx}-${dy}`} alt="" draggable={false} src={`/tiles/plan/${z}/${tx + dx}/${ty + dy}.png`}
            className="absolute size-64 max-w-none select-none" style={{ left: (dx + 1) * 256, top: (dy + 1) * 256 }}
            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
        )))}
      </div>
      <span className="partner-glow absolute top-1/2 left-1/2 z-10 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-night/90 text-xl shadow" style={{ borderColor: k.color }}>{k.icon}</span>
      <span className="absolute top-[calc(50%-3.4rem)] left-1/2 z-10 max-w-[80%] -translate-x-1/2 truncate rounded-full bg-night/90 px-3 py-1 text-xs font-bold shadow">{p.name}</span>
      <span className="absolute right-3 bottom-3 rounded-full bg-night/85 px-3 py-1 text-[11px]" style={{ color: "#f472b6" }}>✨ votre lieu brille sur la carte</span>
    </div>
  );
}

/** La fiche telle que les utilisateurs la verront (mêmes classes que PlaceSheet), avec les vraies infos de l'établissement. */
function YourFiche({ p }: { p: ProspectPreview }) {
  const k = PLACE_KINDS[p.kind] ?? PLACE_KINDS.bar;
  const short = p.name.split(/\s+/).slice(0, 2).join(" ");
  return (
    <div className="relative rounded-3xl border border-line bg-surface p-5 shadow-2xl">
      <p className="text-sm" style={{ color: k.color }}>{k.icon} {k.label}</p>
      <h3 className="mt-1 font-display text-2xl font-extrabold break-words">{p.name}</h3>
      <p className="mt-2 text-sm">{p.description || "Votre description : ambiance, horaires, soirées…"}</p>
      <div className="mt-3 flex gap-2 overflow-hidden">
        {["from-[#FA6F6C] to-[#7c3aed]", "from-[#A1E3C3] to-[#0ea5e9]", "from-[#f472b6] to-[#fbbf24]"].map((g, i) => (
          <div key={i} className={"relative flex h-28 w-36 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-center text-xs font-bold text-night/80 " + g}>
            {i === 0 ? "📷 Vos photos ici" : ["", "jusqu'à 4", "en un clic"][i]}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {p.website && <span className="rounded-full bg-signal px-4 py-2 font-bold text-night">Site web ↗</span>}
        {p.contact && <span className="max-w-full truncate rounded-full border border-line px-4 py-2">{p.contact}</span>}
        {!p.website && !p.contact && <span className="rounded-full border border-dashed border-line px-4 py-2 text-muted">Votre site, téléphone, Instagram</span>}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Stars value={4.8} size="text-lg" />
        <span className="text-sm text-muted">Vos notes apparaîtront ici</span>
      </div>
      <h4 className="mt-4 font-display font-bold">Commentaires</h4>
      <div className="mt-2 rounded-2xl bg-night p-3 text-sm">
        <p className="text-xs text-muted"><b className="text-ink">Nico34</b> · ★★★★★</p>
        <p className="mt-1">Super ambiance, équipe adorable. Je reviens !</p>
        <p className="mt-2 border-l-2 pl-2 text-xs" style={{ borderColor: MINT }}><b>{short}</b> · Merci Nico, à très vite 🙂</p>
      </div>
      <h4 className="mt-4 font-display font-bold">Chat du lieu</h4>
      <div className="mt-2 space-y-1.5 rounded-2xl bg-night p-3 text-sm">
        <p><span className="text-xs font-bold text-muted">Alex</span> Il y a du monde ce soir ? 🙂</p>
        <p><span className="text-xs font-bold" style={{ color: MINT }}>{short} · PRO</span> Soirée DJ à 22 h, un verre offert avant minuit !</p>
        <p className="text-right"><span className="text-xs font-bold text-muted">Sam</span> J'arrive vers 23 h 🍹</p>
      </div>
      <p className="mt-3 text-[11px] text-muted">Aperçu : avis et messages d'exemple. Toutes les infos se modifient depuis votre espace pro.</p>
    </div>
  );
}

export function ProInvite({ token }: { token: string }) {
  const [p, setP] = useState<ProspectPreview | null | undefined>(token === "exemple" ? SAMPLE : undefined);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (token === "exemple") return;
    prospectPreview(token, !new URLSearchParams(location.search).has("apercu")).then(setP).catch((e: Error) => setErr(e.message));
  }, [token]);

  if (err) return <Shell><p className="mt-10 text-center text-muted">{err}. Réessayez dans un instant.</p></Shell>;
  if (p === undefined) return <Shell><p className="mt-10 text-center text-muted">Chargement de votre fiche…</p></Shell>;
  if (p === null) return (
    <Shell>
      <h1 className="mt-10 font-display text-2xl font-extrabold">Lien introuvable</h1>
      <p className="mt-2 text-muted">Ce lien d'invitation n'existe pas ou a été supprimé. Vous pouvez créer votre fiche vous-même en quelques minutes.</p>
      <a href="/pro" className="mt-6 flex h-14 items-center justify-center rounded-full font-display text-lg font-extrabold text-night" style={{ background: CORAL }}>Découvrir hdar pro</a>
    </Shell>
  );
  if (p.claimed || p.active) return (
    <Shell>
      <h1 className="mt-10 font-display text-2xl font-extrabold">« {p.name} » est déjà activée ✅</h1>
      <p className="mt-2 text-muted">Retrouvez-la dans votre espace pro pour la modifier, voir vos statistiques ou lancer un Live Pro.</p>
      <a href="/pro" className="mt-6 flex h-14 items-center justify-center rounded-full font-display text-lg font-extrabold text-night" style={{ background: CORAL }}>Ouvrir mon espace pro</a>
    </Shell>
  );

  const claimHref = token === "exemple" ? "/pro" : `/pro?claim=${encodeURIComponent(token)}`;
  const from = p.prices.length ? Math.min(...p.prices.map((x) => x.price_cents)) : null;
  const cta = (label = "Activer ma fiche") => (
    <a href={claimHref} className="flex h-14 w-full items-center justify-center rounded-full font-display text-lg font-extrabold text-night shadow-lg sm:w-auto sm:px-10" style={{ background: CORAL, boxShadow: `0 10px 40px -8px ${CORAL}` }}>
      {label}
    </a>
  );
  return (
    <Shell>
      <div className="space-y-14 pb-28">
        <section className="relative -mx-5 overflow-hidden px-5 pt-4">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute -top-16 -left-10 size-56 rounded-full opacity-40 blur-3xl" style={{ background: CORAL }} />
            <span className="absolute top-24 -right-16 size-64 rounded-full opacity-25 blur-3xl" style={{ background: MINT }} />
          </div>
          <div className="relative">
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: GOLD }}>Invitation hdar pro</p>
            <h1 className="mt-2 font-display text-[2rem] leading-[1.1] font-extrabold break-words sm:text-5xl">
              <span style={{ color: CORAL }}>{p.name}</span>, votre fiche est prête.
            </h1>
            <p className="mt-4 text-base text-muted">
              Elle s'allumera sur la carte hdar{p.city ? ` à ${p.city}` : ""} dès son activation, devant {audience(p)}. hdar est la carte en direct des sorties et rencontres autour de soi : gratuite, anonyme, 18+.
            </p>
            <div className="mt-6">{cta()}</div>
            <p className="mt-2 text-xs text-muted">{from != null ? `Dès ${euros(from)} la semaine · ` : ""}sans engagement · résiliable en un clic</p>
            <div className="mt-8"><MapAt p={p} /></div>
          </div>
        </section>

        <section>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: MINT }}>Votre page</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">Ce que verront vos clients en touchant votre pin</h2>
          <p className="mt-1 text-sm text-muted">Photos, description, site, avis avec étoiles, et le chat de votre lieu.</p>
          <div className="mt-5"><YourFiche p={p} /></div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-extrabold">Tout ce que vous pouvez faire</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(([i, t, d]) => (
              <div key={t} className="rounded-3xl border border-line bg-surface p-4">
                <p className="text-2xl">{i}</p>
                <h3 className="mt-1 font-display font-bold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-extrabold">En ligne en 3 étapes</h2>
          <ol className="mt-4 space-y-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3 rounded-3xl border border-line bg-surface p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full font-display font-extrabold text-night" style={{ background: i === 2 ? MINT : CORAL }}>{i + 1}</span>
                <span><b className="block">{t}</b><span className="text-sm text-muted">{d}</span></span>
              </li>
            ))}
          </ol>
        </section>

        {p.prices.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-extrabold">Tarifs</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {p.prices.map((x, i) => (
                <div key={x.label} className={"rounded-3xl border bg-surface p-4 " + (i === 1 ? "border-signal" : "border-line")}>
                  <p className="text-sm text-muted">{x.label}</p>
                  <p className="font-display text-3xl font-extrabold">{euros(x.price_cents)}</p>
                  {i === 1 && <p className="mt-1 text-xs font-bold text-signal">Le plus choisi</p>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Sans engagement, renouvelable, résiliable en un clic.{p.boost_from ? ` Boost Pro en option dès ${euros(p.boost_from)}.` : ""}</p>
          </section>
        )}

        <section>
          <h2 className="font-display text-2xl font-extrabold">Questions fréquentes</h2>
          <div className="mt-4 space-y-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="rounded-2xl border border-line bg-surface p-4">
                <summary className="cursor-pointer font-bold">{q}</summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="text-center">
          {cta(`Activer « ${p.name.length > 22 ? p.name.slice(0, 20) + "…" : p.name} »`)}
          <p className="mt-6 text-xs text-muted">
            Une question ? <a className="underline" href="mailto:contact@hdar.chat">contact@hdar.chat</a>
            {token !== "exemple" && !p.optout && <> · <a className="underline" href={`${SUPABASE_URL}/functions/v1/hdar-prospect?unsub=${encodeURIComponent(token)}`}>Ne plus recevoir nos emails</a></>}
          </p>
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-night/95 px-4 py-3 backdrop-blur sm:hidden">{cta()}</div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="h-dvh overflow-x-hidden overflow-y-auto bg-night px-5 py-6 text-ink">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="flex items-center gap-2"><Mark className="size-8" /><Wordmark /><span className="rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: MINT, color: MINT }}>PRO</span></a>
        {children}
      </div>
    </main>
  );
}
