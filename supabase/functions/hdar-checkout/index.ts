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
  let body: { action?: string; product?: string; place_id?: string | null; back?: string };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Requête invalide" }, 400);
  }
  try {
    if (body.action === "portal") {
      const customer = await rpc("hdar_my_stripe_customer", {}, auth);
      if (!customer) return json({ message: "Aucun abonnement trouvé" }, 404);
      const s = await stripe("billing_portal/sessions", { customer, return_url: `${SITE}${body.back === "premium" ? "/premium" : body.back === "boost" ? "/boost" : "/pro"}` }, key);
      return json({ url: s.url });
    }
    const p = await rpc("hdar_checkout_prepare", { p_product: body.product, p_place: body.place_id ?? null }, auth);
    const meta: Record<string, string> = { user_id: p.user_id, product: p.product, place_id: p.place_id ?? "" };
    const isBoost = p.kind === "boost" || p.kind === "place_boost" || p.kind === "pro_boost";
    const isPrem = p.kind === "premium";
    const isHearts = p.kind === "hearts";
    const recurring = (p.kind === "listing" || isPrem) && p.interval;
    const back = isHearts ? "/live" : isPrem ? "/premium" : p.kind === "pro_boost" ? "/pro" : isBoost ? "/boost" : "/pro";
    const params: Record<string, string> = {
      mode: recurring ? "subscription" : "payment",
      success_url: `${SITE}${back}?paid=1`,
      cancel_url: `${SITE}${back}?cancel=1`,
      client_reference_id: p.user_id,
      locale: "fr",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(p.price_cents),
      "line_items[0][price_data][product_data][name]":
        isHearts ? `Cœurs du Live · ${p.label}` : isPrem ? `hdar+ · ${p.label}` : p.kind === "boost" ? `Boost hdar · ${p.label}` : p.kind === "pro_boost" ? `Boost Pro « ${p.place_name ?? ""} » · ${p.label}` : p.kind === "place_boost" ? `Boost du lieu « ${p.place_name ?? ""} » · ${p.label}` : `Lieu partenaire « ${p.place_name ?? ""} » · ${p.label}`,
      "line_items[0][price_data][product_data][description]":
        isHearts
          ? "Des cœurs à envoyer dans le Live hdar. Sans valeur monétaire, non remboursables."
          : isPrem
          ? "20 photos d'album, filtres de la carte, qui t'a vu et mis en favori, recherche par pseudo, badge hdar+. Résiliable à tout moment."
          : p.kind === "pro_boost"
          ? "Pin doré sur la carte, en tête « À la une » des Lieux et priorité dans le Live Pro."
          : p.kind === "place_boost"
          ? "Ton lieu brille sur la carte hdar, passe en tête de la liste Lieux et reste ouvert pendant tout le boost."
          : p.kind === "boost"
          ? "Ton profil brille plus fort sur la carte hdar et remonte en tête autour de toi."
          : "Ta fiche mise en avant sur la carte hdar : halo, photos, lien vers ton site et stats de visites.",
      "line_items[0][price_data][product_data][images][0]": `${SITE}/boost-cover.jpg`,
      "custom_text[submit][message]":
        isHearts ? "Tes cœurs arrivent dès le paiement ❤️" : isPrem ? "hdar+ s'active dès le paiement ✨" : isBoost ? "Ton boost s'active dès le paiement ✨" : "Ta fiche apparaît sur la carte dès le paiement ✨",
      // Habillage de la page Checkout (l'API refuse de modifier le branding du compte lui-même).
      "branding_settings[display_name]": "hdar",
      "branding_settings[background_color]": "#0B0B10",
      "branding_settings[button_color]": "#FA6F6C",
      "branding_settings[border_style]": "rounded",
      "branding_settings[icon][type]": "file",
      "branding_settings[icon][file]": Deno.env.get("HDAR_STRIPE_ICON_FILE") ?? "file_1UPtQgLsLZMIGwHyI0tfd8uV",
      "branding_settings[logo][type]": "file",
      "branding_settings[logo][file]": Deno.env.get("HDAR_STRIPE_LOGO_FILE") ?? "file_1UPtQhLsLZMIGwHy9GvdN8M2",
    };
    // payment_method_types n'est plus accepté : on exclut les moyens inutiles (reste carte + Link + wallets).
    ["klarna", "bancontact", "amazon_pay", "eps", "mb_way", "satispay"].forEach((m, i) => (params[`excluded_payment_method_types[${i}]`] = m));
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
