/**
 * Anonymous Supabase Auth session. No email, no identity: each device gets a
 * real auth.uid() after the one-time 18+ confirmation. The server derives the
 * caller from that JWT, never from a client-supplied id.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  import.meta.env.VITE_HDAR_SUPABASE_URL || "https://hoomzhgqzwuystwburfa.supabase.co";
export const SUPABASE_KEY =
  import.meta.env.VITE_HDAR_SUPABASE_KEY || "sb_publishable_BWmk7ZH_jG2Vp2muud3w_w_TllpzneU";

const ADULT_KEY = "hdar-adult";
const DEVICE_KEY = "hdar-device";

let client: SupabaseClient | null = null;
export function supabase() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export function adultConfirmed() {
  return typeof localStorage !== "undefined" && localStorage.getItem(ADULT_KEY) === "1";
}
export function confirmAdult() {
  localStorage.setItem(ADULT_KEY, "1");
}

let pending: Promise<string> | null = null;

/** Ensures an anonymous session and binds it to this device's hdar id. Returns the access token. */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAAFUvihI1by_YuomX";

let captchaToken: string | undefined;
/** Turnstile token from the first-visit screen; consumed by the next anonymous sign-in. */
export function setCaptchaToken(token: string | undefined) {
  captchaToken = token;
}

export async function hasSession() {
  const { data } = await supabase().auth.getSession();
  return !!data.session;
}

export function ensureSession(): Promise<string> {
  if (!pending) {
    pending = (async () => {
      if (!adultConfirmed()) throw new Error("Confirme avoir 18 ans ou plus");
      const sb = supabase();
      let { data } = await sb.auth.getSession();
      if (!data.session) {
        const res = await sb.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
        captchaToken = undefined;
        if (res.error || !res.data.session) throw new Error(res.error?.message || "Connexion impossible");
        data = { session: res.data.session };
      }
      // Bind (once) the legacy device id to auth.uid(); the server returns the canonical id.
      const legacy = localStorage.getItem(DEVICE_KEY);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_claim`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          authorization: `Bearer ${data.session!.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_device: legacy }),
      });
      if (res.ok) {
        const id = (await res.json()) as string;
        if (id) localStorage.setItem(DEVICE_KEY, id);
      }
      return data.session!.access_token;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

export async function accessToken(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  if (data.session && localStorage.getItem(DEVICE_KEY)) return data.session.access_token;
  return ensureSession();
}

export async function authUserId(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/** After account deletion: forget the session and every local hdar key (the 18+ choice is kept). */
export async function wipeLocalSession() {
  try {
    await supabase().auth.signOut({ scope: "local" });
  } catch {
    // session is already gone server-side
  }
  for (const k of Object.keys(localStorage)) {
    if (k === ADULT_KEY) continue;
    if (k.startsWith("hdar") || k.startsWith("sb-")) localStorage.removeItem(k);
  }
}
