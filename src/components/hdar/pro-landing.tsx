import type { PriceRow } from "@/lib/hdar/live";
import { PLACE_KINDS, Stars } from "./places-layer";
import { Mark, Wordmark } from "./logo";

const CORAL = "#FA6F6C";
const MINT = "#A1E3C3";
const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

function Bokeh({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={"pointer-events-none absolute inset-0 overflow-hidden " + className}>
      <span className="absolute -top-16 -left-10 size-56 rounded-full opacity-40 blur-3xl" style={{ background: CORAL }} />
      <span className="absolute top-24 -right-16 size-64 rounded-full opacity-25 blur-3xl" style={{ background: MINT }} />
      <span className="absolute bottom-0 left-1/3 size-40 rounded-full opacity-20 blur-3xl" style={{ background: "#f472b6" }} />
    </div>
  );
}

/** Extrait de carte : vraies tuiles de l'appli (Montpellier) + pins tels que map-view les dessine. */
export function MapSnippet() {
  const z = 15, x0 = 16736, y0 = 11956;
  const bar = PLACE_KINDS.bar, park = PLACE_KINDS.park, beach = PLACE_KINDS.cruising;
  const pin = "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-night/90 text-sm shadow ";
  return (
    <div className="relative h-56 overflow-hidden rounded-3xl border border-line bg-night">
      <div className="absolute" style={{ left: -150, top: -230, width: 768, height: 768 }}>
        {[0, 1, 2].flatMap((dy) => [0, 1, 2].map((dx) => (
          <img key={`${dx}-${dy}`} alt="" src={`/tiles/plan/${z}/${x0 + dx}/${y0 + dy}.png`} className="absolute size-64 select-none" style={{ left: dx * 256, top: dy * 256 }} draggable={false} />
        )))}
      </div>
      <span className={pin + "partner-glow z-[15] size-10"} style={{ left: "52%", top: "48%", borderColor: bar.color }}>{bar.icon}</span>
      <span className={pin + "z-10 size-8"} style={{ left: "22%", top: "70%", borderColor: park.color }}>{park.icon}</span>
      <span className={pin + "z-10 size-8"} style={{ left: "82%", top: "26%", borderColor: beach.color }}>{beach.icon}</span>
      {[["18%", "30%", "M"], ["70%", "72%", "J"], ["38%", "22%", "L"], ["86%", "60%", "K"]].map(([l, t, n]) => (
        <span key={n} className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-online bg-surface text-xs font-bold" style={{ left: l, top: t }}>{n}</span>
      ))}
      <span className="absolute top-3 left-3 rounded-full bg-night/85 px-3 py-1 text-[11px] font-bold">Exemple · Montpellier</span>
      <span className="absolute right-3 bottom-3 rounded-full bg-night/85 px-3 py-1 text-[11px]" style={{ color: "#f472b6" }}>✨ votre lieu brille sur la carte</span>
    </div>
  );
}

