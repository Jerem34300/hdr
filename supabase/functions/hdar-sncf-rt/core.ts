// Logique pure (testable hors Deno) : index « numéro de train -> retards / suppressions » depuis le GTFS-RT SNCF.
export type RtStop = [number, number, number]; // [heure prévue (epoch s), retard (s), 1 si arrêt supprimé]
export type RtTrain = { c: boolean; s: RtStop[] };
type Feed = {
  header?: { timestamp?: number | { toNumber(): number } };
  entity: { tripUpdate?: { trip: { tripId?: string; scheduleRelationship?: number }; stopTimeUpdate?: { arrival?: { delay?: number; time?: number | { toNumber(): number } }; departure?: { delay?: number; time?: number | { toNumber(): number } }; scheduleRelationship?: number }[] } }[];
};
const num = (v: unknown) => (v == null ? 0 : typeof v === "number" ? v : (v as { toNumber(): number }).toNumber());

export function indexFeed(feed: Feed) {
  const trains: Record<string, RtTrain> = {};
  for (const e of feed.entity) {
    const tu = e.tripUpdate;
    if (!tu) continue;
    const m = /^OCESN(\d{1,6})F/.exec(tu.trip.tripId ?? ""); // « OCESN6258F1187_F:OUI:… » -> 6258
    if (!m) continue;
    const t = (trains[m[1]] ??= { c: false, s: [] });
    if (tu.trip.scheduleRelationship === 3) t.c = true; // CANCELED
    for (const s of tu.stopTimeUpdate ?? []) {
      const ev = s.departure?.time ? s.departure : s.arrival;
      if (!ev?.time) continue;
      const d = num(ev.delay);
      t.s.push([num(ev.time) - d, d, s.scheduleRelationship === 1 ? 1 : 0]); // SKIPPED
      // l'arrivée peut avoir son propre horaire prévu (terminus / arrêt long)
      if (s.arrival?.time && s.departure?.time) t.s.push([num(s.arrival.time) - num(s.arrival.delay), num(s.arrival.delay), s.scheduleRelationship === 1 ? 1 : 0]);
    }
  }
  return { at: num(feed.header?.timestamp), trains };
}

export function pick(idx: ReturnType<typeof indexFeed>, nums: string[]) {
  const out: Record<string, RtTrain> = {};
  for (const n of nums) if (idx.trains[n]) out[n] = idx.trains[n];
  return { at: idx.at, trains: out };
}
