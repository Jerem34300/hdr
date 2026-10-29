// hdar-sncf-rt — retards et suppressions SNCF en temps réel pour le tableau des trains.
// Source ouverte SANS clé : GTFS-RT SNCF (TGV INOUI, OUIGO, Intercités, TER) publié sur transport.data.gouv.fr
// (licence ODbL). Flux ≈1,5 Mo : téléchargé côté serveur au plus une fois par minute, puis on ne renvoie
// au téléphone que les trains demandés. Aucune donnée utilisateur, aucune clé.
import GtfsRt from "npm:gtfs-realtime-bindings@1.1.1";
import { indexFeed, pick } from "./core.ts";

const FEED = "https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates";
const TTL = 60_000;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "public, max-age=30" } });

let cache: { t: number; idx: ReturnType<typeof indexFeed> } | null = null;
let inflight: Promise<ReturnType<typeof indexFeed>> | null = null;
async function load() {
  if (cache && Date.now() - cache.t < TTL) return cache.idx;
  inflight ??= (async () => {
    try {
      const r = await fetch(FEED, { headers: { "user-agent": "hdar.chat sncf-rt" }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`flux ${r.status}`);
      const feed = GtfsRt.transit_realtime.FeedMessage.decode(new Uint8Array(await r.arrayBuffer()));
      const idx = indexFeed(feed as never);
      cache = { t: Date.now(), idx };
      return idx;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const nums = (Array.isArray(body?.nums) ? body.nums : []).filter((n: unknown) => typeof n === "string" && /^\d{1,6}$/.test(n)).slice(0, 80);
    if (!nums.length) return json({ at: 0, trains: {} });
    const idx = await load().catch(() => cache?.idx ?? null); // flux indisponible : dernier état connu
    if (!idx) return json({ at: 0, trains: {} });
    return json(pick(idx, nums));
  } catch {
    return json({ at: 0, trains: {} });
  }
});
