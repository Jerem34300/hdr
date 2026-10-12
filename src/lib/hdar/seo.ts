/** Public site address, used for canonical links. Override with VITE_SITE_URL on a custom domain. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://hdar.chat").replace(/\/$/, "");

export type SeoCity = { slug: string; name: string; region: string; line: string };

/** Cities with a public landing page ("Rencontre gay à …"), listed in the sitemap. */
export const SEO_CITIES: SeoCity[] = [
  { slug: "paris", name: "Paris", region: "Île-de-France", line: "Le Marais, Pigalle, Oberkampf : la carte montre qui est connecté autour de toi." },
  { slug: "lyon", name: "Lyon", region: "Auvergne-Rhône-Alpes", line: "Des Pentes de la Croix-Rousse à la Guillotière, vois qui est dispo dans ton quartier." },
  { slug: "marseille", name: "Marseille", region: "Provence-Alpes-Côte d'Azur", line: "Du Vieux-Port au cours Julien, le chat du quartier réunit les gens autour." },
  { slug: "toulouse", name: "Toulouse", region: "Occitanie", line: "Capitole, Carmes, Saint-Cyprien : trouve qui est en ligne à quelques rues." },
  { slug: "montpellier", name: "Montpellier", region: "Occitanie", line: "De l'Écusson à Antigone, discute avec les gens connectés près de toi." },
  { slug: "agde", name: "Agde", region: "Occitanie", line: "Agde, le Grau et la côte : vois qui est connecté autour de toi, en direct." },
  { slug: "cap-d-agde", name: "Cap d'Agde", region: "Occitanie", line: "Au Cap d'Agde, toute la saison : qui est là, maintenant, et où ça bouge." },
  { slug: "beziers", name: "Béziers", region: "Occitanie", line: "Béziers et alentours : la carte des gens connectés, distances arrondies." },
  { slug: "nimes", name: "Nîmes", region: "Occitanie", line: "Autour des Arènes et de l'Écusson, vois qui est dispo ce soir." },
  { slug: "sete", name: "Sète", region: "Occitanie", line: "Du port aux plages du lido, vois qui est connecté autour de toi à Sète." },
  { slug: "perpignan", name: "Perpignan", region: "Occitanie", line: "Perpignan et la côte catalane : chat de quartier et discussions privées." },
  { slug: "bordeaux", name: "Bordeaux", region: "Nouvelle-Aquitaine", line: "Saint-Pierre, Chartrons, Victoire : qui est connecté autour de toi." },
  { slug: "nantes", name: "Nantes", region: "Pays de la Loire", line: "Du Bouffay à l'île de Nantes, trouve qui est dispo à quelques minutes." },
  { slug: "lille", name: "Lille", region: "Hauts-de-France", line: "Vieux-Lille, Wazemmes, centre : vois qui est en ligne près de toi." },
  { slug: "nice", name: "Nice", region: "Provence-Alpes-Côte d'Azur", line: "Vieux-Nice, port, Promenade : la carte de qui est là, maintenant." },
  { slug: "strasbourg", name: "Strasbourg", region: "Grand Est", line: "Grande Île, Krutenau, Neudorf : discute avec les gens connectés autour." },
  { slug: "rennes", name: "Rennes", region: "Bretagne", line: "Du centre historique à Sainte-Anne, vois qui est dispo ce soir." },
  { slug: "grenoble", name: "Grenoble", region: "Auvergne-Rhône-Alpes", line: "Grenoble et la cuvette : chat du quartier et rencontres à deux pas." },
  { slug: "avignon", name: "Avignon", region: "Provence-Alpes-Côte d'Azur", line: "Intra-muros et alentours : qui est connecté autour de toi, en direct." },
  { slug: "toulon", name: "Toulon", region: "Provence-Alpes-Côte d'Azur", line: "Toulon et la rade : vois qui est en ligne à quelques rues." },
  { slug: "angers", name: "Angers", region: "Pays de la Loire", line: "Angers centre et la Doutre : discussions privées avec les gens autour." },
];
