// hdar-stripe-webhook — reçoit les événements Stripe, vérifie la signature (STRIPE_WEBHOOK_SECRET),
// puis active / prolonge l'annonce ou le boost via hdar_payment_apply (service_role, idempotent).
// Événements : checkout.session.completed, invoice.paid (renouvellements), customer.subscription.updated/deleted, charge.refunded.
const enc = new TextEncoder();

async function verify(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]).filter((x) => x.length === 2));
  const sigs = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  const t = parts.t;
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${t}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
}

type Meta = { user_id?: string; product?: string; place_id?: string };
const apply = (ref: string, m: Meta, amount: number, currency: string, sub: string | null, customer: string | null) =>
  rpc("hdar_payment_apply", {
    p_ref: ref, p_user: m.user_id, p_product: m.product, p_place: m.place_id || null,
    p_amount: amount, p_currency: currency, p_subscription: sub, p_customer: customer,
  });

// Secrets: env first, else Supabase Vault via service_role-only RPC hdar_stripe_secret (cached).
const _sec: Record<string, string | null> = {};
async function getSecret(env: string, name: string): Promise<string | null> {
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
  const secret = await getSecret("STRIPE_WEBHOOK_SECRET", "stripe_webhook_secret");
  if (!secret) return new Response("not configured", { status: 503 });
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get("stripe-signature") ?? "", secret))) return new Response("bad signature", { status: 400 });
  // deno-lint-ignore no-explicit-any
  const ev = JSON.parse(payload) as { type: string; data: { object: any } };
  const o = ev.data.object;
  try {
    if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
      if (o.payment_status === "paid" || o.payment_status === "no_payment_required") {
        await apply(o.id, o.metadata ?? {}, o.amount_total ?? 0, o.currency ?? "eur", o.subscription ?? null, o.customer ?? null);
        if (o.payment_intent) await rpc("hdar_payment_meta", { p_ref: o.id, p_pi: typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent.id });
      }
    } else if (ev.type === "invoice.paid") {
      if (o.billing_reason === "subscription_cycle") {
        const det = o.parent?.subscription_details ?? o.subscription_details ?? {};
        const meta: Meta = det.metadata ?? o.lines?.data?.[0]?.metadata ?? {};
        const sub = det.subscription ?? o.subscription ?? null;
        await apply(o.id, meta, o.amount_paid ?? 0, o.currency ?? "eur", typeof sub === "string" ? sub : sub?.id ?? null, o.customer ?? null);
      }
    } else if (ev.type === "account.updated") {
      await rpc("hdar_amb_account_status", { p_account: o.id, p_enabled: !!(o.payouts_enabled && o.capabilities?.transfers === "active") });
    } else if (ev.type === "charge.refunded") {
      const pi = typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id ?? null;
      const inv = typeof o.invoice === "string" ? o.invoice : o.invoice?.id ?? null;
      await rpc("hdar_payment_refund", { p_pi: pi, p_ref: inv, p_refunded: o.amount_refunded ?? 0 });
    } else if (ev.type === "customer.subscription.deleted") {
      await rpc("hdar_subscription_status", { p_subscription: o.id, p_status: "cancelled" });
    } else if (ev.type === "customer.subscription.updated") {
      await rpc("hdar_subscription_status", { p_subscription: o.id, p_status: o.cancel_at_period_end ? "cancelling" : o.status });
    }
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 }); // Stripe réessaiera
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
