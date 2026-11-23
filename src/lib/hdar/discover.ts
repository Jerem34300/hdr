import { rpcCall, type PlaceKind, type PlacePin, type PlaceVenue } from "./live";
import { venueOf } from "./venue.ts";
import { useHdar } from "./store";

export {
  DEFAULT_COVERS, RISK_COUNTRIES, defaultCover, listingLabel, kindNoun, kindIcon,
  maskEmail, emailDomain, websiteDomain, emailMatchesWebsite, isDisplayableOutreach,
  publicDescription, type MapListing, type OutreachLike,
} from "./discover-utils";
import { type MapListing } from "./discover-utils";

export type DiscoverCard = {
  id: string;
  kind: PlaceKind;
  venue?: PlaceVenue;
  name: string;
  description: string;
  lat: number;
  lng: number;
  city: string | null;
  address: string | null;
  hours: string | null;
  tags: string[];
  website: string | null;
  listing: MapListing;
  verified: boolean;
  cover_credit: string | null;
  photos: string[];
  partner: boolean;
  source?: string;
  source_ref?: string | null;
  country?: string | null;
};

export type DiscoverMethods = {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  website: string | null;
  website_domain: string | null;
  official_masked: string | null;
  has_official: boolean;
  has_website: boolean;
};

export const discoverMethods = (id: string) => rpcCall<DiscoverMethods>("hdar_discover_methods", { p_id: id });
export const discoverSendCode = (id: string, method: "email_official" | "email_domain", email?: string) =>
  rpcCall<{ ok: boolean; masked: string; expires_in: number; sent: boolean; held: boolean }>("hdar_discover_send_code", {
    p_id: id, p_method: method, p_email: email ?? null,
  });
export const discoverConfirmCode = (id: string, code: string) =>
  rpcCall<{ ok: boolean; id: string; name: string; verified: boolean; method: string }>("hdar_discover_confirm_code", {
    p_id: id, p_code: code,
  });
export const discoverRequestManual = (id: string, email: string, justification: string, proof?: string | null) =>
  rpcCall<{ ok: boolean; id: string; status: string }>("hdar_discover_request_manual", {
    p_id: id, p_email: email, p_justification: justification, p_proof: proof ?? null,
  });
export const discoverOwnerSave = (input: {
  id: string; description?: string; hours?: string; address?: string; website?: string; tags?: string[]; photos?: string[];
}) =>
  rpcCall<{ ok: boolean; id: string; pending_photos: boolean }>("hdar_discover_owner_save", {
    p_id: input.id,
    p_description: input.description ?? null,
    p_hours: input.hours ?? null,
    p_address: input.address ?? null,
    p_website: input.website ?? null,
    p_tags: input.tags ?? null,
    p_photos: input.photos ?? null,
  });

export const adminClaimRequests = (key: string) => rpcCall<AdminClaimRow[]>("hdar_admin_claim_requests", { p_key: key });
export const adminClaimReview = (key: string, id: string, ok: boolean, note?: string) =>
  rpcCall("hdar_admin_claim_review", { p_key: key, p_id: id, p_ok: ok, p_note: note ?? null });
export const adminPendingPhotos = (key: string) => rpcCall<AdminPhotoRow[]>("hdar_admin_pending_photos", { p_key: key });
export const adminPhotosReview = (key: string, id: string, ok: boolean) =>
  rpcCall("hdar_admin_photos_review", { p_key: key, p_id: id, p_ok: ok });

export type AdminClaimRow = {
  id: string; place_id: string; name: string; city: string | null; kind: string;
  email: string | null; justification: string; has_proof: boolean;
  status: "pending" | "approved" | "rejected"; admin_note: string | null;
  created_at: string; reviewed_at: string | null;
};
export type AdminPhotoRow = {
  id: string; name: string; city: string | null; kind: string;
  pending_n: number; pending_photos: string[]; photos_n: number;
};

/** Mode démo / captures : uniquement en développement, jamais en production. */
export function discoverDemoMode(): string | null {
  if (!import.meta.env.DEV || typeof location === "undefined") return null;
  const q = new URLSearchParams(location.search);
  return q.get("discoverdemo");
}

export function discoverDemoActive(): boolean {
  return discoverDemoMode() != null;
}

