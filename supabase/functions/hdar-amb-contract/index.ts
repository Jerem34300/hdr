// hdar-amb-contract — signature électronique du contrat ambassadeur (nom saisi + version + date + IP hachée),
// génération du PDF personnalisé (contrat + certificat de signature), envoi par email (Resend), téléchargement ambassadeur / admin.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const SITE = Deno.env.get("HDAR_SITE_URL") ?? "https://hdar.chat";
const VERSION = "v1";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

async function rpc(fn: string, args: unknown, auth?: string) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST",
    headers: { apikey: auth ? ANON : SR, authorization: auth ?? `Bearer ${SR}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error((() => { try { return JSON.parse(t).message; } catch { return t; } })());
  return t ? JSON.parse(t) : null;
}
async function sha(s: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}
type Sig = { id: number; name: string; version: string; at: string; ip_hash: string | null; code: string | null };
const fmt = (d: string) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });

async function buildPdf(s: Sig) {
  const src = await fetch(`${SITE}/ambassadeur/contrat-${s.version}.pdf`);
  if (!src.ok) throw new Error("Modèle de contrat introuvable");
  const doc = await PDFDocument.load(await src.arrayBuffer());
  const f = await doc.embedFont(StandardFonts.Helvetica), b = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Exemplaire signé électroniquement par ${s.name} le ${fmt(s.at)} · contrat ${s.version} · page ${i + 1}/${pages.length}`,
    { x: 30, y: 12, size: 7, font: f, color: rgb(0.45, 0.45, 0.5) }));
  const p = doc.addPage([595.28, 841.89]);
  let y = 780;
  const line = (t: string, o: { bold?: boolean; size?: number; gap?: number } = {}) => { p.drawText(t, { x: 50, y, size: o.size ?? 11, font: o.bold ? b : f, color: rgb(0.1, 0.1, 0.14) }); y -= o.gap ?? 20; };
  line("hdar.", { bold: true, size: 26, gap: 34 });
  line("Certificat de signature électronique", { bold: true, size: 17, gap: 30 });
  line("Contrat d'apporteur d'affaires — Ambassadeur indépendant", { gap: 34 });
  for (const [k, v] of [["Ambassadeur (nom et prénom saisis)", s.name], ["Code ambassadeur", s.code ?? "—"], ["Version du contrat", s.version],
    ["Date et heure d'acceptation", `${fmt(s.at)} (heure de Paris)`], ["Empreinte de l'adresse IP (SHA-256)", (s.ip_hash ?? "—").slice(0, 32)], ["Référence de signature", `HDAR-AMB-${s.id}`]]) {
    line(k, { bold: true, size: 10, gap: 15 }); line(v, { gap: 24 });
  }
  y -= 6;
  for (const t of ["L'Ambassadeur a lu le contrat dans l'application hdar.chat, coché « J'ai lu et j'accepte le contrat »",
    "et saisi son nom complet en guise de signature électronique (article 1367 du Code civil).",
    "L'adresse IP n'est conservée que sous forme d'empreinte non réversible."]) line(t, { size: 9.5, gap: 14 });
  return await doc.save();
}

async function sendMail(to: string[], s: Sig, pdf: Uint8Array) {
  const key = Deno.env.get("RESEND_NEWS_KEY");
  if (!key || !to.length) return false;
  let bin = ""; for (const c of pdf) bin += String.fromCharCode(c);
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: "hdar <contact@hdar.chat>", to, reply_to: "contact@hdar.chat", subject: "Ton contrat ambassadeur hdar (signé)",
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111"><p>Bonjour ${s.name.replace(/[<>&]/g, "")},</p><p>Bienvenue dans le programme ambassadeur hdar 🎯</p><p>Tu trouveras en pièce jointe ton contrat signé électroniquement le ${fmt(s.at)} (version ${s.version}). Il reste disponible à tout moment dans ton Espace ambassadeur › 📄 Mon contrat.</p><p>Prochaine étape : configurer tes versements Stripe depuis ton espace.</p><p>L'équipe hdar · <a href="${SITE}/ambassadeur">${SITE.replace("https://", "")}/ambassadeur</a></p></div>`,
      attachments: [{ filename: `contrat-ambassadeur-hdar-${s.version}.pdf`, content: btoa(bin) }] }) });
  return r.ok;
}
const pdfResp = (pdf: Uint8Array, name: string) => new Response(pdf as unknown as BodyInit, { headers: { ...cors, "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"` } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("authorization");
  if (!auth) return json({ error: "auth" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "admin_pdf") {
      await rpc("hdar_admin_amb_contract_ok", { p_key: body.key }, auth);
      const s = await rpc("hdar_amb_contract_get", { p_user: body.user }) as Sig | null;
      if (!s) return json({ error: "Aucun contrat signé" }, 404);
      return pdfResp(await buildPdf(s), `contrat-${s.code ?? "amb"}-${s.version}.pdf`);
    }
    const me = await rpc("hdar_amb_whoami", {}, auth) as { user_id: string; photo_ok: boolean; email: string | null } | null;
    if (!me) return json({ error: "Profil introuvable" }, 403);
    if (body.action === "pdf") {
      const s = await rpc("hdar_amb_contract_get", { p_user: me.user_id }) as Sig | null;
      if (!s) return json({ error: "Aucun contrat signé" }, 404);
      return pdfResp(await buildPdf(s), `contrat-ambassadeur-hdar-${s.version}.pdf`);
    }
    if (body.action === "sign") {
      if (body.accept !== true) return json({ error: "Coche « J'ai lu et j'accepte le contrat »" }, 400);
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
      const s = await rpc("hdar_amb_sign", { p_user: me.user_id, p_token: body.token ?? "", p_name: String(body.name ?? ""), p_version: VERSION,
        p_ip_hash: ip ? await sha(`${ip}|${SR.slice(-24)}`) : null, p_ua: req.headers.get("user-agent") }) as Sig;
      let mailed = false;
      try {
        const extra = typeof body.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) ? body.email : null;
        const to = [...new Set([me.email, extra].filter(Boolean) as string[])];
        mailed = await sendMail([...to, "contact@hdar.chat"], s, await buildPdf(s)) && to.length > 0;
      } catch (e) { console.error(e); }
      return json({ ok: true, mailed, version: s.version, at: s.at });
    }
    return json({ error: "action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
