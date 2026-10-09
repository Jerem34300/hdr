import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

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

function threadId(a: string, b: string) {
  return [a, b].sort().join(":");
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
    const until = new Date(Date.now() + data.hours * 3_600_000).toISOString();
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, pseudo, lat, lng, desires, visible_until, updated_at)
      values (${data.self}, ${data.pseudo}, ${data.lat}, ${data.lng}, ${data.desires}, ${until}, now())
      on conflict (user_id) do update set
        pseudo = excluded.pseudo,
        lat = excluded.lat,
        lng = excluded.lng,
        desires = excluded.desires,
        visible_until = excluded.visible_until,
        updated_at = now()
    `;
  });

export const goDark = createServerFn({ method: "POST" })
  .validator((self: string) => selfId(self))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`update profiles set visible_until = now() where user_id = ${data}`;
  });

export const listLive = createServerFn({ method: "GET" })
  .validator((self: string) => selfId(self))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; pseudo: string; lat: number; lng: number; desires: string }>`
      select p.user_id as id, p.pseudo, p.lat, p.lng, p.desires
      from profiles p
      where p.visible_until > now()
        and p.user_id <> ${data}
        and p.lat is not null
        and not exists (
          select 1 from live_blocks b
          where (b.user_id = ${data} and b.blocked_id = p.user_id)
             or (b.user_id = p.user_id and b.blocked_id = ${data})
        )
    `;
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
    const sql = await getSql();
    const rows = await sql<{ id: string; from_id: string; body: string; at: string }>`
      select id, from_id, body, created_at::text as at
      from live_messages
      where thread_id = ${threadId(data.self, data.withId)}
      order by created_at asc
      limit 200
    `;
    return rows.map((r) => ({ id: r.id, mine: r.from_id === data.self, body: r.body, at: r.at }));
  });

export const sendLive = createServerFn({ method: "POST" })
  .validator((input: { self: string; to: string; body: string }) => ({
    self: selfId(input.self),
    to: String(input.to || "").slice(0, 80),
    body: String(input.body || "").trim().slice(0, 500),
  }))
  .handler(async ({ data }) => {
    if (!data.to || !data.body || data.to === data.self) return;
    const sql = await getSql();
    const blocked = await sql<{ n: number }>`
      select 1 as n from live_blocks
      where (user_id = ${data.self} and blocked_id = ${data.to})
         or (user_id = ${data.to} and blocked_id = ${data.self})
      limit 1
    `;
    if (blocked.length) return;
    await sql`
      insert into live_messages (id, thread_id, from_id, body)
      values (${crypto.randomUUID()}, ${threadId(data.self, data.to)}, ${data.self}, ${data.body})
    `;
  });

export const blockLive = createServerFn({ method: "POST" })
  .validator((input: { self: string; other: string }) => ({
    self: selfId(input.self),
    other: String(input.other || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.other || data.other === data.self) return;
    const sql = await getSql();
    await sql`
      insert into live_blocks (user_id, blocked_id) values (${data.self}, ${data.other})
      on conflict do nothing
    `;
    await sql`
      insert into live_blocks (user_id, blocked_id) values (${data.other}, ${data.self})
      on conflict do nothing
    `;
  });

export const reportLive = createServerFn({ method: "POST" })
  .validator((input: { self: string; other: string }) => ({
    self: selfId(input.self),
    other: String(input.other || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.other || data.other === data.self) return;
    const sql = await getSql();
    await sql`
      insert into live_reports (id, reporter_id, target_id)
      values (${crypto.randomUUID()}, ${data.self}, ${data.other})
    `;
    await sql`
      insert into live_blocks (user_id, blocked_id) values (${data.self}, ${data.other})
      on conflict do nothing
    `;
    await sql`
      insert into live_blocks (user_id, blocked_id) values (${data.other}, ${data.self})
      on conflict do nothing
    `;
  });
