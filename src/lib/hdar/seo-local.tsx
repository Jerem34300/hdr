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
  paris: {
    description:
      "Plans, tchat et rencontres à Paris, autour de toi. Gratuit, anonyme, 18+. Carte en direct Marais, Oberkampf, Pigalle — pour tout le monde.",
    nearby: ["boulogne-billancourt", "saint-denis", "montreuil", "argenteuil", "versailles"],
    faq: [
      {
        q: "Où sortir et rencontrer à Paris avec hdar ?",
        a: "Ouvre la carte autour du Marais, d'Oberkampf, de Pigalle ou de ton arrondissement : tu vois qui est visible près de toi, tu écris dans le chat du quartier ou en privé. Premier rendez-vous plutôt en lieu public.",
      },
      {
        q: "Quels lieux partenaires sont visibles à Paris ?",
        a: "Aujourd'hui, deux lieux partenaires sont sur la carte : L'Impact Bar et IDM Sauna.",
      },
    ],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Paris la nuit, autour de toi</h2>
        <p className="mt-3 text-sm leading-relaxed">
          À Paris, la distance se compte en stations, pas en kilomètres. Le <strong>Marais</strong>, <strong>Oberkampf</strong>,{" "}
          <strong>Pigalle</strong>, les quais ou un coin du 11e : la carte hdar montre qui est visible autour de toi, maintenant.
          Personne dans ton coin ? Dézoome la carte pour voir qui est chaud ailleurs, ou touche le nom de la ville en haut à droite
          pour changer de ville. Un regard, un message, un verre plus tard — le reste, c&apos;est entre vous.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Tu te montres 1 h, 3 h ou toute la nuit ; ta position est arrondie à environ 110 mètres. Le chat du quartier couvre à peu près
          3 km. Pour un premier contact, un café en terrasse ou un bar bondé reste plus sage qu'un appartement.
        </p>

        <h2 className="mt-10 font-display text-xl font-bold">Quartiers et sorties</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          <li><strong>Le Marais</strong> — bars et terrasses denses, facile de se retrouver à pied.</li>
          <li><strong>Oberkampf / Bastille</strong> — soirées plus longues, rues animées jusqu'à tard.</li>
          <li><strong>Pigalle / South Pigalle</strong> — néons, clubs, ambiance plus chargée, toujours 18+.</li>
          <li><strong>Canal Saint-Martin</strong> — plutôt balade et premier verre au calme.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-bold">Paris en chiffres</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Population municipale <strong>2&nbsp;103&nbsp;778</strong> habitants (INSEE, recensement 2023) pour une superficie de{" "}
          <strong>105,40&nbsp;km²</strong>. Source :{" "}
          <a className={ext} href="https://www.insee.fr/fr/statistiques/2011101?geo=COM-75056" rel="noopener" target="_blank">
            INSEE — dossier communal Paris (75056)
          </a>
          .
        </p>

        <h2 className="mt-10 font-display text-xl font-bold">Lieux partenaires à Paris</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Les lieux partenaires déjà sur la carte :
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li><strong>L'Impact Bar</strong> — bar partenaire.</li>
          <li><strong>IDM Sauna</strong> — sauna partenaire.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-bold">Comment ça marche à Paris</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Ouvre hdar.chat, confirme 18 ans — pas d'e-mail.</li>
          <li>Touche « Se montrer » : tu apparais sur la carte, position arrondie.</li>
          <li>Chat du quartier ou message privé ; tu disparais quand tu choisis.</li>
        </ol>
      </>
    ),
  },
  montpellier: {
    og: "/og-montpellier.jpg",
    description:
      "Plans, tchat et rencontres à Montpellier, autour de toi. Gratuit, anonyme, 18+. Écusson, Saint-Roch, Beaux-Arts — pour tout le monde.",
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
          <em>qui est là maintenant</em>, c&apos;est ce qui compte. Personne autour ? Dézoome la carte ou change de ville en haut à droite.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Sur hdar, tu apparais sur la carte de Montpellier seulement quand tu le décides, pour 1 h, 3 h ou toute la nuit. Ta
          position est arrondie à environ 110 mètres puis effacée : personne ne peut deviner ton adresse. Un soir dans
          l'Écusson, la carte montre qui est visible autour de la place de la Comédie ou de Saint-Roch, et le chat du
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
          <li>Touche « Se montrer » et choisis 1 h, 3 h ou toute la nuit : tu apparais sur la carte, position arrondie.</li>
          <li>Regarde qui est autour, écris dans le chat du quartier (effacé après 24 h) ou crée un « lieu » pour ta soirée.</li>
          <li>Pour les messages privés, crée un pseudo : texte, photos, vocaux, appel vidéo et partage de position exacte facultatif (1 h).</li>
          <li>Ajoute des favoris : tu es prévenu quand ils se montrent à Montpellier.</li>
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
          plages du lido. La ville est petite : la carte en direct de hdar montre qui est visible du port jusqu'à la
          Corniche, sans compte. Calme ce soir ? Dézoome vers Montpellier ou Agde pour voir qui est chaud ailleurs. Ta position est arrondie à environ 110 mètres et s'efface
          après 1 h, 3 h ou toute la nuit.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          En été, crée un « lieu » pour une plage ou une soirée afin de retrouver les gens du coin, et utilise le chat
          du quartier pour savoir où ça bouge. Pour la prévention, les associations de Montpellier (AIDES, Planning
          familial 34) sont les plus proches.
        </p>
      </>
    ),
  },

  lyon: {
    description: "Plans, tchat et rencontres à Lyon, autour de toi. Gratuit, anonyme, 18+. Pentes, Guillotière, Presqu'île.",
    nearby: ["villeurbanne", "venissieux", "saint-etienne", "grenoble"],
    faq: [
      {
        q: "Où trouver un plan à Lyon ce soir ?",
        a: "Ouvre la carte autour des Pentes, de la Guillotière ou de la Presqu'île : tu vois qui est visible près de toi, tu discutes d'abord, puis tu décides. 18+, position arrondie, sans adresse listée ici.",
      },
    ],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Plans à Lyon, entre Saône et Rhône</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Lyon se joue à pied : les <strong>Pentes de la Croix-Rousse</strong> le soir, la <strong>Guillotière</strong> plus animée,
          la <strong>Presqu&apos;île</strong> entre Bellecour et Hôtel de Ville, et les quais quand il fait doux. Un plan ici, c&apos;est souvent
          d&apos;abord un message — puis un verre, une balade, ou simplement discuter. hdar montre qui est visible dans ton quartier,
          et si c&apos;est calme, tu dézoomes la carte pour voir qui est chaud ailleurs, ou tu changes de ville en haut à droite. 18+.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Le chat du quartier couvre environ 3 km : utile pour demander « qui sort côté Guillotière ? » sans te dévoiler plus que tu ne veux.
          Tu te montres 1 h, 3 h ou toute la nuit ; ta position reste arrondie à environ 110 mètres.
        </p>
        <h2 className="mt-10 font-display text-xl font-bold">Quartiers où ça bouge</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          <li><strong>Pentes / Croix-Rousse</strong> — bars en escalier, terrasses serrées, premier contact à pied.</li>
          <li><strong>Guillotière</strong> — plus tard, plus mixte, bon pour un plan spontané après un tchat.</li>
          <li><strong>Presqu&apos;île</strong> — Bellecour, Cordeliers, Jacobins : central, facile à rejoindre.</li>
          <li><strong>Confluence / quais</strong> — plutôt balade et rendez-vous au calme.</li>
        </ul>
      </>
    ),
  },
  marseille: {
    description: "Plans, tchat et rencontres à Marseille, autour de toi. Gratuit, anonyme, 18+. Vieux-Port, cours Julien, plages.",
    nearby: ["aix-en-provence", "toulon", "avignon"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Marseille côté Vieux-Port</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Du <strong>Vieux-Port</strong> au <strong>cours Julien</strong> et vers les plages, la ville vit dehors. La carte en direct t&apos;aide à voir
          qui est dans le coin — discret, gratuit, 18+. Personne autour ? Dézoome la carte vers Aix ou la côte.
        </p>
      </>
    ),
  },
  toulouse: {
    description: "Plans, tchat et rencontres à Toulouse, autour de toi. Gratuit, anonyme, 18+. Capitole, Carmes, Saint-Cyprien.",
    nearby: ["montauban", "albi", "bordeaux"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Toulouse la rose, le soir</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Autour du <strong>Capitole</strong>, des <strong>Carmes</strong> et de <strong>Saint-Cyprien</strong>, les terrasses restent longues.
          hdar reste local : qui est visible près de toi, chat de quartier, anonymat.
        </p>
      </>
    ),
  },
  nice: {
    description: "Plans, tchat et rencontres à Nice, autour de toi. Gratuit, anonyme, 18+. Vieux-Nice, port, Promenade.",
    nearby: ["cannes", "antibes", "toulon"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Nice entre Promenade et Vieux-Nice</h2>
        <p className="mt-3 text-sm leading-relaxed">
          La <strong>Promenade des Anglais</strong>, le <strong>Vieux-Nice</strong> et le port : on se croise dehors. Sur hdar, tu choisis de
          t&apos;afficher — position arrondie, 18+.
        </p>
      </>
    ),
  },
  nantes: {
    description: "Plans, tchat et rencontres à Nantes, autour de toi. Gratuit, anonyme, 18+. Bouffay, île de Nantes.",
    nearby: ["angers", "rennes", "bordeaux"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Nantes, Bouffay et l&apos;île</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Du <strong>Bouffay</strong> à l&apos;<strong>île de Nantes</strong>, les sorties restent à taille humaine. La carte montre le voisinage, 18+.
        </p>
      </>
    ),
  },
  bordeaux: {
    description: "Plans, tchat et rencontres à Bordeaux, autour de toi. Gratuit, anonyme, 18+. Saint-Pierre, Chartrons, Victoire.",
    nearby: ["nantes", "toulouse"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Bordeaux côté Chartrons</h2>
        <p className="mt-3 text-sm leading-relaxed">
          <strong>Saint-Pierre</strong>, les <strong>Chartrons</strong>, la Victoire : bars et quais. hdar reste discret — tu te montres quand tu veux.
        </p>
      </>
    ),
  },
  lille: {
    description: "Plans, tchat et rencontres à Lille, autour de toi. Gratuit, anonyme, 18+. Vieux-Lille, Wazemmes.",
    nearby: ["roubaix", "tourcoing", "lens"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Lille, Vieux-Lille et Wazemmes</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Entre le <strong>Vieux-Lille</strong> et <strong>Wazemmes</strong>, les soirées se jouent à quelques rues. Carte en direct, 18+.
        </p>
      </>
    ),
  },
  strasbourg: {
    description: "Plans, tchat et rencontres à Strasbourg, autour de toi. Gratuit, anonyme, 18+. Grande Île, Krutenau.",
    nearby: ["mulhouse", "colmar", "nancy"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Strasbourg sur la Grande Île</h2>
        <p className="mt-3 text-sm leading-relaxed">
          <strong>Grande Île</strong>, <strong>Krutenau</strong>, Neudorf : la ville se marche. hdar affiche le voisinage, 18+.
        </p>
      </>
    ),
  },
  rennes: {
    description: "Plans, tchat et rencontres à Rennes, autour de toi. Gratuit, anonyme, 18+. Centre, Sainte-Anne.",
    nearby: ["nantes", "brest", "angers"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Rennes autour de Sainte-Anne</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Centre historique et <strong>Sainte-Anne</strong> : sorties à taille humaine. Carte hdar locale et discrète, 18+.
        </p>
      </>
    ),
  },
  grenoble: {
    description: "Plans, tchat et rencontres à Grenoble, autour de toi. Gratuit, anonyme, 18+. Centre et cuvette.",
    nearby: ["lyon", "chambery"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Grenoble dans la cuvette</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Tout est près : centre, campus, quais. hdar sert à voir qui est visible dans la cuvette — 18+.
        </p>
      </>
    ),
  },
  toulon: {
    description: "Plans, tchat et rencontres à Toulon, autour de toi. Gratuit, anonyme, 18+. Centre et rade.",
    nearby: ["nice", "marseille"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Toulon et la rade</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Centre-ville et front de mer : on se croise vite. Sur hdar, position arrondie, chat de quartier, 18+.
        </p>
      </>
    ),
  },
  angers: {
    description: "Plans, tchat et rencontres à Angers, autour de toi. Gratuit, anonyme, 18+. Centre et Doutre.",
    nearby: ["nantes", "tours"],
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Angers, centre et Doutre</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Entre le centre et la <strong>Doutre</strong>, les distances sont courtes. Carte de voisinage, 18+.
        </p>
      </>
    ),
  },
  nimes: {
    nearby: ["montpellier", "avignon", "sete"],
    description: "Plans, tchat et rencontres à Nîmes, autour de toi. Gratuit, anonyme, 18+. Arènes et Écusson.",
    body: (
      <>
        <h2 className="mt-10 font-display text-xl font-bold">Nîmes autour des Arènes</h2>
        <p className="mt-3 text-sm leading-relaxed">
          <strong>Arènes</strong> et Écusson : tout est concentré. Idéal pour une carte en direct du centre, 18+.
        </p>
      </>
    ),
  },

};
