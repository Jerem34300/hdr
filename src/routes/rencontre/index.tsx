import { createFileRoute } from "@tanstack/react-router";
import { getIndex } from "@/lib/hdar/seo-geo/api";
import { CityChips, Crumbs, Cta, Hero, SeoShell, fmt, seoHead } from "@/components/hdar/seo-pages";

export const Route = createFileRoute("/rencontre/")({
  loader: () => getIndex(),
  head: () => seoHead({ title: "Rencontres et sorties partout en France, ville par ville — hdar.", desc: "Trouve ta ville ou ta région : la carte en direct des gens visibles autour de toi, le chat du quartier et les lieux. Gratuit, discret, pour tout le monde, 18+.", path: "/rencontre" }),
  component: () => {
    const d = Route.useLoaderData();
    return (
      <SeoShell>
        <Hero seed="france" kicker="Toute la France" title={<>Rencontres et sorties, <span className="text-[#FA6F6C]">ville par ville</span></>}>
          <p className="mt-4 text-lg text-ink/85">{fmt(d.count)} communes, de la grande ville au village. Choisis la tienne.</p>
          <Cta />
        </Hero>
        <div className="mx-auto max-w-2xl px-5">
          <Crumbs items={[{ name: "hdar.", to: "/" }, { name: "Villes" }]} />
          <h2 className="mt-8 font-display text-2xl font-bold">Par région</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">{d.regions.map((r) => <li key={r.s}><a className="seo-card block px-3 py-2.5" href={`/rencontre/region/${r.s}`}>{r.n}</a></li>)}</ul>
          <h2 className="mt-10 font-display text-2xl font-bold">Grandes villes</h2>
          <CityChips list={d.top} />
        </div>
      </SeoShell>
    );
  },
});
