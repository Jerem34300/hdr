export type Desire = "verre" | "discuter" | "plan" | "balade" | "sortir";
export type SignalKind = "verre" | "discuter" | "plan";
export type PlaceKind = "chez-moi" | "chez-toi" | "dehors";
export type TonightLen = "1h" | "3h" | "nuit";

export const DESIRES: { id: Desire; label: string }[] = [
  { id: "verre", label: "Un verre" },
  { id: "discuter", label: "Discuter" },
  { id: "plan", label: "Plan" },
  { id: "balade", label: "Balade" },
  { id: "sortir", label: "Sortir" },
];

export const SIGNALS: { id: SignalKind; label: string }[] = [
  { id: "verre", label: "Un verre" },
  { id: "discuter", label: "Discuter" },
  { id: "plan", label: "Plan" },
];

export const PLACES: { id: PlaceKind; label: string }[] = [
  { id: "chez-moi", label: "Chez moi" },
  { id: "chez-toi", label: "Chez toi" },
  { id: "dehors", label: "Dehors" },
];

export const LENGTHS: { id: TonightLen; label: string; hours: number }[] = [
  { id: "1h", label: "1 h", hours: 1 },
  { id: "3h", label: "3 h", hours: 3 },
  { id: "nuit", label: "La nuit", hours: 8 },
];

export type Tonight = {
  desires: Desire[];
  place: PlaceKind;
  note: string;
  hours: number;
};

export type Person = {
  id: string;
  pseudo: string;
  age: number;
  bio: string;
  tags: Desire[];
  east: number;
  north: number;
  online: boolean;
  voice: boolean;
  avatar: string;
  tonight: Tonight | null;
  replies: string[];
  sharesPrecise: boolean;
  openTo: SignalKind[];
};

