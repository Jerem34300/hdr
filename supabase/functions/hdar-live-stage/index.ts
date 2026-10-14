// hdar-live-stage — actions LiveKit côté serveur après vérification en base avec le jeton de l'utilisateur :
// remove / kick (faire sortir un spectateur / l'expulser 24 h), kill (admin), usage (admin).
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });
const SB = Deno.env.get("SUPABASE_URL")!;
type Cfg = { url: string; key: string; secret: string };
let cfgCache: { at: number; v: Cfg | null } | null = null;
async function lkConfig(): Promise<Cfg | null> {
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
async function sign(c: Cfg, claims: Record<string, unknown>, ttl = 600) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iss: c.key, nbf: now - 10, exp: now + ttl, ...claims }))}`;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(c.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${body}.${b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body))))}`;
}
async function lk(c: Cfg, method: string, room: string | null, args: unknown) {
  const tok = await sign(c, { video: room ? { roomAdmin: true, roomCreate: true, room } : { roomList: true, roomAdmin: true } }); // DeleteRoom exige roomCreate
  const r = await fetch(`${c.url.replace(/^ws/, "http")}/twirp/livekit.RoomService/${method}`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok && !/not.?found/i.test(t)) throw new Error(`livekit ${method} ${r.status}`);
  return t ? JSON.parse(t) : {};
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
    const c = await lkConfig();
    if (!c) return json({ configured: false });
    const { action, room, user } = await req.json();
    if (action !== "usage" && !/^[0-9a-f-]{36}$/i.test(String(room ?? ""))) return json({ error: "room" }, 400);
    if (action === "remove" || action === "kick") {
      // l'hôte fait sortir un spectateur (kick : 24 h) ; vérifié en base avec le jeton de l'hôte
      const r = await userRpc(req, "hdar_room_remove", { p_room: room, p_user: user, p_kick: action === "kick" });
      await lk(c, "RemoveParticipant", room, { room, identity: r.identity });
      return json({ ok: true });
    }
    if (action === "kill") {
      await userRpc(req, "hdar_admin_room_kill", { p_key: "", p_room: room });
      await lk(c, "DeleteRoom", room, { room });
      return json({ ok: true });
    }
    if (action === "usage") {
      await userRpc(req, "hdar_admin_live_rooms", { p_key: "" });
      const l = await lk(c, "ListRooms", null, {});
      const rooms = (l.rooms ?? []) as { name: string; num_participants?: number; numParticipants?: number }[];
      return json({ ok: true, rooms: rooms.length, participants: rooms.reduce((n, r) => n + Number(r.num_participants ?? r.numParticipants ?? 0), 0) });
    }
    return json({ error: "action" }, 400);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "erreur" }, 400); }
});
