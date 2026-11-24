/** Pins de carte : centroïdes pays/ville à ne pas traiter comme une position réelle, et écartement des superpositions. */

export type Offset = { dx: number; dy: number };

/** Centroïdes pays souvent renvoyés par les bases IP quand la ville est inconnue. */
export const COUNTRY_CENTROIDS: { lat: number; lng: number; maxKm: number }[] = [
  // France (OSM / Wikipedia / INSEE) — juste à côté de Sarzay (Indre)
  { lat: 46.6034, lng: 1.8883, maxKm: 25 },
  { lat: 46.603354, lng: 1.888334, maxKm: 25 },
  { lat: 46.2276, lng: 2.2137, maxKm: 25 },
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dphi = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLng - aLng) * Math.PI) / 180;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Vrai si le point est un centroïde de pays (géoloc IP trop floue, pas une ville). */
export function isCountryCentroid(lat: number, lng: number): boolean {
  return COUNTRY_CENTROIDS.some((c) => haversineKm(lat, lng, c.lat, c.lng) <= c.maxKm);
}

/** Décale n pins superposés en étoile autour du point, pour que chacun soit visible et cliquable. */
export function spiderfyOffsets(n: number, radius = 36): Offset[] {
  if (n <= 1) return [{ dx: 0, dy: 0 }];
  const r = radius + Math.min(16, Math.max(0, n - 6) * 2);
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
  });
}
