import { createFileRoute, notFound } from "@tanstack/react-router";
import { getAdsCity } from "@/lib/hdar/seo-geo/api";
import { AdsPage, adsHead } from "@/components/hdar/seo-annonces";

export const Route = createFileRoute("/petites-annonces/$slug")({
  loader: async ({ params }) => { const d = await getAdsCity({ data: params.slug }); if (!d) throw notFound(); return d; },
  head: ({ loaderData }) => adsHead(loaderData ? loaderData.c : undefined),
  component: () => { const d = Route.useLoaderData(); return <AdsPage c={d.c} city={d.city} region={d.region} />; },
});
