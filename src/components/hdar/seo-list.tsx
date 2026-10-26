import type { ListPayload } from "@/lib/hdar/seo-geo/types";
import { CityChips, Count, Crumbs, Cta, Faq, Hero, SeoShell, fmt, seoHead } from "./seo-pages";

const label = (d: ListPayload) => (d.kind === "region" ? d.n : `${d.n} (${d.code})`);
export function listHead(d: ListPayload | undefined) {
  if (!d) return seoHead({ title: "Introuvable — hdar.", desc: "", path: "/rencontre", noindex: true });
  return seoHead({ title: `Rencontres et sorties ${d.kind === "region" ? "en " : ": "}${label(d)} : toutes les villes — hdar.`, desc: `Rencontres, tchat et sorties dans les ${fmt(d.count)} communes ${d.kind === "region" ? "de la région" : "du département"} ${d.n}. Carte en direct, gratuit, discret, pour tout le monde, 18+.`, path: `/rencontre/${d.kind}/${d.s}`, noindex: d.total < 100000 });
}
export function ListPage({ d }: { d: ListPayload }) {
  return (
    <SeoShell>
      <Hero seed={d.s} kicker={d.kind === "region" ? "Région" : "Département"} title={<>Rencontres et sorties {d.kind === "region" ? "en " : ": "}<span className="text-[#FA6F6C]">{d.kind === "region" ? d.n : label(d)}</span></>}>
        <p className="mt-4 text-lg text-ink/85">De {d.hubs[0]?.n ?? d.cities[0]?.n} aux plus petits villages : choisis ta commune et vois qui est connecté autour de toi.</p>
        <Cta />
        <dl className="mt-8 grid grid-cols-2 gap-2 text-center">
          <div className="seo-card py-3"><dt className="text-[11px] text-muted">communes</dt><dd className="font-display text-xl font-bold"><Count value={d.count} /></dd></div>
          <div className="seo-card py-3"><dt className="text-[11px] text-muted">habitants</dt><dd className="font-display text-xl font-bold"><Count value={d.total} /></dd></div>
        </dl>
      </Hero>
      <div className="mx-auto max-w-2xl px-5">
        <Crumbs items={[{ name: "hdar.", to: "/" }, { name: "Villes", to: "/rencontre" }, ...(d.parent ? [{ name: d.parent.n, to: `/rencontre/region/${d.parent.s}` }] : []), { name: d.n }]} />
        {d.hubs.length > 0 && <section className="seo-reveal mt-10"><h2 className="font-display text-2xl font-bold">Grandes villes</h2><CityChips list={d.hubs} /></section>}
        {d.deps.length > 0 && <section className="seo-reveal mt-10"><h2 className="font-display text-2xl font-bold">Départements</h2><ul className="mt-4 grid grid-cols-2 gap-2 text-sm">{d.deps.map((x) => <li key={x.s}><a className="seo-card block px-3 py-2.5" href={`/rencontre/departement/${x.s}`}>{x.n} ({x.code})</a></li>)}</ul></section>}
        <section className="seo-reveal mt-10">
          <h2 className="font-display text-2xl font-bold">{d.kind === "region" ? "Principales communes" : `Toutes les communes (${fmt(d.count)})`}</h2>
          <CityChips list={d.cities} />
        </section>
        <Faq items={[
          { q: `hdar fonctionne-t-il partout en ${d.n} ?`, a: `Oui, dans toutes les communes, des grandes villes aux villages. La carte montre les gens connectés autour de toi, quelle que soit ta commune.` },
          { q: "C'est pour qui ?", a: "Pour tout le monde, 18 ans et plus, et LGBT-friendly : rencontre amoureuse, amitié, tchat en ligne ou sortie ce soir." },
          { q: "C'est gratuit et discret ?", a: "Oui : pas d'e-mail, pas de compte obligatoire, position arrondie à environ 110 mètres." },
        ]} />
      </div>
    </SeoShell>
  );
}
