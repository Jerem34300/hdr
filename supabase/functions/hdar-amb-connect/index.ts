// hdar-amb-connect — onboarding Stripe Connect Express des ambassadeurs (identité, IBAN, SIRET collectés par Stripe, jamais par hdar).
// POST { action: "onboard" | "dashboard" } avec le jeton Supabase de l'ambassadeur.
const SITE = Deno.env.get("HDAR_SITE_URL") ?? "https://hdar.chat";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });
async function rpc(fn: string, args: Record<string, unknown>, auth?: string) {
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${fn}`, { method: "POST",
    headers: { apikey: auth ? Deno.env.get("SUPABASE_ANON_KEY")! : sk, authorization: auth ?? `Bearer ${sk}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : null;
}
async function stripe(path: string, params: Record<string, string>, key: string) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error?.message ?? "Stripe");
  return b;
}
const _sec: Record<string, string | null> = {};
async function secret(env: string, name: string): Promise<string | null> {
  const e = Deno.env.get(env);
  if (e) return e;
  if (_sec[name]) return _sec[name];
  try {
    const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/hdar_stripe_secret`, {
      method: "POST",
      headers: { apikey: k, authorization: `Bearer ${k}`, "content-type": "application/json" },
      body: JSON.stringify({ p_name: name }),
    });
    const v = r.ok ? await r.json() : null;
    const ok = typeof v === "string" && v.length > 20 ? v : null;
    if (ok) _sec[name] = ok;
    return ok;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = await secret("STRIPE_SECRET_KEY", "stripe_secret_key");
  if (!key) return json({ error: "not_configured" }, 503);
  const auth = req.headers.get("authorization");
  if (!auth) return json({ error: "auth" }, 401);
  try {
    const me = await rpc("hdar_amb_connect_self", {}, auth) as { user_id: string; code: string; account: string | null } | null;
    if (!me) return json({ error: "Réservé aux ambassadeurs ayant accepté la charte" }, 403);
    const { action } = await req.json().catch(() => ({ action: "onboard" }));
    let acct = me.account;
    if (!acct) {
      try {
        const a = await stripe("accounts", { type: "express", country: "FR", business_type: "individual", "capabilities[transfers][requested]": "true",
          "business_profile[product_description]": "Ambassadeur hdar (apport d'affaires)", "metadata[hdar_amb]": me.code }, key);
        acct = a.id as string;
      } catch (e) {
        const m = String((e as Error).message);
        if (/connect/i.test(m)) return json({ error: "connect_disabled", message: m }, 503);
        throw e;
      }
      await rpc("hdar_amb_set_account", { p_user: me.user_id, p_account: acct });
    }
    if (action === "dashboard") {
      const l = await stripe(`accounts/${acct}/login_links`, {}, key);
      return json({ url: l.url });
    }
    const l = await stripe("account_links", { account: acct!, type: "account_onboarding",
      refresh_url: `${SITE}/ambassadeur?connect=retry`, return_url: `${SITE}/ambassadeur?connect=done` }, key);
    return json({ url: l.url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
