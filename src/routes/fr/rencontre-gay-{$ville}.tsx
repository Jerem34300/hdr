import { createFileRoute, Link } from "@tanstack/react-router";
import { CITIES, PEOPLE, spotsFor } from "@/lib/hdar/data";
import { HOT_ANON } from "@/lib/hdar/rules";

export const Route = createFileRoute("/fr/rencontre-gay-{$ville}")({
  head: ({ params }) => {
    const city = CITIES.find((c) => c.slug === params.ville);
    const name = city?.name ?? "Ville";
    return {
      meta: [
        { title: `Rencontre gay à ${name} — hdar.` },
        {
          name: "description",
          content: `Qui est autour à ${name}, ce soir. Distances arrondies, 18 ans et plus, aucune photo explicite.`,
        },
        { name: "robots", content: "index, follow" },
      ],
    };
  },
  component: CityPage,
});

function CityPage() {
  const { ville } = Route.useParams();
  const city = CITIES.find((c) => c.slug === ville);
  if (!city) {
    return (
      <main className="min-h-dvh bg-night px-5 py-16 text-ink">
        <h1 className="font-display text-3xl font-extrabold">Ville inconnue</h1>
        <Link to="/" className="mt-6 inline-flex h-11 items-center text-signal">
          Ouvrir hdar
        </Link>
      </main>
    );
  }
  const online = PEOPLE.filter((p) => p.online).length;
  const dispo = PEOPLE.filter((p) => p.tonight).length;
  const spots = spotsFor(city.slug);
  const zoneCount = online + HOT_ANON;
  const faq = [
    {
      q: "Faut-il créer un compte ?",
      a: "Non. Tu arrives sur la carte. Le pseudo et la confirmation des 18 ans n'arrivent qu'au premier message.",
    },
    {
      q: "Ma position exacte est-elle visible ?",
      a: "Non. Elle reste sur ton appareil. Les autres voient une zone arrondie, jamais une adresse.",
    },
    {
      q: `Où ça bouge à ${city.name} ?`,
      a: `${city.line} Quartiers suivis : ${city.quartiers.join(", ")}.`,
    },
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
    <main className="min-h-dvh bg-night text-ink">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <article className="mx-auto max-w-lg px-5 py-10">
        <p className="font-display text-sm font-extrabold tracking-tight">
          hdar<span className="text-signal">.</span>
        </p>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight">Rencontre gay à {city.name}</h1>
        <p className="mt-3 text-muted">{city.line} Who's around. Right now.</p>
        <dl className="mt-8 grid grid-cols-3 gap-2">
          <Stat label="En ligne" value={String(online)} />
          <Stat label="Dispo" value={String(dispo)} />
          <Stat label="Dans la zone" value={String(zoneCount)} />
        </dl>
        <h2 className="mt-10 font-display text-xl font-bold">Spots ouverts</h2>
        <ul className="mt-3 space-y-2">
          {spots.map((spot) => (
            <li key={spot.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="font-display font-bold">{spot.title}</p>
              <p className="text-sm text-muted">{spot.members} personnes · ferme dans {spot.hours} h</p>
            </li>
          ))}
        </ul>
        <h2 className="mt-10 font-display text-xl font-bold">Quartiers</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {city.quartiers.map((q) => (
            <li key={q} className="rounded-full border border-line px-3 py-2 text-sm">
              {q}
            </li>
          ))}
        </ul>
        <h2 className="mt-10 font-display text-xl font-bold">Questions</h2>
        <div className="mt-3 space-y-2">
          {faq.map((item) => (
            <details key={item.q} className="rounded-2xl border border-line px-4 py-3">
              <summary className="cursor-pointer font-medium">{item.q}</summary>
              <p className="mt-2 text-sm text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">18 ans et plus. Aucune photo explicite sur les pages publiques.</p>
        <Link to="/" className="mt-4 inline-flex h-12 items-center rounded-full bg-signal px-5 font-medium text-night">
          Voir qui est autour
        </Link>
        <nav className="mt-10 flex flex-wrap gap-x-3 gap-y-2 text-sm text-muted">
          {CITIES.map((c) => (
            <Link key={c.slug} to="/fr/rencontre-gay-{$ville}" params={{ ville: c.slug }}>
              {c.name}
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-2xl font-extrabold">{value}</dd>
    </div>
  );
}
