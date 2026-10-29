import data from "./data.json";
import type { CityPayload, ListPayload, Mini, IndexPayload } from "./types";

type C = { s: string; n: string; p: number; d: string; x: number; y: number; h: string; k: number; H: number };
const D = data as unknown as { cities: C[]; deps: Record<string, { n: string; r: string; s: string }>; regs: Record<string, { n: string; s: string }> };
const bySlug = new Map(D.cities.map((c) => [c.s, c]));
const km = (a: C, b: C) => {
  const r = Math.PI / 180, dl = (b.y - a.y) * r, dg = (b.x - a.x) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.y * r) * Math.cos(b.y * r) * Math.sin(dg / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};
const mini = (c: C, from?: C): Mini => ({ s: c.s, n: c.n, p: c.p, k: from ? Math.round(km(from, c)) : undefined });
const dep = (code: string) => ({ code, ...D.deps[code] });
const reg = (code: string) => ({ code, ...D.regs[code] });
export const TOP30 = new Set(D.cities.slice(0, 30).map((c) => c.s));
/** Villes « fortes » : seules indexées et soumises au sitemap (50 000 hab. et plus, pôles, top 30, focus Hérault).
 *  Les autres communes restent accessibles et suivies (noindex, follow) : gabarit trop proche pour être indexé. */
const STRONG_MIN_POP = 50000;
const FOCUS = new Set(["agde", "sete", "lunel", "frontignan", "marseillan", "vias", "pezenas", "palavas-les-flots", "la-grande-motte"]);
const STRONG = new Set(D.cities.filter((c) => c.p >= STRONG_MIN_POP || c.H || TOP30.has(c.s) || FOCUS.has(c.s)).map((c) => c.s));
const regPop: Record<string, number> = {};
for (const c of D.cities) { const r = D.deps[c.d].r; regPop[r] = (regPop[r] || 0) + c.p; }
/** Régions quasi vides (TAAF, Clipperton, Saint-Pierre…) : noindex. */
export const REGION_MIN_POP = 100000;

export function cityPayload(slug: string): CityPayload | null {
  const c = bySlug.get(slug);
  if (!c) return null;
  const dp = dep(c.d), rg = reg(dp.r);
  const hub = bySlug.get(c.h)!;
  const nearby = D.cities.filter((o) => o !== c).map((o) => [o, km(c, o)] as const).sort((a, b) => a[1] - b[1]).slice(0, 12).map(([o]) => mini(o, c));
  const around = c.H ? D.cities.filter((o) => o.h === c.s && o !== c).sort((a, b) => b.p - a.p).slice(0, 240).map((o) => mini(o, c)) : [];
  const aroundCount = c.H ? D.cities.filter((o) => o.h === c.s).length - 1 : 0;
  const depCities = D.cities.filter((o) => o.d === c.d);
  return {
    s: c.s, n: c.n, p: c.p, x: c.x, y: c.y, hubKm: c.k, isHub: !!c.H, top: TOP30.has(c.s), strong: STRONG.has(c.s),
    hub: mini(hub), dep: { s: dp.s, n: dp.n, code: dp.code }, reg: { s: rg.s, n: rg.n },
    rankInDep: depCities.indexOf(c) + 1, depCount: depCities.length,
    nearby, around, aroundCount,
  };
}

export function regionPayload(slug: string): ListPayload | null {
  const code = Object.keys(D.regs).find((k) => D.regs[k].s === slug);
  if (!code) return null;
  const deps = Object.entries(D.deps).filter(([, v]) => v.r === code).map(([k, v]) => ({ s: v.s, n: v.n, code: k })).sort((a, b) => a.code.localeCompare(b.code));
  const codes = new Set(deps.map((d) => d.code));
  const cities = D.cities.filter((c) => codes.has(c.d));
  return { kind: "region", s: slug, n: D.regs[code].n, cities: cities.slice(0, 150).map((c) => mini(c)), hubs: cities.filter((c) => c.H).map((c) => mini(c)), deps, parent: null, count: cities.length, total: cities.reduce((a, c) => a + c.p, 0) };
}

export function depPayload(slug: string): ListPayload | null {
  const code = Object.keys(D.deps).find((k) => D.deps[k].s === slug);
  if (!code) return null;
  const rg = reg(D.deps[code].r);
  const cities = D.cities.filter((c) => c.d === code);
  return { kind: "departement", s: slug, n: D.deps[code].n, code, cities: cities.map((c) => mini(c)), hubs: cities.filter((c) => c.H).map((c) => mini(c)), deps: [], parent: { s: rg.s, n: rg.n }, count: cities.length, total: cities.reduce((a, c) => a + c.p, 0) };
}

export function indexPayload(): IndexPayload {
  return {
    regions: Object.values(D.regs).map((r) => ({ s: r.s, n: r.n })).sort((a, b) => a.n.localeCompare(b.n, "fr")),
    top: D.cities.slice(0, 60).map((c) => mini(c)),
    count: D.cities.length,
  };
}


/** Toutes les URL publiques, pour les sitemaps. */
export function allUrls() {
  const regs = Object.keys(D.regs).filter((k) => (regPop[k] || 0) >= REGION_MIN_POP).map((k) => D.regs[k].s);
  return {
    cities: D.cities.filter((c) => STRONG.has(c.s)).map((c) => `/rencontre/${c.s}`),
    // Annonces par ville (≈400 mots, gabarit) et sous-pages thème (quasi-doublons de la page ville) : hors sitemap.
    annonces: ["/petites-annonces"],
    // Pages villes traduites (en, es, de, it, pt, ar) : les 300 plus grandes villes.
    intl: D.cities.slice(0, 300).filter((c) => STRONG.has(c.s)).flatMap((c) => ["en", "es", "de", "it", "pt", "ar"].map((l) => `/${l}/city/${c.s}`)),
    themes: D.cities.slice(0, 30).map((c) => `/rencontre/${c.s}/live-coquin`),
    // Départements : restent indexables (maillage) mais hors sitemap.
    lists: ["/rencontre", ...regs.map((s) => `/rencontre/region/${s}`)],
  };
}
