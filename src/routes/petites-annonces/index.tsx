import { createFileRoute } from "@tanstack/react-router";
import { getAdsIndex } from "@/lib/hdar/seo-geo/api";
import { AdsPage, adsHead } from "@/components/hdar/seo-annonces";

export const Route = createFileRoute("/petites-annonces/")({
  loader: () => getAdsIndex(),
  head: () => adsHead(null),
  component: () => {
    const d = Route.useLoaderData();
    return (
      <>
        <AdsPage c={null} city={0} region={d.total} />
        <nav aria-label="Villes" className="sr-only">{d.top.map((c) => <a key={c.s} href={`/petites-annonces/${c.s}`}>Petites annonces {c.n}</a>)}</nav>
      </>
    );
  },
});
