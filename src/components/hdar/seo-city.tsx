import type { CityPayload } from "@/lib/hdar/seo-geo/types";
import { SITE_URL } from "@/lib/hdar/seo";
import { LOCAL } from "@/lib/hdar/seo-local";
import { cityAlternates } from "./seo-city-intl";
import { CityChips, Count, Crumbs, Cta, Faq, Feature, Hero, Ld, SeoShell, fmt, pick, seoHead } from "./seo-pages";

export type Theme = "tchat-gay" | "sortir-ce-soir" | null;
const size = (c: CityPayload) => (c.p >= 100000 ? "big" : c.p >= 20000 ? "mid" : c.p >= 2000 ? "small" : "tiny");
const path = (c: CityPayload, t: Theme) => `/rencontre/${c.s}${t ? "/" + t : ""}`;
const a = (n: string) => (n.startsWith("Le ") ? `au ${n.slice(3)}` : n.startsWith("Les ") ? `aux ${n.slice(4)}` : `à ${n}`);
/** Prefers curated LOCAL.nearby slugs present in geo nearby, then the rest — intentional internal links. */
function nearbyList(c: CityPayload, local?: { nearby?: string[] }) {
  if (!local?.nearby?.length) return c.nearby;
  const by = new Map(c.nearby.map((m) => [m.s, m]));
  const curated = local.nearby.map((s) => by.get(s)).filter((m): m is NonNullable<typeof m> => !!m);
  const rest = c.nearby.filter((m) => !local.nearby!.includes(m.s));
  return [...curated, ...rest].slice(0, 12);
}

export function cityHead(c: CityPayload | undefined, t: Theme, og?: string) {
  if (!c) return seoHead({ title: "Ville introuvable — hdar.", desc: "", path: "/rencontre", noindex: true });
  const local = LOCAL[c.s];
  // Titres ≤60, descriptions ≤155 : ville + tchat/rencontre/autour de toi + gratuit/anonyme/18+.
  const title = t === "tchat-gay" ? `Tchat gay ${c.n} · LGBT-friendly, 18+ — hdar.`
    : t === "sortir-ce-soir" ? `Sortir ce soir ${a(c.n)} · autour de toi — hdar.`
    : pick(c.s, [
      `${c.n} : plans, tchat & rencontres — hdar.`,
      `Plans et tchat ${a(c.n)} · autour de toi — hdar.`,
      `Tchat & rencontres ${a(c.n)} · gratuit, 18+ — hdar.`,
    ]);
  const desc = t === "tchat-gay" ? `Tchat gay et LGBT-friendly ${a(c.n)}. Autour de toi, gratuit, anonyme, 18+. Carte en direct et messages privés.`
    : t === "sortir-ce-soir" ? `Sortir ce soir ${a(c.n)} ? Qui est autour de toi en direct. Gratuit, anonyme, 18+. Carte et chat du quartier.`
    : (local?.description ?? `Plans, tchat et rencontres ${a(c.n)}, autour de toi. Gratuit, anonyme, 18+. Carte en direct et chat du quartier, pour tout le monde.`);
  // Sous-pages thème = quasi-doublon de la page ville ; petites communes = gabarit : noindex, follow.
  const h = seoHead({ title, desc, path: path(c, t), og: og ?? local?.og, noindex: !!t || c.strong === false });
  return t ? h : { ...h, links: [...h.links, ...cityAlternates(c.s)] };
}

