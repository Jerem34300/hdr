import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/hdar/legal";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({ meta: [{ title: "Confidentialité — hdar." }, { name: "description", content: "Comment hdar. protège ta vie privée : anonyme, position arrondie et effacée, aucune publicité." }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        hdar. est une appli de rencontre gay <strong>anonyme</strong>, réservée aux <strong>18 ans et plus</strong>. Pas d'email,
        pas de numéro de téléphone, pas de compte Google ou réseau social. Cette page explique quelles données existent, pourquoi,
        et combien de temps elles sont gardées.
      </p>

      <h2>Ton identité</h2>
      <ul>
        <li>À la première visite, ton appareil reçoit un identifiant anonyme aléatoire (session Supabase anonyme). Il n'est relié à aucune identité réelle.</li>
        <li>Un contrôle anti-robot Cloudflare Turnstile est effectué à l'entrée.</li>
        <li>Ton pseudo, ton âge déclaré, ton intro, tes centres d'intérêt, ton vocal et tes photos sont ceux que tu choisis de donner. Tout est facultatif, y compris la photo.</li>
      </ul>

      <h2>Ta position</h2>
      <ul>
        <li>Tu n'apparais sur la carte que lorsque tu le décides, pour <strong>1 h, 3 h ou 12 h</strong>. À la fin de cette durée, ta position est <strong>effacée automatiquement</strong> de nos serveurs.</li>
        <li>Les autres ne voient qu'une position <strong>arrondie à environ 110 m</strong>, jamais ton adresse exacte.</li>
        <li>Dans une conversation privée, tu peux choisir de partager ta <strong>position exacte</strong> avec une seule personne, après confirmation. Elle expire au bout d'<strong>1 h</strong> puis est effacée.</li>
      </ul>

      <h2>Messages et photos</h2>
      <ul>
        <li>Les messages privés (texte, photos, vocaux) ne sont visibles que par toi et ton interlocuteur.</li>
        <li>La première photo de ton profil passe un contrôle automatique de nudité explicite, effectué <strong>dans ton navigateur</strong> (NSFW.js) : l'image n'est envoyée à aucun service tiers pour cela. Une photo signalée n'est visible que par toi jusqu'à vérification par un modérateur.</li>
        <li>Les modérateurs peuvent consulter les contenus d'un profil signalé pour traiter le signalement.</li>
      </ul>

      <h2>Durées de conservation</h2>
      <ul>
        <li>Position sur la carte : effacée à la fin de la durée choisie (1, 3 ou 12 h).</li>
        <li>Position exacte partagée en privé : 1 h.</li>
        <li>Signaux d'appel vidéo : 1 h. Messages du chat de quartier : 24 h. Lieux et leurs messages : 24 h après leur fermeture.</li>
        <li>Messages privés : <strong>30 jours</strong>.</li>
        <li>Statistiques de fréquentation (nombre de visites) : 90 jours.</li>
        <li>Une purge automatique tourne toutes les 10 minutes.</li>
      </ul>

      <h2>Où sont les données</h2>
      <p>
        Les données sont hébergées par Supabase dans l'Union européenne (région <strong>Paris</strong>). Le site est servi par Netlify.
        Aucune donnée n'est vendue. <strong>Aucune publicité, aucun traceur publicitaire</strong>, aucun outil d'analyse tiers.
      </p>

      <h2>Tes droits (RGPD)</h2>
      <ul>
        <li>Tu peux supprimer à tout moment <strong>toutes tes données</strong> depuis « Mon profil » → « Supprimer toutes mes données » : profil, photos, vocal, messages, médias, favoris, position et compte anonyme.</li>
        <li>Pour toute question ou demande (accès, rectification, opposition) : <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</li>
        <li>Tu peux aussi saisir la CNIL (cnil.fr).</li>
      </ul>
    </LegalPage>
  );
}