/** Fiche démo, mêmes classes que PlaceSheet / PlaceExtras / PlaceChat. */
export function SampleFiche() {
  const k = PLACE_KINDS.bar;
  const comments = [
    ["Nico34", 5, "Ambiance au top le jeudi, équipe adorable. Je reviens !"],
    ["Yanis", 5, "Le meilleur after du quartier, cocktails maison 🔥"],
    ["Théo.M", 4, "Super terrasse, un peu de monde le samedi mais ça vaut le coup."],
  ] as const;
  return (
    <div className="relative rounded-3xl border border-line bg-surface p-5 shadow-2xl">
      <span className="absolute top-3 right-3 rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">Exemple</span>
      <p className="text-sm" style={{ color: k.color }}>{k.icon} {k.label}</p>
      <h3 className="mt-1 pr-16 font-display text-2xl font-extrabold">Le Néon Imaginaire</h3>
      <p className="mt-2 text-sm">Bar cocktails & DJ sets du jeudi au samedi, 18 h – 2 h. Happy hour jusqu'à 21 h.</p>
      <div className="mt-3 flex gap-2 overflow-hidden">
        {["from-[#FA6F6C] to-[#7c3aed]", "from-[#A1E3C3] to-[#0ea5e9]", "from-[#f472b6] to-[#fbbf24]"].map((g, i) => (
          <div key={i} className={"relative h-28 w-36 shrink-0 rounded-2xl bg-gradient-to-br " + g}>
            <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-80">{["🍸", "🪩", "🌙"][i]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-signal px-4 py-2 font-bold text-night">Site web ↗</span>
        <span className="rounded-full border border-line px-4 py-2">@leneon.demo</span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Stars value={4.7} size="text-lg" />
        <span className="text-sm text-muted">4,7 / 5 · 38 notes</span>
      </div>
      <h4 className="mt-4 font-display font-bold">Commentaires</h4>
      <ul className="mt-2 space-y-2">
        {comments.map(([p, s, b]) => (
          <li key={p} className="rounded-2xl bg-night p-3 text-sm">
            <p className="text-xs text-muted"><b className="text-ink">{p}</b> · {"★".repeat(s)}</p>
            <p className="mt-1">{b}</p>
          </li>
        ))}
      </ul>
      <h4 className="mt-4 font-display font-bold">Chat du lieu</h4>
      <div className="mt-2 space-y-1.5 rounded-2xl bg-night p-3 text-sm">
        <p><span className="text-xs font-bold text-muted">Alex</span> Quelqu'un ce soir ? 🙂</p>
        <p><span className="text-xs font-bold text-muted">Le Néon</span> Soirée DJ à 22 h, shot offert avant minuit !</p>
        <p className="text-right"><span className="text-xs font-bold text-muted">Sam</span> J'arrive vers 23 h 🍹</p>
      </div>
      <p className="mt-3 text-[11px] text-muted">Établissement fictif, pseudos et avis de démonstration.</p>
    </div>
  );
}

const BENEFITS = [
  ["📍", "Vu en temps réel", "Votre lieu s'affiche aux personnes visibles autour de vous, au moment où elles cherchent où sortir."],
  ["✨", "Un halo qui attire l'œil", "Ton pin brille sur la carte, impossible de le rater parmi les autres lieux."],
  ["💬", "Votre propre chat", "Annoncez une soirée, répondez aux questions, créez l'envie avant même que les gens arrivent."],
  ["⭐", "Avis sous votre contrôle", "Notes et commentaires : activés ou non, publics sur la fiche ou privés pour vous seul."],
  ["📊", "Des stats concrètes", "Vues, visiteurs uniques, clics vers votre site, zones d'origine, heures de pointe."],
  ["🔒", "Respect de l'anonymat", "Stats agrégées par zone : vous mesurez votre audience sans jamais savoir qui est qui."],
] as const;

const FAQ = [
  ["Y a-t-il un engagement ?", "Non. Vous choisissez 1 semaine, 1 mois ou 3 mois. L'abonnement se renouvelle, mais vous l'arrêtez quand vous voulez."],
  ["Comment résilier ?", "En un clic depuis votre espace pro, via le portail sécurisé Stripe. Votre fiche reste visible jusqu'à la fin de la période payée."],
  ["Les utilisateurs restent-ils anonymes ?", "Oui. hdar ne vous donne jamais l'identité ni la position exacte de quelqu'un : les statistiques sont regroupées par zone."],
  ["Je peux désactiver les avis ?", "Oui, à tout moment : notes et commentaires activés ou non, publics ou privés."],
  ["Quels lieux sont acceptés ?", "Bars, clubs, saunas, événements, restaurants, commerces, lieux LGBT-friendly et inclusifs. Les fiches sont modérées selon nos CGU."],
] as const;

export function ProLanding({ prices, boostPrices = [], onCreate }: { prices: PriceRow[]; boostPrices?: PriceRow[]; onCreate: () => void }) {
  const cta = (label = "Créer ma fiche") => (
    <button type="button" onClick={onCreate} className="h-14 w-full rounded-full font-display text-lg font-extrabold text-night shadow-lg sm:w-auto sm:px-10" style={{ background: CORAL, boxShadow: `0 10px 40px -8px ${CORAL}` }}>
      {label}
    </button>
  );
  return (
    <div className="mt-5 space-y-14 pb-10">
      {/* hero */}
      <section className="relative -mx-5 overflow-hidden px-5 pt-6 pb-8">
        <Bokeh />
        <div className="relative">
          <div className="flex items-center gap-2"><Mark className="size-8" /><Wordmark /><span className="rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: MINT, color: MINT }}>PRO</span></div>
          <h2 className="mt-5 font-display text-[2rem] leading-[1.1] font-extrabold sm:text-5xl">
            Mettez votre lieu sur <span style={{ color: CORAL }}>la carte</span> que la communauté regarde <span style={{ color: MINT }}>en ce moment</span>.
          </h2>
          <p className="mt-4 text-base text-muted">hdar, c'est la carte live des sorties et rencontres autour de soi, pour tout le monde. Votre bar, club ou sauna apparaît là où les gens décident de sortir, avec un halo lumineux, votre chat et vos avis.</p>
          <div className="mt-6">{cta()}</div>
          <p className="mt-2 text-xs text-muted">Sans engagement · en ligne en quelques minutes · paiement sécurisé Stripe</p>
          <div className="mt-8"><MapSnippet /></div>
        </div>
      </section>

      {/* aperçu */}
      <section>
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: MINT }}>Aperçu</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">Voilà ce que voient les utilisateurs</h2>
        <p className="mt-1 text-sm text-muted">Un tap sur votre pin ouvre votre fiche : photos, site, note, avis et chat en direct.</p>
        <div className="mt-5"><SampleFiche /></div>
      </section>

      {/* avantages */}
      <section>
        <h2 className="font-display text-2xl font-extrabold">Pourquoi hdar pro ?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map(([i, t, d]) => (
            <div key={t} className="rounded-3xl border border-line bg-surface p-4">
              <p className="text-2xl">{i}</p>
              <h3 className="mt-1 font-display font-bold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Avantages partenaires */}
      <section className="rounded-3xl border border-[#fbbf24]/50 bg-surface p-5">
        <h2 className="font-display text-2xl font-extrabold">Tout ce qui est inclus</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["📍", "Votre lieu sur la carte", "Fiche avec photos, site, horaires, notes et chat du lieu, mise en avant avec son halo."],
            ["🏷️", "Badge Partenaire", "Le nom de votre lieu et le badge Partenaire s'affichent partout où vous apparaissez."],
            ["🎥", "Live Pro · toute la France", "Faites des lives vidéo sans limite de distance : vous croisez des membres partout, pas seulement autour de vous."],
            ["🎁", "Cadeaux pro", "Offrez un verre, une entrée à -20 %… avec code promo et date d'expiration, à montrer sur place. 20 par jour."],
            ["💬", "Écrire en pro", "Ouvrez des conversations privées en tant que partenaire. 20 nouvelles conversations par jour."],
            ["📊", "Stats en direct", "Vues, clics, messages et provenance de vos visiteurs, jour par jour."],
          ].map(([i, t, d]) => (
            <div key={t} className="flex gap-3 rounded-2xl bg-night p-4">
              <span className="text-3xl">{i}</span>
              <div><h3 className="font-display font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Pour protéger les membres : ils peuvent refuser messages et cadeaux des pros, bloquer ou signaler. Aucune position précise n'est jamais partagée.</p>
      </section>

      {/* étapes */}
      <section>
        <h2 className="font-display text-2xl font-extrabold">En ligne en 3 étapes</h2>
        <ol className="mt-4 space-y-3">
          {[["Créez votre fiche", "Nom, description, photos, site, position. Choisissez vos réglages d'avis."], ["Choisissez l'abonnement", "1 semaine, 1 mois ou 3 mois, paiement sécurisé par Stripe. Votre lieu brille aussitôt sur la carte."], ["Votre espace pro", "Tableau de bord (stats, avis), Live Pro, cadeaux pro, Boost Pro : tout au même endroit."]].map(([t, d], i) => (
            <li key={t} className="flex gap-4 rounded-3xl border border-line bg-surface p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-extrabold text-night" style={{ background: i === 1 ? MINT : CORAL }}>{i + 1}</span>
              <div><h3 className="font-display font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {/* tarifs */}
      {prices.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-extrabold">Tarifs simples</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {prices.map((p, i) => {
              const best = i === 1;
              return (
                <div key={p.product} className="relative rounded-3xl border bg-surface p-5" style={{ borderColor: best ? CORAL : "var(--color-line)" }}>
                  {best && <span className="absolute -top-3 left-5 rounded-full px-3 py-0.5 text-[11px] font-bold text-night" style={{ background: CORAL }}>Le plus choisi</span>}
                  <p className="font-display font-bold">{p.label}</p>
                  <p className="mt-1 font-display text-3xl font-extrabold">{euros(p.price_cents)}</p>
                  <p className="mt-2 text-xs text-muted">Halo sur la carte · chat · avis · stats</p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Prix TTC, renouvellement automatique, résiliable à tout moment.</p>
        </section>
      )}

      {/* Boost Pro */}
      <section className="rounded-3xl border border-[#fbbf24]/60 bg-surface p-5 shadow-[0_0_30px_#fbbf2433]">
        <p className="text-xs font-bold tracking-[0.25em] text-[#fbbf24] uppercase">Option · partenaires actifs</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">⭐ Boost Pro</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>🟡 <b>Pin doré</b> qui brille sur la carte</li>
          <li>⭐ En tête de <b>« À la une »</b> dans l'onglet Lieux</li>
          <li>🎥 <b>Priorité dans le Live Pro</b> : les membres tombent sur vous en premier</li>
        </ul>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {(boostPrices.length ? boostPrices.map((p) => [p.label, euros(p.price_cents)]) : [["24 heures", "4,99 €"], ["7 jours", "19,99 €"], ["30 jours", "59,99 €"]]).map(([l, e]) => (
              <tr key={l} className="border-t border-line"><td className="py-2">{l}</td><td className="py-2 text-right font-display text-lg font-extrabold text-[#fbbf24]">{e}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Paiement unique, sans renouvellement. À acheter depuis votre espace partenaire, fiche par fiche.</p>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="font-display text-2xl font-extrabold">Questions fréquentes</h2>
        <div className="mt-4 space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer font-bold">{q}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="relative overflow-hidden rounded-3xl border border-line p-6 text-center">
        <Bokeh />
        <div className="relative">
          <h2 className="font-display text-2xl font-extrabold">Ce soir, tout le monde cherche où sortir.</h2>
          <p className="mt-2 text-sm text-muted">Faites en sorte qu'on vous trouve.</p>
          <div className="mt-5">{cta("Créer ma fiche maintenant")}</div>
        </div>
      </section>
    </div>
  );
}
