/**
 * Paiements : suspendus pendant le lancement (offre FIRST). Le code Stripe reste intact ;
 * mettre VITE_PAYMENTS_ENABLED=true (et PAYMENTS_ENABLED=true sur la fonction hdar-checkout) pour le rebrancher.
 */
import { create } from "zustand";
import { SUPABASE_KEY, SUPABASE_URL, accessToken } from "./session";

export const PAYMENTS_ENABLED = import.meta.env.VITE_PAYMENTS_ENABLED === "true";
export const FIRST_CODE = "FIRST";
export const FIRST_TOTAL = 5000;
export const SHARE_URL = "https://hdar.chat/?code=FIRST";

type Offer = { open: boolean; product: string | null; placeId: string | null; celebrate: { rank: number; city?: string | null } | null; welcome: boolean };
export const useLaunchOffer = create<Offer>(() => ({ open: false, product: null, placeId: null, celebrate: null, welcome: false }));
/** Remplace l'achat : ouvre la feuille « Offert pendant le lancement ». */
export const showLaunchOffer = (product: string | null = null, placeId: string | null = null) =>
  useLaunchOffer.setState({ open: true, product, placeId });

async function rpc<T>(fn: string, args: Record<string, unknown>, anon = false): Promise<T> {
  const token = anon ? SUPABASE_KEY : await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(e.message || `Serveur indisponible (${res.status})`);
  }
  return (await res.json()) as T;
}
export type FirstMe = { founder: boolean; rank?: number; city?: string | null; region?: string | null; remaining: number; profile_boost_at?: string | null; profile_boosts_left?: number; ad_boost_at?: string | null };
export const firstRemaining = () => rpc<number>("hdar_first_remaining", {}, true).then(Number).catch(() => null);
export const firstMe = () => rpc<FirstMe>("hdar_first_me", {});
export const firstRedeem = (code: string, region: string) =>
  rpc<{ rank: number; remaining: number; city: string | null; region: string | null; title: string; body: string }>("hdar_first_redeem", { p_code: code, p_region: region });
export const firstBoost = () => rpc<string>("hdar_first_boost", {});
export const firstAdBoost = (id: string) => rpc<string>("hdar_first_ad_boost", { p_id: id });
export const adminFirstStats = (key: string) =>
  rpc<{ redeemed: number; total: number; regions: { region: string; quota: number; used: number }[]; remaining: number; today: number; profile_boosts: number; ad_boosts: number }>("hdar_admin_first_stats", { p_key: key });

/** Quota régional (5000 répartis au prorata de la population INSEE). */
export type FirstRegion = { region: string; name: string; quota: number; remaining: number; global: number };
export const firstRegion = (region: string) => rpc<FirstRegion | null>("hdar_first_region", { p_region: region }, true).catch(() => null);
export const placesLabel = (n: number | null) => (n == null ? "" : n <= 0 ? "Plus aucune place" : `Plus que ${n} place${n > 1 ? "s" : ""}`);

/** Partage natif du bon plan (aperçu du lien : page d'accueil, texte sans contenu explicite). */
export async function shareFirst(remaining: number | null, region?: string | null) {
  const where = region ? (remaining != null && remaining > 0 ? ` : plus que ${remaining} en ${region}` : ` en ${region}`) : remaining != null && remaining > 0 ? ` (plus que ${remaining} places)` : "";
  const text = `hdar. : sorties et rencontres autour de toi, gratuit et discret. hdar+ offert à vie aux 5000 premiers avec le code FIRST${where} 🎁`;
  try {
    if (navigator.share) { await navigator.share({ title: "hdar+ offert aux 5000 premiers", text, url: SHARE_URL }); return "shared"; }
    await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
    return "copied";
  } catch {
    return "cancelled";
  }
}
