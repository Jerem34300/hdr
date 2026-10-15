// Génère src/lib/hdar/seo-geo/data.json depuis geo.api.gouv.fr (toutes les communes).
// Usage : curl "https://geo.api.gouv.fr/communes?fields=nom,code,population,centre,codeDepartement,departement,region&format=json" > /tmp/communes.json && node scripts/build-seo-cities.mjs /tmp/communes.json
import { readFileSync, writeFileSync } from "node:fs";
const src = JSON.parse(readFileSync(process.argv[2] || "/tmp/communes.json", "utf8"));
const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rows = src.filter((c) => c.centre && c.departement && c.region).sort((a, b) => b.population - a.population);
const km = (a, b) => { const R = 6371, r = Math.PI / 180; const dl = (b[1] - a[1]) * r, dg = (b[0] - a[0]) * r; const x = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const seen = new Map();
for (const c of rows) { const s = slugify(c.nom); seen.set(s, (seen.get(s) || 0) + 1); }
const cities = rows.map((c) => ({ s: seen.get(slugify(c.nom)) > 1 ? `${slugify(c.nom)}-${c.codeDepartement}` : slugify(c.nom), n: c.nom, p: c.population || 0, d: c.codeDepartement, x: +c.centre.coordinates[0].toFixed(4), y: +c.centre.coordinates[1].toFixed(4) }));
const hubs = [];
for (const c of cities) { if (c.p < 50000) break; if (!hubs.some((h) => km([h.x, h.y], [c.x, c.y]) < 12)) hubs.push(c); }
for (const c of cities) { let best = null, bd = 1e9; for (const h of hubs) { const d = km([h.x, h.y], [c.x, c.y]); if (d < bd) { bd = d; best = h; } } c.h = best.s; c.k = Math.round(bd); c.H = hubs.includes(c) ? 1 : 0; }
const deps = {}, regs = {};
for (const c of src) if (c.departement && c.region) { deps[c.codeDepartement] = { n: c.departement.nom, r: c.region.code }; regs[c.region.code] = { n: c.region.nom, s: slugify(c.region.nom) }; }
for (const k of Object.keys(deps)) deps[k].s = slugify(deps[k].n);
writeFileSync("src/lib/hdar/seo-geo/data.json", JSON.stringify({ cities, deps, regs }));
console.log(cities.length, "villes,", hubs.length, "pôles,", Object.keys(deps).length, "dép.,", Object.keys(regs).length, "régions");
