// hdar-live-token — jeton LiveKit. La personne qui diffuse publie caméra + micro et envoie les demandes (données).
// Les spectateurs peuvent publier caméra / micro (jamais d'écran partagé, jamais de données) après avoir accepté ;
// leurs pistes sont limitées au seul diffuseur (setTrackSubscriptionPermissions côté client, appliqué par le SFU).
// Nom vide pour les spectateurs : les autres spectateurs ne voient pas leur pseudo.
// Places limitées vérifiées en base (hdar_room_join, sérialisé) avant de signer le jeton.
// Secrets : LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (env) ou Vault via hdar_livekit_config (service_role).
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });
const SB = Deno.env.get("SUPABASE_URL")!;
type Cfg = { url: string; key: string; secret: string };
let cfgCache: { at: number; v: Cfg | null } | null = null;
export async function lkConfig(): Promise<Cfg | null> {
  const url = Deno.env.get("LIVEKIT_URL"), key = Deno.env.get("LIVEKIT_API_KEY"), secret = Deno.env.get("LIVEKIT_API_SECRET");
  if (url && key && secret) return { url, key, secret };
  if (cfgCache && Date.now() - cfgCache.at < 300000) return cfgCache.v;
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${SB}/rest/v1/rpc/hdar_livekit_config`, { method: "POST", headers: { apikey: srv, authorization: `Bearer ${srv}`, "content-type": "application/json" }, body: "{}" });
  const d = r.ok ? await r.json() : null;
  const v = d?.url && d?.key && d?.secret ? (d as Cfg) : null;
  cfgCache = { at: Date.now(), v };
  return v;
}
const b64u = (b: Uint8Array | string) => btoa(typeof b === "string" ? unescape(encodeURIComponent(b)) : String.fromCharCode(...b)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
export async function sign(c: Cfg, claims: Record<string, unknown>, ttl = 7200) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iss: c.key, nbf: now - 10, exp: now + ttl, ...claims }))}`;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(c.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${body}.${b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body))))}`;
}
async function userRpc(req: Request, fn: string, args: unknown) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, authorization: req.headers.get("authorization") ?? "", "content-type": "application/json" }, body: JSON.stringify(args) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.message || `rpc ${r.status}`);
  return d;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const cfg = await lkConfig();
    const body = await req.json().catch(() => ({}));
    if (body.check || !cfg) return json({ configured: !!cfg });
    if (!/^[0-9a-f-]{36}$/i.test(String(body.room ?? ""))) return json({ error: "room" }, 400);
    const j = await userRpc(req, "hdar_room_join", { p_room: body.room, p_lat: body.lat ?? null, p_lng: body.lng ?? null });
    const stage = j.role === "stage";
    const token = await sign(cfg, { sub: j.identity, name: stage ? j.pseudo ?? "" : "", video: { room: j.room, roomJoin: true, canSubscribe: true, canPublish: true, canPublishSources: ["camera", "microphone"], canPublishData: stage, canUpdateOwnMetadata: false, hidden: false, recorder: false } });
    return json({ configured: true, url: cfg.url, token, role: j.role, identity: j.identity });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "erreur" }, 400); }
});
