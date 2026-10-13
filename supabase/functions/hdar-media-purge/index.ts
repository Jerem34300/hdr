// Hourly (pg_cron): deletes hdar-media files whose message expired, was removed, or whose DM was deleted on both sides.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: expected } = await sb.rpc("hdar_media_purge_key");
  if (!expected || req.headers.get("x-purge-key") !== expected) return new Response("forbidden", { status: 403 });
  let removed = 0;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await sb.rpc("hdar_media_orphans", { p_limit: 500 });
    if (error) return new Response(JSON.stringify({ error: error.message, removed }), { status: 500 });
    const names = (data as { name: string }[]).map((r) => r.name);
    if (!names.length) break;
    const { error: e2 } = await sb.storage.from("hdar-media").remove(names);
    if (e2) return new Response(JSON.stringify({ error: e2.message, removed }), { status: 500 });
    removed += names.length;
    if (names.length < 500) break;
  }
  return new Response(JSON.stringify({ removed }), { headers: { "content-type": "application/json" } });
});
