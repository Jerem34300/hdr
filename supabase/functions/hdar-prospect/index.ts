// hdar-prospect — prospection automatique des établissements gays et libertins (voir hdar_v61_prospection.sql).
// Appels :
//   pg_cron (en-tête x-cron-key) : { action: "source" } chaque lundi, { action: "tick" } chaque heure ouvrée.
//   admin (JWT d'un compte admin) : source | tick | test { to, id? } | preview { id?, step } | import { rows }.
//   GET ?unsub=<jeton> : désinscription définitive (lien présent dans chaque email).
// Secrets : RESEND_PRO_KEY (ou BREVO_PRO_KEY), PRO_FROM, PRO_REPLY_TO, PRO_LEGAL. Sans clé d'envoi : rien ne part.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("HDAR_SITE_URL") ?? "https://hdar.chat";
const RESEND = Deno.env.get("RESEND_PRO_KEY");
const BREVO = Deno.env.get("BREVO_PRO_KEY");
const FROM = Deno.env.get("PRO_FROM") || "Jérémy de hdar <pro@hdar.chat>";
const REPLY = Deno.env.get("PRO_REPLY_TO") || "contact@hdar.chat";
const LEGAL = Deno.env.get("PRO_LEGAL") || "hdar.chat · contact@hdar.chat";
const SELF = `${URL_}/functions/v1/hdar-prospect`;
const UA = "hdar-pro/1.0 (+https://hdar.chat/pro; contact@hdar.chat)";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function rpc<T = unknown>(fn: string, args: unknown, auth = `Bearer ${SR}`, apikey = SR): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey, authorization: auth, "content-type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text(); const d = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(d?.message || "Erreur");
  return d as T;
}
async function get(url: string, ms = 8000, init: RequestInit = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal, redirect: "follow", headers: { "user-agent": UA, ...(init.headers ?? {}) } }); } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- collecte OpenStreetMap
type Row = { source: string; source_ref?: string; segment: "gay" | "libertin"; kind: string; name: string; city?: string; postcode?: string; address?: string;
  lat: number; lng: number; website?: string; phone?: string; instagram?: string; email?: string; email_source?: string; priority?: number };
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const QUERY = `[out:json][timeout:170];
area["ISO3166-1"="FR"][admin_level=2]->.fr;
(
  nwr["amenity"="swingerclub"](area.fr);
  nwr["club"~"swinger|libertin|echangiste",i](area.fr);
  nwr["lgbtq"~"^(primary|only)$"](area.fr);
  nwr["lgbtq:gay"~"^(primary|only)$"](area.fr);
  nwr["gay"~"^(yes|only|primary)$"](area.fr);
);
out center tags;`;
const VENUE = /^(bar|pub|cafe|nightclub|restaurant|biergarten|swingerclub|sauna|public_bath|stripclub)$/;
type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
export function fromOsm(el: OsmEl): Row | null {
  const t = el.tags ?? {}; const lat = el.lat ?? el.center?.lat; const lng = el.lon ?? el.center?.lon;
  if (!t.name || lat == null || lng == null) return null;
  const lib = t.amenity === "swingerclub" || /swinger|libertin|echangiste|échangiste/i.test(t.club ?? "");
  const sauna = t.leisure === "sauna" || t.amenity === "sauna" || t.amenity === "public_bath";
  if (!lib && !sauna && !VENUE.test(t.amenity ?? "")) return null; // associations, hôtels, boutiques : hors cible
  const kind = sauna ? "sauna" : lib || t.amenity === "nightclub" || t.amenity === "stripclub" ? "club" : /^(bar|pub|cafe|biergarten)$/.test(t.amenity ?? "") ? "bar" : "other";
  const ig = t["contact:instagram"] ?? t.instagram;
  return {
    source: "osm", source_ref: `osm:${el.type}/${el.id}`, segment: lib ? "libertin" : "gay", kind, name: t.name, lat, lng,
    city: t["addr:city"], postcode: t["addr:postcode"], address: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || undefined,
    website: t.website ?? t["contact:website"] ?? t.url, phone: t.phone ?? t["contact:phone"],
    instagram: ig ? (ig.startsWith("http") ? ig : `https://instagram.com/${ig.replace(/^@/, "")}`) : undefined,
    email: t.email ?? t["contact:email"], email_source: "osm",
  };
}
async function source() {
  let data: { elements: OsmEl[] } | null = null; let err = "";
  for (const u of OVERPASS) {
    try { const r = await get(u, 175000, { method: "POST", body: new URLSearchParams({ data: QUERY }) }); if (r.ok) { data = await r.json(); break; } err = `${u} ${r.status}`; }
    catch (e) { err = `${u} ${e instanceof Error ? e.message : e}`; }
  }
  if (!data) throw new Error(`OpenStreetMap indisponible (${err})`);
  const rows = data.elements.map(fromOsm).filter((r): r is Row => !!r);
  let res: { seen: number; total: number } = { seen: 0, total: 0 };
  for (let i = 0; i < rows.length; i += 200) res = await rpc("hdar_prospect_upsert", { p_rows: rows.slice(i, i + 200) });
  return { found: rows.length, total: res.total };
}

