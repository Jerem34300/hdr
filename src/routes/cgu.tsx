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
        Le service est anonyme et gratuit. Tu restes responsable de ce que tu publies et partages, y
        compris ta position exacte lorsque tu choisis de l'envoyer.
      </p>
      <h2>3. Ce qui est interdit</h2>
      <ul>
        <li>
          Photo de profil explicite (l'album et les messages privés restent sous ta responsabilité
          et doivent respecter la loi).
        </li>
        <li>Tout contenu impliquant un mineur, non consenti, haineux, menaçant ou illégal.</li>
        <li>
          Harcèlement, usurpation d'identité, spam, prostitution ou sollicitation commerciale.
        </li>
        <li>Diffuser hors de l'appli des contenus ou positions reçus d'autres personnes.</li>
      </ul>
      <h2>4. Modération</h2>
      <p>
        Tu peux bloquer et signaler n'importe quel profil. Les modérateurs peuvent masquer des
        contenus, retirer une photo ou suspendre un appareil, sans préavis, en cas de non-respect de
        ces règles.
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
      <h2>8. Contact</h2>
      <p>
        Via le <ContactLink /> (accessible aussi depuis « Mon profil »).
      </p>
    </LegalPage>
  );
}