type DemoSeed = {
  id: string; kind: PlaceKind; name: string; lat: number; lng: number;
  city: string; address?: string; hours?: string; tags?: string[];
  website?: string; description: string; listing?: MapListing; verified?: boolean;
  photos?: string[]; country?: string; cover_credit?: string | null; venue?: PlaceVenue;
};

function cardFrom(s: DemoSeed): DiscoverCard {
  const venue = s.venue ?? venueOf(s.kind);
  return {
    id: s.id,
    kind: s.kind,
    venue,
    name: s.name,
    description: s.description,
    lat: s.lat,
    lng: s.lng,
    city: s.city,
    address: s.address ?? null,
    hours: s.hours ?? null,
    tags: s.tags ?? [],
    website: s.website ?? null,
    listing: s.listing ?? "discover",
    verified: !!s.verified,
    cover_credit: s.cover_credit ?? null,
    photos: s.photos ?? [],
    partner: s.listing === "partner",
    source: "demo",
    source_ref: null,
    country: s.country ?? "FR",
  };
}

function pinFrom(c: DiscoverCard): PlacePin {
  return { id: c.id, kind: c.kind, name: c.name, lat: c.lat, lng: c.lng, partner: c.listing === "partner", listing: c.listing, verified: c.verified, venue: c.venue };
}

