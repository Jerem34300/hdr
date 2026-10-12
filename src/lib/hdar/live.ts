/**
 * Presence, live chat, call signaling and shared places, stored in a shared
 * Supabase project. Called straight from the browser: the publishable key is
 * public by design, tables sit in a private schema, and every operation goes
 * through a validated `hdar_*` SQL function (see supabase/*.sql). Talking to
 * Supabase directly keeps polling off the host's serverless function quota.
 *
 * Each call keeps the `{ data }` argument shape of the server functions it
 * replaced, so call sites read the same.
 */

import { SUPABASE_KEY, SUPABASE_URL, accessToken } from "./session";

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
  kind: "text" | "image" | "audio";
  duration: number | null;
};

export type SignalKind = "offer" | "answer" | "hangup";
export type SignalRow = { id: number; from_id: string; pseudo: string; kind: SignalKind; payload: string };

export type SpotRow = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  closesAt: number;
  mine: boolean;
  members: number;
};

export type SpotLine = { id: string; fromId: string; pseudo: string; body: string; at: string; mine: boolean };

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
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

/** Postgres `timestamptz::text` ("2026-10-10 17:50:31.88+00") to ms; Safari needs strict ISO. */
export function pgTime(v: string): number {
  const iso = v.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

function selfId(value: string) {
  const id = String(value || "").trim().slice(0, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identité invalide");
  return id.toLowerCase();
}

function otherId(value: string) {
  return String(value || "").trim().slice(0, 80).toLowerCase();
}

// Presence ---------------------------------------------------------------

export async function pulse({
  data,
}: {
  data: { self: string; lat: number; lng: number; pseudo: string; desires: string; hours: number };
}) {
  if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return;
  await rpc("hdar_pulse", {
    p_self: selfId(data.self),
    p_lat: data.lat,
    p_lng: data.lng,
    p_pseudo: String(data.pseudo || "Anonyme").trim().slice(0, 24) || "Anonyme",
    p_desires: String(data.desires || "").slice(0, 80),
    p_hours: Math.round(Math.min(12, Math.max(1, Number(data.hours) || 3))),
  });
}

export async function goDark({ data }: { data: string }) {
  await rpc("hdar_go_dark", { p_self: selfId(data) });
}

export async function listLive({ data }: { data: string }): Promise<LivePin[]> {
  const rows = await rpc<{ id: string; pseudo: string; lat: number; lng: number; desires: string }[]>(
    "hdar_list_live",
    { p_self: selfId(data) },
  );
  return rows.map((r) => ({
    id: r.id,
    pseudo: r.pseudo,
    lat: Number(r.lat),
    lng: Number(r.lng),
    hot: r.desires.split(",").includes("plan"),
  }));
}

// Private chat -------------------------------------------------------------

export async function readThread({ data }: { data: { self: string; withId: string } }): Promise<LiveMsg[]> {
  const self = selfId(data.self);
  const withId = otherId(data.withId);
  if (!withId || withId === self) return [];
  const rows = await rpc<
    { id: string; from_id: string; body: string; at: string; kind: LiveMsg["kind"]; duration: number | null }[]
  >("hdar_thread", { p_self: self, p_with: withId });
  return rows.map((r) => ({
    id: r.id,
    mine: r.from_id === self,
    body: r.body,
    at: r.at,
    kind: r.kind,
    duration: r.duration,
  }));
}

export async function sendLive({ data }: { data: { self: string; to: string; body: string } }) {
  const body = String(data.body || "").trim().slice(0, 500);
  if (!body) return;
  await rpc("hdar_send", { p_self: selfId(data.self), p_to: otherId(data.to), p_body: body });
}

export async function sendMedia({
  data,
}: {
  data: { self: string; to: string; kind: "image" | "audio"; media: string; duration?: number };
}) {
  await rpc("hdar_send_media", {
    p_self: selfId(data.self),
    p_to: otherId(data.to),
    p_kind: data.kind,
    p_media: data.media,
    p_duration: data.duration ?? null,
  });
}

const mediaCache = new Map<string, Promise<string>>();

/** Loads a photo / voice note once per session; only the two people in the thread can read it. */
export function getMedia(self: string, id: string): Promise<string> {
  let hit = mediaCache.get(id);
  if (!hit) {
    hit = rpc<string | null>("hdar_get_media", { p_self: selfId(self), p_id: id }).then((v) => v ?? "");
    hit.catch(() => mediaCache.delete(id));
    mediaCache.set(id, hit);
  }
  return hit;
}

export async function blockLive({ data }: { data: { self: string; other: string } }) {
  await rpc("hdar_block", { p_self: selfId(data.self), p_other: otherId(data.other) });
}

export async function reportLive({ data }: { data: { self: string; other: string } }) {
  await rpc("hdar_report", { p_self: selfId(data.self), p_other: otherId(data.other) });
}

// Video call signaling -----------------------------------------------------

export async function sendSignal(self: string, to: string, kind: SignalKind, payload = "") {
  await rpc("hdar_signal_send", { p_self: selfId(self), p_to: selfId(to), p_kind: kind, p_payload: payload });
}

export async function pollSignals(self: string, after: number): Promise<SignalRow[]> {
  return rpc<SignalRow[]>("hdar_signal_poll", { p_self: selfId(self), p_after: after });
}

// Shared places --------------------------------------------------------------

export async function createSpot(input: {
  self: string;
  title: string;
  hours: number;
  lat: number;
  lng: number;
  pseudo: string;
}): Promise<string> {
  return rpc<string>("hdar_spot_create", {
    p_self: selfId(input.self),
    p_title: input.title,
    p_hours: Math.round(input.hours),
    p_lat: input.lat,
    p_lng: input.lng,
    p_pseudo: input.pseudo,
  });
}

export async function listSpots(self: string, lat: number, lng: number): Promise<SpotRow[]> {
  const rows = await rpc<
    { id: string; title: string; lat: number; lng: number; closes_at: string; mine: boolean; members: number }[]
  >("hdar_spot_list", { p_self: selfId(self), p_lat: lat, p_lng: lng });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lat: Number(r.lat),
    lng: Number(r.lng),
    closesAt: pgTime(r.closes_at),
    mine: r.mine,
    members: Number(r.members) || 1,
  }));
}