export const PEOPLE: Person[] = [
  {
    id: "milo",
    pseudo: "Milo",
    age: 26,
    avatar: "/avatars/01.jpg",
    east: 50,
    north: 60,
    online: true,
    voice: true,
    tags: ["verre", "discuter"],
    bio: "Dernier verre, pas un plan de carrière.",
    tonight: { desires: ["verre", "discuter"], place: "dehors", note: "Au comptoir, pas pressé.", hours: 3 },
    openTo: ["verre", "discuter"],
    sharesPrecise: true,
    replies: [
      "Je suis au comptoir. Tu fais un saut ?",
      "Ok. Je te garde une place vingt minutes.",
      "Si tu viens, dis-moi juste quand tu pars.",
    ],
  },
  {
    id: "sacha",
    pseudo: "Sacha",
    age: 31,
    avatar: "/avatars/02.jpg",
    east: -70,
    north: 30,
    online: true,
    voice: false,
    tags: ["discuter", "balade"],
    bio: "Je marche plus volontiers que je ne m'assois.",
    tonight: { desires: ["discuter", "balade"], place: "dehors", note: "Balade si la pluie s'arrête.", hours: 3 },
    openTo: ["discuter"],
    sharesPrecise: false,
    replies: [
      "La pluie s'est calmée. On marche ?",
      "Je suis vers le canal, côté calme.",
      "Pas pressé. On se pose dehors.",
    ],
  },
  {
    id: "nael",
    pseudo: "Naël",
    age: 24,
    avatar: "/avatars/03.jpg",
    east: 100,
    north: -40,
    online: true,
    voice: true,
    tags: ["plan", "sortir"],
    bio: "Dispo tard. Je n'aime pas les groupes.",
    tonight: { desires: ["plan", "sortir"], place: "dehors", note: "Dispo après 22 h.", hours: 8 },
    openTo: ["plan"],
    sharesPrecise: false,
    replies: ["Après 22 h je suis libre.", "Dehors, pas chez moi.", "Envoie juste l'heure."],
  },
  {
    id: "eden",
    pseudo: "Eden",
    age: 29,
    avatar: "/avatars/04.jpg",
    east: -30,
    north: -90,
    online: true,
    voice: true,
    tags: ["verre", "discuter"],
    bio: "Je reste pour la conversation, pas pour le bruit.",
    tonight: null,
    openTo: ["verre"],
    sharesPrecise: false,
    replies: [
      "Je discute plus facilement qu'au premier verre.",
      "T'es dans quel coin du quartier ?",
      "Ok, je reste encore un peu.",
    ],
  },
  {
    id: "kenji",
    pseudo: "Kenji",
    age: 34,
    avatar: "/avatars/05.jpg",
    east: 120,
    north: 100,
    online: true,
    voice: false,
    tags: ["discuter", "balade"],
    bio: "Sorti du boulot. Je peux faire un détour.",
    tonight: { desires: ["discuter", "balade"], place: "dehors", note: "Je marche, détour possible.", hours: 1 },
    openTo: ["discuter"],
    sharesPrecise: true,
    replies: [
      "Je marche, je peux faire un détour.",
      "Un thé ou un verre, les deux me vont.",
      "Un point de repère, pas une adresse.",
    ],
  },
  {
    id: "noam",
    pseudo: "Noam",
    age: 23,
    avatar: "/avatars/06.jpg",
    east: -100,
    north: 10,
    online: true,
    voice: true,
    tags: ["sortir", "verre"],
    bio: "Mobile ce soir. Pas un plan compliqué.",
    tonight: { desires: ["sortir", "verre"], place: "dehors", note: "Je sors, pas chez moi.", hours: 3 },
    openTo: ["verre"],
    sharesPrecise: false,
    replies: ["Je sors, je suis mobile.", "Un verre oui. Rien de compliqué.", "Je te dis quand je pars."],
  },
  {
    id: "axel",
    pseudo: "Axel",
    age: 36,
    avatar: "/avatars/07.jpg",
    east: 10,
    north: 130,
    online: false,
    voice: false,
    tags: ["plan"],
    bio: "Souvent absent. Quand je réponds, c'est calme.",
    tonight: null,
    openTo: ["plan"],
    sharesPrecise: false,
    replies: ["Là je réponds.", "Plutôt calme. Pas un groupe.", "Demain aussi si ce soir tombe à l'eau."],
  },
  {
    id: "rafael",
    pseudo: "Rafael",
    age: 33,
    avatar: "/avatars/08.jpg",
    east: -50,
    north: 140,
    online: true,
    voice: true,
    tags: ["verre"],
    bio: "Encore assis. Je ne reste pas longtemps.",
    tonight: { desires: ["verre"], place: "chez-toi", note: "Un verre, puis on voit.", hours: 1 },
    openTo: ["verre"],
    sharesPrecise: false,
    replies: ["Un verre, puis on avise.", "Je suis encore assis, pas longtemps.", "On se parle d'abord."],
  },
  {
    id: "jules",
    pseudo: "Jules",
    age: 22,
    avatar: "/avatars/09.jpg",
    east: 460,
    north: 200,
    online: true,
    voice: false,
    tags: ["discuter"],
    bio: "Je finis un truc, ensuite je suis libre.",
    tonight: null,
    openTo: ["discuter"],
    sharesPrecise: false,
    replies: ["Je finis un truc et j'arrive.", "Juste discuter ? Ça me va.", "Je connais un endroit pas bruyant."],
  },
  {
    id: "amin",
    pseudo: "Amin",
    age: 30,
    avatar: "/avatars/10.jpg",
    east: -640,
    north: 160,
    online: true,
    voice: true,
    tags: ["plan", "balade"],
    bio: "Pas un bar bruyant. Un coin, une heure.",
    tonight: { desires: ["plan", "balade"], place: "dehors", note: "Pas un bar bruyant.", hours: 3 },
    openTo: ["plan"],
    sharesPrecise: false,
    replies: ["Pas un bar bruyant, plutôt un coin.", "Je peux me déplacer un peu.", "On se dit une heure et on s'y tient."],
  },
  {
    id: "hugo",
    pseudo: "Hugo",
    age: 27,
    avatar: "/avatars/11.jpg",
    east: 220,
    north: 1020,
    online: false,
    voice: false,
    tags: ["discuter"],
    bio: "Je lis plus vite que je ne parle.",
    tonight: null,
    openTo: ["discuter"],
    sharesPrecise: true,
    replies: ["Je rentre tard. Un message me va.", "Pas dispo tout de suite, mais je lis.", "Demain en fin de journée, plus simple."],
  },
  {
    id: "basile",
    pseudo: "Basile",
    age: 41,
    avatar: "/avatars/12.jpg",
    east: -280,
    north: -1080,
    online: true,
    voice: true,
    tags: ["verre", "discuter"],
    bio: "Dernier service. Conversation normale.",
    tonight: { desires: ["verre", "discuter"], place: "dehors", note: "Dernier service, encore là.", hours: 1 },
    openTo: ["verre"],
    sharesPrecise: true,
    replies: ["Dernier service. Je suis encore là.", "Un verre, conversation normale.", "Si tu es loin, on remet ça."],
  },
];

