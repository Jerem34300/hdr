// hdar-turn — serveurs TURN pour le Live et les appels vidéo.
// Metered (METERED_TURN_API_KEY + METERED_DOMAIN) en priorité, Cloudflare (CF_TURN_KEY_ID/TOKEN) en secours. Cache 5 min.
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, "content-type": "application/json" } });
let cache: { at: number; list: unknown[] } | null = null;

async function metered(): Promise<unknown[] | null> {
  const key = Deno.env.get("METERED_TURN_API_KEY"), dom = Deno.env.get("METERED_DOMAIN") || "hdarchat.metered.live";
  if (!key) return null;
  const r = await fetch(`https://${dom}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`);
  const d = await r.json();
  return Array.isArray(d) && d.length ? d : null;
}
async function cloudflare(): Promise<unknown[] | null> {
  const id = Deno.env.get("CF_TURN_KEY_ID"), tok = Deno.env.get("CF_TURN_KEY_TOKEN");
  if (!id || !tok) return null;
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ ttl: 14400 }),
  });
  const d = await r.json();
  const list = Array.isArray(d.iceServers) ? d.iceServers : d.iceServers ? [d.iceServers] : [];
  return list.length ? list : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (cache && Date.now() - cache.at < 300000) return json({ iceServers: cache.list, configured: true });
  let list: unknown[] | null = null;
  try { list = await metered(); } catch { /* */ }
  if (!list) { try { list = await cloudflare(); } catch { /* */ } }
  if (!list) return json({ iceServers: [], configured: !!(Deno.env.get("METERED_TURN_API_KEY") || Deno.env.get("CF_TURN_KEY_ID")), error: true });
  cache = { at: Date.now(), list };
  return json({ iceServers: list, configured: true });
});
