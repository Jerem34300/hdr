/** Privacy + expiry rules. Distances are never exact for a stranger. */

export function snapMeters(meters: number, cell = 100) {
  if (cell <= 0) return meters;
  return Math.round(meters / cell) * cell;
}

/** 100 m while the cell is dense, else 300 m, else 1 km. */
export function adaptiveCell(countIn100: number, countIn300: number): 100 | 300 | 1000 {
  if (countIn100 >= 20) return 100;
  if (countIn300 >= 20) return 300;
  return 1000;
}

export function bucketDistance(meters: number): string {
  const m = Math.max(0, meters);
  if (m < 180) return "~100 m";
  if (m < 500) return "~300 m";
  if (m < 1400) return "~1 km";
  if (m < 2500) return "~2 km";
  return `~${Math.round(m / 1000)} km`;
}

/** Published distance follows the cell, never the raw meter reading. */
export function publishDistance(trueMeters: number, cell: number) {
  const snapped = snapMeters(Math.max(0, trueMeters), cell);
  return bucketDistance(Math.max(cell, snapped));
}

export function isExpired(expiresAt: number | null, now: number) {
  if (expiresAt == null) return false;
  return expiresAt <= now;
}

/** Both pins keep the thread. Otherwise it dies 24 h after the match. */
export function conversationExpiry(createdAt: number, pinnedBoth: boolean) {
  if (pinnedBoth) return null;
  return createdAt + 24 * 60 * 60 * 1000;
}

export function remainingLabel(expiresAt: number | null, now: number) {
  if (expiresAt == null) return "Épinglée";
  const ms = expiresAt - now;
  if (ms <= 0) return "Expirée";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h} h`;
  const min = Math.max(1, Math.floor(ms / 60_000));
  return `${min} min`;
}

export function hiddenIds(blocks: readonly string[], reports: readonly string[]) {
  return [...new Set([...blocks, ...reports])];
}

export function notHidden<T extends { id: string }>(rows: readonly T[], hidden: readonly string[]) {
  const ban = new Set(hidden);
  return rows.filter((row) => !ban.has(row.id));
}

export function destination(lat: number, lng: number, eastM: number, northM: number) {
  const lat2 = lat + northM / 111_320;
  const lng2 = lng + eastM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat2, lng: lng2 };
}

export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function circleRing(lat: number, lng: number, radiusM: number, steps = 48) {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p = destination(lat, lng, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

export const HOT_ANON = 18;

export function cellForPerson(
  east: number,
  north: number,
  people: readonly { east: number; north: number; online: boolean }[],
) {
  const online = people.filter((p) => p.online);
  const dist = (o: { east: number; north: number }) => Math.hypot(o.east - east, o.north - north);
  const inHot = Math.hypot(east, north) < 350;
  const bonus = inHot ? HOT_ANON : 0;
  const c100 = online.filter((o) => dist(o) <= 100).length + bonus;
  const c300 = online.filter((o) => dist(o) <= 300).length + bonus;
  return adaptiveCell(c100, c300);
}
