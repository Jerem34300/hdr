// hdar-checkout — crée une session Stripe Checkout (boost ou annonce partenaire) ou un lien vers le portail client.
// Appelée depuis le navigateur avec le jeton Supabase de l'utilisateur. Le produit, le prix et la propriété du lieu
// sont validés en base par hdar_checkout_prepare (jamais par le client).
// Secret requis : STRIPE_SECRET_KEY. Tant qu'il manque, répond { enabled: false } / 503 "not_configured".
const SITE = Deno.env.get("HDAR_SITE_URL") ?? "https://hdar.chat";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

async function rpc(fn: string, args: Record<string, unknown>, auth: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_ANON_KEY")!;
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) throw new Error((() => { try { return JSON.parse(t).message; } catch { return t; } })() || "Erreur");
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

// Secrets: env first, else Supabase Vault via service_role-only RPC hdar_stripe_secret (cached).
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
  if (req.method === "GET") return json({ enabled: !!key });
  if (!key) return json({ error: "not_configured", message: "Paiement bientôt disponible" }, 503);
  const auth = req.headers.get("authorization") ?? "";
  let body: { action?: string; product?: string; place_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Requête invalide" }, 400);
  }
  try {
    if (body.action === "portal") {
      const customer = await rpc("hdar_my_stripe_customer", {}, auth);
      if (!customer) return json({ message: "Aucun abonnement trouvé" }, 404);
      const s = await stripe("billing_portal/sessions", { customer, return_url: `${SITE}/pro` }, key);
      return json({ url: s.url });
    }
    const p = await rpc("hdar_checkout_prepare", { p_product: body.product, p_place: body.place_id ?? null }, auth);
    const meta: Record<string, string> = { user_id: p.user_id, product: p.product, place_id: p.place_id ?? "" };
    const recurring = p.kind === "listing" && p.interval;
    const params: Record<string, string> = {
      mode: recurring ? "subscription" : "payment",
      success_url: `${SITE}/pro?paid=1${p.kind === "boost" ? "#boost" : ""}`,
      cancel_url: `${SITE}/pro?cancel=1${p.kind === "boost" ? "#boost" : ""}`,
      client_reference_id: p.user_id,
      locale: "fr",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(p.price_cents),
      "line_items[0][price_data][product_data][name]":
        p.kind === "boost" ? `hdar · Boost ${p.label}` : `hdar · Lieu partenaire « ${p.place_name ?? ""} » · ${p.label}`,
    };
    for (const [k, v] of Object.entries(meta)) params[`metadata[${k}]`] = v;
    if (recurring) {
      params["line_items[0][price_data][recurring][interval]"] = p.interval;
      params["line_items[0][price_data][recurring][interval_count]"] = String(p.interval_count ?? 1);
      for (const [k, v] of Object.entries(meta)) params[`subscription_data[metadata][${k}]`] = v;
    }
    const s = await stripe("checkout/sessions", params, key);
    return json({ url: s.url });
  } catch (e) {
    return json({ message: e instanceof Error ? e.message : "Erreur" }, 400);
  }
});