// ---------------------------------------------------------------- recherche de l'email sur le site
const JUNK = /(\.(png|jpe?g|gif|webp|svg|css|js)$)|(@(\d+x|example\.|domain\.|email\.|sentry|wixpress|wix\.com|godaddy|mysite|yoursite|votre-?site|exemple))|^(noreply|no-reply|donotreply|privacy|dpo|rgpd|webmaster|abuse)@/i;
export function pickEmail(html: string, site: string): string | null {
  const host = (() => { try { return new URL(site).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const txt = html.replace(/&#64;|&#x40;|\s?\[(at|arobase)\]\s?|\s\(at\)\s/gi, "@").replace(/&#46;|\s?\[(dot|point)\]\s?/gi, ".");
  const mailto = [...txt.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => decodeURIComponent(m[1]));
  const all = [...mailto, ...(txt.match(/[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? [])]
    .map((e) => e.toLowerCase().replace(/^\W+|\W+$/g, "")).filter((e) => !JUNK.test(e) && e.length < 80);
  if (!all.length) return null;
  const score = (e: string) => (host && e.endsWith("@" + host) ? 4 : 0) + (mailto.includes(e) ? 2 : 0) + (/^(contact|info|bonjour|hello|reservation|club|bar|sauna|direction|accueil)@/.test(e) ? 1 : 0);
  return [...new Set(all)].sort((a, b) => score(b) - score(a))[0];
}
const igOf = (html: string) => html.match(/https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore|reel|accounts|sharer)([A-Za-z0-9_.]{2,30})/)?.[0] ?? null;
async function page(url: string): Promise<string> {
  try {
    const r = await get(url);
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return "";
    return (await r.text()).slice(0, 600000);
  } catch { return ""; }
}
async function enrichOne(id: string, website: string) {
  const site = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  let origin = ""; try { origin = new URL(site).origin; } catch { return rpc("hdar_prospect_enriched", { p_id: id, p_email: null, p_instagram: null }); }
  const home = await page(site);
  let email = pickEmail(home, site); let ig = igOf(home);
  if (!email) {
    const links = [...home.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]).filter((h) => /contact|mention|legal|impressum|infos?|acces|reserv/i.test(h));
    const urls = [...new Set([...links.map((h) => { try { return new URL(h, origin).href; } catch { return ""; } }).filter((u) => u.startsWith(origin)), `${origin}/contact`, `${origin}/mentions-legales`])].slice(0, 4);
    for (const u of urls) { const h = await page(u); email = pickEmail(h, site); ig ??= igOf(h); if (email) break; }
  }
  await rpc("hdar_prospect_enriched", { p_id: id, p_email: email, p_instagram: ig });
  return email;
}
async function enrich(n = 12) {
  const list = await rpc<{ id: string; website: string }[]>("hdar_prospect_enrich_list", { p_n: n });
  let found = 0;
  for (let i = 0; i < list.length; i += 4) {
    const r = await Promise.allSettled(list.slice(i, i + 4).map((p) => enrichOne(p.id, p.website)));
    found += r.filter((x) => x.status === "fulfilled" && x.value).length;
  }
  return { checked: list.length, found };
}

// ---------------------------------------------------------------- emails
type P = { id: string; name: string; kind: string; segment: "gay" | "libertin"; city: string | null; email: string; step: number; token: string; clicked: boolean; price_from: number | null };
const C = { night: "#0b0b10", card: "#16161e", coral: "#FA6F6C", mint: "#A1E3C3", gold: "#fbbf24", ink: "#f5f5f5", muted: "#a1a1aa" };
const euros = (c: number | null) => c == null ? "" : (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: c % 100 ? 2 : 0 });
const FEATURES: [string, string, string][] = [
  ["📍", "Votre pin lumineux sur la carte", "vu en temps réel par les personnes connectées autour de vous, au moment où elles choisissent où sortir."],
  ["📝", "Votre page complète", "description, horaires, 4 photos, site web, téléphone et Instagram, modifiables à tout moment depuis votre téléphone."],
  ["⭐", "Avis et étoiles", "activés ou non, publics ou privés, avec possibilité de répondre à chaque commentaire."],
  ["💬", "Le chat de votre lieu", "annoncez une soirée, répondez aux questions, donnez envie avant même que les gens arrivent."],
  ["🎥", "Live Pro", "présentez votre lieu en vidéo à toute la France (sans nudité, selon les règles hdar)."],
  ["🎁", "Cadeaux et messages pro", "offrez un verre, une entrée ou un code promo aux utilisateurs autour de vous."],
  ["🚀", "Boost Pro", "pin doré et première place « À la une » quand vous voulez faire le plein."],
  ["📊", "Tableau de bord", "vues, visiteurs uniques, clics vers votre site, heures de pointe, zones d'origine : sans jamais savoir qui est qui."],
];
const kindLabel = (p: P) => ({ club: "club", sauna: "sauna", bar: "bar", other: "établissement" }[p.kind] ?? "établissement");
const audience = (p: P) => p.segment === "libertin"
  ? "les couples et célibataires ouverts d'esprit qui cherchent où sortir ce soir"
  : "la communauté gay et LGBT+ qui cherche où sortir ce soir";
export function compose(p: P, step: number, link: string, unsub: string) {
  const at = p.city ? ` à ${p.city}` : "";
  const price = p.price_from ? `À partir de ${euros(p.price_from)} la semaine, sans engagement, résiliable en un clic.` : "Sans engagement, résiliable en un clic.";
  const S = [
    {
      subject: `${p.name} : votre fiche hdar est prête`,
      kicker: "Votre fiche est prête", cta: "Voir ma fiche",
      intro: [`Bonjour,`, `Je suis Jérémy, fondateur de hdar : la carte en direct des sorties et des rencontres autour de soi, gratuite, anonyme et réservée aux 18 ans et plus. Elle est utilisée par ${audience(p)}.`,
        `Nous avons préparé la page de votre ${kindLabel(p)}${at}, « ${p.name} ». Elle n'attend plus que vous pour s'allumer sur la carte. Voici tout ce qu'elle vous permet de faire :`],
      list: FEATURES,
      outro: [price, `Un clic sur le bouton ci-dessous pour voir votre fiche, la compléter et l'activer. Une question ? Répondez simplement à cet email.`],
    },
    {
      subject: p.clicked ? `${p.name} : il ne manque qu'un clic` : `Ce que verront vos clients en ouvrant ${p.name}`,
      kicker: "Aperçu de votre page", cta: "Activer ma fiche",
      intro: [`Bonjour,`, p.clicked
        ? `Vous avez jeté un œil à la fiche de « ${p.name} » sur hdar : merci ! Elle est toujours prête, il ne reste qu'à l'activer.`
        : `Je reviens vers vous au sujet de la fiche de « ${p.name} » sur hdar. En touchant votre pin, les utilisateurs autour de vous découvrent :`],
      list: FEATURES.filter(([i]) => ["📝", "⭐", "💬", "🎁"].includes(i)),
      outro: [`Vous gardez la main sur tout : textes, photos, avis, et vous pouvez tout modifier à tout moment depuis votre espace pro.`, price],
    },
    {
      subject: `Dernier message pour ${p.name}`,
      kicker: "Dernier rappel", cta: "Voir ma fiche",
      intro: [`Bonjour,`, `Ce sera mon dernier message : je ne vous écrirai plus ensuite. La fiche de « ${p.name} »${at} reste prête si vous souhaitez apparaître sur la carte hdar et toucher ${audience(p)}.`],
      list: FEATURES.filter(([i]) => ["📍", "🎥", "🚀", "📊"].includes(i)),
      outro: [price, `Merci pour votre temps, et belle soirée !`],
    },
  ][Math.min(step, 2)];
  const li = S.list.map(([i, t, d]) => `<tr><td style="width:34px;vertical-align:top;font-size:20px;padding:8px 0">${i}</td><td style="padding:8px 0;font-size:15px;line-height:1.5"><b style="color:${C.ink}">${esc(t)}</b><span style="color:${C.muted}"> · ${esc(d)}</span></td></tr>`).join("");
  const para = (a: string[]) => a.map((x) => `<p style="margin:0 0 14px">${esc(x)}</p>`).join("");
  const why = `Vous recevez cet email car « ${p.name} » est un établissement référencé publiquement (OpenStreetMap ou son site internet). Votre adresse professionnelle sert uniquement à vous présenter hdar pro ; elle n'est ni revendue ni partagée.`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;background:${C.night}"><div style="background:${C.night};padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" style="max-width:580px;margin:0 auto;background:${C.card};border-radius:28px;border:1px solid #2a2a35;overflow:hidden">
<tr><td style="padding:22px 24px 0;text-align:center"><span style="font-size:30px;font-weight:800;color:${C.ink}">hdar<span style="color:${C.coral}">.</span></span> <span style="font-size:11px;font-weight:700;color:${C.mint};border:1px solid ${C.mint};border-radius:99px;padding:2px 8px;vertical-align:middle">PRO</span></td></tr>
<tr><td style="padding:22px 24px 0"><div style="border-radius:22px;padding:30px 20px;text-align:center;background:radial-gradient(circle at 20% 10%,rgba(250,111,108,.55),transparent 60%),radial-gradient(circle at 90% 100%,rgba(161,227,195,.35),transparent 60%),#1d1022">
  <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${C.gold};font-weight:700">${esc(S.kicker)}</div>
  <div style="font-size:28px;font-weight:800;line-height:1.2;margin-top:8px">${esc(p.name)}</div>
  ${p.city ? `<div style="font-size:14px;color:${C.muted};margin-top:6px">📍 ${esc(p.city)}</div>` : ""}</div></td></tr>
<tr><td style="padding:22px 26px 0;font-size:16px;line-height:1.6">${para(S.intro)}<table role="presentation" width="100%">${li}</table></td></tr>
<tr><td style="padding:10px 26px 0;font-size:15px;line-height:1.6">${para(S.outro)}</td></tr>
<tr><td style="padding:8px 24px 30px;text-align:center"><a href="${link}" style="display:inline-block;background:${C.coral};color:${C.night};font-weight:800;font-size:17px;text-decoration:none;border-radius:999px;padding:16px 34px">${esc(S.cta)} →</a>
<div style="font-size:13px;color:${C.muted};margin-top:18px">Jérémy · hdar.chat</div></td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:11px;color:#71717a;line-height:1.5">${esc(why)}<br>${esc(LEGAL)} · <a href="${unsub}" style="color:${C.muted}">Ne plus recevoir d'email de hdar</a></p>
</div></body></html>`;
  const text = [...S.intro, ...S.list.map(([i, t, d]) => `${i} ${t} : ${d}`), "", ...S.outro, "", `${S.cta} : ${link}`, "", "Jérémy · hdar.chat", "", why, `Ne plus recevoir d'email : ${unsub}`, LEGAL].join("\n");
  return { subject: S.subject, html, text };
}
const links = (p: P) => ({ link: `${SITE}/pro/invitation/${p.token}`, unsub: `${SELF}?unsub=${p.token}` });

async function deliver(to: string, m: { subject: string; html: string; text: string }, unsub: string): Promise<string | null> {
  const headers = { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  if (BREVO) {
    const [, name, email] = FROM.match(/^\s*(.*?)\s*<([^>]+)>\s*$/) ?? [null, "hdar", FROM];
    const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": BREVO, "content-type": "application/json" },
      body: JSON.stringify({ sender: { name, email }, to: [{ email: to }], replyTo: { email: REPLY }, subject: m.subject, htmlContent: m.html, textContent: m.text, headers, tags: ["prospection"] }) });
    return r.ok ? null : `Brevo ${r.status} ${(await r.text()).slice(0, 200)}`;
  }
  if (RESEND) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${RESEND}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY, subject: m.subject, html: m.html, text: m.text, headers }) });
    return r.ok ? null : `Resend ${r.status} ${(await r.text()).slice(0, 200)}`;
  }
  return "not_configured";
}
async function sendDue() {
  if (!RESEND && !BREVO) return { sent: 0, error: "Aucune clé d'envoi (RESEND_PRO_KEY ou BREVO_PRO_KEY)" };
  const due = await rpc<P[]>("hdar_prospect_due", { p_n: 50 });
  let sent = 0; const errors: string[] = [];
  for (const p of due) {
    const { link, unsub } = links(p);
    const err = await deliver(p.email, compose(p, p.step, link, unsub), unsub);
    await rpc("hdar_prospect_sent", { p_id: p.id, p_step: p.step, p_ok: !err, p_error: err });
    if (err) errors.push(`${p.name} : ${err}`); else sent++;
    await new Promise((r) => setTimeout(r, 400));
  }
  return { sent, errors };
}

