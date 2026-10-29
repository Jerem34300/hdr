import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCity } from "@/lib/hdar/seo-geo/api";
import { IntlCityPage, intlCityHead, isSeoLang, type SeoLang } from "@/components/hdar/seo-city-intl";

export const Route = createFileRoute("/$lang/city/$slug")({
  loader: async ({ params }) => {
    if (!isSeoLang(params.lang)) throw notFound();
    const c = await getCity({ data: params.slug });
    if (!c) throw notFound();
    return c;
  },
  head: ({ loaderData, params }) => intlCityHead(params.lang as SeoLang, loaderData),
  component: () => <IntlCityPage l={Route.useParams().lang as SeoLang} c={Route.useLoaderData()} />,
});
