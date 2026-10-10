import { createServerFn } from "@tanstack/react-start";

// Shared Supabase project that stores presence and live chat. The publishable
// key is public by design: tables sit in a private schema and are reachable
// only through the validated `hdar_*` RPC functions (supabase/hdar_live.sql).
const SUPABASE_URL = process.env.HDAR_SUPABASE_URL || "https://hoomzhgqzwuystwburfa.supabase.co";
const SUPABASE_KEY =
  process.env.HDAR_SUPABASE_KEY || "sb_publishable_BWmk7ZH_jG2Vp2muud3w_w_TllpzneU";

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    let message = `Serveur indisponible (${res.status})`;
    try {
      const err = (await res.json()) as { message?: string };
      if (err.message) message = err.message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export type LivePin = {
  id: string;
  pseudo: string;
  lat: number;
  lng: number;
  hot: boolean;
};

export type LiveMsg = {
  id: string;
  mine: boolean;
  body: string;
  at: string;
};

function selfId(value: string) {
  const id = String(value || "").trim().slice(0, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identité invalide");
  return id;
}

export const pulse = createServerFn({ method: "POST" })
  .validator((input: { self: string; lat: number; lng: number; pseudo: string; desires: string; hours: number }) => ({
    self: selfId(input.self),
    lat: Number(input.lat),
    lng: Number(input.lng),
    pseudo: String(input.pseudo || "Anonyme").trim().slice(0, 24) || "Anonyme",
    desires: String(input.desires || "").slice(0, 80),
    hours: Math.min(12, Math.max(1, Number(input.hours) || 3)),
  }))
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return;
    await rpc("hdar_pulse", {
      p_self: data.self,
      p_lat: data.lat,
      p_lng: data.lng,
      p_pseudo: data.pseudo,
      p_desires: data.desires,
      p_hours: Math.round(data.hours),
    });
  });

export const goDark = createServerFn({ method: "POST" })
  .validator((self: string) => selfId(self))
  .handler(async ({ data }) => {
    await rpc("hdar_go_dark", { p_self: data });
  });

export const listLive = createServerFn({ method: "GET" })
  .validator((self: string) => selfId(self))
  .handler(async ({ data }) => {
    const rows = await rpc<{ id: string; pseudo: string; lat: number; lng: number; desires: string }[]>(
      "hdar_list_live",
      { p_self: data },
    );
    return rows.map((r) => ({
      id: r.id,
      pseudo: r.pseudo,
      lat: Number(r.lat),
      lng: Number(r.lng),
      hot: r.desires.split(",").includes("plan"),
    })) satisfies LivePin[];
  });

export const readThread = createServerFn({ method: "GET" })
  .validator((input: { self: string; withId: string }) => ({
    self: selfId(input.self),
    withId: String(input.withId || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.withId || data.withId === data.self) return [] as LiveMsg[];
    const rows = await rpc<{ id: string; from_id: string; body: string; at: string }[]>(
      "hdar_read_thread",
      { p_self: data.self, p_with: data.withId },
    );
    const self = data.self.toLowerCase();
    return rows.map((r) => ({ id: r.id, mine: r.from_id === self, body: r.body, at: r.at }));
  });

export const sendLive = createServerFn({ method: "POST" })
  .validator((input: { self: string; to: string; body: string }) => ({
    self: selfId(input.self),
    to: String(input.to || "").slice(0, 80),
    body: String(input.body || "").trim().slice(0, 500),
  }))
  .handler(async ({ data }) => {
    if (!data.to || !data.body || data.to === data.self) return;
    await rpc("hdar_send", { p_self: data.self, p_to: data.to, p_body: data.body });
  });

export const blockLive = createServerFn({ method: "POST" })
  .validator((input: { self: string; other: string }) => ({
    self: selfId(input.self),
    other: String(input.other || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.other || data.other === data.self) return;
    await rpc("hdar_block", { p_self: data.self, p_other: data.other });
  });

export const reportLive = createServerFn({ method: "POST" })
  .validator((input: { self: string; other: string }) => ({
    self: selfId(input.self),
    other: String(input.other || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.other || data.other === data.self) return;
    await rpc("hdar_report", { p_self: data.self, p_other: data.other });
  });
