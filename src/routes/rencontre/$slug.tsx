import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCity } from "@/lib/hdar/seo-geo/api";
import { LOCAL } from "@/lib/hdar/seo-local";
import { CityPage, cityHead } from "@/components/hdar/seo-city";

export const Route = createFileRoute("/rencontre/$slug")({
  loader: async ({ params }) => { const c = await getCity({ data: params.slug }); if (!c) throw notFound(); return c; },
  head: ({ loaderData }) => cityHead(loaderData, null, LOCAL[loaderData?.s ?? ""]?.og),
  component: () => <CityPage c={Route.useLoaderData()} theme={null} />,
});