const PARIS: DemoSeed[] = [
  { id: "demo-bar", kind: "bar", venue: "bar", name: "Café Voulez-vous", lat: 48.85855, lng: 2.35348, city: "Paris", address: "18 Rue du Temple", website: "http://www.cafevoulezvous.com/", description: "Bar au 18 Rue du Temple, à Paris.", country: "FR" },
  { id: "demo-sauna", kind: "sauna", venue: "sauna", name: "Sauna Euro Men's Club", lat: 48.87049, lng: 2.34149, city: "Paris", address: "10 rue Saint-Marc", website: "www.e-m-c.fr", description: "Sauna gay à Paris - Euro Men'S Club.", country: "FR" },
  { id: "demo-impact", kind: "bar", venue: "bar", name: "L'Impact Bar", lat: 48.86524, lng: 2.35116, city: "Paris", website: "https://impact-bar.com", listing: "partner", verified: true, description: "Bar gay au cœur de Paris. Grand bar, cocktails et soirées à thème.", country: "FR" },
  { id: "demo-paris-1", kind: "bar", venue: "bar", name: "45 Tours", lat: 48.85049, lng: 2.38819, city: "Paris", address: "45 Rue de Montreuil", description: "Bar au 45 Rue de Montreuil, à Paris.", country: "FR" },
  { id: "demo-paris-2", kind: "sauna", venue: "sauna", name: "Atlantide sauna", lat: 48.84709, lng: 2.37440, city: "Paris", address: "13 Rue Parrot", website: "https://atlantide-sauna.com", description: "Atlantide Sauna, sauna hammam toutes tendances à Paris. Club privé adulte près de la Gare de Lyon, dédié à la détente et aux rencontres.", country: "FR" },
  { id: "demo-paris-3", kind: "other", venue: "shop", name: "BMC store", lat: 48.85926, lng: 2.34933, city: "Paris", address: "21 Rue des Lombards", website: "www.bmc-store.com", description: "Boutique au 21 Rue des Lombards, à Paris.", country: "FR" },
  { id: "demo-paris-4", kind: "bar", venue: "bar", name: "Bonjour Madame", lat: 48.85034, lng: 2.38713, city: "Paris", address: "40 Rue de Montreuil", description: "Bar au 40 Rue de Montreuil, à Paris.", country: "FR" },
  { id: "demo-paris-5", kind: "bar", venue: "bar", name: "Cabaret des Merveilles", lat: 48.85359, lng: 2.34285, city: "Paris", address: "25 Rue de l'Hirondelle", description: "Bar au 25 Rue de l'Hirondelle, à Paris.", country: "FR" },
  { id: "demo-paris-6", kind: "bar", venue: "bar", name: "Café Barge", lat: 48.84226, lng: 2.37065, city: "Paris", address: "5 Port de la Rapée", website: "https://www.cafebarge.com", description: "Bar au 5 Port de la Rapée, à Paris.", country: "FR" },
  { id: "demo-paris-7", kind: "bar", venue: "bar", name: "Café de la Gare", lat: 48.85959, lng: 2.35399, city: "Paris", address: "41 Rue du Temple, 75004", website: "https://www.cdlg.org/j/", description: "Site Officiel du Café de la Gare, Théâtre privé parisien. Ici vous pouvez consulter la programmation, réserver un spectacle, lire un petit historique de Sotha, regarder des photos, fondatrice du lieu.", country: "FR" },
  { id: "demo-paris-8", kind: "bar", venue: "bar", name: "Café de Paris", lat: 48.86676, lng: 2.38228, city: "Paris", address: "158 Rue Oberkampf", description: "Bar au 158 Rue Oberkampf, à Paris.", country: "FR" },
  { id: "demo-paris-9", kind: "club", venue: "club", name: "Cavern Club", lat: 48.85520, lng: 2.33981, city: "Paris", address: "21 Rue Dauphine", website: "https://www.lecavernclub.com/", description: "Club au 21 Rue Dauphine, à Paris.", country: "FR" },
  { id: "demo-paris-10", kind: "club", venue: "club", name: "CUD", lat: 48.86183, lng: 2.35720, city: "Paris", address: "12 Rue des Haudriettes", description: "Club au 12 Rue des Haudriettes, à Paris.", country: "FR" },
  { id: "demo-paris-11", kind: "club", venue: "club", name: "Double jeu", lat: 48.86307, lng: 2.35434, city: "Paris", website: "http://djtp.net/", description: "Club à Paris.", country: "FR" },
  { id: "demo-paris-12", kind: "bar", venue: "bar", name: "Entre Deux Eaux", lat: 48.86386, lng: 2.37195, city: "Paris", address: "45 rue de la Folie Méricourt", website: "http://www.nudebarparis.com", description: "Bar au 45 rue de la Folie Méricourt, à Paris.", country: "FR" },
  { id: "demo-paris-13", kind: "club", venue: "club", name: "Football club Paris arc-en-ciel", lat: 48.86302, lng: 2.35431, city: "Paris", website: "http://fcparisarcenciel.fr", description: "Club à Paris.", country: "FR" },
  { id: "demo-paris-14", kind: "club", venue: "club", name: "Front runner Paris", lat: 48.86307, lng: 2.35434, city: "Paris", website: "http://frontrunnersparis.org", description: "Club à Paris.", country: "FR" },
  { id: "demo-paris-15", kind: "club", venue: "club", name: "Gambetta club", lat: 48.85956, lng: 2.40306, city: "Paris", address: "104 Rue de Bagnolet", description: "Club au 104 Rue de Bagnolet, à Paris.", country: "FR" },
  { id: "demo-paris-16", kind: "club", venue: "club", name: "Gibus club", lat: 48.86829, lng: 2.36613, city: "Paris", address: "18 Rue du Faubourg du Temple", website: "http://www.gibus.fr", description: "Club au 18 Rue du Faubourg du Temple, à Paris.", country: "FR" },
  { id: "demo-paris-17", kind: "other", venue: "shop", name: "IEM", lat: 48.85816, lng: 2.35646, city: "Paris", address: "18 Rue Sainte-Croix de la Bretonnerie", website: "https://www.iem.fr", description: "Boutique au 18 Rue Sainte-Croix de la Bretonnerie, à Paris.", country: "FR" },
  { id: "demo-paris-18", kind: "club", venue: "club", name: "Kilomètre25", lat: 48.89751, lng: 2.39068, city: "Paris", address: "Rue Ella Fitzgerald", website: "https://www.kilometre25.fr", description: "Open air, Paris 19, ouvert du 5 mai au 31 octobre 2023. Club, soirées techno & house.", country: "FR" },
  { id: "demo-paris-19", kind: "club", venue: "club", name: "La Java", lat: 48.87101, lng: 2.37389, city: "Paris", address: "105 Rue du Faubourg du Temple", website: "http://www.la-java.fr/", description: "Club au 105 Rue du Faubourg du Temple, à Paris.", country: "FR" },
  { id: "demo-paris-20", kind: "club", venue: "club", name: "La Machine du Moulin Rouge", lat: 48.88412, lng: 2.33217, city: "Paris", address: "90 Boulevard de Clichy", website: "https://www.lamachinedumoulinrouge.com", description: "Club au 90 Boulevard de Clichy, à Paris La Machine du Moulin Rouge et son Bar à Bulles : club · concert · event · culture · boire et manger.", country: "FR" },
  { id: "demo-paris-21", kind: "bar", venue: "bar", name: "La Mutinerie", lat: 48.86253, lng: 2.35224, city: "Paris", address: "176-178 Rue Saint-Martin", website: "http://www.lamutinerie.eu", description: "Bar au 176-178 Rue Saint-Martin, à Paris.", country: "FR" },
  { id: "demo-paris-22", kind: "bar", venue: "cruising", name: "Le Full Metal", lat: 48.85890, lng: 2.35700, city: "Paris", website: "http://www.fullmetal.fr/fr/fr.html", description: "Bar cruising à Paris.", country: "FR" },
  { id: "demo-paris-23", kind: "club", venue: "club", name: "Les Bains Paris", lat: 48.86393, lng: 2.35201, city: "Paris", address: "7 Rue du Bourg l'Abbé", website: "https://lesbains-paris.com", description: "Découvrez l'accueil exclusif de Les Bains Paris, reflétant le luxe et l'élégance au cœur de la ville lumière, pour des moments inoubliables.", country: "FR" },
  { id: "demo-paris-24", kind: "club", venue: "club", name: "Maxim's", lat: 48.86731, lng: 2.32223, city: "Paris", address: "3 Rue Royale", website: "https://maxims-de-paris.com", description: "Bienvenue dans le temple de la vie parisienne. Marque emblématique qui incarne le luxe et l'élégance à la française, Maxim’s est née du célèbre restaurant parisien fondé en 1893 rue Royale.", country: "FR" },
  { id: "demo-paris-25", kind: "bar", venue: "bar", name: "Merci Marsha", lat: 48.85472, lng: 2.38236, city: "Paris", address: "8 Rue Richard Lenoir", website: "https://www.mercimarsha.fr/", description: "Bar au 8 Rue Richard Lenoir, à Paris.", country: "FR" },
  { id: "demo-paris-26", kind: "club", venue: "club", name: "Pamela", lat: 48.85453, lng: 2.33798, city: "Paris", address: "62 Rue Mazarine", description: "Club au 62 Rue Mazarine, à Paris.", country: "FR" },
  { id: "demo-paris-27", kind: "club", venue: "club", name: "Panic room", lat: 48.86125, lng: 2.36762, city: "Paris", address: "101 Rue Amelot", website: "https://panicroomparis.com", description: "Electro cocktail bar situé rue Amelot à Paris, le Panic Room pour l'apéro, un date, un anniversaire ou pour danser.", country: "FR" },
  { id: "demo-paris-28", kind: "bar", venue: "bar", name: "Quetzal", lat: 48.85724, lng: 2.35509, city: "Paris", address: "10 Rue de la Verrerie", description: "Bar au 10 Rue de la Verrerie, à Paris.", country: "FR" },
  { id: "demo-paris-29", kind: "club", venue: "club", name: "Rex club", lat: 48.87063, lng: 2.34726, city: "Paris", address: "5 Boulevard Poissonnière", website: "https://rexclub.com", description: "Club au 5 Boulevard Poissonnière, à Paris 38 ans de musique électronique.", country: "FR" },
  { id: "demo-paris-30", kind: "bar", venue: "bar", name: "Rosa Bonheur à l'Est", lat: 48.83878, lng: 2.46087, city: "Paris", address: "Porte Jaune", website: "https://www.rosabonheur.fr/rosa-est", description: "Bar au Porte Jaune, à Paris Rosa Bonheur à l'Est Niché sur le lac des Minimes, au coeur du Bois de Vincennes. Dernier né des guinguettes.", country: "FR" },
  { id: "demo-paris-31", kind: "bar", venue: "bar", name: "Rosa bonheur Buttes", lat: 48.87998, lng: 2.38623, city: "Paris", address: "2 Avenue de la Cascade", website: "https://www.rosabonheur.fr", description: "Bar au 2 Avenue de la Cascade, à Paris Le Rosa Bonheur : des guinguettes où l'esprit de la Camargue règne en fête. Des lieux où il fait bon vivre, et où se mêlent gens, genres et vent de liberté.", country: "FR" },
  { id: "demo-paris-32", kind: "club", venue: "club", name: "Sacré", lat: 48.86898, lng: 2.34335, city: "Paris", address: "142 Rue Montmartre", website: "https://www.sacre.paris", description: "Le Sacré est un lieu de vie nocturne situé au cœur de Paris (2ème). Club électro, bar tapas et comedie club. Découvrez notre programmation et réservez vos billets.", country: "FR" },
  { id: "demo-paris-33", kind: "sauna", venue: "sauna", name: "Sauna Bains d'Odessa", lat: 48.84296, lng: 2.32446, city: "Paris", address: "5 rue Odessa", website: "http://lesbainsdodessa.com", description: "Sauna au 5 rue Odessa, à Paris.", country: "FR" },
  { id: "demo-paris-34", kind: "sauna", venue: "sauna", name: "Sauna Mykonos", lat: 48.88233, lng: 2.33945, city: "Paris", website: "https://saunamykonosparis.fr/", description: "Sauna à Paris Le Sauna Mykonos est un endroit convivial et relaxant où les hommes peuvent se détendre et se connecter dans une atmosphère chaleureuse et confortable.", country: "FR" },
  { id: "demo-paris-35", kind: "bar", venue: "bar", name: "Sister Midnight", lat: 48.88146, lng: 2.34075, city: "Paris", address: "4 Rue Viollet-le-Duc", website: "https://www.sistermidnightparis.com", description: "Bar au 4 Rue Viollet-le-Duc, à Paris.", country: "FR" },
  { id: "demo-paris-36", kind: "bar", venue: "bar", name: "Speechless Bar", lat: 48.85049, lng: 2.38829, city: "Paris", address: "45 Rue de Montreuil", website: "https://linktr.ee/speechlessbar_paris", description: "Bar au 45 Rue de Montreuil, à Paris Bar à cocktails Ethique, culturel et végétal LGBTQIA+ Mardi-Samedi 18h-2h.", country: "FR" },
  { id: "demo-paris-37", kind: "club", venue: "club", name: "Symbol", lat: 48.84253, lng: 2.32252, city: "Paris", address: "22 Rue du Départ", website: "https://linktr.ee/symbolagency", description: "Club au 22 Rue du Départ, à Paris Inspirer l’inédit, façonner l’inoubliable.", country: "FR" },
  { id: "demo-paris-38", kind: "bar", venue: "bar", name: "We are Brewers", lat: 48.86793, lng: 2.36842, city: "Paris", address: "16 Boulevard Jules Ferry", description: "Bar au 16 Boulevard Jules Ferry, à Paris.", country: "FR" },
  { id: "demo-paris-39", kind: "club", venue: "club", name: "Yoyo", lat: 48.86458, lng: 2.29647, city: "Paris", address: "13 Avenue du Président Wilson", website: "http://yoyo-paris.com", description: "Club au 13 Avenue du Président Wilson, à Paris.", country: "FR" }
];

