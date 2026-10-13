import { createFileRoute } from "@tanstack/react-router";
import { ContactLink, LegalPage } from "@/components/hdar/legal";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Confidentialité — hdar." },
      {
        name: "description",
        content:
          "Comment hdar. protège ta vie privée : anonyme, position arrondie et effacée, aucune publicité.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        hdar. est une appli de rencontre gay <strong>anonyme</strong>, réservée aux{" "}
        <strong>18 ans et plus</strong>. Pas d'email, pas de numéro de téléphone, pas de compte
        Google ou réseau social. Cette page explique quelles données existent, pourquoi, et combien
        de temps elles sont gardées.
      </p>

      <h2>Ton identité</h2>
      <ul>
        <li>
          À la première visite, ton appareil reçoit un identifiant anonyme aléatoire (session
          Supabase anonyme). Il n'est relié à aucune identité réelle.
        </li>
        <li>Un contrôle anti-robot Cloudflare Turnstile est effectué à l'entrée.</li>
        <li>
          Ton pseudo, ton âge déclaré, ton intro, tes centres d'intérêt, ton vocal et tes photos
          sont ceux que tu choisis de donner. Tout est facultatif, y compris la photo.
        </li>
      </ul>

      <h2>Ta position</h2>
      <ul>
        <li>
          Tu n'apparais sur la carte que lorsque tu le décides, pour{" "}
          <strong>1 h, 3 h ou 12 h</strong>. À la fin de cette durée, ta position est{" "}
          <strong>effacée automatiquement</strong> de nos serveurs.
        </li>
        <li>
          Les autres ne voient qu'une position <strong>arrondie à environ 110 m</strong>, jamais ton
          adresse exacte.
        </li>
        <li>
          Dans une conversation privée, tu peux choisir de partager ta{" "}
          <strong>position exacte</strong> avec une seule personne, après confirmation. Elle expire
          au bout d'<strong>1 h</strong> puis est effacée.
        </li>
      </ul>

      <h2>Ton profil et données sensibles</h2>
      <ul>
        <li>
          La <strong>phrase du moment</strong> que tu écris est affichée sur ta fiche, visible par
          les personnes qui cliquent sur toi depuis la carte.
        </li>
        <li>
          « <strong>Je suis</strong> » et « <strong>Je cherche</strong> » (H, F, X) sont{" "}
          <strong>facultatifs</strong>. Comme ils peuvent révéler ton orientation sexuelle, ce sont
          des données sensibles (article 9 du RGPD) : ils ne sont enregistrés qu'avec ton{" "}
          <strong>consentement explicite</strong> (case à cocher dans ton profil). Tu peux retirer
          ce consentement à tout moment en décochant la case : ces infos sont alors effacées.
        </li>
        <li>Ces infos ne sont jamais vendues ni utilisées pour de la publicité.</li>
      </ul>

      <h2>Messages, photos, vidéos et vocaux</h2>
      <ul>
        <li>
          Les messages privés (texte, photos, vidéos, vocaux) ne sont visibles que par toi et ton
          interlocuteur. Dans le chat de quartier et les chats de lieux, ils sont visibles par les
          personnes présentes dans ce chat.
        </li>
        <li>
          Les médias sont stockés chez notre hébergeur (Supabase, UE) et{" "}
          <strong>effacés automatiquement</strong> dès que plus personne ne peut voir leur message :
          24 h pour le chat de quartier et les chats de lieux, 24 h après la fermeture d'un lieu
          créé par un utilisateur. En privé : dès que vous avez <strong>tous les deux supprimé la
          conversation</strong>, et au plus tard après <strong>30 jours</strong> (les messages
          privés sont effacés à 30 jours). Le fichier disparaît dans l'heure qui suit. Vidéos
          limitées à 60 secondes.
        </li>
        <li>
          Chaque média peut être signalé (🚩). Après <strong>3 signalements</strong>, il est masqué
          automatiquement en attendant l'examen d'un modérateur.
        </li>
        <li>
          La première photo de ton profil passe un contrôle automatique de nudité explicite,
          effectué <strong>dans ton navigateur</strong> (NSFW.js) : l'image n'est envoyée à aucun
          service tiers pour cela.
        </li>
        <li>
          Les modérateurs peuvent consulter les contenus signalés pour traiter le signalement.
        </li>
      </ul>

      <h2>Live vidéo</h2>
      <ul>
        <li>Réservé aux 18 ans et plus, comme toute l'appli.</li>
        <li>
          La vidéo passe <strong>directement d'un appareil à l'autre</strong> (WebRTC, pair à pair).
          Elle n'est <strong>ni enregistrée ni stockée</strong> par hdar. Seuls de courts signaux de
          connexion transitent par nos serveurs, puis sont effacés.
        </li>
        <li>
          Le floutage est appliqué <strong>sur ton téléphone, avant l'envoi</strong> : tant que tu es
          flouté, seule une image floutée part vers l'autre personne, jamais l'image nette. C'est toi
          seul qui choisis de te montrer. Nous conservons la date à laquelle tu as accepté les règles
          du live.
        </li>
        <li>
          En connexion directe, ton <strong>adresse IP</strong> peut être visible techniquement par
          la personne en face. Aucune distance ni position n'est affichée.
        </li>
        <li>
          Ta caméra est <strong>floutée par défaut</strong> ; c'est toi qui décides de la
          déflouter. Tu peux passer, bloquer ou signaler à tout moment ; un signalement peut
          entraîner un bannissement.
        </li>
      </ul>

      <h2>Paiements (boosts, hdar+, partenaires)</h2>
      <ul>
        <li>
          Les paiements (boost de profil ou de lieu, abonnement hdar+, fiches partenaires) sont
          traités par <strong>Stripe</strong>. hdar. ne voit ni ne stocke jamais ton numéro de
          carte.
        </li>
        <li>
          Stripe reçoit les informations nécessaires au paiement (carte, email si tu le saisis pour
          le reçu, pays) et les traite selon sa propre politique de confidentialité. hdar. ne garde
          que l'identifiant de paiement, le produit, le montant et les dates, pour activer ton achat
          et pour la comptabilité (factures conservées 10 ans, obligation légale).
        </li>
      </ul>

      <h2>hdar+ : visites, favoris, recherche</h2>
      <ul>
        <li>
          Quand tu ouvres une fiche ou mets quelqu'un en favori, cela est enregistré pour que les
          abonnés hdar+ puissent voir <strong>qui a vu leur profil</strong> et qui les a mis en
          favori. Les visites sont gardées <strong>30 jours</strong>.
        </li>
        <li>
          Live hdar+ : le retour arrière, les filtres et le matching prioritaire utilisent ton âge, H/F/X
          et « Je cherche », jamais ta position. Une « Demande à se voir » n'envoie qu'une invitation :
          rien n'est déflouté sans l'action de la personne concernée. L'heure de la dernière demande est
          gardée le temps de la rencontre pour limiter à une demande.
        </li>
        <li>
          Ton consentement aux données sensibles est enregistré avec sa date, pour pouvoir le
          prouver ; il est effacé si tu le retires ou supprimes tes données.
        </li>
        <li>
          Les abonnés peuvent chercher un profil par pseudo. La recherche ne montre jamais de
          position, ni les profils bloqués, cachés ou supprimés.
        </li>
      </ul>

      <h2>Lieux partenaires : notes et commentaires</h2>
      <p>
        Tu peux noter et commenter un lieu partenaire. Ta note et ton commentaire sont publics,
        affichés avec ton pseudo, et peuvent être signalés et retirés par la modération. Ils sont
        effacés si tu supprimes tes données.
      </p>

      <h2>Statistiques anonymes</h2>
      <p>
        Pour savoir si l'appli est utilisée et aider nos partenaires, nous comptons des visites de
        façon <strong>agrégée et anonyme</strong>, par zones d'environ <strong>1 km</strong>, sans
        lien avec ton profil. Ces statistiques sont gardées <strong>400 jours</strong>. Aucun
        outil d'analyse tiers, aucun traceur publicitaire.
      </p>

      <h2>Durées de conservation</h2>
      <ul>
        <li>Position sur la carte : effacée à la fin de la durée choisie (1, 3 ou 12 h).</li>
        <li>Position exacte partagée en privé : 1 h.</li>
        <li>Signaux d'appel et de live vidéo : 1 h maximum. Le live n'est jamais enregistré.</li>
        <li>Chat de quartier et ses médias : 24 h. Lieux et leurs messages : 24 h après fermeture.</li>
        <li>
          Messages privés et leurs médias : <strong>30 jours</strong> maximum, plus tôt si vous
          supprimez tous les deux la conversation.
        </li>
        <li>Compteur de visites du site : 90 jours.</li>
        <li>Visites de profil (hdar+) : 30 jours.</li>
        <li>Statistiques agrégées anonymes : 400 jours.</li>
        <li>Profil, favoris, notes : jusqu'à suppression de tes données.</li>
        <li>Données de paiement et factures : 10 ans (obligation comptable).</li>
        <li>Messages du formulaire de contact : 1 an maximum.</li>
        <li>Une purge automatique tourne en continu (toutes les 10 minutes à 1 heure).</li>
      </ul>

      <h2>Sous-traitants</h2>
      <ul>
        <li><strong>Supabase</strong> : base de données et fichiers, hébergés dans l'UE (Paris).</li>
        <li><strong>Netlify</strong> : hébergement du site.</li>
        <li><strong>Stripe</strong> : paiements.</li>
        <li><strong>Cloudflare</strong> : contrôle anti-robot Turnstile à l'entrée.</li>
        <li>
          <strong>Esri (ArcGIS Online)</strong> : fonds de carte. Les tuiles passent par notre
          serveur, ton adresse IP n'est donc pas transmise à Esri.
        </li>
        <li>
          <strong>Photon (Komoot)</strong> : nom de rue ou de quartier à partir de coordonnées,
          appelé depuis ton navigateur (reçoit ton IP et la position concernée).
        </li>
        <li>Données des lieux permanents : © OpenStreetMap contributors (ODbL).</li>
      </ul>
      <p>Aucune donnée n'est vendue. Aucune publicité.</p>

      <h2>Tes droits (RGPD)</h2>
      <ul>
        <li>
          Tu peux supprimer à tout moment <strong>toutes tes données</strong> et ton compte depuis
          « Mon profil » → ⚙️ <strong>Paramètres</strong> → « Supprimer toutes mes données » :
          profil, photos, vocal, messages, médias, favoris, notes, position et compte anonyme.
        </li>
        <li>
          Pour exercer tes droits d'accès, de rectification, d'opposition, de portabilité ou de
          retrait du consentement : via le <ContactLink /> (sujet « RGPD / suppression »). Réponse
          sous un mois.
        </li>
        <li>
          Tu peux aussi introduire une réclamation auprès de la <strong>CNIL</strong> (cnil.fr).
        </li>
      </ul>
    </LegalPage>
  );
}