function intro(c: CityPayload) {
  const pop = fmt(c.p), s = size(c);
  const where = c.isHub ? `pôle de ${c.aroundCount > 0 ? fmt(c.aroundCount) + " communes alentour" : "sa région"}` : `à ${c.hubKm} km de ${c.hub.n}`;
  const v: Record<string, string[]> = {
    big: [`Avec ${pop} habitants, ${c.n} est la ${c.rankInDep === 1 ? "plus grande ville" : `${c.rankInDep}e commune`} du département ${c.dep.n}. Il y a toujours quelqu'un dehors, encore faut-il savoir où.`, `${c.n} compte ${pop} habitants et des quartiers qui vivent jusque tard. hdar te montre qui est visible autour de toi, maintenant.`],
    mid: [`${c.n} (${pop} habitants, ${c.dep.n}) est une ville à taille humaine, ${where}. Sur hdar, tu vois qui est visible près de toi ; si c'est calme, dézoome la carte pour voir qui est chaud ailleurs.`, `Ville de ${pop} habitants ${c.isHub ? "au cœur de sa région" : where}, ${c.n} a ses habitués et ses soirées. La carte en direct t'aide à les trouver.`],
    small: [`${c.n} compte ${pop} habitants, ${where}. Dans une ville de cette taille, la bonne personne est souvent à quelques rues : la carte te le montre.`, `À ${c.n} (${c.dep.n}, ${pop} habitants), pas besoin de faire des kilomètres pour discuter. hdar couvre la commune et les villes voisines.`],
    tiny: [`${c.n} est une petite commune de ${pop} habitants du département ${c.dep.n}, ${where}. hdar marche aussi ici : la carte regroupe les gens visibles dans les communes autour.`, `Même dans une commune de ${pop} habitants comme ${c.n}, tu peux voir qui est visible dans le coin, jusqu'à ${c.hub.n} (${c.hubKm} km).`],
  };
  return pick(c.s + "i", v[s]);
}

const INTENTS = (c: CityPayload) => [
  { icon: "🌙", t: "Sortir ce soir", d: pick(c.s + "1", [`Regarde qui est dehors ${a(c.n)} ce soir et où ça bouge.`, `Une envie de sortir ? Le chat du quartier te dit où les gens sont, maintenant.`, `Crée un lieu pour ta soirée et retrouve les gens du coin en direct.`]) },
  { icon: "🔥", t: "Plans autour de toi", d: pick(c.s + "p", [`Un plan ${a(c.n)} ce soir ? La carte montre qui est visible près de toi, 18+. Personne autour ? Dézoome ou change de ville en haut à droite.`, `Envie d'un plan discret ${a(c.n)} ? Tchat d'abord, puis on voit. Personne autour ? Dézoome la carte ou change de ville en haut à droite.`]) },
  { icon: "💘", t: "Rencontre amoureuse", d: pick(c.s + "2", [`Prends le temps de discuter avant de te voir : messages, vocaux, appel vidéo.`, `Fais connaissance tranquillement, sans profil interminable à remplir.`]) },
  { icon: "🤝", t: "Amitié, se faire des amis", d: pick(c.s + "3", [`Nouveau ${a(c.n)} ? Trouve des gens pour un verre, un sport, une balade.`, `Pas que pour draguer : beaucoup viennent juste pour rencontrer du monde.`]) },
  { icon: "💬", t: "Tchat en ligne, amis virtuels", d: pick(c.s + "4", [`Discute depuis ton canapé avec les gens du coin, sans obligation de se voir.`, `Le chat du quartier et les messages privés, même sans sortir de chez toi.`]) },
  { icon: "✨", t: "Sans prise de tête", d: pick(c.s + "5", [`Une rencontre d'un soir ou un simple café : chacun dit ce qu'il cherche, entre adultes consentants.`, `Spontané et sans pression : tu te connectes 1 h, 3 h ou toute la nuit, puis tu disparais.`]) },
  { icon: "🏳️‍🌈", t: "Pour tout le monde, LGBT-friendly", d: `Hétéro, gay, lesbienne, bi, trans ou en questionnement : hdar est ouvert à tous ${a(c.n)}.` },
];

