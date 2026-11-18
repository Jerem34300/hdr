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
        {/* Liste pour les moteurs et la navigation clavier : visible dès qu'un lien reçoit le focus. */}
        <nav aria-label="Villes" className="sr-only focus-within:not-sr-only focus-within:mx-auto focus-within:block focus-within:max-w-2xl focus-within:px-5 focus-within:py-6 [&_a]:mr-3 [&_a]:inline-block [&_a]:py-1 [&_a]:underline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-[#FA6F6C]">{d.top.map((c) => <a key={c.s} href={`/petites-annonces/${c.s}`}>Petites annonces {c.n}{c.d ? ` (${c.d})` : ""}</a>)}</nav>
      </>
    );
  },
});
