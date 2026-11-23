import { rpcCall, type PlaceKind, type PlacePin } from "./live";
import { useHdar } from "./store";

export {
  DEFAULT_COVERS, RISK_COUNTRIES, defaultCover, listingLabel, kindNoun, kindIcon,
  maskEmail, emailDomain, websiteDomain, emailMatchesWebsite, isDisplayableOutreach,
  publicDescription, type MapListing, type OutreachLike,
} from "./discover-utils";
import { DEFAULT_COVERS, defaultCover, publicDescription, type MapListing } from "./discover-utils";

export type DiscoverCard = {
  id: string;
  kind: PlaceKind;
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
  photos?: string[]; country?: string; cover_credit?: string | null;
};

function cardFrom(s: DemoSeed): DiscoverCard {
  return {
    id: s.id,
    kind: s.kind,
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

function pinFrom(c: DiscoverCard): PlacePin & { listing?: MapListing; verified?: boolean } {
  return { id: c.id, kind: c.kind, name: c.name, lat: c.lat, lng: c.lng, partner: c.listing === "partner", listing: c.listing, verified: c.verified };
}

const PARIS: DemoSeed[] = [
  { id: "demo-comptoir", kind: "bar", name: "Le Comptoir du Marais", lat: 48.8597, lng: 2.3620, city: "Paris", address: "Le Marais", hours: "Tous les jours, 17 h – 2 h", tags: ["bar", "terrasse", "soirée"], website: "https://exemple.hdar.chat/comptoir", description: "Un bar du Marais à découvrir. Infos publiques uniquement : horaires et adresse de quartier.", country: "FR" },
  { id: "demo-impact", kind: "bar", name: "L'Impact Bar", lat: 48.8606, lng: 2.3578, city: "Paris", address: "Le Marais", hours: "Du mardi au samedi, 18 h – 2 h", tags: ["bar"], listing: "partner", verified: true, description: "Bar partenaire déjà en ligne à Paris.", website: "https://exemple.hdar.chat/impact" },
  { id: "demo-idm", kind: "sauna", name: "IDM Sauna", lat: 48.8614, lng: 2.3592, city: "Paris", address: "Le Marais", hours: "Tous les jours, 12 h – 2 h", tags: ["sauna"], listing: "partner", verified: true, description: "Établissement partenaire déjà en ligne à Paris.", website: "https://exemple.hdar.chat/idm" },
  { id: "demo-canal", kind: "bar", name: "Café du Canal", lat: 48.8622, lng: 2.3648, city: "Paris", address: "Canal Saint-Martin", hours: "Mercredi – dimanche, 18 h – 1 h", tags: ["bar", "canal"], description: "Café du canal, à deux pas de la passerelle.", website: "https://exemple.hdar.chat/canal" },
  { id: "demo-repu", kind: "club", name: "Studio République", lat: 48.8628, lng: 2.3618, city: "Paris", address: "République", hours: "Vendredi et samedi, 23 h – 6 h", tags: ["club", "nuit"], description: "Salle de soirée près de République.", website: "https://exemple.hdar.chat/repu" },
  { id: "demo-oberk", kind: "bar", name: "La Verrière Oberkampf", lat: 48.8610, lng: 2.3662, city: "Paris", address: "Oberkampf", hours: "Tous les soirs dès 18 h", tags: ["bar", "concerts"], description: "Bar à découvrir dans le 11e." },
  { id: "demo-belleville", kind: "bar", name: "Belleville Light", lat: 48.8580, lng: 2.3655, city: "Paris", address: "Haut Marais", description: "Petit bar à découvrir côté haut Marais." },
  { id: "demo-bastille", kind: "club", name: "Atelier Bastille", lat: 48.8568, lng: 2.3640, city: "Paris", address: "vers Bastille", hours: "Jeudi – samedi, 23 h – 5 h", tags: ["club"], description: "Club à découvrir vers Bastille." },
  { id: "demo-pigalle", kind: "bar", name: "Café des Archives", lat: 48.8576, lng: 2.3588, city: "Paris", address: "Archives", hours: "Tous les jours, 18 h – 2 h", description: "Bar près des Archives." },
  { id: "demo-chatelet", kind: "bar", name: "Comptoir Blancs-Manteaux", lat: 48.8588, lng: 2.3570, city: "Paris", address: "Blancs-Manteaux", description: "Bar proche des Blancs-Manteaux." },
  { id: "demo-tumble", kind: "sauna", name: "Thermes du Temple", lat: 48.8602, lng: 2.3602, city: "Paris", address: "Le Marais", hours: "Tous les jours, 12 h – 23 h", tags: ["sauna"], description: "Établissement à découvrir dans le Marais.", website: "https://exemple.hdar.chat/thermes" },
  { id: "demo-sentier", kind: "bar", name: "Le Vertbois", lat: 48.8624, lng: 2.3584, city: "Paris", address: "Vertbois", description: "Bar du Vertbois." },
  { id: "demo-nation", kind: "club", name: "Salle Turenne", lat: 48.8572, lng: 2.3618, city: "Paris", address: "Turenne", description: "Salle de soirée rue de Turenne." },
  { id: "demo-montorgueil", kind: "bar", name: "La Petite Chaise", lat: 48.8590, lng: 2.3642, city: "Paris", address: "Francs-Bourgeois", hours: "Mardi – dimanche, 17 h – 1 h", description: "Bar des Francs-Bourgeois." },
  { id: "demo-arts", kind: "bar", name: "Café des Arts", lat: 48.8608, lng: 2.3634, city: "Paris", address: "3e arrondissement", description: "Café des Arts, à découvrir." },
];

const BERLIN: DemoSeed[] = [
  { id: "demo-berlin-prenzl", kind: "bar", name: "Lichtbar Mitte", lat: 52.5212, lng: 13.4070, city: "Berlin", address: "Mitte", hours: "Tous les jours, 18 h – 2 h", tags: ["bar"], website: "https://exemple.hdar.chat/lichtbar", description: "Bar à découvrir à Mitte.", country: "DE" },
  { id: "demo-berlin-schoene", kind: "bar", name: "Kiez Ecke", lat: 52.5188, lng: 13.4028, city: "Berlin", address: "Mitte", hours: "Mercredi – dimanche dès 19 h", tags: ["bar"], description: "Bar de quartier à Mitte.", country: "DE" },
  { id: "demo-berlin-kreuz", kind: "club", name: "Hall am Park", lat: 52.5184, lng: 13.4078, city: "Berlin", address: "Mitte", hours: "Vendredi et samedi, 23 h – 6 h", tags: ["club"], description: "Salle de soirée à Mitte.", country: "DE" },
  { id: "demo-berlin-mitte", kind: "bar", name: "Mitte Laterne", lat: 52.5204, lng: 13.4050, city: "Berlin", address: "Mitte", description: "Bar à Mitte.", country: "DE" },
  { id: "demo-berlin-neukolln", kind: "bar", name: "Fensterbar", lat: 52.5220, lng: 13.4032, city: "Berlin", address: "Mitte", description: "Bar à découvrir à Mitte.", country: "DE" },
  { id: "demo-berlin-sauna", kind: "sauna", name: "Thermen am Kanal", lat: 52.5196, lng: 13.4008, city: "Berlin", address: "Mitte", hours: "Tous les jours, 12 h – 22 h", tags: ["sauna"], description: "Établissement à découvrir près du canal.", country: "DE" },
  { id: "demo-berlin-fried", kind: "bar", name: "Friedrich Lounge", lat: 52.5216, lng: 13.4092, city: "Berlin", address: "Friedrichstraße", description: "Bar près de Friedrichstraße.", country: "DE" },
  { id: "demo-berlin-wed", kind: "club", name: "Werk Club", lat: 52.5176, lng: 13.4044, city: "Berlin", address: "Mitte", description: "Club à Mitte.", country: "DE" },
  { id: "demo-berlin-charlo", kind: "bar", name: "Spree Cup", lat: 52.5228, lng: 13.4064, city: "Berlin", address: "Mitte", description: "Bar près de la Spree.", country: "DE" },
  { id: "demo-berlin-tempel", kind: "bar", name: "Unter den Linden Eck", lat: 52.5178, lng: 13.4016, city: "Berlin", address: "Unter den Linden", description: "Bar près d'Unter den Linden.", country: "DE" },
];

const verifiedPhotos = [defaultCover("bar"), defaultCover("club")];

function verifiedComptoir(): DiscoverCard {
  return cardFrom({
    ...PARIS[0],
    verified: true,
    photos: verifiedPhotos,
    description: "Un bar du Marais, fiche complétée par le propriétaire. Horaires et photos validés.",
    cover_credit: null,
  });
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
  if (mode === "verified") return verifiedComptoir();
  const cards = ALL_DEMO;
  if (id) return (mode === "verified" ? verifiedComptoir() : cards.find((c) => c.id === id) ?? null);
  return cards.find((c) => c.id === "demo-comptoir") ?? cards[0] ?? null;
}

/** Code affiché uniquement en mode démo, jamais envoyé par e-mail. */
export const DEMO_VERIFY_CODE = "248163";
export const DEMO_METHODS: DiscoverMethods = {
  id: "demo-comptoir",
  name: "Le Comptoir du Marais",
  kind: "bar",
  city: "Paris",
  website: "https://exemple.hdar.chat/comptoir",
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
  const center = city === "berlin" ? { lat: 52.5200, lng: 13.4050 } : { lat: 48.8595, lng: 2.3615 };
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
