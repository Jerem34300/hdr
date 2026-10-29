import { create } from "zustand";

/** Codes pays proposés pour les salons « Général » (mêmes codes que hdar.countries, v102). */
export const COUNTRIES = ["FR","BE","CH","LU","MC","CA","US","GB","IE","ES","PT","IT","DE","AT","NL","DK","SE","NO","FI","PL","CZ","GR","RO","HU","HR","BG","TR","MA","DZ","TN","EG","SN","CI","CM","LB","AE","SA","QA","IL","MX","BR","AR","CL","CO","PE","AU","NZ","JP","TH","IN","ZA","AD","MT","CY"] as const;
const KEY = "hdar-country";
const CACHE = "hdar-country-geo";

/** Pays de la langue du téléphone (fr-BE -> BE), repli France. */
function fromLocale(): string {
  if (typeof navigator === "undefined") return "FR";
  for (const l of navigator.languages ?? [navigator.language]) {
    const r = /-([A-Z]{2})$/i.exec(l || "")?.[1]?.toUpperCase();
    if (r && (COUNTRIES as readonly string[]).includes(r)) return r;
  }
  return "FR";
}
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

export const useCountry = create<{ auto: string | null; autoRegion: string | null; chosen: string | null; choose: (cc: string | null) => void }>((set) => ({
  auto: null,
  autoRegion: null,
  chosen: typeof window === "undefined" ? null : read(KEY),
  choose: (cc) => {
    try { if (cc) localStorage.setItem(KEY, cc); else localStorage.removeItem(KEY); } catch { /* ignore */ }
    set({ chosen: cc });
  },
}));
export const currentCountry = (s: { auto: string | null; chosen: string | null }) => s.chosen ?? s.auto ?? fromLocale();

/** Pays depuis la position (géocodage inverse OSM, une fois par zone de ~10 km, mis en cache). La position n'est jamais envoyée précisément : arrondie à 0,1°. */
export async function detectCountry(lat: number, lng: number) {
  const la = lat.toFixed(1), lo = lng.toFixed(1), cell = `${la},${lo}`;
  try {
    const c = JSON.parse(read(CACHE) || "null") as { cell: string; cc: string; rg?: string | null } | null;
    if (c?.cell === cell && "rg" in c) { useCountry.setState({ auto: c.cc, autoRegion: c.rg ?? null }); return; }
  } catch { /* ignore */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&lat=${la}&lon=${lo}`, { headers: { "Accept-Language": "en" } });
    const j = (await r.json()) as { address?: { country_code?: string; "ISO3166-2-lvl4"?: string } };
    const rg = j.address?.["ISO3166-2-lvl4"] ?? null;
    const cc = j.address?.country_code?.toUpperCase();
    if (cc && (COUNTRIES as readonly string[]).includes(cc)) {
      useCountry.setState({ auto: cc, autoRegion: rg });
      try { localStorage.setItem(CACHE, JSON.stringify({ cell, cc, rg })); } catch { /* ignore */ }
    }
  } catch { /* réseau : on garde la langue du téléphone */ }
}
