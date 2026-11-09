import type { CityText } from "./kit";

/** Français (Belgique / Suisse romande) — texte unique par ville. Coquin sans nudité, aucun chiffre d'utilisateurs inventé. */
export const CITIES_FR: Record<string, CityText> = {
  bruxelles: {
    title: "Bruxelles : tchat et plans autour de toi — hdar.",
    desc: "Tchat, plans et rencontres à Bruxelles, autour de toi. Gratuit, anonyme, 18+. Carte en direct autour de Saint-Jacques, Saint-Géry, Ixelles et le Sablon.",
    h1: ["Tchat et plans à ", "Bruxelles"],
    lead: "Bruxelles est petite pour une capitale, et c'est tant mieux. Entre Saint-Jacques, Saint-Géry et Ixelles, un coup d'œil sur la carte suffit pour voir qui est dans le coin.",
    introTitle: "Une capitale à taille humaine",
    intro: [
      "Le **quartier Saint-Jacques**, autour de la **rue du Marché au Charbon**, rassemble depuis longtemps les bars LGBT+ de la ville, à deux pas de la Grand-Place. Juste à côté, **Saint-Géry** se remplit de terrasses dès qu'il fait beau. **Ixelles**, de Flagey au Châtelain, a ses cafés et son ambiance de quartier, et le **Sablon** joue la carte chic.",
      "hdar marche comme Bruxelles : tu vois ce qui se passe près de toi. Tu choisis quand tu es visible — une heure, trois heures ou toute la nuit — avec une position arrondie. Un regard, un message dans le tchat du quartier, une bière ensuite peut-être.",
    ],
    quartersTitle: "Plans à Bruxelles, quartier par quartier",
    quarters: [
      ["Saint-Jacques", "Bars LGBT+ près de la Grand-Place, le point de départ classique."],
      ["Saint-Géry", "Terrasses et cafés, idéal pour un premier verre."],
      ["Ixelles", "Flagey, Châtelain : cafés et vie de quartier."],
      ["Sablon", "Plus chic, parfait pour un rendez-vous tranquille."],
    ],
    cruising: "Sur la carte hdar, les lieux publics signalés par la communauté — parcs, bois et autres espaces en plein air — sont sur un calque optionnel, « Autres lieux publics ». Active-le si tu veux voir ce qu'il y a à Bruxelles. Aucune adresse ici : seulement la carte en direct, pour les 18 ans et plus, avec discrétion et respect des autres.",
    faq: [
      { q: "Ça marche aussi en périphérie, à Anderlecht ou Woluwe ?", a: "Oui. La carte montre qui est visible autour de toi, où que tu sois." },
      { q: "hdar, c'est seulement pour les gays ?", a: "Non. C'est ouvert à toutes les orientations, LGBT-friendly, réservé aux 18 ans et plus." },
    ],
  },
  genf: {
    title: "Genève : tchat et rencontres autour de toi — hdar.",
    desc: "Tchat et rencontres à Genève, autour de toi. Gratuit, anonyme, 18+. Carte en direct autour des Pâquis, de Plainpalais, des Eaux-Vives et de Carouge.",
    h1: ["Genève : tchat et plans ", "au bord du lac"],
    lead: "Genève a l'air sage, mais le soir les Pâquis et Plainpalais se réveillent. La carte te montre qui est visible autour de toi en ce moment.",
    introTitle: "Entre lac et quartiers vivants",
    intro: [
      "Les **Pâquis**, derrière la gare, sont le quartier le plus mélangé de la ville : bars, petits restos et, côté lac, les **Bains des Pâquis** où l'on se retrouve à toute saison. **Plainpalais** est étudiant et animé, les **Eaux-Vives** plus résidentielles mais pleines de terrasses, et **Carouge**, avec son air de petite ville sarde, est parfait pour un verre tranquille.",
      "Dans une ville où beaucoup ne font que passer, hdar aide à voir qui est vraiment dans le coin. Visible le temps que tu veux, position arrondie, tchat du quartier — et rien d'explicite sur les pages publiques.",
    ],
    quartersTitle: "Quartiers de Genève",
    quarters: [
      ["Pâquis", "Bars et ambiance mélangée près du lac."],
      ["Plainpalais", "Étudiant, animé, plein de cafés."],
      ["Eaux-Vives", "Terrasses et quais, plus calme."],
      ["Carouge", "Petites rues et bistrots pour un premier rendez-vous."],
    ],
    cruising: "Les lieux publics signalés par la communauté — parcs, quais et autres espaces en plein air — sont sur le calque optionnel « Autres lieux publics ». Pour Genève, aucune adresse sur cette page : seulement la carte en direct, 18+, avec discrétion et respect.",
    faq: [
      { q: "Ça marche aussi côté français, à Annemasse ou Ferney ?", a: "Oui. La carte montre qui est visible autour de toi, de part et d'autre de la frontière." },
      { q: "Pour qui est hdar ?", a: "Pour tout le monde à partir de 18 ans, toutes orientations, LGBT-friendly." },
    ],
  },
  lausanne: {
    title: "Lausanne : tchat et plans autour de toi — hdar.",
    desc: "Tchat et plans à Lausanne, autour de toi. Gratuit, anonyme, 18+. Carte en direct autour du Flon, de la Cité, de la Riponne et d'Ouchy.",
    h1: ["Lausanne : des plans ", "qui montent et descendent"],
    lead: "À Lausanne, tout est en pente — même les soirées. Du Flon à Ouchy, la carte te montre qui est visible près de toi ce soir.",
    introTitle: "Du Flon au bord du lac",
    intro: [
      "Le **Flon**, ancien quartier d'entrepôts au creux de la ville, concentre bars et clubs. Au-dessus, la **Cité** et la vieille ville autour de la cathédrale offrent des ruelles plus calmes, et la place de la **Riponne** est un point de rendez-vous central. En bas, **Ouchy** et ses quais au bord du Léman sont faits pour se balader au coucher du soleil.",
      "Avec hdar, tu décides quand on te voit et pour combien de temps. Position arrondie, tchat du quartier, aucune nudité sur les pages publiques : un regard, un message, un verre de chasselas.",
    ],
    quartersTitle: "Quartiers de Lausanne",
    quarters: [
      ["Le Flon", "Bars et clubs dans les anciens entrepôts."],
      ["La Cité", "Ruelles calmes autour de la cathédrale."],
      ["Riponne", "Point de rendez-vous central."],
      ["Ouchy", "Quais du Léman pour un rendez-vous de jour."],
    ],
    cruising: "Les lieux publics signalés par la communauté — parcs, rives et autres espaces en plein air — apparaissent sur le calque optionnel « Autres lieux publics ». Pour Lausanne, aucune adresse ici : seulement la carte en direct, 18+, avec discrétion.",
    faq: [
      { q: "Ça marche aussi à Renens, Pully ou Vevey ?", a: "Oui. La carte montre qui est visible autour de toi." },
      { q: "hdar, c'est seulement pour les gays ?", a: "Non. Pour tout le monde à partir de 18 ans, toutes orientations." },
    ],
  },
};
