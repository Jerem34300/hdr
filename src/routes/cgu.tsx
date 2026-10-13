import { createFileRoute } from "@tanstack/react-router";
import { ContactLink, LegalPage } from "@/components/hdar/legal";

export const Route = createFileRoute("/cgu")({
  head: () => ({ meta: [{ title: "Conditions d'utilisation — hdar." }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Conditions générales d'utilisation">
      <h2>1. Accès</h2>
      <p>
        hdar. est réservé aux personnes <strong>majeures (18 ans et plus)</strong>. En entrant, tu
        certifies avoir au moins 18 ans. Tout profil d'une personne mineure sera supprimé.
      </p>
      <h2>2. Anonymat</h2>
      <p>
        Le service est anonyme et gratuit dans sa version de base. Tu restes responsable de ce que tu publies et partages, y
        compris ta position exacte lorsque tu choisis de l'envoyer.
      </p>
      <h2>3. Ce qui est interdit</h2>
      <ul>
        <li>
          <strong>Toute présence ou tout contenu impliquant un mineur</strong> : signalé aux
          autorités et banni définitivement.
        </li>
        <li>
          Photo de profil explicite. Nudité ou contenu sexuel imposé à quelqu'un qui ne l'a pas
          demandé, dans les chats publics ou en live (caméra floutée par défaut).
        </li>
        <li>Contenu non consenti, haineux, violent, menaçant ou illégal ; drogue, armes.</li>
        <li>
          Harcèlement, usurpation d'identité, spam, prostitution ou sollicitation commerciale.
        </li>
        <li>
          Enregistrer, capturer ou diffuser hors de l'appli des contenus, lives ou positions reçus
          d'autres personnes.
        </li>
      </ul>
      <h2>4. Modération et signalement</h2>
      <p>
        Tu peux bloquer et signaler n'importe quel profil, média ou live. Un média signalé 3 fois
        est masqué automatiquement. Les modérateurs peuvent masquer des contenus, retirer une photo,
        suspendre ou bannir un appareil, sans préavis, en cas de non-respect de ces règles.
      </p>
      <p>
        <strong>Contenus illicites (DSA)</strong> : le point de contact unique pour les
        utilisateurs et les autorités est le <ContactLink /> (sujet « Signalement »). Indique le
        contenu concerné et pourquoi il est illicite ; nous agissons rapidement et t'informons de
        la décision.
      </p>
      <h2>5. Sécurité lors des rencontres</h2>
      <p>
        Rencontre de préférence dans un lieu public, préviens un proche, protège-toi. hdar. ne
        vérifie pas l'identité des utilisateurs et ne peut être tenu responsable des rencontres.
      </p>
      <h2>6. Données personnelles</h2>
      <p>
        Voir la{" "}
        <a className="underline" href="/confidentialite">
          politique de confidentialité
        </a>
        .
      </p>
      <h2>7. Lieux permanents</h2>
      <p>La couche « Lieux permanents » affiche des lieux publics et gratuits. Une partie provient d'OpenStreetMap (© OpenStreetMap contributors, licence ODbL). Les lieux proposés par les utilisateurs sont vérifiés avant publication. hdar. n'encourage aucune pratique illégale : la loi, le consentement et le respect des autres usagers s'appliquent partout.</p>
      <h2>8. Services payants</h2>
      <ul>
        <li>
          Boosts (profil ou lieu), abonnement <strong>hdar+</strong> et fiches partenaires sont
          payés via Stripe. Les prix TTC sont affichés avant paiement.
        </li>
        <li>
          hdar+ comprend : filtres de la carte (âge, H/F/X, envies, lieu, en ligne, avec photo), qui
          t'a vu et qui t'a mis en favori, recherche par pseudo, 20 photos d'album, badge, et dans le
          Live : retour à la personne précédente, filtres H/F/X et âge, matching prioritaire et
          « Demande à se voir » (une invitation par rencontre ; seule la personne concernée peut
          choisir de se montrer).
        </li>
        <li>
          Ces services numériques sont <strong>exécutés immédiatement</strong>. En cochant la case avant le paiement, tu
          demandes cette exécution immédiate et <strong>renonces à ton droit de rétractation</strong>{" "}
          de 14 jours (article L221-28 du Code de la consommation).
        </li>
        <li>Un boost commencé n'est pas remboursable.</li>
        <li>
          Les <strong>cœurs du Live</strong> sont achetés en packs (paiement unique) et servent
          uniquement à être envoyés dans le Live. Ils n'ont <strong>aucune valeur monétaire</strong>,
          ne sont ni remboursables, ni transférables, ni échangeables contre de l'argent, et ne
          rapportent rien à la personne qui les reçoit. La renonciation au droit de rétractation
          s'applique aussi à ces achats.
        </li>
        <li>
          hdar+ et les fiches partenaires sont des abonnements à <strong>renouvellement
          automatique</strong> (semaine, mois… selon l'offre choisie). Ils sont résiliables à tout
          moment via « Gérer mon abonnement » sur /premium ou /pro (portail Stripe) ; l'accès reste
          actif jusqu'à la fin de la période payée. Les factures y sont disponibles.
        </li>
      </ul>
      <h2>9. Lieux partenaires, notes et commentaires</h2>
      <p>
        Les notes et commentaires doivent refléter une expérience réelle, rester respectueux et ne
        pas contenir de données personnelles de tiers. Ils peuvent être retirés par la modération.
      </p>
      <h2>9 bis. Live Pro, cadeaux et messages des partenaires</h2>
      <p>
        Les lieux partenaires dont l'abonnement est actif peuvent faire un <strong>Live Pro</strong> sans
        limite de distance, identifié par un badge « Partenaire » et le nom du lieu ; le partenaire peut
        apparaître sans flou, les membres gardent leurs propres règles de flou. Ils peuvent envoyer des
        <strong> cadeaux pro</strong> (offre, code promo, date d'expiration ; 20 par jour maximum) et ouvrir
        des conversations privées (20 nouvelles par jour maximum). L'offre engage uniquement le partenaire,
        pas hdar. Tu peux refuser ces messages et cadeaux dans Paramètres, bloquer ou signaler un partenaire.
        Tout démarchage abusif entraîne la suspension du partenaire.
      </p>
      <h2>9 ter. Codes cadeaux, parrainage et surprises</h2>
      <p>
        Les <strong>codes cadeaux</strong> hdar (jours de hdar+, boost ou cœurs) s'utilisent une seule fois
        par profil, dans la limite de leurs utilisations et de leur date d'expiration ; ils n'ont aucune
        valeur monétaire et ne sont ni échangeables ni remboursables. <strong>Parrainage</strong> : quand une
        personne crée son profil avec ton lien et que sa photo est validée, vous recevez chacun 3 jours de
        hdar+ (10 récompenses maximum par mois pour le parrain ; l'auto-parrainage est exclu). hdar peut
        offrir de temps en temps une <strong>surprise</strong> (boost ou quelques jours de hdar+), au plus
        une fois tous les 10 jours, sans aucune obligation. Tout abus (faux comptes, revente de codes) entraîne
        l'annulation des avantages et un bannissement.
      </p>
      <h2>10. Live vidéo</h2>
      <p>
        Le live met en relation au hasard des personnes majeures. Il n'est pas enregistré par
        hdar. Ta vidéo est floutée <strong>sur ton propre téléphone, avant l'envoi</strong> : ton image
        nette n'est jamais envoyée tant que tu ne choisis pas de te montrer, et personne ne peut te
        déflouter à ta place. Sont interdits : la présence de mineurs, l'exhibition non désirée,
        l'enregistrement ou la capture de l'autre personne. L'entrée dans le live suppose
        l'acceptation de ces règles, dont la date est conservée. La vidéo passant d'appareil à appareil, ton adresse IP peut être visible par ton
        interlocuteur. Les règles ci-dessus s'appliquent ; tout abus entraîne un bannissement.
      </p>
      <h2>11. Mentions légales et contact</h2>
      <p>
        Éditeur : hdar. Hébergement : Netlify, Inc. (site) et Supabase (données, UE). Contact,
        RGPD et signalements : via le <ContactLink /> (accessible aussi depuis « Mon profil »).
      </p>
    </LegalPage>
  );
}
