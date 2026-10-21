import { SUPABASE_KEY, SUPABASE_URL, accessToken } from "./session";
import { startCheckout } from "./live";
import { PAYMENTS_ENABLED } from "./payments";

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(e.message || `Serveur indisponible (${res.status})`);
  }
  return (await res.json().catch(() => null)) as T;
}

/** Consentement art. 9 RGPD, horodaté en base. */
export const setSensitiveConsent = (on: boolean) => call<string | null>("hdar_sensitive_consent", { p_on: on });
export const getSensitiveConsent = async () => !!(await call<string | null>("hdar_sensitive_consent_get", {}));

let waiverOk = false;
const subs = new Set<(v: boolean) => void>();
export const getWaiver = () => waiverOk;
export const setWaiver = (v: boolean) => { waiverOk = v; subs.forEach((f) => f(v)); };
export const onWaiver = (f: (v: boolean) => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** Checkout gardé par la renonciation au droit de rétractation (L221-28). */
export async function checkoutWithWaiver(product: string, placeId: string | null) {
  if (!PAYMENTS_ENABLED) return startCheckout(product, placeId); // offre de lancement, pas de paiement
  if (!waiverOk) throw new Error("Coche d'abord la case « exécution immédiate » sous les prix.");
  return startCheckout(product, placeId);
}
