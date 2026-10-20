import { createServerFn } from "@tanstack/react-start";

export const getCity = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => (await import("./geo.server")).cityPayload(data));
export const getRegion = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => (await import("./geo.server")).regionPayload(data));
export const getDep = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => (await import("./geo.server")).depPayload(data));
export const getIndex = createServerFn({ method: "GET" }).handler(async () => (await import("./geo.server")).indexPayload());

/** Pages publiques /petites-annonces : commune + nombre anonyme d'annonces en ligne (aucun contenu d'annonce). */
export const getAdsCity = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => {
  const c = (await import("./geo.server")).cityPayload(data);
  if (!c) return null;
  const [city, region] = await Promise.all([adsCount(null, c.s), adsCount(adRegion(c.reg.s), null)]);
  return { c, city, region };
});
export const getAdsIndex = createServerFn({ method: "GET" }).handler(async () => {
  const d = (await import("./geo.server")).indexPayload();
  return { top: d.top.slice(0, 30), regions: d.regions, total: await adsCount(null, null) };
});
const METRO = new Set(["auvergne-rhone-alpes", "bourgogne-franche-comte", "bretagne", "centre-val-de-loire", "corse", "grand-est", "hauts-de-france", "ile-de-france", "normandie", "nouvelle-aquitaine", "occitanie", "pays-de-la-loire", "provence-alpes-cote-d-azur"]);
const adRegion = (s: string) => (METRO.has(s) ? s : "outre-mer");
async function adsCount(region: string | null, city: string | null): Promise<number> {
  const { SUPABASE_URL, SUPABASE_KEY } = await import("../session");
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_ads_count`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ p_region: region, p_city: city }), signal: AbortSignal.timeout(2500),
    });
    return r.ok ? Number(await r.json()) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Aperçu de partage d'une annonce : la ville seulement (jamais texte, photo ni pseudo). */
export const getAdShareCity = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => {
  if (!/^[0-9a-f-]{36}$/i.test(data)) return null;
  const { SUPABASE_URL, SUPABASE_KEY } = await import("../session");
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_ad_share_city`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ p_id: data }), signal: AbortSignal.timeout(2500),
    });
    const city = r.ok ? ((await r.json()) as string | null) : null;
    return city ? String(city).slice(0, 60) : null;
  } catch {
    return null;
  }
});
