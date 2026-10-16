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
        certifies avoir au moins 18 ans. Tout profil d'une personne mineure sera supprimé. hdar. est ouvert à toutes et tous, quels que soient le genre, l'orientation ou l'identité : sorties et rencontres autour de toi, dans le respect de chacun·e. Toute discrimination (homophobie, transphobie, racisme, sexisme…) est interdite.
      </p>
      <h2>2. Anonymat</h2>
      <p>
        Le service est anonyme et gratuit dans sa version de base. Tu restes responsable de ce que tu publies et partages, y
        compris ta position exacte lorsque tu choisis de l'envoyer.
      </p>
      <h2 id="interdits">3. Ce qui est interdit (politique d'utilisation acceptable)</h2>
      <ul>
        <li>
          <strong>Toute présence ou tout contenu impliquant un mineur</strong> : signalé aux
          autorités et banni définitivement.
        </li>
        <li>
          Photo de profil explicite. Nudité ou contenu sexuel imposé à quelqu'un qui ne l'a pas
          demandé, dans les chats publics ou en live (caméra floutée par défaut).
        </li>
        <li>
          <strong>Nudité dans le Live</strong> (en face à face comme en diffusion à plusieurs) : le Live
          peut être coquin, mais sexe et parties intimes restent couverts. Expulsion et suspension en cas
          de manquement.
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
      <h2 id="autorites">4 bis. Demandes des autorités</h2>
      <p>
        Les autorités judiciaires et les forces de l'ordre adressent leurs demandes via le{" "}
        <ContactLink /> (sujet « Signalement »), en joignant la réquisition ou la décision
        concernée et un moyen de les recontacter.
      </p>
      <ul>
        <li>
          Nous vérifions l'origine et la validité de chaque demande. Nous ne communiquons de données
          que sur réquisition ou décision émanant d'une autorité compétente, conformément au droit
          français et européen (notamment la LCEN et le règlement sur les services numériques).
        </li>
        <li>
          Nous ne transmettons que les données strictement nécessaires dont nous disposons au moment
          de la demande, dans la limite de nos durées de conservation (voir la politique de
          confidentialité) : données du profil, dates d'activité, contenus signalés, historique de
          modération et, le cas échéant, données de paiement détenues par Stripe.
        </li>
        <li>
          Les demandes urgentes (danger immédiat pour une personne, implication d'un mineur) sont
          traitées en priorité. Tout contenu impliquant un mineur est signalé spontanément aux
          autorités (Pharos), et le compte est banni.
        </li>
        <li>
          À la réception d'une demande valable, nous pouvons conserver les données concernées au-delà
          des durées habituelles, le temps nécessaire à l'enquête.
        </li>
        <li>
          Sauf interdiction légale ou demande contraire de l'autorité, la personne concernée peut
          être informée de la demande.
        </li>
      </ul>
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
        Tout démarchage abusif entraîne la suspension du partenaire. Le <strong>Boost Pro</strong> (24 h, 7 jours
        ou 30 jours, paiement unique) est réservé aux partenaires actifs : pin doré sur la carte, place « À la une »
        dans l'onglet Lieux et priorité dans le Live Pro pendant la durée achetée. Il démarre dès le paiement ; en
        cochant la case prévue, tu demandes son exécution immédiate et renonces au droit de rétractation de 14 jours.
      </p>
      <h2>9 ter. Codes cadeaux, parrainage et surprises</h2>
      <p>
        Les <strong>codes cadeaux</strong> hdar (jours de hdar+, boost ou cœurs) s'utilisent une seule fois
        par profil, dans la limite de leurs utilisations et de leur date d'expiration ; ils n'ont aucune
        valeur monétaire et ne sont ni échangeables ni remboursables. <strong>Parrainage</strong> : quand une
        personne crée son profil avec ton lien et que sa photo est validée, vous recevez chacun 3 jours de
        hdar+ (10 récompenses maximum par mois pour le parrain ; l'auto-parrainage est exclu). Partager ton lien d'invitation peut aussi te faire gagner tout de suite un petit cadeau (boost de 3 h ou 1 jour de hdar+), au plus une fois tous les 7 jours. hdar peut
        offrir de temps en temps une <strong>surprise</strong> (boost ou quelques jours de hdar+), au plus
        une fois tous les 10 jours, sans aucune obligation. Tout abus (faux comptes, revente de codes) entraîne
        l'annulation des avantages et un bannissement.
      </p>
      <h2>9 quater. Programme ambassadeur</h2>
      <p>Le programme ambassadeur est sur invitation de hdar. Il est régi par le contrat d'apporteur d'affaires présenté dans l'application, signé électroniquement (nom saisi, date, version, empreinte de l'adresse IP) ; un exemplaire PDF est remis à l'ambassadeur et reste téléchargeable dans son espace. L'ambassadeur doit avoir un profil avec photo validée, accepter la charte (aucun spam, aucune fausse inscription, proposer hdar uniquement à des adultes consentants, ne jamais demander d'identité ni de données personnelles) et disposer d'un statut d'auto-entrepreneur (SIRET) pour être rémunéré. Les versements sont effectués automatiquement par virement via Stripe Connect (le 1er de chaque mois, au-delà du seuil indiqué) ; l'ambassadeur ouvre pour cela un compte Stripe Express et accepte les conditions de Stripe. Les commissions ne portent que sur des paiements réellement encaissés (un abonnement résilié cesse d'en générer ; un remboursement annule la commission correspondante, déduite des versements suivants) et sont calculées par hdar selon les règles affichées dans son espace (par exemple : montant par inscrit dont la photo est validée et toujours actif 7 jours après, pourcentage du chiffre d'affaires net des membres et partenaires apportés pendant une durée limitée, bonus éventuel). L'ambassadeur déclare ces revenus. Les codes cadeaux remis par un ambassadeur sont à usage unique et limités. Les fiches partenaires créées par un ambassadeur sont des brouillons que l'établissement réclame puis valide ; toute offre de lancement doit être approuvée par hdar. hdar peut modifier les règles ou retirer le rôle à tout moment ; toute fraude entraîne l'annulation des commissions concernées.</p>

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
