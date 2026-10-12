import { createFileRoute, Link } from "@tanstack/react-router";
import { SEO_CITIES, SITE_URL } from "@/lib/hdar/seo";
import { LOCAL } from "@/lib/hdar/seo-local";

export const Route = createFileRoute("/fr/rencontre-gay-{$ville}")({
  head: ({ params }) => {
    const city = SEO_CITIES.find((c) => c.slug === params.ville);
    if (!city) return { meta: [{ title: "Ville inconnue — hdar." }, { name: "robots", content: "noindex" }] };
    const url = `${SITE_URL}/fr/rencontre-gay-${city.slug}`;
    const local = LOCAL[city.slug];
    const desc =
      local?.description ??
      `Rencontre gay à ${city.name} : vois sur la carte qui est connecté autour de toi, discute dans le chat du quartier, photos, vocaux et vidéo. Gratuit, sans inscription, 18+.`;
    const title = `Rencontre gay à ${city.name} : qui est autour, en direct — hdar.`;
    const og = `${SITE_URL}${local?.og ?? "/og.jpg"}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: og },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: og },
        { name: "robots", content: "index, follow" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CityPage,
});

function CityPage() {
  const { ville } = Route.useParams();
  const city = SEO_CITIES.find((c) => c.slug === ville);
  if (!city) {
    return (
      <main className="h-dvh overflow-y-auto bg-night px-5 py-16 text-ink">
        <h1 className="font-display text-3xl font-extrabold">Ville inconnue</h1>
        <Link to="/" className="mt-6 inline-flex h-11 items-center text-signal">
          Ouvrir hdar
        </Link>
      </main>
    );
  }
  const local = LOCAL[city.slug];
  const url = `${SITE_URL}/fr/rencontre-gay-${city.slug}`;
  const faq = [
    {
      q: `Comment faire une rencontre gay à ${city.name} avec hdar ?`,
      a: `Ouvre hdar, autorise ta position et touche Connexion : tu apparais sur la carte de ${city.name} pour quelques heures. Touche un profil pour le voir, puis écris-lui, envoie une photo, un vocal ou lance un appel vidéo.`,
    },
    {
      q: "Faut-il créer un compte ?",
      a: "Non. Tu choisis un pseudo et tu confirmes avoir 18 ans au premier message. Pas d'e-mail, pas de mot de passe.",
    },
    {
      q: "Ma position exacte est-elle visible ?",
      a: "Non. Les autres voient une position arrondie à environ 110 mètres et une distance approximative, jamais une adresse.",
    },
    {
      q: `C'est quoi le chat du quartier à ${city.name} ?`,
      a: "Un chat ouvert à tous les gens connectés dans un rayon d'environ 3 km. Les messages disparaissent au bout de 24 heures.",
    },
    {
      q: "C'est gratuit ?",
      a: "Oui. La carte, le chat du quartier, les messages privés et les lieux sont gratuits.",
    },
    ...(local?.faq ?? []),
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <main className="h-dvh overflow-y-auto bg-night text-ink">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "hdar.", item: SITE_URL + "/" },
            { "@type": "ListItem", position: 2, name: `Rencontre gay à ${city.name}`, item: url },
          ],
        })}
      </script>
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "hdar.",
          url: SITE_URL,
          applicationCategory: "SocialNetworkingApplication",
          operatingSystem: "Web, iOS, Android",
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        })}
      </script>
      <article className="mx-auto max-w-lg px-5 py-10">
        <Link to="/" className="font-display text-sm font-extrabold tracking-tight">
          hdar<span className="text-signal">.</span>
        </Link>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight">Rencontre gay à {city.name}</h1>
        <p className="mt-3 text-lg">{city.line}</p>
        <p className="mt-3 text-muted">
          hdar est une appli de rencontre gay géolocalisée, en direct, pour {city.name} et toute la région {city.region}.
          Pas de profil à remplir pendant des heures : tu ouvres, tu vois qui est connecté autour, tu discutes.
        </p>
        <Link to="/" className="mt-6 inline-flex h-12 items-center rounded-full bg-signal px-6 font-medium text-night">
          Voir qui est autour à {city.name}
        </Link>
        <h2 className="mt-10 font-display text-xl font-bold">Ce que tu peux faire</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>La carte en direct</strong> — les gens connectés autour de toi, avec une distance arrondie.
          </li>
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>Le chat du quartier</strong> — un fil ouvert aux gens à ~3 km, effacé après 24 h.
          </li>
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>Messages privés</strong> — texte, photos, vocaux et appel vidéo.
          </li>
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>Les lieux</strong> — crée un lieu pour quelques heures (bar, soirée, plage) et retrouve-toi avec ceux du coin.
          </li>
        </ul>
        {local?.body}
        <h2 className="mt-10 font-display text-xl font-bold">Questions fréquentes</h2>
        <div className="mt-3 space-y-2">
          {faq.map((item) => (
            <details key={item.q} className="rounded-2xl border border-line px-4 py-3">
              <summary className="cursor-pointer font-medium">{item.q}</summary>
              <p className="mt-2 text-sm text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">Réservé aux 18 ans et plus. Aucune photo explicite sur les pages publiques.</p>
        {local?.nearby && (
          <>
            <h2 className="mt-10 font-display text-lg font-bold">Rencontre gay près de {city.name}</h2>
            <nav className="mt-3 flex flex-wrap gap-2 text-sm">
              {local.nearby
                .map((slug) => SEO_CITIES.find((c) => c.slug === slug))
                .filter((c) => !!c)
                .map((c) => (
                  <Link key={c.slug} to="/fr/rencontre-gay-{$ville}" params={{ ville: c.slug }} className="rounded-full border border-line px-3 py-1.5">
                    {c.name}
                  </Link>
                ))}
            </nav>
          </>
        )}
        <h2 className="mt-10 font-display text-lg font-bold">Rencontre gay dans d'autres villes</h2>
        <nav className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm text-muted">
          {SEO_CITIES.filter((c) => c.slug !== city.slug).map((c) => (
            <Link key={c.slug} to="/fr/rencontre-gay-{$ville}" params={{ ville: c.slug }} className="underline-offset-2 hover:underline">
              {c.name}
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}
