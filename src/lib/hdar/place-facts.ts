import type { PlaceKind, PlaceVenue } from "./live";
import { venueOf } from "./venue.ts";

/** Infos pratiques d'une fiche : colonnes du lieu + champs optionnels du manifest. */
export type PlaceFacts = {
  hours: string | null;
  entry: string | null;
  events: string[];
  tags: string[];
};

export type PlaceFactsSource = {
  hours?: unknown;
  tags?: string[] | null;
  entry?: unknown;
  events?: unknown;
};

export function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const parts = value.map((x) => formatEventLine(x) ?? (typeof x === "string" ? x.trim() : "")).filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  return null;
}

/** Une soirée du manifest : uniquement les champs fournis, rien d'inventé. */
export function formatEventLine(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const when = typeof o.when === "string" ? o.when.trim() : "";
  const detail = typeof o.detail === "string" ? o.detail.trim() : "";
  let price = "";
  if (typeof o.price === "number" && Number.isFinite(o.price)) price = `${o.price} €`;
  else if (typeof o.price === "string") price = o.price.trim();
  const parts = [name, when, detail, price].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function eventLines(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map(formatEventLine).filter((x): x is string => !!x);
  }
  const line = formatEventLine(value) ?? textOrNull(value);
  return line ? [line] : [];
}

/** Colonne d'abord, manifest seulement pour combler un trou. Rien n'est inventé. */
export function mergePlaceFacts(place: PlaceFactsSource, manifest?: PlaceFactsSource | null): PlaceFacts {
  const events = eventLines(place.events);
  const fromManifest = eventLines(manifest?.events);
  return {
    hours: textOrNull(place.hours) ?? textOrNull(manifest?.hours),
    entry: textOrNull(place.entry) ?? textOrNull(manifest?.entry),
    events: events.length ? events : fromManifest,
    tags: (place.tags ?? []).map((x) => x.trim()).filter(Boolean),
  };
}

export function hasPlaceFacts(facts: PlaceFacts): boolean {
  return !!(facts.hours || facts.entry || facts.events.length || facts.tags.length);
}

const PUBLIC_KINDS: PlaceKind[] = ["cruising", "beach", "park", "garden", "viewpoint", "square", "promenade", "aire", "toilets"];

/** Bar, club, sauna, boutique : établissement. Bois, parking, plage : lieu public. */
export function isEstablishmentPlace(place: { kind: PlaceKind; venue?: PlaceVenue | null }): boolean {
  if (place.kind === "bar" || place.kind === "club" || place.kind === "sauna") return true;
  if (place.kind === "other") return true;
  const venue = place.venue ?? (PUBLIC_KINDS.includes(place.kind) ? null : venueOf(place.kind));
  return venue === "bar" || venue === "club" || venue === "sauna" || venue === "shop" || venue === "exchange";
}

/** Court texte de repli, selon le type, quand horaires / entrée / soirées manquent. */
export function placeFactsFallbackKey(place: { kind: PlaceKind; venue?: PlaceVenue | null }): string {
  const venue = place.venue ?? venueOf(place.kind);
  if (venue === "sauna") {
    return "Les horaires et les conditions d'entrée de ce sauna ne sont pas encore indiqués. Vérifie auprès du lieu avant de te déplacer.";
  }
  if (venue === "bar") {
    return "Les horaires et le programme de ce bar ne sont pas encore indiqués. Vérifie auprès du lieu avant de te déplacer.";
  }
  if (venue === "club") {
    return "Les horaires, le prix d'entrée et les soirées de ce club ne sont pas encore indiqués. Vérifie auprès du lieu avant de te déplacer.";
  }
  if (venue === "shop") {
    return "Les horaires et les infos pratiques de cette boutique ne sont pas encore indiqués. Vérifie auprès du lieu avant de te déplacer.";
  }
  if (venue === "exchange") {
    return "Les horaires et les conditions d'entrée de ce club ne sont pas encore indiqués. Vérifie auprès du lieu avant de te déplacer.";
  }
  return "Les horaires et les infos pratiques de ce lieu ne sont pas encore indiqués. Vérifie auprès du lieu avant de te déplacer.";
}
