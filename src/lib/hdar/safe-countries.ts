/**
 * Pays où les relations entre personnes de même sexe sont pénalisées.
 * Liste à étendre (codes ISO 3166-1 alpha-2) quand un nouveau pays
 * doit bénéficier des mêmes protections.
 *
 * Ne jamais s'appuyer sur une adresse IP, ni la stocker.
 * Le pays vient du géocodage de la position (ville) ou d'un en-tête CDN.
 */
export const RISK_COUNTRIES = ["DZ", "MA", "TN", "SN", "CM"] as const;

export function isRiskCountry(cc: string | null | undefined): boolean {
  if (!cc) return false;
  return (RISK_COUNTRIES as readonly string[]).includes(cc.trim().toUpperCase());
}

/** Vrai si la position géocodée ou le pays CDN est un pays à risque. Pas le pays choisi dans les salons. */
export function locatedInRiskCountry(geo: string | null | undefined, cdn: string | null | undefined): boolean {
  return isRiskCountry(geo) || isRiskCountry(cdn);
}

function devOverride(): string | null {
  if (!import.meta.env.DEV || typeof location === "undefined") return null;
  const m = /(?:^|[?&])safe=([A-Za-z]{2})(?:&|$)/.exec(location.search);
  return m ? m[1].toUpperCase() : null;
}

const OFFSET_KEY = "hdar-safe-off";

/** Décalage ~1 km, tiré au hasard une fois par session (ne saute pas à chaque envoi). */
function sessionOffset(): { east: number; north: number } {
  try {
    const raw = sessionStorage.getItem(OFFSET_KEY);
    if (raw) {
      const o = JSON.parse(raw) as { east: number; north: number };
      if (Number.isFinite(o.east) && Number.isFinite(o.north)) return o;
    }
  } catch { /* ignore */ }
  const angle = Math.random() * Math.PI * 2;
  const r = 800 + Math.random() * 400;
  const o = { east: Math.cos(angle) * r, north: Math.sin(angle) * r };
  try { sessionStorage.setItem(OFFSET_KEY, JSON.stringify(o)); } catch { /* ignore */ }
  return o;
}

function destination(lat: number, lng: number, eastM: number, northM: number) {
  const lat2 = lat + northM / 111_320;
  const lng2 = lng + eastM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat2, lng: lng2 };
}

/** Position publiée aux autres : floutée ~1 km dans un pays à risque, inchangée sinon. */
export function publishPos(lat: number, lng: number, risk: boolean): { lat: number; lng: number } {
  if (!risk) return { lat, lng };
  const o = sessionOffset();
  return destination(lat, lng, o.east, o.north);
}

export { devOverride };