export async function closeSpot(self: string, id: string): Promise<boolean> {
  return rpc<boolean>("hdar_spot_close", { p_self: selfId(self), p_id: id });
}

export async function spotMessages(self: string, id: string): Promise<SpotLine[]> {
  const rows = await rpc<
    { id: string; from_id: string; pseudo: string; body: string; at: string; mine: boolean }[]
  >("hdar_spot_messages", { p_self: selfId(self), p_id: id });
  return rows.map((r) => ({ id: r.id, fromId: r.from_id, pseudo: r.pseudo, body: r.body, at: r.at, mine: r.mine }));
}

export async function sendSpotMessage(self: string, id: string, pseudo: string, body: string) {
  await rpc("hdar_spot_send", { p_self: selfId(self), p_id: id, p_pseudo: pseudo, p_body: body });
}

export async function hideSpotMessage(self: string, id: string) {
  await rpc("hdar_spot_msg_hide", { p_self: selfId(self), p_id: id });
}

// Public profiles ------------------------------------------------------------

export type PublicProfile = {
  id: string;
  pseudo: string;
  age: number | null;
  bio: string;
  tags: string[];
  desires: string[];
  photo: string;
  online: boolean;
  lat: number | null;
  lng: number | null;
};

export async function saveProfile(input: {
  self: string;
  pseudo: string;
  age: number | null;
  bio: string;
  tags: string[];
  photos: string[];
  voice: string;
  voiceSec: number;
}) {
  await rpc("hdar_profile_save", {
    p_self: selfId(input.self),
    p_pseudo: input.pseudo,
    p_age: input.age,
    p_bio: input.bio,
    p_tags: input.tags.join(","),
    p_photos: input.photos.filter((p) => p.startsWith("data:image/")).slice(0, 5),
    p_voice: input.voice.startsWith("data:audio/") ? input.voice : "",
    p_voice_sec: input.voiceSec,
  });
}

export type ProfileExtras = { album: string[]; voice: string; voiceSec: number };

/** Album and voice intro, loaded only when a profile page is opened. */
export async function getProfileExtras(self: string, id: string): Promise<ProfileExtras> {
  const rows = await rpc<{ album: string[] | null; voice: string | null; voice_sec: number | null }[]>(
    "hdar_profile_extras",
    { p_self: selfId(self), p_id: otherId(id) },
  );
  const r = rows[0];
  return { album: r?.album ?? [], voice: r?.voice ?? "", voiceSec: r?.voice_sec ?? 0 };
}

const split = (v: string | null | undefined) => (v ? v.split(",").filter(Boolean) : []);

export async function getProfile(self: string, id: string): Promise<PublicProfile | null> {
  const rows = await rpc<
    {
      id: string;
      pseudo: string;
      age: number | null;
      bio: string;
      tags: string;
      desires: string;
      photo: string | null;
      online: boolean;
      lat: number | null;
      lng: number | null;
    }[]
  >("hdar_profile_get", { p_self: selfId(self), p_id: otherId(id) });
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    pseudo: r.pseudo,
    age: r.age,
    bio: r.bio,
    tags: split(r.tags),
    desires: split(r.desires),
    photo: r.photo ?? "",
    online: r.online,
    lat: r.lat,
    lng: r.lng,
  };
}

// Neighbourhood chat ---------------------------------------------------------

export type AreaLine = {
  id: string;
  fromId: string;
  pseudo: string;
  body: string;
  at: string;
  mine: boolean;
  lat: number;
  lng: number;
};

