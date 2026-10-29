// Import des gares / stations métro-tram / aéroports OSM -> SQL idempotent (upsert par source_ref), par zone.
// Usage : node scripts/import-transit.mjs FR BE ...  (zones dans BOXES) -> supabase/data/transit_<zone>.sql
// Les requêtes « pays entier » sont refusées (502/504) par l'Overpass public : on découpe en tuiles de 1°,
// une petite requête à la fois, avec pause entre chaque (fair use). Données © OpenStreetMap contributors (ODbL).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = "hdar.chat transit import (contact: hdar.chat)";
// [sud, ouest, nord, est]
const BOXES = {
  FR: [41.3, -5.2, 51.1, 9.6], BE: [49.5, 2.5, 51.5, 6.4], LU: [49.4, 5.7, 50.2, 6.5], CH: [45.8, 5.9, 47.8, 10.5],
  DE: [47.2, 5.8, 55.1, 15.1], IT: [36.6, 6.6, 47.1, 18.6], ES: [36.0, -9.4, 43.8, 3.4], PT: [36.9, -9.6, 42.2, -6.1],
  NL: [50.7, 3.3, 53.6, 7.3], GB: [49.9, -8.2, 58.7, 1.8], IE: [51.4, -10.5, 55.4, -6.0], AT: [46.3, 9.5, 49.1, 17.2],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tileQ = (s, w, n, e) => { const b = `${s},${w},${n},${e}`; return `[out:json][timeout:120];(nwr["railway"~"^(station|halt)$"]["name"](${b});node["railway"="tram_stop"]["name"](${b});nwr["aeroway"="aerodrome"]["iata"](${b}););out center tags;`; };
async function fetchQ(q) {
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const u of URLS) {
      try {
        const r = await fetch(u, { method: "POST", headers: { "user-agent": UA, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(150_000) });
        if (r.ok) return (await r.json()).elements;
        console.error("  ", u.split("/")[2], r.status);
      } catch (e) { console.error("  ", u.split("/")[2], e.message); }
    }
    await sleep(30_000 * (attempt + 1));
  }
  return null;
}
function kindOf(t) {
  if (t.aeroway === "aerodrome") return t.iata ? "airport" : null;
  if (t.railway === "tram_stop") return "metro";
  if (/subway|light_rail|monorail/.test(t.station ?? "") || t.subway === "yes") return "metro";
  return "station";
}
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
mkdirSync("supabase/data", { recursive: true });
for (const cc of process.argv.slice(2).map((x) => x.toUpperCase())) {
  const box = BOXES[cc];
  if (!box) { console.error(cc, "zone inconnue"); continue; }
  const prog = `supabase/data/.progress_${cc}.json`; // reprise après interruption
  const state = existsSync(prog) ? JSON.parse(readFileSync(prog, "utf8")) : { done: [], els: {} };
  const tiles = [];
  for (let s = Math.floor(box[0]); s < box[2]; s++) for (let w = Math.floor(box[1]); w < box[3]; w++) tiles.push([s, w]);
  for (const [s, w] of tiles) {
    const k = `${s},${w}`;
    if (state.done.includes(k)) continue;
    const els = await fetchQ(tileQ(s, w, s + 1, w + 1));
    if (!els) { console.error(cc, k, "échec, on passe"); continue; }
    for (const el of els) state.els[`${el.type}/${el.id}`] = el;
    state.done.push(k);
    writeFileSync(prog, JSON.stringify(state));
    console.log(cc, k, els.length, `(${state.done.length}/${tiles.length})`);
    await sleep(4_000);
  }
  const seen = new Set(); const rows = [];
  for (const el of Object.values(state.els)) {
    const t = el.tags ?? {}; const k = kindOf(t);
    const lat = el.lat ?? el.center?.lat; const lng = el.lon ?? el.center?.lon;
    const name = (t["name:fr"] || t.name || "").trim().slice(0, 80);
    if (!k || lat == null || !name) continue;
    const dk = `${k}|${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(dk)) continue; seen.add(dk);
    rows.push(`(${esc(k)},${esc(name)},${lat},${lng},'osm',${esc(`osm:${el.type}/${el.id}`)},'approved',false,false,${t.iata ? esc(t.iata.slice(0, 4)) : "null"})`);
  }
  const chunks = [];
  for (let i = 0; i < rows.length; i += 2000) chunks.push(`insert into hdar.places (kind,name,lat,lng,source,source_ref,status,ratings_on,comments_on,transit_code) values\n${rows.slice(i, i + 2000).join(",\n")}\non conflict (source_ref) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, transit_code = excluded.transit_code where hdar.places.kind in ('station','metro','airport');`);
  chunks.forEach((c, i) => writeFileSync(`supabase/data/transit_${cc.toLowerCase()}_${i}.sql`, c + "\n"));
  console.log(cc, "TOTAL", rows.length, "arrêts,", chunks.length, "fichiers,", `${state.done.length}/${tiles.length} tuiles`);
}
