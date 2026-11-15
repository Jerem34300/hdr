import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/hdar/session";

const KINDS = new Set([
  "gate_view",
  "gate_check",
  "gate_click",
  "gate_verified",
  "gate_enter",
  "gate_error",
  "gate_captcha_fail",
]);

/** Code pays du visiteur, d'après les en-têtes du CDN (Netlify, Cloudflare, Vercel).
 *  Jamais d'adresse IP : on ne lit et on ne stocke qu'un code ISO à 2 lettres, ou ZZ. */
function countryFrom(request: Request): string {
  const headers = request.headers;
  const direct =
    headers.get("x-nf-country") ||
    headers.get("x-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-vercel-ip-country") ||
    headers.get("x-country-code");
  const raw = (direct || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(raw) && raw !== "XX") return raw;
  try {
    const geo = headers.get("x-nf-geo");
    if (geo) {
      const g = JSON.parse(Buffer.from(geo, "base64").toString("utf8")) as { country?: { code?: string } };
      const cc = (g.country?.code || "").trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(cc) && cc !== "XX") return cc;
    }
  } catch {
    /* en-tête illisible */
  }
  return "ZZ";
}

function langOf(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase().slice(0, 2) : "";
  return /^[a-z]{2}$/.test(s) ? s : "zz";
}

export const Route = createFileRoute("/api/gate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let kind = "";
        let lang = "zz";
        try {
          const body = (await request.json()) as { kind?: unknown; lang?: unknown };
          kind = typeof body.kind === "string" ? body.kind : "";
          lang = langOf(body.lang);
        } catch {
          return new Response("bad request", { status: 400 });
        }
        if (!KINDS.has(kind)) return new Response("bad request", { status: 400 });
        const country = countryFrom(request);
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/rpc/hdar_gate`, {
            method: "POST",
            headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({ p_kind: kind, p_country: country, p_lang: lang }),
          });
        } catch {
          /* statistique facultative */
        }
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      },
    },
  },
});
