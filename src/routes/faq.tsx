import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "@/components/hdar/faq";
import { seoHead } from "@/components/hdar/seo-pages";

export const Route = createFileRoute("/faq")({
  head: () => seoHead({
    title: "FAQ hdar. : compte, discrétion, carte, messages, Live — toutes les réponses",
    desc: "Toutes les réponses sur hdar.chat : gratuit, 18+, sans inscription obligatoire, retrouver son profil par email, code de verrouillage, carte, lieux, messages, Live et code FIRST.",
    path: "/faq",
  }),
  component: FaqPage,
});
