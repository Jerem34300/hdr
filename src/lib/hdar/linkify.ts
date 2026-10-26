/** Découpe un texte en morceaux : texte, lien http(s)/domaine simple, mention @pseudo. Aucun HTML injecté. */
export type Seg = { t: "text"; v: string } | { t: "url"; v: string; href: string; host: string; internal: boolean } | { t: "mention"; v: string; pseudo: string };

const TLD = "com|fr|net|org|io|chat|app|be|ch|ca|eu|info|me|co|tv|ly|gl|gg|xyz|dev|link|page|site|online|store|shop|club|bar|paris|re|lu|ma|tn|dz|uk|de|es|it";
// 1 = URL complète, 2 = domaine simple, 4 = @pseudo (3 = séparateur avant @)
const RE = new RegExp(
  `(https?:\\/\\/[^\\s<>"']+)|((?<![@\\w.\\-])(?:www\\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLD})(?![\\w-])(?:\\/[^\\s<>"']*)?)|(^|[^\\w@])@([\\w.\\-]{2,30})`,
  "gi",
);
const TRAIL = /[).,;:!?»"'’]+$/;

export function isInternalHost(host: string) {
  const h = host.toLowerCase();
  return h === "hdar.chat" || h.endsWith(".hdar.chat") || (typeof location !== "undefined" && h === location.host.toLowerCase());
}

/** Seuls http: et https: passent ; javascript:, data:, vbscript:, file:, blob:… sont refusés. */
export function safeUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s || /\s/.test(s) || [...s].some((c) => c.charCodeAt(0) < 32)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

export function linkify(text: string, mentions = true): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  const push = (v: string) => v && (out[out.length - 1]?.t === "text" ? ((out[out.length - 1] as { v: string }).v += v) : out.push({ t: "text", v }));
  for (const m of text.matchAll(RE)) {
    const i = m.index ?? 0;
    if (m[1] || m[2]) {
      let raw = (m[1] || m[2])!;
      const trail = raw.match(TRAIL)?.[0] ?? "";
      if (trail) raw = raw.slice(0, -trail.length);
      const u = safeUrl(raw);
      push(text.slice(last, i));
      if (u) out.push({ t: "url", v: raw, href: u.href, host: u.hostname.replace(/^www\./, ""), internal: isInternalHost(u.hostname) });
      else push(raw);
      push(trail);
      last = i + m[0].length;
    } else if (m[4] && mentions) {
      const pseudo = m[4].replace(/[.-]+$/, "");
      if (pseudo.length < 2) continue;
      push(text.slice(last, i) + (m[3] ?? ""));
      out.push({ t: "mention", v: "@" + pseudo, pseudo });
      last = i + (m[3] ?? "").length + 1 + pseudo.length;
    }
  }
  push(text.slice(last));
  return out;
}
