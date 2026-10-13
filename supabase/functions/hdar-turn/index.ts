// hdar-turn — identifiants TURN Cloudflare de courte durée (4 h) pour le Live.
// Secrets requis : CF_TURN_KEY_ID et CF_TURN_KEY_TOKEN (Cloudflare → Realtime → TURN Server).
// Tant qu'ils manquent, répond { iceServers: [] } : le Live marche alors en STUN seul.
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const id = Deno.env.get("CF_TURN_KEY_ID"), tok = Deno.env.get("CF_TURN_KEY_TOKEN");
  if (!id || !tok) return json({ iceServers: [], configured: false });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ ttl: 14400 }),
    });
    const d = await r.json();
    const list = Array.isArray(d.iceServers) ? d.iceServers : d.iceServers ? [d.iceServers] : [];
    return json({ iceServers: list, configured: true });
  } catch {
    return json({ iceServers: [], configured: true, error: true });
  }
});
