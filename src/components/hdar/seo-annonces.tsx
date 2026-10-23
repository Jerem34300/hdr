import type { CityPayload } from "@/lib/hdar/seo-geo/types";
import { Crumbs, Faq, Feature, Hero, SeoShell, fmt, seoHead } from "./seo-pages";

const a = (n: string) => (n.startsWith("Le ") ? `au ${n.slice(3)}` : n.startsWith("Les ") ? `aux ${n.slice(4)}` : `à ${n}`);

/** Bouton vers la liste des annonces DANS l'appli (derrière l'écran 18+, non indexée). */
const AdsCta = ({ label }: { label: string }) => (
  <a href="/annonces" rel="nofollow" className="seo-cta mt-7 inline-flex h-14 items-center gap-2 rounded-full px-7 font-semibold text-night">{label} <span aria-hidden>→</span></a>
);

export function adsHead(c: CityPayload | null | undefined) {
  if (c === undefined) return seoHead({ title: "Ville introuvable — hdar.", desc: "", path: "/petites-annonces", noindex: true });
  if (!c) return seoHead({ title: "Petites annonces rencontres et sorties, ville par ville — hdar.", desc: "Poste une petite annonce pour une rencontre ou une sortie près de chez toi : anonyme, gratuite, réservée aux 18 ans et plus. Les annonces restent dans l'appli, entre adultes.", path: "/petites-annonces" });
  return seoHead({
    title: `Petites annonces rencontre ${a(c.n)} (${c.dep.code}) : sorties et rencontres — hdar.`,
    desc: `Petites annonces de rencontres et de sorties ${a(c.n)} et autour (${c.dep.n}). Discret, gratuit, 18+ : poste la tienne pour 24 h, 3 jours ou 7 jours et réponds en message privé.`,
    path: `/petites-annonces/${c.s}`,
  });
}

const FEATURES = [
  { icon: "📌", t: "Une annonce qui reste", d: "Elle reste visible 24 h, 3 jours ou 7 jours, même quand tu n'es pas connecté." },
  { icon: "🗺️", t: "Par ville et par région", d: "Tu vois d'abord les annonces de ton coin, puis tu élargis si tu veux." },
  { icon: "🕶️", t: "Discret", d: "Pas de nom, pas de numéro : tu restes discret. Ta ville est approximative, jamais ton adresse." },
  { icon: "💬", t: "Réponse en privé", d: "On te répond dans tes messages, avec le titre de ton annonce pour s'y retrouver." },
  { icon: "🔞", t: "Entre adultes", d: "Réservé aux 18 ans et plus. Les annonces ne sont visibles que dans l'appli, pas sur les moteurs de recherche." },
  { icon: "🛡️", t: "Modéré", d: "Un bouton pour signaler, une équipe qui regarde, et les annonces signalées sont masquées." },
];

export function AdsPage({ c, city, region }: { c: CityPayload | null; city: number; region: number }) {
  const where = c ? a(c.n) : "près de chez toi";
  const faq = [
    { q: `Comment poster une petite annonce ${where} ?`, a: "Ouvre hdar.chat, confirme que tu as 18 ans et crée ton profil (un pseudo suffit). Dans Lieux, touche Petites annonces puis Poster : un titre, quelques mots, une catégorie, ta ville et la durée." },
    { q: "C'est gratuit ?", a: "Oui, poster et répondre est gratuit, jusqu'à 3 annonces en ligne en même temps. Un boost payant et facultatif permet de remonter en tête de liste." },
    { q: "Qui voit mon annonce ?", a: "Seulement les adultes connectés à l'appli. Les annonces ne sont pas publiées sur Google ni sur cette page : ici, on affiche uniquement leur nombre." },
    { q: "Comment me répondre ?", a: "Les gens touchent Répondre : le message arrive dans tes Messages hdar, avec le titre de l'annonce. Tu peux bloquer ou signaler à tout moment." },
  ];
  return (
    <SeoShell>
      <Hero seed={"pa-" + (c?.s ?? "fr")} kicker={c ? `${c.dep.n} · ${c.reg.n}` : "Toute la France"} title={<>Petites annonces <span className="text-[#FA6F6C]">{c ? a(c.n) : "rencontres et sorties"}</span></>}>
        <p className="mt-4 text-lg leading-snug text-ink/85">Une envie de sortie, de rencontre ou de compagnie {where} ? Poste une petite annonce discrète et laisse les gens du coin te répondre en privé.</p>
        <AdsCta label={c ? `Voir les annonces ${a(c.n)}` : "Voir les annonces"} />
        <p className="mt-3 text-xs text-muted">Gratuit · discret · 18+ · annonces visibles dans l'appli uniquement</p>
        <dl className="mt-8 grid grid-cols-2 gap-2 text-center">
          {c ? (
            <>
              <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">annonces en ligne {a(c.n)}</dt><dd className="font-display text-2xl font-bold">{fmt(city)}</dd></div>
              <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">en {c.reg.n}</dt><dd className="font-display text-2xl font-bold">{fmt(region)}</dd></div>
            </>
          ) : (
            <>
              <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">annonces en ligne</dt><dd className="font-display text-2xl font-bold">{fmt(region)}</dd></div>
              <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">durée max</dt><dd className="font-display text-2xl font-bold">7 jours</dd></div>
            </>
          )}
        </dl>
      </Hero>
      <article className="mx-auto max-w-2xl px-5">
        <Crumbs items={[{ name: "hdar.", to: "/" }, { name: "Petites annonces", to: "/petites-annonces" }, ...(c ? [{ name: c.n }] : [])]} />
        <h2 className="seo-reveal mt-10 font-display text-2xl font-bold">Comment ça marche</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">{FEATURES.map((f) => <Feature key={f.t} icon={f.icon} title={f.t}>{f.d}</Feature>)}</ul>
        {c && (
          <section className="seo-reveal mt-12">
            <h2 className="font-display text-2xl font-bold">Annonces autour de {c.n}</h2>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">{c.nearby.map((n) => <li key={n.s}><a href={`/petites-annonces/${n.s}`} className="inline-flex rounded-full border border-line bg-white/[.03] px-3 py-1.5 hover:border-[#FA6F6C]">{n.n}</a></li>)}</ul>
            <p className="mt-4 text-sm">Et aussi : <a className="text-[#FA6F6C] underline" href={`/rencontre/${c.s}`}>rencontres et sorties {a(c.n)}</a>.</p>
          </section>
        )}
        <Faq items={faq} />
        <div className="seo-reveal my-12 text-center"><AdsCta label="Poster ou lire une annonce" /></div>
      </article>
    </SeoShell>
  );
}
