// hdar-push — stateless Web Push relay, called only by the database (pg_net).
// The caller must present a secret whose SHA-256 matches RELAY_HASH; the VAPID
// private key travels in the request from the database vault, never in code.
import webpush from "npm:web-push@3.6.7";

const RELAY_HASH = "711966c13ed61564ed0a22be2a507eb11747cff2cd0cf1675882fdd8c3a1c2df";
const VAPID_PUBLIC = "BCYFlSj5FLTQ-HnjgG0xBXkB_xGD5d39kSzuKQY_G0l_t8DHRSxmEak0FvkxUGgAdmdYkXuzqS3zvwuUCcvLeEQ";

type Sub = { endpoint: string; p256dh: string; auth: string };
type Body = { secret: string; vapid_private: string; subs: Sub[]; payload: Record<string, unknown> };

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!body?.secret || (await sha256(body.secret)) !== RELAY_HASH) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails("https://hdar.chat", VAPID_PUBLIC, body.vapid_private);
  const data = JSON.stringify(body.payload ?? {});
  const gone: string[] = [];
  await Promise.all(
    (body.subs ?? []).slice(0, 20).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 3600, urgency: "high" })
        .catch((e: { statusCode?: number }) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(s.endpoint);
        }),
    ),
  );
  return new Response(JSON.stringify({ gone }), { headers: { "content-type": "application/json" } });
});
