// hdar-amb-payouts — appelée par pg_cron le 1er de chaque mois (x-cron-key). Crée un Stripe Transfer par ambassadeur
// dont le solde dû (commissions sur paiements réellement encaissés, remboursements déduits) atteint le seuil.
async function rpc(fn: string, args: Record<string, unknown>) {
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${fn}`, { method: "POST",
    headers: { apikey: sk, authorization: `Bearer ${sk}`, "content-type": "application/json" }, body: JSON.stringify(args) });
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
  const expected = await rpc("hdar_amb_cron_key", {});
  if (!expected || req.headers.get("x-cron-key") !== expected) return new Response("forbidden", { status: 403 });
  const key = await secret("STRIPE_SECRET_KEY", "stripe_secret_key");
  if (!key) return new Response("not configured", { status: 503 });
  const list = await rpc("hdar_amb_payout_batch", {}) as { user_id: string; account: string; cents: number }[];
  const month = new Date().toISOString().slice(0, 7);
  const out = [];
  for (const a of list) {
    try {
      const r = await fetch("https://api.stripe.com/v1/transfers", { method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `hdar-amb-${a.user_id}-${month}` },
        body: new URLSearchParams({ amount: String(a.cents), currency: "eur", destination: a.account, description: `Commissions ambassadeur hdar ${month}`, "metadata[hdar_amb]": a.user_id }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Stripe");
      await rpc("hdar_amb_payout_record", { p_user: a.user_id, p_cents: a.cents, p_transfer: b.id, p_status: "paid", p_error: null });
      out.push({ ok: true });
    } catch (e) {
      await rpc("hdar_amb_payout_record", { p_user: a.user_id, p_cents: a.cents, p_transfer: null, p_status: "failed", p_error: (e as Error).message });
      out.push({ ok: false });
    }
  }
  return new Response(JSON.stringify({ processed: out.length }), { headers: { "content-type": "application/json" } });
});
