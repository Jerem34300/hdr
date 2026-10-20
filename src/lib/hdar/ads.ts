/** Petites annonces : appels RPC (hdar_ad_*), régions, catégories, durées et tarifs du boost. */
import { SUPABASE_KEY, SUPABASE_URL, accessToken } from "./session";
import { regionAt } from "./regions";

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Serveur indisponible (${res.status})`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const AD_CATEGORIES = [
  { id: "rencontre", label: "Rencontre", icon: "💘" },
  { id: "sortie", label: "Sortie", icon: "🌙" },
  { id: "kink", label: "Kink", icon: "⛓️" },
  { id: "exhib", label: "Exhib", icon: "👀" },
  { id: "autre", label: "Autre", icon: "✨" },
] as const;
export type AdCategory = (typeof AD_CATEGORIES)[number]["id"];

/** Régions (slugs identiques aux pages /rencontre/region/…). */
export const AD_REGIONS: { s: string; n: string }[] = [
  { s: "auvergne-rhone-alpes", n: "Auvergne-Rhône-Alpes" }, { s: "bourgogne-franche-comte", n: "Bourgogne-Franche-Comté" },
  { s: "bretagne", n: "Bretagne" }, { s: "centre-val-de-loire", n: "Centre-Val de Loire" }, { s: "corse", n: "Corse" },
  { s: "grand-est", n: "Grand Est" }, { s: "hauts-de-france", n: "Hauts-de-France" }, { s: "ile-de-france", n: "Île-de-France" },
  { s: "normandie", n: "Normandie" }, { s: "nouvelle-aquitaine", n: "Nouvelle-Aquitaine" }, { s: "occitanie", n: "Occitanie" },
  { s: "pays-de-la-loire", n: "Pays de la Loire" }, { s: "provence-alpes-cote-d-azur", n: "Provence-Alpes-Côte d'Azur" },
  { s: "outre-mer", n: "Outre-mer" },
];
const CODE_TO_SLUG: Record<string, string> = {
  occitanie: "occitanie", paca: "provence-alpes-cote-d-azur", idf: "ile-de-france", ara: "auvergne-rhone-alpes",
  naq: "nouvelle-aquitaine", hdf: "hauts-de-france", ge: "grand-est", bre: "bretagne", pdl: "pays-de-la-loire",
  nor: "normandie", bfc: "bourgogne-franche-comte", cvl: "centre-val-de-loire", cor: "corse", om: "outre-mer",
};
export const regionName = (s: string) => AD_REGIONS.find((r) => r.s === s)?.n ?? s;
export const regionFromPos = (lat: number, lng: number) => CODE_TO_SLUG[regionAt(lat, lng)] ?? "ile-de-france";
export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const AD_DURATIONS = [
  { hours: 24, label: "24 h", premium: false },
  { hours: 72, label: "3 jours", premium: false },
  { hours: 168, label: "7 jours", premium: false },
  { hours: 336, label: "14 jours", premium: true },
  { hours: 720, label: "30 jours", premium: true },
] as const;
export const MAX_ACTIVE_ADS = 3;
export const MAX_ACTIVE_ADS_PLUS = 10;

export type BoostScope = "ville" | "region" | "france" | "monde";
/** Tarifs (centimes) — reflet de hdar.pricing (produits ad_boost_<portée>_<24h|7d>), la base fait foi. */
export const AD_BOOSTS: { scope: BoostScope; label: string; hint: string; d24: number; d7: number }[] = [
  { scope: "ville", label: "Ville", hint: "En tête des annonces de ta ville", d24: 199, d7: 599 },
  { scope: "region", label: "Région", hint: "En tête de toutes les annonces de ta région", d24: 399, d7: 1199 },
  { scope: "france", label: "France", hint: "En tête des annonces partout en France", d24: 699, d7: 1999 },
  { scope: "monde", label: "Monde", hint: "En tête de toutes les listes, partout", d24: 999, d7: 2999 },
];
export const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";

export type Ad = {
  id: string; user_id: string; pseudo: string; title: string; body: string; category: AdCategory;
  region: string; city: string; city_slug: string; photos: string[]; created_at: string; expires_at: string;
  mine: boolean; boost_scope: BoostScope | null; boost_until: string | null; hidden?: boolean; replies?: number;
  premium?: boolean; lat?: number | null; lng?: number | null; km?: number | null;
};
export type AdminAd = Ad & { status: "active" | "expired" | "hidden"; reports: number; open_reports: number; reasons: string[] | null };

export const listAds = (region: string, city: string, category: string, offset = 0, near?: { lat: number; lng: number } | null) =>
  rpc<Ad[]>("hdar_ads_list", {
    p_region: region || null, p_city: city || null, p_category: category || null, p_offset: offset,
    p_lat: near?.lat ?? null, p_lng: near?.lng ?? null, p_near: !!near,
  });
export type AdPin = { id: string; lat: number; lng: number; category: AdCategory; title: string; boosted: boolean };
export const adPins = (b: { s: number; w: number; n: number; e: number }) => rpc<AdPin[]>("hdar_ads_pins", { p_s: b.s, p_w: b.w, p_n: b.n, p_e: b.e });
export type AdsStatus = { premium: boolean; limit: number; active: number; free_boost: boolean };
export const adsStatus = () => rpc<AdsStatus>("hdar_ads_status", {});
export const freeBoost = (id: string) => rpc<string>("hdar_ad_free_boost", { p_id: id });
/** Distance affichée, toujours approximative. */
export const kmLabel = (km: number | null | undefined) => (km == null ? "" : km < 1 ? "à moins de 1 km" : `à ~${Math.round(km)} km`);
const ADS_LAYER = "hdar-ads-layer";
export const adsLayerOn = () => typeof localStorage !== "undefined" && localStorage.getItem(ADS_LAYER) === "on";
export const setAdsLayer = (on: boolean) => localStorage.setItem(ADS_LAYER, on ? "on" : "off");
export const getAd = (id: string) => rpc<Ad | null>("hdar_ad_get", { p_id: id });
export const myAds = () => rpc<Ad[]>("hdar_ads_mine", {});
export const createAd = (a: { title: string; body: string; category: AdCategory; region: string; city: string; hours: number; photos: string[]; pos?: { lat: number; lng: number } | null }) =>
  rpc<string>("hdar_ad_create", {
    p_title: a.title.trim(), p_body: a.body.trim(), p_category: a.category, p_region: a.region, p_city: a.city.trim(),
    p_city_slug: slugify(a.city) || "ville", p_hours: a.hours, p_photos: a.photos,
    p_lat: a.pos?.lat ?? null, p_lng: a.pos?.lng ?? null,
  });
export const deleteAd = (id: string) => rpc("hdar_ad_delete", { p_id: id });
export const reportAd = (id: string, reason: string) => rpc("hdar_ad_report", { p_id: id, p_reason: reason });
/** Envoie la réponse en message privé (avec la citation de l'annonce) ; renvoie l'id de l'auteur. */
export const replyAd = (id: string, body: string) => rpc<string>("hdar_ad_reply", { p_id: id, p_body: body });

export const adminAds = {
  list: (key: string, status: string, city: string, category: string) =>
    rpc<AdminAd[]>("hdar_admin_ads", { p_key: key, p_status: status || null, p_city: city || null, p_category: category || null }),
  setHidden: (key: string, id: string, hidden: boolean) => rpc("hdar_admin_ad_set", { p_key: key, p_id: id, p_hidden: hidden }),
  remove: (key: string, id: string) => rpc("hdar_admin_ad_delete", { p_key: key, p_id: id }),
};

/** Citation d'annonce en tête d'un message privé : « [[ad:<uuid>|<titre>]]\n<texte> ». */
const QUOTE = /^\[\[ad:([0-9a-f-]{36})\|([^\]]{0,80})\]\]\n?/i;
export function parseAdQuote(body: string): { id: string; title: string; rest: string } | null {
  const m = QUOTE.exec(body || "");
  return m ? { id: m[1], title: m[2], rest: body.slice(m[0].length) } : null;
}

/** Partage : lien /annonces/<id> (dans l'appli, 18+, noindex) ; aperçu générique côté serveur. */
export async function shareAd(ad: Ad): Promise<"shared" | "copied" | "none"> {
  const url = `${window.location.origin}/annonces/${ad.id}`;
  const text = `Une annonce t'attend sur hdar.chat · ${ad.city}`;
  if (navigator.share) {
    try { await navigator.share({ title: "hdar.", text, url }); return "shared"; }
    catch (e) { if (e instanceof DOMException && e.name === "AbortError") return "none"; }
  }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { window.prompt("Copie le lien :", url); return "none"; }
}