export type Zone = { id: string; name: string; east: number; north: number; radius: number };

export type City = {
  slug: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  line: string;
  quartiers: string[];
  zones: Zone[];
};

const Z = {
  close: (name: string): Zone => ({ id: "z1", name, east: 40, north: 30, radius: 280 }),
  mid: (name: string): Zone => ({ id: "z2", name, east: -520, north: 420, radius: 340 }),
  far: (name: string): Zone => ({ id: "z3", name, east: 80, north: 860, radius: 300 }),
};

export const CITIES: City[] = [
  {
    slug: "paris",
    name: "Paris",
    area: "Le Marais",
    lat: 48.8595,
    lng: 2.3615,
    line: "Le quartier bouge dès que la nuit tombe.",
    quartiers: ["Le Marais", "République", "Canal Saint-Martin", "Châtelet"],
    zones: [Z.close("Le Marais"), Z.mid("République"), Z.far("Canal")],
  },
  {
    slug: "lyon",
    name: "Lyon",
    area: "Les Terreaux",
    lat: 45.7676,
    lng: 4.832,
    line: "Entre Terreaux et les pentes, on se retrouve dehors.",
    quartiers: ["Terreaux", "Croix-Rousse", "Bellecour", "Guillotière"],
    zones: [Z.close("Terreaux"), Z.mid("Croix-Rousse"), Z.far("Berges")],
  },
  {
    slug: "marseille",
    name: "Marseille",
    area: "Cours Julien",
    lat: 43.2965,
    lng: 5.381,
    line: "Le cours reste allumé bien après le service.",
    quartiers: ["Cours Julien", "Le Panier", "Vieux-Port", "La Plaine"],
    zones: [Z.close("Cours Julien"), Z.mid("Le Panier"), Z.far("Vieux-Port")],
  },
  {
    slug: "toulouse",
    name: "Toulouse",
    area: "Les Carmes",
    lat: 43.598,
    lng: 1.444,
    line: "Les Carmes se remplissent avant minuit.",
    quartiers: ["Carmes", "Esquirol", "Saint-Cyprien", "Capitole"],
    zones: [Z.close("Carmes"), Z.mid("Esquirol"), Z.far("Garonne")],
  },
  {
    slug: "bordeaux",
    name: "Bordeaux",
    area: "Saint-Pierre",
    lat: 44.84,
    lng: -0.574,
    line: "Les quais sont plus calmes dès qu'on s'éloigne des terrasses.",
    quartiers: ["Saint-Pierre", "Chartrons", "Saint-Michel", "Quais"],
    zones: [Z.close("Saint-Pierre"), Z.mid("Chartrons"), Z.far("Quais")],
  },
  {
    slug: "lille",
    name: "Lille",
    area: "Vieux-Lille",
    lat: 50.637,
    lng: 3.063,
    line: "Vieux-Lille tient même quand il crachine.",
    quartiers: ["Vieux-Lille", "Grand Place", "Wazemmes", "Solférino"],
    zones: [Z.close("Vieux-Lille"), Z.mid("Grand Place"), Z.far("Citadelle")],
  },
  {
    slug: "nantes",
    name: "Nantes",
    area: "Graslin",
    lat: 47.213,
    lng: -1.562,
    line: "Graslin puis l'île, à pied.",
    quartiers: ["Graslin", "Île de Nantes", "Bouffay", "Commerce"],
    zones: [Z.close("Graslin"), Z.mid("Bouffay"), Z.far("Île")],
  },
  {
    slug: "nice",
    name: "Nice",
    area: "Vieux-Nice",
    lat: 43.697,
    lng: 7.276,
    line: "Les ruelles restent plus vraies que la promenade.",
    quartiers: ["Vieux-Nice", "Libération", "Port", "Promenade"],
    zones: [Z.close("Vieux-Nice"), Z.mid("Port"), Z.far("Libération")],
  },
];

