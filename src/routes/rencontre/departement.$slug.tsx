import { createFileRoute, notFound } from "@tanstack/react-router";
import { getDep } from "@/lib/hdar/seo-geo/api";
import { ListPage, listHead } from "@/components/hdar/seo-list";

export const Route = createFileRoute("/rencontre/departement/$slug")({
  loader: async ({ params }) => { const d = await getDep({ data: params.slug }); if (!d) throw notFound(); return d; },
  head: ({ loaderData }) => listHead(loaderData),
  component: () => <ListPage d={Route.useLoaderData()} />,
});
