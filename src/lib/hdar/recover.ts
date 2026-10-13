import { SUPABASE_KEY, SUPABASE_URL, confirmAdult, supabase } from "./session";
import { useHdar } from "./store";

/** Email facultatif lié au profil anonyme (Supabase Auth). Jamais affiché publiquement. */
export async function linkedEmail(): Promise<{ email: string | null; pending: string | null }> {
  const { data } = await supabase().auth.getUser();
  const u = data.user as (typeof data.user & { new_email?: string }) | null;
  return { email: u?.email || null, pending: u?.new_email || null };
}
export async function linkEmailStart(email: string) {
  const { error } = await supabase().auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw new Error(frErr(error.message));
}
export async function linkEmailVerify(email: string, code: string) {
  const { error } = await supabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email_change" });
  if (error) throw new Error(frErr(error.message));
}
export async function recoverStart(email: string, captchaToken?: string) {
  const { error } = await supabase().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, captchaToken } });
  if (error) throw new Error(frErr(error.message));
}

type Payload = { id: string; pseudo: string; age: number | null; bio: string | null; tags: string | null; photos: string[]; voice: string | null; voice_sec: number | null; note: string | null; has_profile: boolean };

/** Vérifie le code reçu, bascule sur le compte lié, recharge le profil sur cet appareil. */
export async function recoverVerify(email: string, code: string) {
  const sb = supabase();
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
  if (error || !data.session) throw new Error(frErr(error?.message || "Code invalide"));
  confirmAdult();
  const h = { apikey: SUPABASE_KEY, authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" };
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_claim`, { method: "POST", headers: h, body: JSON.stringify({ p_device: null }) });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_my_profile_full`, { method: "POST", headers: h, body: "{}" });
  const p = (await r.json()) as Payload | null;
  if (!p?.id || !p.has_profile) throw new Error("Aucun profil lié à cet email");
  localStorage.setItem("hdar-device", p.id);
  localStorage.setItem("hdar-owner", p.id);
  const photos = (p.photos ?? []).filter(Boolean);
  useHdar.getState().patchMe({
    pseudo: p.pseudo ?? "", age: p.age, adult: true, bio: p.bio ?? "", tags: (p.tags ? p.tags.split(",").filter(Boolean) : []) as never,
    photo: photos[0] ?? "", photos, voice: p.voice ?? undefined, voiceSec: p.voice_sec ?? 0, note: p.note ?? "", onboarded: true, email: email.trim().toLowerCase(),
  });
  await new Promise((res) => setTimeout(res, 300));
  window.location.assign("/");
}

function frErr(m: string) {
  if (/rate limit|too many|seconds/i.test(m)) return "Trop de demandes, réessaie dans une minute.";
  if (/expired|invalid/i.test(m)) return "Code invalide ou expiré.";
  if (/signups not allowed|not found|user not found/i.test(m)) return "Aucun profil lié à cet email.";
  if (/already been registered|already registered|exists/i.test(m)) return "Cet email est déjà lié à un autre profil.";
  return m;
}
