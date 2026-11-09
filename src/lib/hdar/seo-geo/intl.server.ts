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
  en: "GB",
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

const RESERVED = new Set(["city", "stadt", "ciudad", "stad", "cidade", "citta"]);

export function intlCityPayload(lang: string, slug: string) {
  if (RESERVED.has(slug)) return null;
  const hit = byLangSlug.get(`${lang}:${slug}`);
  if (!hit) return null;
  const { country, city, meta } = hit;
  const display =
    lang === "nl" && city.n_nl ? city.n_nl
    : lang === "de" && city.n_de ? city.n_de
    : lang === "fr" && city.n_fr ? city.n_fr
    : city.n;
  const nearby = city.nearby
    .map((s) => {
      const n = byLangSlug.get(`${lang}:${s}`);
      return n ? { s: n.city.s, n: lang === "nl" && n.city.n_nl ? n.city.n_nl : n.city.n } : null;
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
  };
}

export type IntlCityPayload = NonNullable<ReturnType<typeof intlCityPayload>>;

/** Native city URLs by country (for sitemaps). Priority-1 countries first (DE, ES, NL). */
export function intlNativeUrls(priorityMax = 1) {
  const out: Record<string, string[]> = {};
  for (const [cc, meta] of Object.entries(DATA.countries)) {
    if (meta.priority > priorityMax) continue;
    const lang = meta.lang;
    out[cc.toLowerCase()] = meta.cities.map((c) => `/${lang}/${c.s}`);
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
