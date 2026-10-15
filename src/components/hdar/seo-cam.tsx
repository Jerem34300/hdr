import { Link } from "@tanstack/react-router";
import { Crumbs, Faq, Feature, Hero, SeoShell, seoHead } from "./seo-pages";

type L = { title: string; desc: string; kicker: string; h1: [string, string]; lead: string; why: string; faq: { q: string; a: string }[] };
const RULES = { q: "Quelles sont les règles ?", a: "Réservé aux 18 ans et plus. Nudité et contenus sexuels interdits, consentement obligatoire, enregistrement interdit (voir les CGU). Bloque et signale à tout moment." };
const FREE = { q: "C'est gratuit et anonyme ?", a: "Oui. Pas d'e-mail, un pseudo suffit. Le Live est gratuit ; les réactions 🔥 🥵 😛 ❤️ coûtent 1 cœur chacune." };

export const CAM: Record<string, L> = {
  "webcam-gay-live": {
    title: "Webcam gay live : chat vidéo en direct, anonyme — hdar.", desc: "Webcam gay en live : face-à-face vidéo au hasard, diffuse ta cam aux curieux, chat en direct. Pour tout le monde et LGBT-friendly, anonyme, gratuit, 18+.",
    kicker: "Webcam · LGBT-friendly", h1: ["Webcam gay ", "en live"], lead: "Allume ta cam, tombe sur un mec au hasard ou diffuse-toi à ceux qui défilent. Anonyme, en direct, entre adultes.",
    why: "hdar est ouvert à tout le monde et LGBT-friendly : gays, bis, curieux, chacun trouve sa place. Si le feeling passe, continuez en privé, en messages ou en appel vidéo.",
    faq: [{ q: "Le Live est-il réservé aux gays ?", a: "Non, hdar est pour tout le monde et LGBT-friendly. Tu croiseras des gens de toutes orientations." }, FREE, RULES],
  },
  "alternative-chatroulette": {
    title: "Alternative à Chatroulette : chat vidéo aléatoire français — hdar.", desc: "Tu cherches une alternative à Chatroulette ? hdar propose un chat vidéo au hasard, une diffusion à plusieurs et une carte des gens autour. Gratuit, anonyme, 18+.",
    kicker: "Chat vidéo aléatoire", h1: ["Une alternative ", "à Chatroulette"], lead: "Le principe que tu connais, un inconnu au hasard en vidéo, plus des façons de voir et d'être vu à plusieurs.",
    why: "En plus du face-à-face aléatoire, hdar ajoute le mode Diffuser (jusqu'à 6 spectateurs, 12 avec hdar+), la cam à 3 et une carte en direct pour rencontrer les gens près de chez toi. L'appli est française et respecte le RGPD.",
    faq: [{ q: "hdar est-il lié à Chatroulette ?", a: "Non. hdar est un service indépendant, sans lien avec Chatroulette." }, FREE, RULES],
  },
  "alternative-omegle": {
    title: "Alternative à Omegle : chat vidéo avec des inconnus — hdar.", desc: "Omegle a fermé en novembre 2023. hdar propose un chat vidéo au hasard avec des inconnus, entre adultes, anonyme et gratuit. 18+.",
    kicker: "Après Omegle", h1: ["Une alternative ", "à Omegle"], lead: "Omegle a fermé en novembre 2023. Envie de parler à des inconnus en vidéo ? Sur hdar, un geste et tu es en face de quelqu'un.",
    why: "hdar est réservé aux adultes (18+), avec blocage, signalement et consentement pour chaque caméra ou micro allumé. En plus du face-à-face, tu peux diffuser ta cam ou passer à la carte pour rencontrer des gens autour de toi.",
    faq: [{ q: "Omegle existe-t-il encore ?", a: "Non, Omegle a fermé en novembre 2023. hdar est un service indépendant, sans lien avec Omegle." }, FREE, RULES],
  },
  "tchat-webcam-aleatoire": {
    title: "Tchat webcam aléatoire gratuit, sans inscription — hdar.", desc: "Tchat webcam aléatoire : tombe sur un inconnu en vidéo, passe au suivant, ou diffuse ta cam. Sans inscription, anonyme, gratuit, 18+.",
    kicker: "Tchat webcam", h1: ["Tchat webcam ", "aléatoire"], lead: "Un inconnu, une cam, et tu décides. Pas d'inscription, pas d'e-mail : tu ouvres le Live et c'est parti.",
    why: "Le hasard fait bien les choses, mais tu gardes la main : suivant quand tu veux, chat écrit pendant la vidéo, et le chat du quartier pour ceux qui préfèrent discuter avant de se montrer.",
    faq: [{ q: "Faut-il s'inscrire ?", a: "Non. Tu confirmes avoir 18 ans, tu choisis un pseudo et tu entres dans le Live." }, FREE, RULES],
  },
  "cam-to-cam": {
    title: "Cam to cam en direct entre adultes, anonyme — hdar.", desc: "Cam to cam : face-à-face vidéo avec un inconnu, ou diffuse ta cam à plusieurs spectateurs. Consentement pour chaque cam, anonyme, gratuit, 18+.",
    kicker: "Cam to cam · 18+", h1: ["Cam to cam, ", "en direct"], lead: "Toi, ta cam, et quelqu'un en face. Ou plusieurs, si tu aimes discuter à plusieurs.",
    why: "En face-à-face, vous vous voyez tous les deux. En mode Diffuser, les spectateurs te voient, et un spectateur peut allumer sa cam ou son micro seulement si vous êtes d'accord tous les deux.",
    faq: [{ q: "Un spectateur peut-il se montrer aussi ?", a: "Oui, si tu le lui proposes ou s'il te le propose, et seulement avec ton accord." }, FREE, RULES],
  },
};
export const CAM_LINKS = [["live-coquin", "Live coquin"], ["webcam-gay-live", "Webcam gay live"], ["alternative-chatroulette", "Alternative à Chatroulette"], ["alternative-omegle", "Alternative à Omegle"], ["tchat-webcam-aleatoire", "Tchat webcam aléatoire"], ["cam-to-cam", "Cam to cam"]];

