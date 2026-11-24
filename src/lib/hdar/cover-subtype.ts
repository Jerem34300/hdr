/** Couverture illustrée par sous-type, avec repli famille puis générique.
 *  Le sous-type est déduit du kind OSM / venue_kind, du nom, de la description
 *  et du site, et peut être fixé explicitement (ids d'associations, ou champ cover_subtype).
 */

export type CoverPlace = {
  id?: string | null;
  kind?: string | null;
  venue_kind?: string | null;
  venue?: string | null;
  name?: string | null;
  description?: string | null;
  website?: string | null;
  tags?: string[] | null;
  source_ref?: string | null;
  transit_code?: string | null;
  cover_subtype?: string | null;
};

/** Sous-types sportifs déduits et stockés pour les 8 associations en base. */
export const ASSOCIATION_SUBTYPES: Record<string, string> = {
  "289a8fe5-8599-469e-ad8d-36ce709aafb9": "football", // Football club Paris arc-en-ciel
  "b2a29100-f8c8-4d2c-a9c1-d075378696a0": "running", // Front runner Nice
  "0af03c85-36c3-4089-8511-212ccc8db102": "running", // Front runner Paris
  "512a133b-43b5-4713-a637-0c34fd03a0e1": "running", // Front runners Strasbourg
  "de6f3923-1e6a-4f8b-85bd-c4c3a5bdf46b": "rugby", // Les Coqs festifs
  "c8f2cf7e-e7ea-4804-847e-17d0765b0644": "rugby", // Les Gaillards
  "0391af6c-c1ef-4bd1-8930-c598e8705428": "boxing", // Paname boxing club
  "708d16fb-117f-4f18-bae5-42119a3ff7b8": "cycling", // Visible Cycling Club
};

const ASSOCIATION_SUBTYPES_BY_NAME: Record<string, string> = {
  "football club paris arc-en-ciel": "football",
  "front runner nice": "running",
  "front runner paris": "running",
  "front runners strasbourg": "running",
  "les coqs festifs": "rugby",
  "les gaillards": "rugby",
  "paname boxing club": "boxing",
  "visible cycling club": "cycling",
};

export const SUBTYPE_COVERS: Record<string, string> = {
  football: "/places/cover-sport-football.webp",
  running: "/places/cover-sport-running.webp",
  rugby: "/places/cover-sport-rugby.webp",
  boxing: "/places/cover-sport-boxing.webp",
  cycling: "/places/cover-sport-cycling.webp",
  swimming: "/places/cover-sport-swimming.webp",
  basketball: "/places/cover-sport-basketball.webp",
  volleyball: "/places/cover-sport-volleyball.webp",
  tennis: "/places/cover-sport-tennis.webp",
  dance: "/places/cover-sport-dance.webp",
  hiking: "/places/cover-sport-hiking.webp",
  association: "/places/cover-association.webp",
  train: "/places/cover-transit-train.webp",
  "bus-station": "/places/cover-transit-bus-station.webp",
  metro: "/places/cover-transit-metro.webp",
  tram: "/places/cover-transit-tram.webp",
  airport: "/places/cover-transit-airport.webp",
  bus: "/places/cover-transit-bus.webp",
  park: "/places/cover-outdoor-park.webp",
  beach: "/places/cover-outdoor-beach.webp",
  viewpoint: "/places/cover-outdoor-viewpoint.webp",
  garden: "/places/cover-outdoor-garden.webp",
  promenade: "/places/cover-outdoor-promenade.webp",
  aire: "/places/cover-outdoor-aire.webp",
  square: "/places/cover-outdoor-square.webp",
  toilets: "/places/cover-toilets.webp",
  bar: "/places/cover-bar.webp",
  pub: "/places/cover-bar-pub.webp",
  cafe: "/places/cover-bar-cafe.webp",
  cabaret: "/places/cover-bar-cabaret.webp",
  club: "/places/cover-club.webp",
  sauna: "/places/cover-sauna.webp",
  spa: "/places/cover-spa.webp",
  shop: "/places/cover-shop.webp",
  exchange: "/places/cover-exchange.webp",
  cruising: "/places/cover-cruising.webp",
  other: "/places/cover-other.webp",
};

const FAMILY_FALLBACK: Record<string, string> = {
  football: "association",
  running: "association",
  rugby: "association",
  boxing: "association",
  cycling: "association",
  swimming: "association",
  basketball: "association",
  volleyball: "association",
  tennis: "association",
  dance: "association",
  hiking: "association",
  train: "transit",
  "bus-station": "transit",
  metro: "transit",
  tram: "transit",
  airport: "transit",
  bus: "transit",
  park: "outdoor",
  beach: "outdoor",
  viewpoint: "outdoor",
  garden: "outdoor",
  promenade: "outdoor",
  aire: "outdoor",
  square: "outdoor",
  pub: "bar",
  cafe: "bar",
  cabaret: "bar",
  spa: "sauna",
};

