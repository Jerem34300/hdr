// hdar-livekit-webhook — événements LiveKit (participant parti, salon terminé) -> base. Signature JWT vérifiée (sha256 du corps).
const SB = Deno.env.get("SUPABASE_URL")!, SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function secret(): Promise<{ key: string; secret: string } | null> {
  const key = Deno.env.get("LIVEKIT_API_KEY"), s = Deno.env.get("LIVEKIT_API_SECRET");
  if (key && s) return { key, secret: s };
  const r = await fetch(`${SB}/rest/v1/rpc/hdar_livekit_config`, { method: "POST", headers: { apikey: SRV, authorization: `Bearer ${SRV}`, "content-type": "application/json" }, body: "{}" });
  const d = r.ok ? await r.json() : null;
  return d?.key && d?.secret ? d : null;
}
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
async function verify(auth: string, body: string, c: { key: string; secret: string }) {
  const [h, p, sig] = auth.replace(/^Bearer\s+/i, "").split(".");
  if (!h || !p || !sig) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(c.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("HMAC", k, unb64u(sig), new TextEncoder().encode(`${h}.${p}`)))) return false;
  const claims = JSON.parse(new TextDecoder().decode(unb64u(p)));
  if (claims.iss !== c.key || (claims.exp && claims.exp < Date.now() / 1000)) return false;
  const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))));
  return claims.sha256 === hash;
}
Deno.serve(async (req) => {
  const body = await req.text();
  const c = await secret();
  if (!c || !(await verify(req.headers.get("authorization") ?? "", body, c))) return new Response("unauthorized", { status: 401 });
  const ev = JSON.parse(body);
  const room = ev.room?.name;
  if (/^[0-9a-f-]{36}$/i.test(room ?? "") && (ev.event === "participant_left" || ev.event === "room_finished")) {
    await fetch(`${SB}/rest/v1/rpc/hdar_room_webhook`, { method: "POST", headers: { apikey: SRV, authorization: `Bearer ${SRV}`, "content-type": "application/json" },
      body: JSON.stringify({ p_event: ev.event, p_room: room, p_user: ev.participant?.identity ?? null }) });
  }
  // Garde-fou serveur : une piste publiée par un spectateur n'est jamais servie aux autres spectateurs,
  // même si son appli ne pose pas les permissions (le diffuseur est le seul à pouvoir publier des données).
  if (/^[0-9a-f-]{36}$/i.test(room ?? "") && ev.event === "track_published" && ev.participant && !(ev.participant.permission?.can_publish_data ?? ev.participant.permission?.canPublishData)) {
    await shield(c, room, ev.participant.identity, ev.track?.sid).catch(() => undefined);
  }
  return new Response("ok");
});
const b64u = (b: Uint8Array | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function lk(c: { key: string; secret: string }, room: string, method: string, args: unknown) {
  const url = Deno.env.get("LIVEKIT_URL") ?? (await (await fetch(`${SB}/rest/v1/rpc/hdar_livekit_config`, { method: "POST", headers: { apikey: SRV, authorization: `Bearer ${SRV}`, "content-type": "application/json" }, body: "{}" })).json()).url;
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iss: c.key, nbf: now - 10, exp: now + 120, video: { roomAdmin: true, room } }))}`;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(c.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const tok = `${body}.${b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body))))}`;
  const r = await fetch(`${String(url).replace(/^ws/, "http")}/twirp/livekit.RoomService/${method}`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  return r.ok ? r.json() : {};
}
async function shield(c: { key: string; secret: string }, room: string, from: string, sid?: string) {
  if (!sid) return;
  const l = await lk(c, room, "ListParticipants", { room });
  type P = { identity: string; permission?: { can_publish_data?: boolean; canPublishData?: boolean } };
  for (const p of (l.participants ?? []) as P[]) {
    if (p.identity === from || p.permission?.can_publish_data || p.permission?.canPublishData) continue;
    await lk(c, room, "UpdateSubscriptions", { room, identity: p.identity, track_sids: [sid], subscribe: false });
  }
}
