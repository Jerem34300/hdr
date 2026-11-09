import raw from "./intl-cities.json";

export type IntlCity = {
  s: string;
  n: string;
  n_nl?: string;
  n_de?: string;
  n_fr?: string;
  lat: number;
  lng: number;
  pop: number | null;
  area_km2: number | null;
  pop_year: number | null;
  area_year: number | null;
  source: string;
  source_url: string;
  nearby: string[];
  /** Indexable language for this city when the country has several (e.g. Genève → fr). */
  primary?: string;
};

export type IntlCountry = {
  lang: string;
  langs?: string[];
  name: string;
  pathWord: string | null;
  priority: number;
  cities: IntlCity[];
};

const DATA = raw as { countries: Record<string, IntlCountry> };

/** Primary lang → country code for native city pages (DE→DE, ES→ES, NL→NL). */
export const LANG_COUNTRY: Record<string, string> = {
  de: "DE",
  es: "ES",
  nl: "NL",
  it: "IT",
  pt: "PT",
};

const byLangSlug = new Map<string, { country: string; city: IntlCity; meta: IntlCountry }>();
for (const [cc, meta] of Object.entries(DATA.countries)) {
  const langs = meta.langs?.length ? meta.langs : [meta.lang];
  for (const lang of langs) {
    for (const city of meta.cities) {
      byLangSlug.set(`${lang}:${city.s}`, { country: cc, city, meta });
    }
  }
}

/** Number locale per country + page language (de-CH uses ’ grouping, pt-PT spaces…). */
function numberLocale(country: string, lang: string) {
  const map: Record<string, string> = { DE: "de-DE", ES: "es-ES", NL: "nl-NL", IT: "it-IT", PT: "pt-PT", GB: "en-GB", IE: "en-IE" };
  if (country === "CH") return lang === "fr" ? "fr-CH" : "de-CH";
  if (country === "BE") return lang === "nl" ? "nl-BE" : "fr-BE";
  return map[country] ?? lang;
}

function displayName(city: IntlCity, lang: string) {
  return lang === "nl" && city.n_nl ? city.n_nl
    : lang === "de" && city.n_de ? city.n_de
    : lang === "fr" && city.n_fr ? city.n_fr
    : city.n;
}

const RESERVED = new Set(["city", "stadt", "ciudad", "stad", "cidade", "citta"]);

export function intlCityPayload(lang: string, slug: string) {
  if (RESERVED.has(slug)) return null;
  const hit = byLangSlug.get(`${lang}:${slug}`);
  if (!hit) return null;
  const { country, city, meta } = hit;
  const display = displayName(city, lang);
  const primary = city.primary ?? meta.lang;
  const nearby = city.nearby
    .map((s) => {
      const n = byLangSlug.get(`${lang}:${s}`);
      return n ? { s: n.city.s, n: displayName(n.city, lang) } : null;
    })
    .filter(Boolean) as { s: string; n: string }[];
  return {
    s: city.s,
    n: display,
    country,
    countryName: meta.name,
    lang,
    lat: city.lat,
    lng: city.lng,
    pop: city.pop,
    area_km2: city.area_km2,
    pop_year: city.pop_year,
    area_year: city.area_year,
    source: city.source,
    source_url: city.source_url,
    nearby,
    path: `/${lang}/${city.s}`,
    /** false for secondary-language variants (e.g. /fr/zuerich) → noindex, not in sitemap. */
    isPrimary: lang === primary,
    primaryPath: `/${primary}/${city.s}`,
    numberLocale: numberLocale(country, lang),
  };
}

export type IntlCityPayload = NonNullable<ReturnType<typeof intlCityPayload>>;

/** Native city URLs by country (for sitemaps). Priority-1 countries first (DE, ES, NL). */
export function intlNativeUrls(priorityMax = 1) {
  const out: Record<string, string[]> = {};
  for (const [cc, meta] of Object.entries(DATA.countries)) {
    if (meta.priority > priorityMax) continue;
    out[cc.toLowerCase()] = meta.cities.map((c) => `/${c.primary ?? meta.lang}/${c.s}`);
  }
  return out;
}

export function allIntlCountries() {
  return Object.entries(DATA.countries).map(([cc, meta]) => ({
    code: cc,
    name: meta.name,
    lang: meta.lang,
    langs: meta.langs ?? [meta.lang],
    priority: meta.priority,
    cities: meta.cities.map((c) => ({ s: c.s, n: c.n, pop: c.pop, source: c.source })),
  }));
}
