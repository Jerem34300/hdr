import { Link } from "@tanstack/react-router";
import type { CityPayload } from "@/lib/hdar/seo-geo/types";
import { SITE_URL } from "@/lib/hdar/seo";
import { CamLinks } from "./seo-cam";
import { CityChips, Crumbs, Faq, Feature, Hero, Ld, SeoShell, pick, seoHead } from "./seo-pages";

const a = (n: string) => (n.startsWith("Le ") ? `au ${n.slice(3)}` : n.startsWith("Les ") ? `aux ${n.slice(4)}` : `à ${n}`);
const path = (c?: CityPayload | null) => (c ? `/rencontre/${c.s}/live-coquin` : "/live-coquin");

export function coquinHead(c?: CityPayload | null) {
  return seoHead({
    title: c ? `Live coquin ${a(c.n)} : flirter en vidéo, en direct — hdar.` : "Live coquin : flirter en vidéo entre adultes, en direct — hdar.",
    desc: c ? `Envie de flirter ${a(c.n)} ? Lance un Live et discute en vidéo avec des inconnus, en direct. Entre adultes, consentement et respect, anonyme, gratuit, 18+.` : "Flirte en vidéo avec des inconnus, en direct : face-à-face au hasard ou diffusion à plusieurs. Entre adultes, consentement et respect, anonyme, gratuit, 18+.",
    path: path(c), og: "/og-live.jpg",
  });
}

const CtaLive = ({ label = "Lancer un Live" }: { label?: string }) => (
  <Link to="/live" className="seo-cta mt-7 inline-flex h-14 items-center gap-2 rounded-full px-7 font-semibold text-night">{label} <span aria-hidden>→</span></Link>
);

