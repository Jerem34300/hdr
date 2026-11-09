import { createFileRoute, notFound } from "@tanstack/react-router";
import { getIntlCity } from "@/lib/hdar/seo-geo/api";
import { IntlNativePage, intlNativeHead } from "@/components/hdar/seo-intl-native";

export const Route = createFileRoute("/$lang/$slug")({
  loader: async ({ params }) => {
    const c = await getIntlCity({ data: { lang: params.lang, slug: params.slug } });
    if (!c) throw notFound();
    return c;
  },
  head: ({ loaderData }) => intlNativeHead(loaderData),
  component: () => <IntlNativePage c={Route.useLoaderData()} />,
});
