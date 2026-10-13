// hdar-region — région générale d'un profil (« Hérault, France »). Les coordonnées restent côté serveur :
// lues via hdar_region_key (service_role), arrondies à 0,1°, géocodées une fois (Nominatim) puis mises en cache.
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, "content-type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SR, authorization: `Bearer ${SR}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { id } = await req.json();
    if (typeof id !== "string" || id.length > 80) return json({ label: null });
    const key = await rpc("hdar_region_key", { p_id: id });
    if (!key) return json({ label: null });
    if (key.label) return json({ label: key.label });
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&accept-language=fr&lat=${key.lat}&lon=${key.lng}`, { headers: { "user-agent": "hdar.chat region lookup (contact via hdar.chat/contact)" } });
    const d = await r.json();
    const a = d.address ?? {};
    const area = a.county || a.state_district || a.state || a.region || "";
    const label = [area, a.country].filter(Boolean).join(", ") || null;
    if (label) await rpc("hdar_region_store", { p_k: key.k, p_label: label });
    return json({ label });
  } catch {
    return json({ label: null });
  }
});