export function CoquinPage({ c }: { c?: CityPayload | null }) {
  const at = c ? ` ${a(c.n)}` : "";
  const s = c?.s ?? "coquin";
  const lead = c
    ? pick(s + "c", [
        `Envie de flirter${at} ? Sur hdar, un geste et tu es en vidéo avec quelqu'un de nouveau, du coin ou de toute la France.`,
        `Un soir${at}, une cam, des inconnus qui défilent : tu discutes, tu charmes, tu passes au suivant. Sans compte, sans prise de tête.`,
        `${c.n} a ses curieux et ses timides. Le Live de hdar les met face à face, en direct, entre adultes et dans le respect.`,
      ])
    : "Viens flirter en vidéo avec des inconnus, en direct. Un regard, un sourire, quelques mots : c'est toi qui choisis jusqu'où va la conversation.";
  const faq = [
    { q: "C'est quoi le Live de hdar ?", a: "Un face-à-face vidéo au hasard avec une autre personne connectée. Tu passes à la suivante quand tu veux. Tu peux aussi diffuser ta caméra aux gens qui font défiler les Lives." },
    { q: "Combien de personnes peuvent me regarder ?", a: "En mode Diffuser, jusqu'à 6 spectateurs te voient et t'entendent, 12 avec hdar+. Ton partenaire en face-à-face reste privé, sauf s'il choisit de diffuser avec toi." },
    { q: "Un spectateur peut-il allumer sa caméra ?", a: "Oui, mais uniquement avec consentement : tu peux lui proposer, il peut te le proposer, et rien ne s'allume sans accord." },
    { q: "C'est anonyme et gratuit ?", a: "Oui. Pas d'e-mail, un pseudo suffit. Le Live est gratuit ; les réactions 🔥 🥵 😛 ❤️ coûtent 1 cœur chacune." },
    { q: "Quelles sont les règles ?", a: "Réservé aux 18 ans et plus. Nudité et contenus sexuels interdits, consentement obligatoire, enregistrement interdit (voir les CGU). Tu peux bloquer et signaler à tout moment ; les comptes signalés sont suspendus." },
    ...(c ? [{ q: `Je peux tomber sur des gens ${a(c.n)} ?`, a: `Le Live mélange les gens connectés en France, en évitant les personnes à moins de 2 km. Pour les gens tout près ${a(c.n)}, utilise la carte et le chat du quartier.` }] : []),
  ];
  return (
    <SeoShell>
      <Ld data={{ "@context": "https://schema.org", "@type": "WebApplication", name: "hdar. Live", url: SITE_URL + "/live", applicationCategory: "SocialNetworkingApplication", operatingSystem: "Web, iOS, Android", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" } }} />
      <Hero seed={s} kicker={c ? `Live coquin · ${c.n}` : "Live coquin · 18+"} title={<>Flirter <span className="text-[#FA6F6C]">en direct</span>{at}</>}>
        <p className="mt-4 text-lg leading-snug text-ink/85">{lead}</p>
        <CtaLive />
        <p className="mt-3 text-xs text-muted">Anonyme · sans compte · 18+ · sans nudité</p>
      </Hero>
      <article className="mx-auto max-w-2xl px-5">
        <Crumbs items={[{ name: "hdar.", to: "/" }, ...(c ? [{ name: c.n, to: `/rencontre/${c.s}` }] : []), { name: "Live coquin" }]} />
        <h2 className="seo-reveal mt-10 font-display text-2xl font-bold">Le flirt, en vidéo</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          <Feature icon="🎲" title="Live au hasard">Face-à-face vidéo avec un inconnu. Pas le feeling ? Suivant.</Feature>
          <Feature icon="📡" title="Diffuser">Ouvre ta cam aux gens qui défilent et discute avec eux : jusqu'à 6 spectateurs, 12 avec hdar+.</Feature>
          <Feature icon="👥" title="Cam à 3">Ton partenaire peut diffuser avec toi : les spectateurs vous voient tous les deux.</Feature>
          <Feature icon="🎥" title="Consentement d'abord">Un spectateur n'allume sa cam ou son micro que si vous êtes d'accord tous les deux.</Feature>
          <Feature icon="❤️" title="Réactions">Envoie 🔥 😛 ❤️ à qui te plaît : chaque réaction coûte 1 cœur.</Feature>
          <Feature icon="🕶️" title="Anonyme">Pas d'e-mail, un pseudo, et le chat du quartier pour les gens autour.</Feature>
        </ul>
        <h2 className="seo-reveal mt-12 font-display text-2xl font-bold">Sans prise de tête, avec du respect</h2>
        <p className="seo-reveal mt-3 text-sm leading-relaxed text-ink/85">{c ? pick(s + "d", [`Pas de profil à remplir, pas de swipe sans fin : tu ouvres et tu discutes. Si le courant passe avec quelqu'un ${a(c.n)}, continuez en privé.`, `Flirt d'un soir ou simple curiosité, chacun garde la main. Et si l'autre est trop près, hdar te propose plutôt le chat privé.`]) : "Pas de profil à remplir, pas de swipe sans fin : tu ouvres et tu discutes. Si le courant passe, continuez en privé, en messages ou en appel vidéo."}</p>
        <h2 className="seo-reveal mt-12 font-display text-2xl font-bold">Les règles du Live</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          <Feature icon="🔞" title="18 ans et plus">Le Live est réservé aux adultes. Tout mineur est exclu.</Feature>
          <Feature icon="🚫" title="Pas de nudité">Nudité et contenus sexuels sont interdits, en face-à-face comme en diffusion.</Feature>
          <Feature icon="🤝" title="Consentement">Personne n'est filmé ni entendu sans son accord. L'enregistrement est interdit.</Feature>
          <Feature icon="🛡️" title="Signalement">Bloque ou signale en un geste : les comptes signalés sont suspendus.</Feature>
        </ul>
        <Faq items={faq} />
        {c && <section className="seo-reveal mt-10"><h2 className="font-display text-xl font-bold">Autour de {c.n}</h2><CityChips list={c.nearby.slice(0, 8)} /></section>}
        <CamLinks not="live-coquin" />
        <div className="seo-reveal my-12 text-center"><CtaLive label="Entrer dans le Live" /></div>
      </article>
    </SeoShell>
  );
}