// ---------------------------------------------------------------- import manuel (géocodage BAN)
async function geocode(q: string): Promise<{ lat: number; lng: number; city?: string; postcode?: string } | null> {
  try {
    const r = await get(`https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(q)}`);
    const f = (await r.json())?.features?.[0];
    return f ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], city: f.properties.city, postcode: f.properties.postcode } : null;
  } catch { return null; }
}
async function importRows(rows: Partial<Row>[]) {
  const ok: Row[] = []; const failed: string[] = [];
  for (const r of rows.slice(0, 500)) {
    if (!r.name) continue;
    let { lat, lng } = r as Row; let city = r.city; let postcode = r.postcode;
    if (lat == null || lng == null || !Number.isFinite(+lat) || !Number.isFinite(+lng)) {
      const g = await geocode([r.address, r.postcode, r.city].filter(Boolean).join(" ") || `${r.name} ${r.city ?? ""}`);
      if (!g) { failed.push(r.name); continue; }
      ({ lat, lng } = g); city ??= g.city; postcode ??= g.postcode;
    }
    ok.push({ ...r, source: "manual", segment: r.segment === "libertin" ? "libertin" : "gay", kind: r.kind ?? "bar", name: r.name, lat: +lat, lng: +lng, city, postcode, email_source: "manual" } as Row);
  }
  const res = ok.length ? await rpc<{ total: number }>("hdar_prospect_upsert", { p_rows: ok }) : null;
  return { imported: ok.length, failed, total: res?.total };
}

