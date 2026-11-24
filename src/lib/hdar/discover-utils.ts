export type MapListing = "discover" | "partner";

import { venueCover, venueIcon as venueGlyph, venueLabel, venueOf } from "./venue.ts";

export const DEFAULT_COVERS: Record<string, string> = {
  bar: "/places/cover-bar.svg",
  club: "/places/cover-club.svg",
  sauna: "/places/cover-sauna.svg",
  shop: "/places/cover-shop.svg",
  other: "/places/cover-shop.svg",
  exchange: "/places/cover-exchange.svg",
  "club-echange": "/places/cover-exchange.svg",
  cruising: "/places/cover-cruising.svg",
  "cruising-bar": "/places/cover-cruising.svg",
};

export const RISK_COUNTRIES = new Set(["DZ", "MA", "TN", "SN", "CM"]);

export function defaultCover(kind: string): string {
  return venueCover(venueOf(kind));
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
