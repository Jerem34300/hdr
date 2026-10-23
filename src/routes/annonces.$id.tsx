import { createFileRoute } from "@tanstack/react-router";
import { getAdShareCity } from "@/lib/hdar/seo-geo/api";
import { SITE_URL } from "@/lib/hdar/seo";
import { AnnoncesShell } from "./annonces.index";

/** Lien partagé vers une annonce : ouvre l'appli (18+). Aperçu volontairement générique : ville seulement. */
export const Route = createFileRoute("/annonces/$id")({
  loader: async ({ params }) => ({ city: await getAdShareCity({ data: params.id }) }),
  head: ({ loaderData }) => {
    const title = "Une annonce t'attend sur hdar.chat";
    const desc = loaderData?.city ? `Petite annonce à ${loaderData.city} · 18+, discret, gratuit.` : "Petites annonces entre adultes · 18+, discret, gratuit.";
    return {
      meta: [
        { title: `${title} — hdar.` }, { name: "robots", content: "noindex, nofollow, noarchive" }, { name: "description", content: desc },
        { name: "page-own-og", content: "1" }, { property: "og:title", content: title }, { property: "og:description", content: desc },
        { property: "og:image", content: `${SITE_URL}/og.jpg?v=discret2` }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: () => <AnnoncesShell focus={Route.useParams().id} />,
});