export const camHead = (k: string) => seoHead({ title: CAM[k].title, desc: CAM[k].desc, path: "/" + k, og: "/og-live.jpg" });
export const CamLinks = ({ not }: { not: string }) => (
  <nav className="seo-reveal mt-10 flex flex-wrap gap-2 text-sm">{CAM_LINKS.filter(([s]) => s !== not).map(([s, n]) => <a key={s} href={"/" + s} className="rounded-full border border-line px-3 py-1.5">{n}</a>)}</nav>
);

export function CamPage({ k }: { k: string }) {
  const l = CAM[k];
  const cta = (t: string) => <Link to="/live" className="seo-cta mt-7 inline-flex h-14 items-center gap-2 rounded-full px-7 font-semibold text-night">{t} <span aria-hidden>→</span></Link>;
  return (
    <SeoShell>
      <Hero seed={k} kicker={l.kicker} title={<>{l.h1[0]}<span className="text-[#FA6F6C]">{l.h1[1]}</span></>}>
        <p className="mt-4 text-lg leading-snug text-ink/85">{l.lead}</p>
        {cta("Lancer un Live")}
        <p className="mt-3 text-xs text-muted">Anonyme · sans compte · 18+ · sans nudité</p>
      </Hero>
      <article className="mx-auto max-w-2xl px-5">
        <Crumbs items={[{ name: "hdar.", to: "/" }, { name: "Live", to: "/live-coquin" }, { name: l.h1.join("") }]} />
        <ul className="mt-8 grid gap-2 sm:grid-cols-2">
          <Feature icon="🎲" title="Face-à-face au hasard">Un inconnu en vidéo, suivant quand tu veux.</Feature>
          <Feature icon="📡" title="Diffuser">Jusqu'à 6 spectateurs te regardent, 12 avec hdar+.</Feature>
          <Feature icon="👀" title="Cam à 3">Ton partenaire peut diffuser avec toi.</Feature>
          <Feature icon="❤️" title="Réactions 🔥 😛 ❤️">1 cœur par réaction.</Feature>
        </ul>
        <h2 className="seo-reveal mt-12 font-display text-2xl font-bold">Pourquoi hdar</h2>
        <p className="seo-reveal mt-3 text-sm leading-relaxed text-ink/85">{l.why}</p>
        <Faq items={l.faq} />
        <CamLinks not={k} />
        <div className="seo-reveal my-12 text-center">{cta("Entrer dans le Live")}</div>
      </article>
    </SeoShell>
  );
}
