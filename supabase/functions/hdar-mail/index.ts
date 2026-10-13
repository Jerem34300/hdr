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
type Tpl = "news" | "gift" | "invite";
const C = { night: "#0b0b10", card: "#16161e", coral: "#FA6F6C", green: "#3EE08F", gold: "#fbbf24", ink: "#f5f5f5", muted: "#a1a1aa" };
const HERO: Record<Tpl, { emoji: string; kicker: string; cta: string; href: string }> = {
  news: { emoji: "✨", kicker: "Nouveautés hdar", cta: "Découvrir", href: "https://hdar.chat" },
  gift: { emoji: "🎁", kicker: "Un cadeau pour toi", cta: "Utiliser mon code", href: "https://hdar.chat" },
  invite: { emoji: "💌", kicker: "Invite tes amis", cta: "Partager mon lien", href: "https://hdar.chat" },
};
/** Template email marketing hdar (sombre, corail/vert, mobile-first). */
export const mail = (body: string, unsub: string, tpl: Tpl = "news", o: { code?: string; title?: string } = {}) => {
  const h = HERO[tpl] ?? HERO.news;
  const title = esc(o.title || "");
  const code = o.code ? esc(o.code.toUpperCase().slice(0, 24)) : "";
  const href = tpl === "gift" && code ? `https://hdar.chat/?code=${encodeURIComponent(code)}` : h.href;
  const giftBlock = code ? `<table role="presentation" width="100%" style="margin:24px 0 4px"><tr><td style="background:linear-gradient(135deg,#2a1a22,#13261d);border:2px dashed ${C.gold};border-radius:20px;padding:22px;text-align:center">
    <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${C.gold};font-weight:700">${tpl === "invite" ? "Ton code d'invitation" : "Ton code cadeau"}</div>
    <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:6px;color:${C.green};margin-top:8px">${code}</div>
    <div style="font-size:12px;color:${C.muted};margin-top:8px">${tpl === "invite" ? "3 jours de hdar+ offerts pour toi et ton ami" : "Profil → Paramètres → « J'ai un code »"}</div></td></tr></table>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;background:${C.night}"><div style="background:${C.night};padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:${C.card};border-radius:28px;border:1px solid #2a2a35;overflow:hidden">
<tr><td style="padding:22px 24px 0;text-align:center"><span style="font-size:30px;font-weight:800;color:${C.ink}">hdar<span style="color:${C.coral}">.</span></span></td></tr>
<tr><td style="padding:22px 24px 0"><div style="border-radius:22px;padding:34px 20px;text-align:center;background:radial-gradient(circle at 20% 10%,rgba(250,111,108,.55),transparent 60%),radial-gradient(circle at 90% 100%,rgba(62,224,143,.35),transparent 60%),#1d1022">
  <div style="font-size:54px;line-height:1">${h.emoji}</div>
  <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${C.gold};font-weight:700;margin-top:12px">${h.kicker}</div>
  ${title ? `<div style="font-size:28px;font-weight:800;line-height:1.2;margin-top:8px">${title}</div>` : ""}</div></td></tr>
<tr><td style="padding:20px 26px 6px;font-size:16px;line-height:1.6">${esc(body).replace(/\n/g, "<br>")}${giftBlock}</td></tr>
<tr><td style="padding:18px 24px 30px;text-align:center"><a href="${href}" style="display:inline-block;background:${C.coral};color:${C.night};font-weight:800;font-size:17px;text-decoration:none;border-radius:999px;padding:16px 34px">${h.cta} →</a></td></tr>
</table>
<p style="text-align:center;font-size:11px;color:#71717a;margin-top:16px;line-height:1.5">hdar. · la carte en direct, 100 % anonyme · 18+<br>Tu reçois cet email car tu as coché « Recevoir les nouveautés hdar ». <a href="${unsub}" style="color:${C.muted}">Se désinscrire</a></p>
</div></body></html>`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const u = new URL(req.url);
  if (u.searchParams.get("unsub")) {
    try { await rpc("hdar_news_unsubscribe", { p_token: u.searchParams.get("unsub") }, `Bearer ${SR}`, SR); } catch { /* jeton invalide */ }
    return page("Tu es désinscrit des nouveautés hdar. 👋");
  }
  try {
    const auth = req.headers.get("authorization") || "";
    const { subject, body, test, template, code, title } = await req.json();
    const tpl: Tpl = ["news", "gift", "invite"].includes(template) ? template : "news";
    if (typeof subject !== "string" || typeof body !== "string" || !subject.trim() || !body.trim()) return json({ error: "Sujet et message requis" }, 400);
    let list: { email: string; token: string }[] = await rpc("hdar_admin_news_recipients", { p_key: "" }, auth);
    if (test) list = list.slice(0, 0).concat(typeof test === "string" ? [{ email: test, token: "00000000-0000-0000-0000-000000000000" }] : []);
    let sent = 0;
    for (let i = 0; i < list.length; i += 100) {
      const batch = list.slice(i, i + 100).map((r) => {
        const unsub = `${SELF}?unsub=${r.token}`;
        return { from: FROM, to: [r.email], reply_to: "contact@hdar.chat", subject: subject.slice(0, 200), html: mail(body, unsub, tpl, { code, title }), text: `${body}${code ? `\n\nCode : ${code}` : ""}\n\nSe désinscrire : ${unsub}`,
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