export function cityBySlug(slug: string) {
  return CITIES.find((c) => c.slug === slug) ?? CITIES[0];
}

export type SpotSeed = {
  id: string;
  title: string;
  east: number;
  north: number;
  radiusM: number;
  hours: number;
  members: number;
  thread: { from: string; text: string }[];
};

const THREADS: { from: string; text: string }[][] = [
  [
    { from: "Sam", text: "On est trois. Il reste de la place." },
    { from: "Noé", text: "J'arrive dans dix minutes." },
    { from: "Sam", text: "On discute, pas de photo dans le spot." },
  ],
  [
    { from: "Alex", text: "Coin plus calme, à deux rues." },
    { from: "Jo", text: "Je reste une heure max." },
  ],
  [
    { from: "Camille", text: "Dernière table dehors." },
    { from: "Lou", text: "Je peux faire un détour." },
  ],
];

const SPOT_TITLES: Record<string, [string, string, string]> = {
  paris: ["Dernier verre", "After du canal", "Toit calme"],
  lyon: ["Verre aux Terreaux", "Pentes, sans plan", "Dernier métro"],
  marseille: ["Cours Julien", "Vieux-Port tard", "Toit du Panier"],
  toulouse: ["Aux Carmes", "Garonne, à pied", "Dernier set"],
  bordeaux: ["Saint-Pierre", "Quais, sans foule", "Après le vin"],
  lille: ["Vieux-Lille", "Un verre, Grand Place", "Avant la pluie"],
  nantes: ["Graslin", "Île, à pied", "Dernier tram"],
  nice: ["Vieux-Nice", "Promenade courte", "Après la terrasse"],
};

export function spotsFor(slug: string): SpotSeed[] {
  const titles = SPOT_TITLES[slug] ?? SPOT_TITLES.paris;
  const geom = [
    { east: 70, north: 40, radiusM: 220, hours: 3, members: 11 },
    { east: -90, north: 160, radiusM: 380, hours: 6, members: 7 },
    { east: 200, north: -70, radiusM: 180, hours: 2, members: 4 },
  ];
  return titles.map((title, i) => {
    const g = geom[i] ?? geom[0];
    return {
      id: `${slug}-${i + 1}`,
      title,
      east: g.east,
      north: g.north,
      radiusM: g.radiusM,
      hours: g.hours,
      members: g.members,
      thread: THREADS[i] ?? [],
    };
  });
}

export const SPOT_REPLIES = [
  "Bien vu.",
  "Je suis dans le coin.",
  "On se retrouve où, à peu près ?",
  "Ok pour dans un quart d'heure.",
  "Je reste encore un peu.",
];

export const SPOT_SUGGESTIONS = ["Un verre ici", "On se pose", "Dernière heure"];

export const HERE_ZONES: Zone[] = [
  { id: "h1", name: "Tout près", east: 40, north: 30, radius: 280 },
  { id: "h2", name: "Au nord", east: -80, north: 700, radius: 340 },
  { id: "h3", name: "Plus loin", east: 480, north: -180, radius: 300 },
];