const BERLIN: DemoSeed[] = [
  { id: "demo-berlin-1", kind: "bar", venue: "bar", name: "B-Lage", lat: 52.47369, lng: 13.45116, city: "Berlin", website: "https://b-lage.de", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-2", kind: "bar", venue: "bar", name: "Bar Saint Jean", lat: 52.52360, lng: 13.39068, city: "Berlin", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-3", kind: "bar", venue: "bar", name: "Betty F", lat: 52.52756, lng: 13.40519, city: "Berlin", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-4", kind: "bar", venue: "bar", name: "Blond", lat: 52.49786, lng: 13.34788, city: "Berlin", website: "https://www.blond.berlin/", description: "Bar in Berlin Die queere Cocktailbar Im schwulen Nollendorf-Kiez - auf zur Party ins Blond und sich austoben, entspannen und vom Team der Bar verwöhnen lassen.", country: "DE" },
  { id: "demo-berlin-5", kind: "bar", venue: "bar", name: "Boxer Berlin", lat: 52.49732, lng: 13.34943, city: "Berlin", website: "https://boxerbarcelona.com/fr/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-6", kind: "other", venue: "shop", name: "Brunos", lat: 52.49743, lng: 13.35418, city: "Berlin", website: "https://brunos.de/", description: "Laden in Berlin.", country: "DE" },
  { id: "demo-berlin-7", kind: "bar", venue: "bar", name: "Bull", lat: 52.50024, lng: 13.34939, city: "Berlin", website: "https://bullbar-berlin.de/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-8", kind: "other", venue: "shop", name: "City men shop", lat: 52.49914, lng: 13.34385, city: "Berlin", website: "http://www.city-men.net/index.php/de/", description: "Laden in Berlin.", country: "DE" },
  { id: "demo-berlin-9", kind: "sauna", venue: "sauna", name: "Der Boiler Sauna", lat: 52.49375, lng: 13.38765, city: "Berlin", website: "http://www.boiler-berlin.de/", description: "Sauna in Berlin.", country: "DE" },
  { id: "demo-berlin-10", kind: "bar", venue: "bar", name: "Dos Santos - exclusive leather design", lat: 52.48624, lng: 13.38645, city: "Berlin", website: "https://www.dossantosshop.com/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-11", kind: "bar", venue: "bar", name: "Dreizehn", lat: 52.49942, lng: 13.34225, city: "Berlin", website: "http://dreizehn-berlin.com/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-12", kind: "club", venue: "club", name: "Ficken 3000", lat: 52.48864, lng: 13.42261, city: "Berlin", website: "https://www.ficken3000.com/de_de/", description: "Club in Berlin.", country: "DE" },
  { id: "demo-berlin-13", kind: "bar", venue: "bar", name: "Flax", lat: 52.53580, lng: 13.43121, city: "Berlin", website: "http://www.flax-berlin.de/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-14", kind: "bar", venue: "bar", name: "Grosse Freiheit 114", lat: 52.51350, lng: 13.45604, city: "Berlin", website: "https://www.grosse-freiheit-114.de/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-15", kind: "bar", venue: "bar", name: "Himmelreich", lat: 52.51023, lng: 13.45661, city: "Berlin", website: "https://www.himmelreich-berlin.de/", description: "Bar in Berlin Hier treffen sich Menschen unterschiedlichsten Alters und unabhängig von ihrer Sexualität, um ungezwungen zu quatschen und zu trinken.", country: "DE" },
  { id: "demo-berlin-16", kind: "bar", venue: "bar", name: "Incognito", lat: 52.49419, lng: 13.34491, city: "Berlin", website: "https://incognito-berlin.com", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-17", kind: "club", venue: "club", name: "Insomnia night club", lat: 52.46556, lng: 13.38609, city: "Berlin", website: "https://www.insomnia-berlin.de/", description: "Club in Berlin.", country: "DE" },
  { id: "demo-berlin-18", kind: "bar", venue: "bar", name: "Marienhof", lat: 52.53479, lng: 13.42403, city: "Berlin", website: "http://www.marienhof-berlin.de/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-19", kind: "other", venue: "shop", name: "Maskulo", lat: 52.49872, lng: 13.34539, city: "Berlin", website: "https://maskulo.com/", description: "Laden in Berlin.", country: "DE" },
  { id: "demo-berlin-20", kind: "other", venue: "shop", name: "Mister B Berlin", lat: 52.49823, lng: 13.34892, city: "Berlin", website: "https://www.misterb.com/en/", description: "Laden in Berlin.", country: "DE" },
  { id: "demo-berlin-21", kind: "bar", venue: "bar", name: "Möbel Olfe", lat: 52.49990, lng: 13.41720, city: "Berlin", website: "https://www.moebel-olfe.de/", description: "Bar in Berlin Möbel-Olfe: Herzlich willkommen.", country: "DE" },
  { id: "demo-berlin-22", kind: "bar", venue: "bar", name: "Monster Ronsons", lat: 52.50514, lng: 13.44821, city: "Berlin", website: "https://www.karaokemonster.de/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-23", kind: "bar", venue: "bar", name: "New Action", lat: 52.50020, lng: 13.34925, city: "Berlin", website: "http://www.newactionberlin.de/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-24", kind: "other", venue: "shop", name: "Other Nature", lat: 52.48936, lng: 13.38678, city: "Berlin", website: "https://other-nature.de/", description: "Laden in Berlin.", country: "DE" },
  { id: "demo-berlin-25", kind: "bar", venue: "bar", name: "Oya", lat: 52.42192, lng: 13.33394, city: "Berlin", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-26", kind: "other", venue: "shop", name: "R&co", lat: 52.49872, lng: 13.34539, city: "Berlin", website: "https://www.randco.de/", description: "Laden in Berlin.", country: "DE" },
  { id: "demo-berlin-27", kind: "bar", venue: "bar", name: "Romeo und Romeo", lat: 52.49827, lng: 13.34924, city: "Berlin", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-28", kind: "bar", venue: "bar", name: "Schwarzes Café", lat: 52.50549, lng: 13.32423, city: "Berlin", website: "https://www.schwarzescafe-berlin.de", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-29", kind: "bar", venue: "bar", name: "Silver Future", lat: 52.48801, lng: 13.43027, city: "Berlin", website: "https://www.silverfuture.net/", description: "Das Silverfuture hat 2007 eröffnet und ist seitdem ein Treffpunkt für Kings, Queens und Criminal Queers und ihre Freund*innen aus Berlin und der ganzen Welt.", country: "DE" },
  { id: "demo-berlin-30", kind: "bar", venue: "bar", name: "Sonntags Club", lat: 52.55144, lng: 13.41878, city: "Berlin", website: "https://www.sonntags-club.de/", description: "Bar in Berlin Beratungs-, Informations- und Kommunikations-Zentrum für Lesben, Schwule, Bisexuelle, Trans* und Inter*.", country: "DE" },
  { id: "demo-berlin-31", kind: "bar", venue: "bar", name: "Sven Appelt Rubber", lat: 52.50088, lng: 13.32520, city: "Berlin", website: "https://sar.berlin", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-32", kind: "bar", venue: "bar", name: "Tipsy Bear", lat: 52.54100, lng: 13.41071, city: "Berlin", website: "https://tipsybearberlin.com/", description: "Bar in Berlin.", country: "DE" },
  { id: "demo-berlin-33", kind: "bar", venue: "bar", name: "Ulrichs", lat: 52.50183, lng: 13.35300, city: "Berlin", description: "Bar in Berlin.", country: "DE" }
];

function verifiedPartner(): DiscoverCard {
  const seed = PARIS.find((p) => p.id === "demo-impact") ?? PARIS[0];
  return cardFrom({ ...seed, listing: "partner", verified: true });
}

const ALL_DEMO = [...PARIS, ...BERLIN].map(cardFrom);

export function discoverDemoCards(city: "paris" | "berlin" | "all" = "all"): DiscoverCard[] {
  if (city === "paris") return PARIS.map(cardFrom);
  if (city === "berlin") return BERLIN.map(cardFrom);
  return ALL_DEMO;
}

export function discoverDemoPins(city?: "paris" | "berlin" | "all"): PlacePin[] {
  const mode = city ?? (discoverDemoMode() === "berlin" ? "berlin" : discoverDemoMode() === "paris" || !discoverDemoMode() ? "paris" : "all");
  const cards = mode === "berlin" || mode === "paris" ? discoverDemoCards(mode) : discoverDemoCards("all");
  return cards.map(pinFrom);
}

export function discoverDemoCard(id?: string | null): DiscoverCard | null {
  const mode = discoverDemoMode();
  const cards = ALL_DEMO;
  if (mode === "verified") {
    const impact = cards.find((c) => c.id === "demo-impact") ?? verifiedPartner();
    return { ...impact, listing: "partner", partner: true, verified: true };
  }
  if (id) return cards.find((c) => c.id === id) ?? null;
  return cards.find((c) => c.id === "demo-bar") ?? cards[0] ?? null;
}

/** Code affiché uniquement en mode démo, jamais envoyé par e-mail. */
export const DEMO_VERIFY_CODE = "248163";
export const DEMO_METHODS: DiscoverMethods = {
  id: "demo-bar",
  name: "Café Voulez-vous",
  kind: "bar",
  city: "Paris",
  website: "https://exemple.hdar.chat/voulezvous",
  website_domain: "exemple.hdar.chat",
  official_masked: "c***@exemple.hdar.chat",
  has_official: true,
  has_website: true,
};

let discoverMapSeeded = false;
/** Place la carte en mode démo (Paris ou Berlin), profil déjà créé, zoom proche. */
export function seedDiscoverMap(city: "paris" | "berlin") {
  if (discoverMapSeeded) return;
  discoverMapSeeded = true;
  const center = city === "berlin" ? { lat: 52.4992, lng: 13.3485 } : { lat: 48.8606, lng: 2.3544 };
  const me = useHdar.getState().me;
  useHdar.setState({
    me: { ...me, onboarded: true, adult: true, pseudo: "Alex", age: 29, photo: "", photos: [], bio: "" },
    customCenter: center,
    cityId: "ici",
    here: center,
    tab: "around",
    cover: false,
  });
}
