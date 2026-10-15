import { createFileRoute, notFound } from "@tanstack/react-router";
import { getRegion } from "@/lib/hdar/seo-geo/api";
import { ListPage, listHead } from "@/components/hdar/seo-list";

export const Route = createFileRoute("/rencontre/region/$slug")({
  loader: async ({ params }) => { const d = await getRegion({ data: params.slug }); if (!d) throw notFound(); return d; },
  head: ({ loaderData }) => listHead(loaderData),
  component: () => <ListPage d={Route.useLoaderData()} />,
});
