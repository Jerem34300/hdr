// hdar-mail — envoi des nouveautés aux utilisateurs opt-in (admin seulement) + désinscription (lien dans chaque email).
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("RESEND_NEWS_KEY")!;
const FROM = Deno.env.get("NEWS_FROM") || "hdar <contact@hdar.chat>";
const SELF = `${URL_}/functions/v1/hdar-mail`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
async function rpc(fn: string, args: unknown, auth: string, apikey = ANON) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey, authorization: auth, "content-type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text(); const d = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(d?.message || "Erreur");
  return d;
}
const page = (msg: string) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body style="background:#0b0b10;color:#f5f5f5;font-family:sans-serif;text-align:center;padding:60px 20px"><div style="font-size:32px;font-weight:800">hdar<span style="color:#FA6F6C">.</span></div><p style="font-size:18px">${msg}</p><a href="https://hdar.chat" style="color:#3EE08F">Retour sur hdar.chat</a></body>`, { headers: { "content-type": "text/html; charset=utf-8" } });
const mail = (body: string, unsub: string) => `<div style="background:#0b0b10;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#f5f5f5"><div style="max-width:520px;margin:0 auto;background:#16161e;border-radius:24px;padding:28px 24px;border:1px solid #2a2a35"><div style="font-size:30px;font-weight:800;text-align:center">hdar<span style="color:#FA6F6C">.</span></div><div style="font-size:15px;line-height:1.6;margin-top:18px">${esc(body).replace(/\n/g, "<br>")}</div><p style="text-align:center;margin:26px 0 0"><a href="https://hdar.chat" style="display:inline-block;background:#3EE08F;color:#0b0b10;font-weight:800;text-decoration:none;border-radius:999px;padding:12px 26px">Ouvrir hdar</a></p></div><p style="text-align:center;font-size:11px;color:#71717a;margin-top:16px">Tu reçois cet email car tu as coché « Recevoir les nouveautés hdar ». <a href="${unsub}" style="color:#a1a1aa">Se désinscrire</a></p></div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const u = new URL(req.url);
  if (u.searchParams.get("unsub")) {
    try { await rpc("hdar_news_unsubscribe", { p_token: u.searchParams.get("unsub") }, `Bearer ${SR}`, SR); } catch { /* jeton invalide */ }
    return page("Tu es désinscrit des nouveautés hdar. 👋");
  }
  try {
    const auth = req.headers.get("authorization") || "";
    const { subject, body, test } = await req.json();
    if (typeof subject !== "string" || typeof body !== "string" || !subject.trim() || !body.trim()) return json({ error: "Sujet et message requis" }, 400);
    let list: { email: string; token: string }[] = await rpc("hdar_admin_news_recipients", { p_key: "" }, auth);
    if (test) list = list.slice(0, 0).concat(typeof test === "string" ? [{ email: test, token: "00000000-0000-0000-0000-000000000000" }] : []);
    let sent = 0;
    for (let i = 0; i < list.length; i += 100) {
      const batch = list.slice(i, i + 100).map((r) => {
        const unsub = `${SELF}?unsub=${r.token}`;
        return { from: FROM, to: [r.email], reply_to: "contact@hdar.chat", subject: subject.slice(0, 200), html: mail(body, unsub), text: `${body}\n\nSe désinscrire : ${unsub}`,
          headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
      });
      const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" }, body: JSON.stringify(batch) });
      if (!r.ok) return json({ error: `Resend : ${(await r.text()).slice(0, 200)}`, sent }, 502);
      sent += batch.length;
    }
    if (!test) await rpc("hdar_admin_news_logged", { p_key: "", p_subject: subject, p_n: sent }, auth);
    return json({ sent });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Erreur" }, 400); }
});
