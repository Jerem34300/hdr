import type { ReactNode } from "react";

export type LocalContent = {
  og?: string;
  description?: string;
  nearby: string[];
  faq?: { q: string; a: string }[];
  body?: ReactNode;
};

const ext = "underline underline-offset-2";

/** Extra local content for some city pages. Only venues verified online are cited (oct. 2026). */
export const LOCAL: Record<string, LocalContent> = {
  montpellier: {
    og: "/og-montpellier.jpg",
    description:
      "Sortir et rencontrer à Montpellier, pour tout le monde : la carte en direct de qui est connecté dans l'Écusson, à Saint-Roch ou aux Beaux-Arts. Parcs, belvédères, places, lieux partenaires, conseils. Gratuit, discret, sans compte, 18+.",
    nearby: ["sete", "nimes", "agde", "cap-d-agde", "beziers"],
    faq: [
      {
        q: "Où sortir à Montpellier ?",
        a: "La vie nocturne se concentre dans l'Écusson et autour de Saint-Roch, des Beaux-Arts et d'Antigone. Ouvre la carte hdar pour voir qui est sorti ce soir et quels lieux sont autour ; pour les soirées LGBT+, l'agenda LGBT de Montpellier est une bonne référence.",
      },
      {
        q: "Où se faire dépister ou trouver de la prévention à Montpellier ?",
        a: "AIDES Montpellier (17 rue Boussairolles) mène des actions de prévention et d'accompagnement (dépistage, PrEP, réduction des risques). Le Planning familial de l'Hérault anime aussi un groupe de parole LGBTQI+ chaque mois.",
      },
    ],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Montpellier, une ville où ça bouge à pied</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Montpellier est l'une des villes les plus ouvertes du sud de la France, et sa vie nocturne tient dans un périmètre
          étonnamment petit. L'<strong>Écusson</strong>, le centre historique piéton, concentre la plupart des bars, des
          terrasses et des soirées. Juste à côté, le quartier <strong>Saint-Roch</strong> et la gare, puis les{" "}
          <strong>Beaux-Arts</strong> au nord et <strong>Antigone</strong> à l'est complètent la carte. C'est
          précisément ce qui rend une appli comme hdar utile ici : quand tout le monde est à quelques rues, savoir{" "}
          <em>qui est là maintenant</em> compte plus qu'une grille de profils de toute la région.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Sur hdar, tu apparais sur la carte de Montpellier seulement quand tu le décides, pour 1 h, 3 h ou 12 h. Ta
          position est arrondie à environ 110 mètres puis effacée : personne ne peut deviner ton adresse. Un soir dans
          l'Écusson, la carte montre qui est connecté autour de la place de la Comédie ou de Saint-Roch, et le chat du
          quartier permet de demander simplement « qui sort ce soir ? ».
        </p>

        <h2 className="mt-10 font-display text-xl font-bold">Sortir à Montpellier</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Bars, terrasses et soirées se trouvent pour l'essentiel dans l'Écusson, autour de Saint-Roch et vers les
          Beaux-Arts. Une bonne partie de la nuit est animée par des collectifs qui organisent des soirées ponctuelles :
          l'agenda change chaque semaine, consulte{" "}
          <a className={ext} href="https://agendalgbt.com/montpellier" rel="noopener" target="_blank">
            Agenda LGBT Montpellier
          </a>{" "}
          pour les soirées LGBT+. Dans hdar, crée un « lieu » éphémère pour ta soirée afin que les gens autour te retrouvent.
        </p>

        <h2 className="mt-10 font-display text-xl font-bold">Parcs, belvédères et plages</h2>
        <p className="mt-3 text-sm leading-relaxed">
          La carte hdar affiche aussi des lieux publics et gratuits issus d'OpenStreetMap : parcs et jardins, belvédères,
          places et promenades, plages, toilettes publiques, ainsi que les lieux proposés par la communauté, vérifiés avant
          publication. Pratique pour fixer un point de rendez-vous ou trouver où se poser, du Peyrou au Lez.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li><strong>Respect</strong> des autres usagers, des familles et des riverains ; la loi s'applique partout.</li>
          <li><strong>Sécurité</strong> : préviens un proche, privilégie les lieux fréquentés pour un premier rendez-vous.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-bold">Associations et prévention</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <strong>Fierté Montpellier Pride / Maison des LGBT</strong>, 3 avenue Georges Clemenceau : permanences
            conviviales, accueil, organisation de la Pride.{" "}
            <a className={ext} href="https://www.fiertemontpellierpride.com/" rel="noopener" target="_blank">
              fiertemontpellierpride.com
            </a>
          </li>
          <li>
            <strong>AIDES Montpellier</strong>, 17 rue Boussairolles : dépistage, PrEP, préservatifs, réduction des
            risques, et actions de prévention dans les bars et saunas.
          </li>
          <li>
            <strong>Planning familial 34</strong> : groupe de parole LGBTQI+ sur les sexualités, une fois par mois.{" "}
            <a
              className={ext}
              href="https://www.planning-familial.org/fr/le-planning-familial-de-lherault-34/groupe-de-parole-sur-nos-sexualites-lgbtqi-2510"
              rel="noopener"
              target="_blank"
            >
              infos
            </a>
          </li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-bold">Comment marche hdar à Montpellier</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Ouvre hdar.chat (ou installe-la sur ton écran d'accueil), confirme que tu as 18 ans. Pas de compte, pas d'e-mail.</li>
          <li>Touche « Se montrer » et choisis 1 h, 3 h ou 12 h : tu apparais sur la carte, position arrondie.</li>
          <li>Regarde qui est autour, écris dans le chat du quartier (effacé après 24 h) ou crée un « lieu » pour ta soirée.</li>
          <li>Pour les messages privés, crée un pseudo : texte, photos, vocaux, appel vidéo et partage de position exacte facultatif (1 h).</li>
          <li>Ajoute des favoris : tu es prévenu quand ils se connectent à Montpellier.</li>
          <li>Active la couche « Lieux permanents » pour voir parcs, belvédères, places, plages et lieux partenaires, ou proposer un lieu.</li>
        </ol>

        <h2 className="mt-10 font-display text-xl font-bold">Rencontrer en sécurité</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>Premier rendez-vous dans un lieu public, par exemple une terrasse de l'Écusson, plutôt qu'un appartement.</li>
          <li>Préviens un proche de l'endroit où tu vas. Le partage de position exacte de hdar expire seul au bout d'une heure.</li>
          <li>Garde ta PrEP, tes préservatifs, et pense au dépistage régulier (AIDES, CeGIDD).</li>
          <li>Si quelqu'un insiste, bloque et signale la personne dans l'appli : les signalements sont examinés.</li>
          <li>Pour toute urgence, compose le 17 ou le 112.</li>
        </ul>
      </>
    ),
  },
  sete: {
    nearby: ["montpellier", "agde", "cap-d-agde", "beziers"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Sète, entre l'étang et la mer</h2>
        <p className="mt-3 text-sm leading-relaxed">
          À une vingtaine de minutes de Montpellier en train, Sète vit au rythme des canaux, du quartier haut et des
          plages du lido. La ville est petite : la carte en direct de hdar montre qui est connecté du port jusqu'à la
          Corniche, sans grille de profils et sans compte. Ta position est arrondie à environ 110 mètres et s'efface
          après 1 h, 3 h ou 12 h.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          En été, crée un « lieu » pour une plage ou une soirée afin de retrouver les gens du coin, et utilise le chat
          du quartier pour savoir où ça bouge. Pour la prévention, les associations de Montpellier (AIDES, Planning
          familial 34) sont les plus proches.
        </p>
      </>
    ),
  },
  nimes: { nearby: ["montpellier", "avignon", "sete"] },
};
