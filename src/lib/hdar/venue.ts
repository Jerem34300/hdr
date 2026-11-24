/** Types de lieux commerciaux réellement présents en base (prospection). */
export type VenueKind = "bar" | "club" | "sauna" | "shop" | "exchange" | "cruising" | "association";

export const VENUE_ORDER: VenueKind[] = ["bar", "club", "sauna", "shop", "exchange", "cruising", "association"];

/** Couleurs lisibles sur la carte sombre, une teinte par type (partenaire et à découvrir partagent la même). */
export const VENUE: Record<VenueKind, { label: string; icon: string; color: string; cover: string }> = {
  bar: { label: "Bar", icon: "🍸", color: "#FF6B9A", cover: "/places/cover-bar.svg" },
  club: { label: "Club", icon: "🪩", color: "#8B7CFF", cover: "/places/cover-club.svg" },
  sauna: { label: "Sauna", icon: "♨️", color: "#F5B942", cover: "/places/cover-sauna.svg" },
  shop: { label: "Boutique", icon: "🛍️", color: "#3DC4F5", cover: "/places/cover-shop.svg" },
  exchange: { label: "Club échangiste", icon: "🔑", color: "#FF7A5C", cover: "/places/cover-exchange.svg" },
  cruising: { label: "Bar cruising", icon: "🔻", color: "#FF8A1F", cover: "/places/cover-cruising.svg" },
  association: { label: "Association", icon: "🏅", color: "#34D399", cover: "/places/cover-association.svg" },
};

export function venueOf(kind: string | null | undefined, outreachKind?: string | null): VenueKind {
  const k = (outreachKind || kind || "").toLowerCase();
  if (k === "association" || k === "sport") return "association";
  if (k === "club-echange" || k === "exchange") return "exchange";
  if (k === "cruising-bar" || k === "cruising") return "cruising";
  if (k === "other" || k === "shop" || k === "sex-shop") return "shop";
  if (k === "sauna") return "sauna";
  if (k === "club") return "club";
  return "bar";
}

export function venueColor(kind: VenueKind | string): string {
  const v = kind in VENUE ? (kind as VenueKind) : venueOf(kind);
  return VENUE[v].color;
}

export function venueCover(kind: VenueKind | string): string {
  const v = kind in VENUE ? (kind as VenueKind) : venueOf(kind);
  return VENUE[v].cover;
}

export function venueLabel(kind: VenueKind | string, risk = false): string {
  const v = kind in VENUE ? (kind as VenueKind) : venueOf(kind);
  if (risk) {
    if (v === "sauna" || v === "exchange" || v === "cruising") return "Établissement";
    if (v === "shop") return "Boutique";
    if (v === "club") return "Club";
    return "Bar";
  }
  return VENUE[v].label;
}

export function venueIcon(kind: VenueKind | string, risk = false): string {
  const v = kind in VENUE ? (kind as VenueKind) : venueOf(kind);
  if (risk && (v === "exchange" || v === "cruising")) return "📌";
  return VENUE[v].icon;
}

/** Affiche un identifiant technique (le-mask) comme un nom lisible. */
export function displayPlaceName(name: string): string {
  const n = name.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(n)) return n;
  return n.split("-").filter((p) => p && p !== "2" && p !== "1").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
