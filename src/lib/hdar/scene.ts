import { useMemo } from "react";
import { CITIES, HERE_ZONES, PEOPLE, type City, type Person, type Zone } from "./data";
import { hiddenIds, bucketDistance, cellForPerson, destination, haversine, HOT_ANON, isExpired, publishDistance } from "./rules";
import type { SpotRow } from "./live";
import { useHdar, type CustomSpot } from "./store";

export type Place = {
  slug: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  line: string;
  quartiers: string[];
  zones: Zone[];
};

export function resolvePlace(
  cityId: string,
  custom: { lat: number; lng: number } | null,
): Place {
  if (cityId === "ici" && custom) {
    return {
      slug: "ici",
      name: "Ici",
      area: "Autour de toi",
      lat: custom.lat,
      lng: custom.lng,
      line: "Autour de ta position, arrondie.",
      quartiers: ["Tout près", "Au nord", "Plus loin"],
      zones: HERE_ZONES,
    };
  }
  const city = CITIES.find((c) => c.slug === cityId) ?? CITIES[0];
  return city;
}

export type LivePerson = Person & {
  cell: 100 | 300 | 1000;
  eastPub: number;
  northPub: number;
  lat: number;
  lng: number;
  dist: number;
  distanceLabel: string;
  tonightOn: boolean;
};

export function projectPeople(
  place: Place,
  now: number,
  clock: Record<string, number>,
  hidden: readonly string[],
): LivePerson[] {
  const visible = PEOPLE.filter((p) => !hidden.includes(p.id));
  return visible
    .map((p) => {
      const cell = cellForPerson(p.east, p.north, visible);
      const eastPub = Math.round(p.east / cell) * cell;
      const northPub = Math.round(p.north / cell) * cell;
      const pub = destination(place.lat, place.lng, eastPub, northPub);
      const truth = destination(place.lat, place.lng, p.east, p.north);
      const dist = haversine(place, truth);
      const expiresAt = p.tonight ? (clock[p.id] ?? null) : null;
      const tonightOn = Boolean(p.tonight && expiresAt != null && !isExpired(expiresAt, now));
      return {
        ...p,
        cell,
        eastPub,
        northPub,
        lat: pub.lat,
        lng: pub.lng,
        dist,
        distanceLabel: publishDistance(dist, cell),
        tonightOn,
      };
    })
    .sort((a, b) => a.dist - b.dist);
}

export type LiveSpot = {
  id: string;
  title: string;
  east: number;
  north: number;
  radiusM: number;
  members: number;
  closesAt: number;
  creator: boolean;
  thread: { from: string; text: string }[];
  lat: number;
  lng: number;
  dist: number;
  distanceLabel: string;
  messages?: CustomSpot["messages"];
  /** Shared through the database: messages and deletion go to the server. */
  live?: boolean;
  /** Boost payant actif : brille sur la carte et passe en tête de liste. */
  boostedUntil?: number;
};

export function projectSpots(
  place: Place,
  now: number,
  clock: Record<string, number>,
  hidden: readonly string[],
  custom: CustomSpot[],
  shared: SpotRow[] = [],
  /** Where distances are measured from: the real GPS position when known. */
  origin: { lat: number; lng: number } = place,
): LiveSpot[] {
  const mine: LiveSpot[] = custom.map((s) => {
    const at =
      s.lat != null && s.lng != null
        ? { lat: s.lat, lng: s.lng }
        : destination(place.lat, place.lng, s.east, s.north);
    const dist = haversine(origin, at);
    return {
      id: s.id,
      title: s.title,
      east: s.east,
      north: s.north,
      radiusM: s.radiusM,
      members: 1,
      closesAt: s.closesAt,
      creator: true,
      thread: [],
      messages: s.messages,
      lat: at.lat,
      lng: at.lng,
      dist,
      distanceLabel: bucketDistance(Math.max(100, dist)),
    };
  });
  const live: LiveSpot[] = shared.map((s) => {
    const dist = haversine(origin, s);
    return {
      id: s.id,
      title: s.title,
      east: 0,
      north: 0,
      radiusM: 300,
      members: s.members,
      closesAt: s.closesAt,
      creator: s.mine,
      thread: [],
      lat: s.lat,
      lng: s.lng,
      dist,
      distanceLabel: bucketDistance(Math.max(100, dist)),
      live: true,
      boostedUntil: s.boostedUntil,
    };
  });
  // Only real places: ones shared through the database, plus older ones kept on this device.
  return [...live, ...mine]
    .filter((s) => !hidden.includes(s.id) && !isExpired(s.closesAt, now))
    .sort((a, b) => Number((b.boostedUntil ?? 0) > now) - Number((a.boostedUntil ?? 0) > now) || a.dist - b.dist);
}

export function zoneStats(zones: Zone[], people: LivePerson[]) {
  return zones.map((zone) => {
    const listed = people.filter(
      (p) => Math.hypot(p.east - zone.east, p.north - zone.north) <= zone.radius,
    ).length;
    const anon = Math.hypot(zone.east, zone.north) < 500 ? HOT_ANON : 4;
    return { ...zone, count: listed + anon };
  });
}

export function useScene() {
  const cityId = useHdar((s) => s.cityId);
  const customCenter = useHdar((s) => s.customCenter);
  const now = useHdar((s) => s.now);
  const clock = useHdar((s) => s.clock);
  const blocks = useHdar((s) => s.blocks);
  const reports = useHdar((s) => s.reports);
  const customSpots = useHdar((s) => s.customSpots);
  const liveSpots = useHdar((s) => s.liveSpots);
  const here = useHdar((s) => s.here);
  return useMemo(() => {
    const place = resolvePlace(cityId, customCenter);
    const hidden = hiddenIds(blocks, reports);
    const people = projectPeople(place, now, clock.people, hidden);
    const spots = projectSpots(place, now, clock.spots, hidden, customSpots, liveSpots, here ?? place);
    const zones = zoneStats(place.zones, people);
    return { place, people, spots, zones, hidden };
  }, [blocks, cityId, clock, customCenter, customSpots, here, liveSpots, now, reports]);
}

export type { City };