export async function areaFeed(self: string, lat: number, lng: number): Promise<AreaLine[]> {
  const rows = await rpc<
    { id: string; from_id: string; pseudo: string; body: string; at: string; mine: boolean; lat: number; lng: number }[]
  >("hdar_area_feed", { p_self: selfId(self), p_lat: lat, p_lng: lng });
  return rows.map((r) => ({
    id: r.id,
    fromId: r.from_id,
    pseudo: r.pseudo,
    body: r.body,
    at: r.at,
    mine: r.mine,
    lat: Number(r.lat),
    lng: Number(r.lng),
  }));
}

export async function areaSend(self: string, lat: number, lng: number, pseudo: string, body: string) {
  await rpc("hdar_area_send", { p_self: selfId(self), p_lat: lat, p_lng: lng, p_pseudo: pseudo, p_body: body });
}

export async function areaHide(self: string, id: string) {
  await rpc("hdar_area_hide", { p_self: selfId(self), p_id: id });
}

// Conversations list ---------------------------------------------------------

export type Conversation = {
  otherId: string;
  pseudo: string;
  lastKind: LiveMsg["kind"];
  lastBody: string;
  lastAt: number;
  lastMine: boolean;
};

export async function listConversations(self: string): Promise<Conversation[]> {
  const rows = await rpc<
    { other_id: string; pseudo: string; last_kind: LiveMsg["kind"]; last_body: string; last_at: string; last_mine: boolean }[]
  >("hdar_conversations", { p_self: selfId(self) });
  return rows.map((r) => ({
    otherId: r.other_id,
    pseudo: r.pseudo,
    lastKind: r.last_kind,
    lastBody: r.last_body,
    lastAt: pgTime(r.last_at),
    lastMine: r.last_mine,
  }));
}

/** Hides a private conversation for the caller only; a new message brings it back. */
export async function hideConversation(self: string, other: string) {
  await rpc("hdar_conversation_hide", { p_self: selfId(self), p_other: otherId(other) });
}

// Activity & moderation ------------------------------------------------------

/** Marks this device as active (app open). Throws "Compte suspendu" for a banned device. */
export async function hit(self: string) {
  await rpc("hdar_hit", { p_self: selfId(self) });
}

/** Reports someone with a reason; also blocks them both ways. */
export async function reportWithReason(self: string, other: string, reason: string) {
  await rpc("hdar_report_reason", { p_self: selfId(self), p_other: otherId(other), p_reason: reason.slice(0, 200) });
}

// Admin (every call is checked against the admin key in the database) ----------

export type AdminStats = Record<string, number> & {
  days: { day: string; visitors: number; new_profiles: number; messages: number }[];
};
export type AdminReportRow = {
  target_id: string;
  pseudo: string;
  photo: string | null;
  reports: number;
  reasons: string | null;
  last_at: string;
  banned: boolean;
};
export type AdminUser = {
  id: string;
  profile: {
    pseudo: string;
    age: number | null;
    bio: string;
    tags: string;
    album: string[];
    voice: string | null;
    created_at: string;
    online: boolean;
  } | null;
  device: { first_seen: string; last_seen: string; sessions: number } | null;
  banned: { reason: string; at: string } | null;
  reports: { reporter: string; reporter_id: string; reason: string; at: string; handled: boolean }[];
  sent_to_reporters: { to: string; kind: string; body: string; media: string | null; at: string }[];
  area_messages: { id: string; body: string; at: string; removed: boolean }[];
  stats: { pm_sent: number; people_contacted: number; blocked_by: number };
};
export type AdminAreaRow = { id: string; from_id: string; pseudo: string; body: string; at: string; removed: boolean };
export type AdminBanRow = { user_id: string; pseudo: string; reason: string; at: string };

export const admin = {
  stats: (key: string) => rpc<AdminStats>("hdar_admin_stats", { p_key: key }),
  reports: (key: string, all: boolean) => rpc<AdminReportRow[]>("hdar_admin_reports", { p_key: key, p_all: all }),
  user: (key: string, id: string) => rpc<AdminUser>("hdar_admin_user", { p_key: key, p_id: id }),
  ban: (key: string, id: string, reason: string, ban: boolean) =>
    rpc("hdar_admin_ban", { p_key: key, p_id: id, p_reason: reason, p_ban: ban }),
  dismiss: (key: string, id: string) => rpc("hdar_admin_dismiss", { p_key: key, p_id: id }),
  area: (key: string) => rpc<AdminAreaRow[]>("hdar_admin_area", { p_key: key }),
  hideArea: (key: string, id: string) => rpc("hdar_admin_hide_area", { p_key: key, p_id: id }),
  banned: (key: string) => rpc<AdminBanRow[]>("hdar_admin_banned", { p_key: key }),
};