const FAMILY_COVERS: Record<string, string> = {
  transit: "/places/cover-transit.webp",
  outdoor: "/places/cover-outdoor.webp",
  association: "/places/cover-association.webp",
  sport: "/places/cover-association.webp",
  bar: "/places/cover-bar.webp",
  sauna: "/places/cover-sauna.webp",
};

function normName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/['’]/g, " ").replace(/\s+/g, " ").trim();
}

function haystack(p: CoverPlace): string {
  return [p.name, p.description, p.website, ...(p.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
}

const SPORT_RULES: [RegExp, string][] = [
  [/\bfront\s*runners?\b|course a pied|course à pied|\brunning\b|\bjogging\b|athletisme|athlétisme/, "running"],
  [/\bfootball\b|\bsoccer\b/, "football"],
  [/\brugby\b/, "rugby"],
  [/\bboxe\b|\bboxing\b/, "boxing"],
  [/\bcyclis|\bcycling\b|\bvélo\b|\bvelo\b/, "cycling"],
  [/\bnatation\b|\bswimming\b/, "swimming"],
  [/\bbasket/, "basketball"],
  [/\bvolley/, "volleyball"],
  [/\btennis\b/, "tennis"],
  [/\bdanse\b|\bdance\b|\bballet\b/, "dance"],
  [/\brandonn|\bhiking\b|\btrek\b/, "hiking"],
];

const TRAM_RE = /\btram(?:way|waj|-train)?\b/i;
const GARDEN_RE = /\bjardin|\bgarden\b|\bgiardino\b|\bgiardini\b/i;
const AIRE_RE = /\baire\b|pique-nique|\bpicnic\b|aire de jeux/i;
const SQUARE_NAME_RE = /^(place|plaza|square|piazza)\b/i;
const PUB_RE = /\bpub\b/i;
const CAFE_RE = /caf[eé]|\bcoffee\b/i;
const CABARET_RE = /\bcabaret\b|\bkaraok|\bspectacle\b/i;
const SPA_RE = /\bhammam\b|\bspa\b|spa['’]?t/i;

export function coverSubtype(p: CoverPlace): string {
  if (p.cover_subtype && (SUBTYPE_COVERS[p.cover_subtype] || FAMILY_COVERS[p.cover_subtype])) {
    return p.cover_subtype;
  }
  const venue = (p.venue_kind || p.venue || "").toLowerCase();
  const kind = (p.kind || "").toLowerCase();
  const type = venue || kind;
  const name = p.name || "";
  const hay = haystack(p);
  const hayNorm = normName(hay);

  if (type === "association" || type === "sport" || kind === "association" || kind === "sport") {
    if (p.id && ASSOCIATION_SUBTYPES[p.id]) return ASSOCIATION_SUBTYPES[p.id];
    const byName = ASSOCIATION_SUBTYPES_BY_NAME[normName(name)];
    if (byName) return byName;
    for (const [re, sub] of SPORT_RULES) {
      if (re.test(hay) || re.test(hayNorm)) return sub;
    }
    return "association";
  }

  if (type === "cruising" || kind === "cruising") return "cruising";
  if (type === "exchange" || type === "club-echange") return "exchange";
  if (type === "shop") return "shop";
  if (type === "club" || kind === "club") {
    if (CABARET_RE.test(name)) return "cabaret";
    return "club";
  }
  if (type === "sauna" || kind === "sauna") {
    if (SPA_RE.test(name)) return "spa";
    return "sauna";
  }
  if (type === "bar" || kind === "bar") {
    if (CABARET_RE.test(name)) return "cabaret";
    if (PUB_RE.test(name)) return "pub";
    if (CAFE_RE.test(name)) return "cafe";
    return "bar";
  }

  if (kind === "airport" || type === "airport") return "airport";
  if (kind === "bus" || type === "bus") return "bus-station";
  if (kind === "station" || type === "station") return "train";
  if (kind === "metro" || type === "metro") return TRAM_RE.test(name) ? "tram" : "metro";

  if (kind === "toilets" || type === "toilets") return "toilets";
  if (kind === "beach" || type === "beach") return "beach";
  if (kind === "viewpoint" || type === "viewpoint") return "viewpoint";
  if (kind === "promenade" || type === "promenade") return "promenade";
  if (kind === "garden" || type === "garden" || ((kind === "park" || type === "park") && GARDEN_RE.test(name))) return "garden";
  if (kind === "aire" || type === "aire" || ((kind === "park" || type === "park") && AIRE_RE.test(name))) return "aire";
  if (kind === "square" || type === "square" || ((kind === "park" || type === "park") && SQUARE_NAME_RE.test(name))) return "square";
  if (kind === "park" || type === "park") return "park";

  if (type === "other" || kind === "other") return "other";
  return type || kind || "other";
}

export function coverForPlace(p: CoverPlace): string {
  const sub = coverSubtype(p);
  if (SUBTYPE_COVERS[sub]) return SUBTYPE_COVERS[sub];
  const family = FAMILY_FALLBACK[sub] || sub;
  if (FAMILY_COVERS[family]) return FAMILY_COVERS[family];
  if (FAMILY_COVERS[sub]) return FAMILY_COVERS[sub];
  return "/places/cover-other.webp";
}
