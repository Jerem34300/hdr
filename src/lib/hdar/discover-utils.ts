export type MapListing = "discover" | "partner";

import { venueIcon as venueGlyph, venueLabel, venueOf } from "./venue.ts";

export const DEFAULT_COVERS: Record<string, string> = {
  bar: "/places/cover-bar.svg",
  club: "/places/cover-club.svg",
  sauna: "/places/cover-sauna.svg",
  shop: "/places/cover-shop.svg",
  other: "/places/cover-other.svg",
  exchange: "/places/cover-exchange.svg",
  "club-echange": "/places/cover-exchange.svg",
  cruising: "/places/cover-cruising.svg",
  "cruising-bar": "/places/cover-cruising.svg",
  association: "/places/cover-association.svg",
  sport: "/places/cover-association.svg",
  toilets: "/places/cover-toilets.svg",
  station: "/places/cover-transit.svg",
  metro: "/places/cover-transit.svg",
  bus: "/places/cover-transit.svg",
  airport: "/places/cover-transit.svg",
  park: "/places/cover-outdoor.svg",
  beach: "/places/cover-outdoor.svg",
  garden: "/places/cover-outdoor.svg",
  viewpoint: "/places/cover-outdoor.svg",
  square: "/places/cover-outdoor.svg",
  promenade: "/places/cover-outdoor.svg",
  aire: "/places/cover-outdoor.svg",
};

export const RISK_COUNTRIES = new Set(["DZ", "MA", "TN", "SN", "CM"]);

/** Couverture illustrée par type (SVG en trait dans /public/places), jamais une photo stock. Type inconnu → cover-other, pas bar. */
export function defaultCover(kind: string): string {
  const k = (kind || "").toLowerCase();
  if (DEFAULT_COVERS[k]) return DEFAULT_COVERS[k];
  return "/places/cover-other.svg";
}

/** Vrai partenaire payant (futur). Pas le flag `partner` / `map_listing` actuel, ni `partner_until` (offert au lancement). */
export function isPaidPartner(p: { paid_partner?: boolean | null; stripe_subscription?: string | null } | null | undefined): boolean {
  if (!p) return false;
  if (p.paid_partner === true) return true;
  const sub = (p.stripe_subscription ?? "").trim();
  return sub.length > 0;
}

export function listingLabel(listing: MapListing | undefined, verified = false, paid = false): string {
  if (paid) return "Partenaire";
  if (verified) return "Lieu à découvrir · Vérifié";
  return "Lieu à découvrir";
}

export function kindNoun(kind: string, risk = false): string {
  return venueLabel(venueOf(kind), risk);
}

export function kindIcon(kind: string, risk = false): string {
  return venueGlyph(venueOf(kind), risk);
}

export function maskEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  return `${e[0]}***@${e.slice(at + 1)}`;
}

export function emailDomain(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const d = e.split("@")[1];
  return d ? d.replace(/^www\./, "") : null;
}

export function websiteDomain(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim().toLowerCase();
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** L'e-mail est sur le même domaine (ou un sous-domaine) que le site du lieu. */
export function emailMatchesWebsite(email: string, website: string): boolean {
  const ed = emailDomain(email);
  const site = websiteDomain(website);
  if (!ed || !site) return false;
  return ed === site || ed.endsWith(`.${site}`) || site.endsWith(`.${ed}`);
}

export type OutreachLike = {
  status?: string | null;
  refused_at?: string | null;
  suppressed_at?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function isDisplayableOutreach(row: OutreachLike): boolean {
  if (row.lat == null || row.lng == null) return false;
  if (row.refused_at || row.suppressed_at) return false;
  const st = row.status ?? "";
  return !["refused", "suppressed", "bounced"].includes(st);
}

const RISK_WORDS = /\b(gay|lgbt|lgbtq|cruising|sauna gay|bar gay|club gay)\b/gi;
export function publicDescription(text: string | null | undefined, country?: string | null): string {
  const v = (text ?? "").trim();
  if (!v) return "";
  if (country && RISK_COUNTRIES.has(country.toUpperCase())) return v.replace(RISK_WORDS, "").replace(/\s{2,}/g, " ").trim();
  return v;
}

export type PlaceLang = "fr" | "en" | "es" | "de" | "it" | "pt" | "ar";
export type PlaceDescriptionI18n = Partial<Record<PlaceLang, string>>;

/** Description de fiche dans la langue de l'app, repli sur le français. */
export function pickPlaceDescription(
  i18n: PlaceDescriptionI18n | null | undefined,
  lang: string,
  fallback?: string | null,
  country?: string | null,
): string {
  const key = (lang || "fr").toLowerCase().slice(0, 2) as PlaceLang;
  const picked = (i18n && (i18n[key] || i18n.fr || i18n.en)) || (fallback ?? "") || "";
  return publicDescription(picked, country);
}

const GENERIC_DESC = /^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising|Établissement)(\s+échangiste)?\s+(à|au|aux|en|in|im|aan|bei|in der)(?=\s|,|$)/i;

/** Descriptions auto du type « Club en Valencia. » / « Sauna au Cour Brasserie, à Uckange. ». */
export function isGenericPlaceDescription(text: string | null | undefined): boolean {
  const v = (text ?? "").trim();
  if (!v) return true;
  if (!GENERIC_DESC.test(v)) return false;
  const sentences = v.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  return v.length < 120 && sentences.length <= 1;
}

/** Crédit photo : domaine(s) uniquement, sans URL, sans préfixe « Photo : » répété. */
export function photoCreditLabel(credit: string | null | undefined, sourceUrl?: string | null): string | null {
  const raw = [credit, sourceUrl].filter((x): x is string => !!x && !!x.trim()).join(" · ").trim();
  if (!raw) return null;
  const stripped = raw.replace(/^(photo\s*:\s*)+/i, "").trim();
  const hosts: string[] = [];
  const seen = new Set<string>();
  const urlRe = /https?:\/\/[^\s·,]+/gi;
  for (const u of stripped.match(urlRe) ?? []) {
    const h = websiteDomain(u);
    if (h && !seen.has(h)) {
      seen.add(h);
      hosts.push(h);
    }
  }
  if (hosts.length) return hosts.join(" · ");
  const bare = websiteDomain(stripped);
  if (bare && !/\s/.test(stripped) && stripped.length < 80) return bare;
  return null;
}
