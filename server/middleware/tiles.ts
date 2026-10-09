import { tileUpstream } from "../tile-url.mjs";

interface TileEvent {
  url: URL;
  req: { method?: string };
}

export default async function tilesMiddleware(
  event: TileEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if ((event.req.method ?? "GET").toUpperCase() !== "GET") return next();
  const upstream = tileUpstream(event.url.pathname);
  if (!upstream) return next();
  const response = await fetch(upstream);
  if (!response.ok) return new Response(null, { status: 502 });
  return new Response(response.body, {
    headers: {
      "content-type": response.headers.get("content-type") || "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
