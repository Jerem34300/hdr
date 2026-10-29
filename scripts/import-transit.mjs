// Import des gares / stations métro-tram / aéroports OSM d'un ou plusieurs pays -> SQL idempotent (upsert par source_ref).
// Usage : node scripts/import-transit.mjs FR DE BE ...   -> supabase/data/transit_<cc>.sql (à appliquer via execute_sql).
// Gratuit : Overpass public, une requête par pays, en série (fair use). Données © OpenStreetMap contributors (ODbL).
import { mkdirSync, writeFileSync } from "node:fs";
const URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = "hdar.chat transit import (contact: hdar.chat)";
const q = (cc) => `[out:json][timeout:300];area["ISO3166-1"="${cc}"][admin_level=2]->.a;(
nwr["railway"~"^(station|halt)$"]["name"](area.a);
node["railway"="tram_stop"]["name"](area.a);
nwr["aeroway"="aerodrome"]["iata"](area.a););out center tags;`;
function kindOf(t) {
  if (t.aeroway === "aerodrome") return t.iata ? "airport" : null;
  if (t.railway === "tram_stop") return "metro";
  if (/subway|light_rail|monorail/.test(t.station ?? "") || t.subway === "yes") return "metro";
  return "station";
}
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
mkdirSync("supabase/data", { recursive: true });
for (const cc of process.argv.slice(2).map((x) => x.toUpperCase())) {
  let res;
  for (const u of URLS) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "user-agent": UA, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q(cc)), signal: AbortSignal.timeout(330_000) });
      if (r.ok) { res = await r.json(); break; }
      console.error(cc, u, r.status);
    } catch (e) { console.error(cc, u, e.message); }
  }
  if (!res) { console.error(cc, "échec"); continue; }
  const seen = new Set(); const rows = [];
  for (const el of res.elements) {
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
  writeFileSync(`supabase/data/transit_${cc.toLowerCase()}.sql`, chunks.join("\n\n") + "\n");
  console.log(cc, rows.length, "arrêts");
}