export function CityPage({ c, theme }: { c: CityPayload; theme: Theme }) {
  const local = LOCAL[c.s];
  const url = SITE_URL + path(c, theme);
  const h1 = theme === "tchat-gay" ? <>Tchat gay et LGBT-friendly <span className="text-[#FA6F6C]">{a(c.n)}</span></>
    : theme === "sortir-ce-soir" ? <>Sortir ce soir <span className="text-[#FA6F6C]">{a(c.n)}</span></>
    : <>Plans, tchat et rencontres <span className="text-[#FA6F6C]">{a(c.n)}</span></>;
  const faq = [
    { q: `Comment faire des rencontres ${a(c.n)} avec hdar ?`, a: `Ouvre hdar.chat, autorise ta position et touche « Se montrer » : tu apparais sur la carte autour de ${c.n} pour 1 h, 3 h ou toute la nuit. Touche un profil pour lui écrire, envoyer une photo, un vocal ou lancer un appel vidéo.` },
    { q: "hdar est-il gratuit ?", a: "Oui. La carte, le chat du quartier, les messages privés et les lieux sont gratuits. Une option payante (hdar+) ajoute des extras, mais elle n'est pas nécessaire." },
    { q: "Faut-il créer un compte ou donner son e-mail ?", a: "Non. Tu choisis un pseudo et tu confirmes avoir 18 ans. Pas d'e-mail, pas de mot de passe, pas de photo obligatoire." },
    { q: "Ma position exacte est-elle visible ?", a: "Non. Les autres voient une position arrondie à environ 110 mètres et une distance approximative, jamais ton adresse." },
    { q: `hdar est-il réservé aux gays ${a(c.n)} ?`, a: "Non, hdar est pour tout le monde, quelle que soit ton orientation, et reste LGBT-friendly. Tu peux y chercher une rencontre amoureuse, des amis, une sortie ou juste discuter." },
    { q: `Que faire s'il y a peu de monde visible près de ${c.n} ?`, a: c.isHub ? `Élargis la carte : elle couvre aussi les communes autour de ${c.n}. Le chat du quartier réunit les gens dans un rayon d'environ 3 km.` : `Élargis la carte vers ${c.hub.n} (${c.hubKm} km) et les communes voisines, ou crée un lieu pour que les gens du coin te trouvent.` },
    ...(local?.faq ?? []),
  ];
  const kicker = `${c.dep.n} · ${c.reg.n}`;
  return (
    <SeoShell>
      <Ld data={{ "@context": "https://schema.org", "@type": "WebPage", url, name: `Rencontres et sorties ${a(c.n)}`, about: { "@type": "City", name: c.n, geo: { "@type": "GeoCoordinates", latitude: c.y, longitude: c.x }, containedInPlace: { "@type": "AdministrativeArea", name: c.dep.n } } }} />
      <Ld data={{ "@context": "https://schema.org", "@type": "WebApplication", name: "hdar.", url: SITE_URL, applicationCategory: "SocialNetworkingApplication", operatingSystem: "Web, iOS, Android", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" } }} />
      <Hero seed={c.s} kicker={kicker} title={h1}>
        <p className="mt-4 text-lg leading-snug text-ink/85">{theme === "tchat-gay" ? `Gays, bis, lesbiennes, trans et curieux ${a(c.n)} : vois qui est visible autour de toi et discute en privé.` : theme === "sortir-ce-soir" ? `Qui est dehors ce soir ${a(c.n)} ? La carte en direct te le montre, avec le chat du quartier pour savoir où ça bouge.` : intro(c)}</p>
        <Cta />
        <p className="mt-3 text-xs text-muted">Gratuit · sans compte · position arrondie · 18+</p>
        <dl className="mt-8 grid grid-cols-3 gap-2 text-center">
          <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">habitants</dt><dd className="font-display text-xl font-bold"><Count value={c.p} /></dd></div>
          {c.isHub ? <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">communes autour</dt><dd className="font-display text-xl font-bold"><Count value={c.aroundCount} /></dd></div>
            : <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">de {c.hub.n}</dt><dd className="font-display text-xl font-bold"><Count value={c.hubKm} suffix=" km" /></dd></div>}
          <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">rayon du chat</dt><dd className="font-display text-xl font-bold">~3 km</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Source habitants :{" "}
          <a className="underline" href="https://www.insee.fr/fr/information/2382986" rel="noopener" target="_blank">INSEE</a>
          {" "}via geo.api.gouv.fr (populations communales, réf. 2023).
        </p>
      </Hero>
      <article className="mx-auto max-w-2xl px-5">
        <Crumbs items={[
          { name: "hdar.", to: "/" },
          { name: c.reg.n, to: `/rencontre/region/${c.reg.s}` },
          // Paris, Lyon… : le département porte le même nom que la ville — on saute ce cran.
          ...(c.dep.n === c.n ? [] : [{ name: c.dep.n, to: `/rencontre/departement/${c.dep.s}` }]),
          ...(theme ? [{ name: c.n, to: path(c, null) }] : []),
          { name: theme === "tchat-gay" ? "Tchat gay" : theme === "sortir-ce-soir" ? "Sortir ce soir" : c.n },
        ]} />
        <h2 className="seo-reveal mt-10 font-display text-2xl font-bold">Plans et rencontres {a(c.n)}</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">{INTENTS(c).map((i) => <Feature key={i.t} icon={i.icon} title={i.t}>{i.d}</Feature>)}</ul>
        <h2 className="seo-reveal mt-12 font-display text-2xl font-bold">Comment ça marche</h2>
        <ol className="seo-reveal mt-4 space-y-2 text-sm leading-relaxed">
          <li><strong className="text-[#FA6F6C]">1.</strong> Ouvre hdar.chat et confirme que tu as 18 ans. Pas d'e-mail.</li>
          <li><strong className="text-[#FA6F6C]">2.</strong> Touche « Se montrer » : tu apparais sur la carte {c.p < 2000 ? `du secteur de ${c.n}` : `de ${c.n}`} pour 1 h, 3 h ou toute la nuit.</li>
          <li><strong className="text-[#FA6F6C]">3.</strong> Écris dans le chat du quartier, crée un lieu ou envoie un message privé.</li>
        </ol>
        {theme === null && local?.body}
        {theme === null && (
          <section className="seo-reveal mt-12">
            <h2 className="font-display text-2xl font-bold">Lieux de drague {a(c.n)}</h2>
            <p className="mt-3 text-sm leading-relaxed">
              Sur la carte hdar, les lieux publics (parcs, belvédères, spots signalés par la communauté) apparaissent via le calque
              « Autres lieux publics » — à activer si besoin. Aucune adresse précise ici : seulement la carte en direct, pour les 18 ans et plus,
              avec un rappel de discrétion et de respect des autres usagers.
            </p>
            <p className="mt-4">
              <a
                href={`/?layers=public&lat=${c.y}&lng=${c.x}&ville=${encodeURIComponent(c.n)}`}
                className="inline-flex h-12 items-center rounded-full border border-[#FA6F6C]/40 bg-[#FA6F6C]/10 px-5 text-sm font-semibold text-[#FA6F6C] hover:bg-[#FA6F6C]/20"
              >
                Ouvrir la carte · calque lieux publics {a(c.n)}
              </a>
            </p>
            <p className="mt-2 text-xs text-muted">18+ · calque à activer · aucune adresse sur cette page.</p>
          </section>
        )}
        {c.isHub && c.around.length > 0 && (
          <section className="seo-reveal mt-12">
            <h2 className="font-display text-2xl font-bold">Autour de {c.n}</h2>
            <p className="mt-2 text-sm text-muted">{c.aroundCount > c.around.length ? `Les ${c.around.length} plus grandes des ${fmt(c.aroundCount)} communes rattachées à ${c.n}. Les autres sont sur la page du département.` : `Les communes rattachées à ${c.n}.`}</p>
            <CityChips list={c.around} showKm />
          </section>
        )}
        <section className="seo-reveal mt-12">
          <h2 className="font-display text-2xl font-bold">{c.isHub ? `Villes voisines de ${c.n}` : `Autour de ${c.n}`}</h2>
          <CityChips list={nearbyList(c, local)} showKm />
          {!c.isHub && <p className="mt-4 text-sm">Grande ville la plus proche : <a className="text-[#FA6F6C] underline" href={`/rencontre/${c.hub.s}`}>rencontres à {c.hub.n}</a> ({c.hubKm} km).</p>}
          {c.top && <p className="mt-4 flex flex-wrap gap-2 text-sm">{theme !== null && <a className="underline" href={path(c, null)}>Rencontres {a(c.n)}</a>}{theme !== "tchat-gay" && <a className="underline" href={path(c, "tchat-gay")}>Tchat gay {c.n}</a>}{theme !== "sortir-ce-soir" && <a className="underline" href={path(c, "sortir-ce-soir")}>Sortir ce soir {a(c.n)}</a>}<a className="underline" href={`/rencontre/${c.s}/live-coquin`}>Live coquin {c.n}</a></p>}
        </section>
        <Faq items={faq} />
        <div className="seo-reveal my-12 text-center"><Cta label={`Voir qui est autour ${a(c.n)}`} /></div>
      </article>
    </SeoShell>
  );
}
