import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCity } from "@/lib/hdar/seo-geo/api";
import { CityPage, cityHead, type Theme } from "@/components/hdar/seo-city";

export const Route = createFileRoute("/rencontre/$slug_/$theme")({
  loader: async ({ params }) => {
    if (params.theme !== "tchat-gay" && params.theme !== "sortir-ce-soir") throw notFound();
    const c = await getCity({ data: params.slug }); if (!c || !c.top) throw notFound(); return c;
  },
  head: ({ loaderData, params }) => cityHead(loaderData, params.theme as Theme),
  component: () => <CityPage c={Route.useLoaderData()} theme={Route.useParams().theme as Theme} />,
});