const optoutPage = (msg: string) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>hdar pro</title><body style="background:#0b0b10;color:#f5f5f5;font-family:sans-serif;text-align:center;padding:60px 20px"><div style="font-size:32px;font-weight:800">hdar<span style="color:#FA6F6C">.</span></div><p style="font-size:18px">${msg}</p><a href="https://hdar.chat/pro" style="color:#A1E3C3">hdar pro</a></body>`, { headers: { "content-type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const u = new URL(req.url);
  const unsubToken = u.searchParams.get("unsub");
  if (unsubToken) {
    // GET (lien) ou POST « List-Unsubscribe-Post » (désinscription en un clic des messageries)
    const ok = await rpc<boolean>("hdar_prospect_optout", { p_token: unsubToken }).catch(() => false);
    return optoutPage(ok ? "C'est noté : vous ne recevrez plus aucun email de hdar. Bonne continuation !" : "Lien invalide ou expiré. Écrivez-nous à contact@hdar.chat et nous vous retirons immédiatement.");
  }
  try {
    const body = await req.json().catch(() => ({}));
    const cron = req.headers.get("x-cron-key");
    if (cron) {
      if (cron !== await rpc<string>("hdar_prospect_cron_key", {})) return json({ error: "forbidden" }, 403);
      if (body.action === "source") return json(await source());
      const e = await enrich(); const s = await sendDue();
      return json({ enrich: e, send: s });
    }
    // Admin : la RPC refuse tout compte non admin.
    const auth = req.headers.get("authorization") || "";
    await rpc("hdar_admin_prospects", { p_key: "", p_status: "__none__", p_q: null }, auth, ANON);
    switch (body.action) {
      case "source": return json(await source());
      case "enrich": return json(await enrich(Math.min(Number(body.n) || 12, 30)));
      case "tick": return json({ enrich: await enrich(), send: await sendDue() });
      case "import": return json(await importRows(Array.isArray(body.rows) ? body.rows : []));
      case "preview":
      case "test": {
        const sample: P = { id: "", name: "Le Néon (exemple)", kind: "bar", segment: body.segment === "libertin" ? "libertin" : "gay", city: "Montpellier", email: "", step: 0, token: "exemple", clicked: false, price_from: 1500 };
        const p = body.id ? await rpc<P>("hdar_prospect_prepare", { p_id: body.id }) : sample;
        const { link, unsub } = links(p);
        if (body.action === "preview") return json(compose(p, Number(body.step) || 0, link, unsub));
        if (typeof body.to !== "string" || !/^\S+@\S+\.\S+$/.test(body.to)) return json({ error: "Adresse de test invalide" }, 400);
        const errs: string[] = [];
        for (const step of [0, 1, 2]) {
          const m = compose(p, step, link, unsub);
          const err = await deliver(body.to, { ...m, subject: `[TEST ${step + 1}/3] ${m.subject}` }, unsub);
          if (err) errs.push(err);
        }
        return errs.length ? json({ error: errs[0] }, 502) : json({ sent: 3 });
      }
      default: return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Erreur" }, 400); }
});
