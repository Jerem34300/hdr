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
      "Rencontre gay à Montpellier : la carte en direct de qui est connecté dans l'Écusson, à Saint-Roch ou aux Beaux-Arts. Bars, prévention, conseils. Gratuit, anonyme, sans compte, 18+.",
    nearby: ["sete", "nimes", "agde", "cap-d-agde", "beziers"],
    faq: [
      {
        q: "Où sortir gay à Montpellier ?",
        a: "Le cœur de la vie gay est dans l'Écusson et autour de Saint-Roch, notamment rue Jules Latreilhe (Le Coxx, Kaleido Bar), ainsi que Madrediosa aux Beaux-Arts et l'HypnoBar rue des Trésoriers de la Bourse. Vérifie les horaires auprès des lieux avant de sortir.",
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
          Montpellier est l'une des villes les plus ouvertes du sud de la France, et sa vie gay tient dans un périmètre
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
          quartier permet de demander simplement « quelqu'un au Coxx ce soir ? ».
        </p>

        <h2 className="mt-10 font-display text-xl font-bold">Où sortir gay à Montpellier</h2>
        <p className="mt-3 text-sm text-muted">
          Lieux vérifiés en ligne en octobre 2026. Les horaires changent souvent : confirme auprès des lieux ou sur{" "}
          <a className={ext} href="https://agendalgbt.com/montpellier" rel="noopener" target="_blank">
            Agenda LGBT Montpellier
          </a>
          .
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>Rue Jules Latreilhe</strong> : la rue la plus gay de la ville, avec <strong>Le Coxx</strong> (DJ le
            week-end, drag shows) et le <strong>Kaleido Bar</strong>. Le point de départ classique d'une soirée.
          </li>
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>Madrediosa</strong>, 5 rue Belmont aux Beaux-Arts : bar queer, ambiance plus mixte, événements
            réguliers. Souvent recommandé pour se faire des amis quand on arrive à Montpellier.
          </li>
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>HypnoBar</strong>, 4 rue des Trésoriers de la Bourse, en plein Écusson.
          </li>
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>Soirées</strong> : la ville n'a pas vraiment de club gay permanent, ce sont les collectifs qui font
            la nuit, comme <strong>Folle de Rage</strong> (tea dances, soirées au <strong>Rockstore</strong>, 20 rue de
            Verdun).
          </li>
          <li className="rounded-2xl border border-line bg-surface px-4 py-3">
            <strong>Saunas</strong> : <strong>ONE Sauna</strong> près de la gare (1 rue de la Victoire de la Marne) et{" "}
            <strong>Koncept Sauna</strong> avenue de Lodève.
          </li>
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
          <li>Touche Connexion et choisis 1 h, 3 h ou 12 h : tu apparais sur la carte, position arrondie.</li>
          <li>Regarde qui est autour, écris dans le chat du quartier (effacé après 24 h) ou crée un « lieu » pour ta soirée.</li>
          <li>Pour les messages privés, crée un pseudo : texte, photos, vocaux, appel vidéo et partage de position exacte facultatif (1 h).</li>
          <li>Ajoute des favoris : tu es prévenu quand ils se connectent à Montpellier.</li>
        </ol>

        <h2 className="mt-10 font-display text-xl font-bold">Rencontrer en sécurité</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>Premier rendez-vous dans un lieu public : une terrasse de l'Écusson ou un bar de la rue Jules Latreilhe plutôt qu'un appartement.</li>
          <li>Préviens un proche de l'endroit où tu vas. Le partage de position exacte de hdar expire seul au bout d'une heure.</li>
          <li>Garde ta PrEP, tes préservatifs, et pense au dépistage régulier (AIDES, CeGIDD).</li>
          <li>Si quelqu'un insiste, bloque-le et signale-le dans l'appli : les signalements sont examinés.</li>
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
