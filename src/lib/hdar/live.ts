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
import { track } from "./track";
import { deviceId } from "./device";
import { PAYMENTS_ENABLED, showLaunchOffer } from "./payments";

export type LivePin = {
  id: string;
  pseudo: string;
  lat: number;
  lng: number;
  hot: boolean;
  premium?: boolean;
};

export type LiveMsg = {
  id: string;
  mine: boolean;
  body: string;
  at: string;
  kind: "text" | "image" | "audio" | "location" | "video";
  duration: number | null;
  replyTo?: string | null;
  reply?: { pseudo: string; body: string } | null;
  reactions?: Reaction[];
  editedAt?: string | null;
  /** Transféré : "" = d'un message privé (auteur jamais nommé), sinon pseudo d'origine (salon). */
  fwd?: string | null;
};

/** Un message se modifie pendant 15 min après l'envoi (texte seulement, v76). */
export const EDIT_WINDOW_MS = 15 * 60_000;
export const canEditMsg = (mine: boolean, kind: string, atMs: number) => mine && kind === "text" && Date.now() - atMs < EDIT_WINDOW_MS;
export const editMessage = (scope: "dm" | "salon" | "area", id: string, body: string) =>
  rpc<{ body: string; edited_at: string }>("hdar_edit_message", { p_scope: scope, p_id: id, p_body: body });

/** Réaction emoji agrégée d'un message (v76). */
export type Reaction = { e: string; n: number; mine: boolean };
export const REACTIONS = ["❤️", "😂", "🔥", "👍", "😮", "😢"] as const;
export type ReactScope = "dm" | "salon" | "area";
/** Ajoute ou retire (2e appui) ma réaction ; renvoie les réactions à jour. */
export const reactTo = (scope: ReactScope, id: string, emoji: string) =>
  rpc<Reaction[]>("hdar_react", { p_scope: scope, p_id: id, p_emoji: emoji });
/** Applique localement un appui (affichage immédiat avant la réponse du serveur). */
export function toggleReaction(list: Reaction[] | undefined, emoji: string): Reaction[] {
  const cur = list ?? [];
  const hit = cur.find((r) => r.e === emoji);
  if (!hit) return [...cur, { e: emoji, n: 1, mine: true }];
  if (hit.mine) return cur.flatMap((r) => (r.e !== emoji ? [r] : r.n > 1 ? [{ ...r, n: r.n - 1, mine: false }] : []));
  return cur.map((r) => (r.e === emoji ? { ...r, n: r.n + 1, mine: true } : r));
}

export type SignalKind = "offer" | "answer" | "hangup";
export type SignalRow = {
  id: number;
  from_id: string;
  pseudo: string;
  kind: SignalKind;
  payload: string;
};

export type SpotRow = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  closesAt: number;
  mine: boolean;
  members: number;
  /** Fin du boost payant (ms), si actif. */
  boostedUntil?: number;
};

export type SpotLine = {
  id: string;
  fromId: string;
  pseudo: string;
  body: string;
  at: string;
  mine: boolean;
};

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${token}`,
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

/** Postgres `timestamptz::text` ("2026-10-10 17:50:31.88+00") to ms; Safari needs strict ISO. */
export function pgTime(v: string): number {
  const iso = v
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

/** Fonction SQL absente (base pas encore à jour) : on retombe sur l'ancienne. */
function missingFn(e: unknown) {
  return e instanceof Error && /could not find the function|schema cache/i.test(e.message);
}

function selfId(value: string) {
  const id = String(value || "")
    .trim()
    .slice(0, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identité invalide");
  return id.toLowerCase();
}

function otherId(value: string) {
  return String(value || "")
    .trim()
    .slice(0, 80)
    .toLowerCase();
}

// Presence ---------------------------------------------------------------

export async function pulse({
  data,
}: {
  data: { self: string; lat: number; lng: number; pseudo: string; desires: string; hours: number; note?: string };
}) {
  if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return;
  await rpc("hdar_pulse", {
    p_self: selfId(data.self),
    p_lat: data.lat,
    p_lng: data.lng,
    p_pseudo:
      String(data.pseudo || "Anonyme")
        .trim()
        .slice(0, 24) || "Anonyme",
    p_desires: String(data.desires || "").slice(0, 80),
    p_hours: Math.round(Math.min(12, Math.max(1, Number(data.hours) || 3))),
    p_note: String(data.note || "").trim().slice(0, 60),
  });
}

/** Le « mot » : phrase courte du profil (60 car.), visible par tous sur ta fiche. */
export const setProfileNote = (note: string) => rpc("hdar_note_set", { p_note: note.trim().slice(0, 60) });

export async function goDark({ data }: { data: string }) {
  await rpc("hdar_go_dark", { p_self: selfId(data) });
}

export async function listLive({ data }: { data: string }): Promise<LivePin[]> {
  const rows = await rpc<
    { id: string; pseudo: string; lat: number; lng: number; desires: string }[]
  >("hdar_list_live", { p_self: selfId(data) });
  return rows.map((r) => ({
    id: r.id,
    pseudo: r.pseudo,
    lat: Number(r.lat),
    lng: Number(r.lng),
    hot: r.desires.split(",").includes("plan"),
  }));
}

// Private chat -------------------------------------------------------------

type ThreadRow = {
  id: string; from_id: string; body: string; at: string; kind: LiveMsg["kind"]; duration: number | null;
  reply_to?: string | null; reply?: { pseudo: string; body: string } | null; reactions?: Reaction[]; edited_at?: string | null; fwd?: string | null;
};

export async function readThread({
  data,
}: {
  data: { self: string; withId: string };
}): Promise<LiveMsg[]> {
  const self = selfId(data.self);
  const withId = otherId(data.withId);
  if (!withId || withId === self) return [];
  let rows: ThreadRow[];
  try {
    rows = await rpc<ThreadRow[]>("hdar_thread2", { p_with: withId });
  } catch (e) {
    if (!missingFn(e)) throw e;
    rows = await rpc<ThreadRow[]>("hdar_thread", { p_self: self, p_with: withId });
  }
  return rows.map((r) => ({
    id: r.id,
    mine: r.from_id === self,
    body: r.body,
    at: r.at,
    kind: r.kind,
    duration: r.duration,
    replyTo: r.reply_to ?? null,
    reply: r.reply ?? null,
    reactions: r.reactions ?? [],
    editedAt: r.edited_at ?? null,
    fwd: r.fwd ?? null,
  }));
}

export async function sendLive({ data }: { data: { self: string; to: string; body: string; replyTo?: string | null } }) {
  const body = String(data.body || "")
    .trim()
    .slice(0, 500);
  if (!body) return;
  try {
    await rpc("hdar_send2", { p_to: otherId(data.to), p_body: body, p_reply: data.replyTo ?? null });
  } catch (e) {
    if (!missingFn(e)) throw e;
    await rpc("hdar_send", { p_self: selfId(data.self), p_to: otherId(data.to), p_body: body });
  }
  track("msg_pm");
  // Propose push notifications only after a real conversation gesture, never on load.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("hdar-ask-push"));
}

export async function sendMedia({
  data,
}: {
  data: { self: string; to: string; kind: "image" | "audio" | "video"; media: string; duration?: number | null };
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
    hit = rpc<string | null>("hdar_get_media", { p_self: selfId(self), p_id: id }).then(
      (v) => v ?? "",
    );
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
  await rpc("hdar_signal_send", {
    p_self: selfId(self),
    p_to: selfId(to),
    p_kind: kind,
    p_payload: payload,
  });
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
    {
      id: string;
      title: string;
      lat: number;
      lng: number;
      closes_at: string;
      mine: boolean;
      members: number;
      boosted_until?: string | null;
    }[]
  >("hdar_spot_list", { p_self: selfId(self), p_lat: lat, p_lng: lng });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lat: Number(r.lat),
    lng: Number(r.lng),
    closesAt: pgTime(r.closes_at),
    mine: r.mine,
    members: Number(r.members) || 1,
    boostedUntil: r.boosted_until ? pgTime(r.boosted_until) : undefined,
  }));
}

export async function closeSpot(self: string, id: string): Promise<boolean> {
  return rpc<boolean>("hdar_spot_close", { p_self: selfId(self), p_id: id });
}

export async function spotMessages(self: string, id: string): Promise<SpotLine[]> {
  const rows = await rpc<
    { id: string; from_id: string; pseudo: string; body: string; at: string; mine: boolean }[]
  >("hdar_spot_messages", { p_self: selfId(self), p_id: id });
  return rows.map((r) => ({
    id: r.id,
    fromId: r.from_id,
    pseudo: r.pseudo,
    body: r.body,
    at: r.at,
    mine: r.mine,
  }));
}

export async function sendSpotMessage(self: string, id: string, pseudo: string, body: string) {
  await rpc("hdar_spot_send", { p_self: selfId(self), p_id: id, p_pseudo: pseudo, p_body: body });
  track("msg_spot");
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
  /** Phrase du moment (60 car.). */
  note: string;
  premium: boolean;
  iam: string;
  seeking: string[];
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
    p_photos: input.photos.filter((p) => p.startsWith("data:image/")).slice(0, 20),
    p_voice: input.voice.startsWith("data:audio/") ? input.voice : "",
    p_voice_sec: input.voiceSec,
  });
}

export type ProfileExtras = { album: string[]; voice: string; voiceSec: number };

/** Album and voice intro, loaded only when a profile page is opened. */
export async function getProfileExtras(self: string, id: string): Promise<ProfileExtras> {
  const rows = await rpc<
    { album: string[] | null; voice: string | null; voice_sec: number | null }[]
  >("hdar_profile_extras", { p_self: selfId(self), p_id: otherId(id) });
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
      note?: string | null;
      premium?: boolean | null;
      iam?: string | null;
      seeking?: string | null;
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
    note: r.note ?? "",
    premium: !!r.premium,
    iam: r.iam ?? "",
    seeking: split(r.seeking),
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
    {
      id: string;
      from_id: string;
      pseudo: string;
      body: string;
      at: string;
      mine: boolean;
      lat: number;
      lng: number;
    }[]
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

export async function areaSend(
  self: string,
  lat: number,
  lng: number,
  pseudo: string,
  body: string,
) {
  await rpc("hdar_area_send", {
    p_self: selfId(self),
    p_lat: lat,
    p_lng: lng,
    p_pseudo: pseudo,
    p_body: body,
  });
  track("msg_area");
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
    {
      other_id: string;
      pseudo: string;
      last_kind: LiveMsg["kind"];
      last_body: string;
      last_at: string;
      last_mine: boolean;
    }[]
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
  void recordCity();
}

/** Ville approximative (géolocalisation Netlify, sans IP) rattachée au profil, au plus une fois toutes les 12 h. */
async function recordCity() {
  const KEY = "hdar-city-at";
  try {
    if (Date.now() - Number(localStorage.getItem(KEY) || 0) < 12 * 3600 * 1000) return;
    localStorage.setItem(KEY, String(Date.now()));
    const r = await fetch("/api/geo", { cache: "no-store" });
    const { city } = (await r.json()) as { city: string | null };
    if (city) await rpc("hdar_set_city", { p_city: city });
  } catch {
    /* statistique facultative */
  }
}

/** Reports someone with a reason; also blocks them both ways. */
export async function reportWithReason(self: string, other: string, reason: string) {
  await rpc("hdar_report_reason", {
    p_self: selfId(self),
    p_other: otherId(other),
    p_reason: reason.slice(0, 200),
  });
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
  reports: {
    reporter: string;
    reporter_id: string;
    reason: string;
    at: string;
    handled: boolean;
  }[];
  sent_to_reporters: { to: string; kind: string; body: string; media: string | null; at: string }[];
  area_messages: { id: string; body: string; at: string; removed: boolean }[];
  stats: { pm_sent: number; people_contacted: number; blocked_by: number };
};
export type AdminAreaRow = {
  id: string;
  from_id: string;
  pseudo: string;
  body: string;
  at: string;
  removed: boolean;
};
export type AdminBanRow = { user_id: string; pseudo: string; reason: string; at: string };

export type AdminPhotoRow = { id: string; pseudo: string; photo: string; at: string };

export const admin = {
  users: (key: string, q: string | null, offset: number) => rpc<{ total: number; rows: AdminUserRow[] }>("hdar_admin_users", { p_key: key, p_q: q || null, p_offset: offset, p_limit: 50 }),
  userExtra: (key: string, id: string) => rpc<AdminUserExtra>("hdar_admin_user_extra", { p_key: key, p_id: id }),
  gift: (key: string, id: string, kind: "premium" | "boost" | "hearts", amount: number, msg: string) => rpc<{ ok: boolean; label: string }>("hdar_admin_gift", { p_key: key, p_id: id, p_kind: kind, p_amount: amount, p_msg: msg || null }),
  reattach: (key: string, pseudo: string, target: string) => rpc<{ ok: boolean; profile: string }>("hdar_admin_reattach", { p_key: key, p_pseudo: pseudo, p_target: target }),
  stats: (key: string) => rpc<AdminStats>("hdar_admin_stats", { p_key: key }),
  reports: (key: string, all: boolean) =>
    rpc<AdminReportRow[]>("hdar_admin_reports", { p_key: key, p_all: all }),
  user: (key: string, id: string) => rpc<AdminUser>("hdar_admin_user", { p_key: key, p_id: id }),
  ban: (key: string, id: string, reason: string, ban: boolean) =>
    rpc("hdar_admin_ban", { p_key: key, p_id: id, p_reason: reason, p_ban: ban }),
  dismiss: (key: string, id: string) => rpc("hdar_admin_dismiss", { p_key: key, p_id: id }),
  area: (key: string) => rpc<AdminAreaRow[]>("hdar_admin_area", { p_key: key }),
  hideArea: (key: string, id: string) => rpc("hdar_admin_hide_area", { p_key: key, p_id: id }),
  banned: (key: string) => rpc<AdminBanRow[]>("hdar_admin_banned", { p_key: key }),
  photos: (key: string) => rpc<AdminPhotoRow[]>("hdar_admin_photos", { p_key: key }),
  reviewPhoto: (key: string, id: string, ok: boolean) =>
    rpc("hdar_admin_photo_review", { p_key: key, p_id: id, p_ok: ok }),
  contacts: (key: string, all: boolean) =>
    rpc<AdminContactRow[]>("hdar_admin_contacts", { p_key: key, p_all: all }),
  handleContact: (key: string, id: number) =>
    rpc("hdar_admin_contact_handle", { p_key: key, p_id: id }),
};

// Favorites --------------------------------------------------------------

export type FavoriteRow = { id: string; pseudo: string; live: boolean; photo: boolean };

export function toggleFavorite(self: string, id: string) {
  return rpc<boolean>("hdar_fav_toggle", { p_self: selfId(self), p_id: otherId(id) });
}

export function listFavorites(self: string) {
  return rpc<FavoriteRow[]>("hdar_favorites", { p_self: selfId(self) });
}

/** Exact position, sent only to one person on explicit request. Expires after `minutes` (0 = never). */
export async function sendLocation(
  self: string,
  to: string,
  lat: number,
  lng: number,
  minutes = 60,
) {
  await rpc("hdar_send_location", {
    p_self: selfId(self),
    p_to: otherId(to),
    p_lat: lat,
    p_lng: lng,
    p_minutes: minutes,
  });
}

export async function flagMyPhoto(self: string, reason: string) {
  await rpc("hdar_photo_flag", { p_self: selfId(self), p_reason: reason.slice(0, 80) });
}

/** Deletes everything about the caller on the server, including the anonymous auth user. */
export async function deleteMyData() {
  await rpc("hdar_delete_me", {});
}

// Web Push -----------------------------------------------------------------

export async function pushSubscribe(self: string, endpoint: string, p256dh: string, auth: string) {
  await rpc("hdar_push_subscribe", {
    p_self: selfId(self),
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  });
}

export async function pushUnsubscribe(self: string, endpoint: string | null) {
  await rpc("hdar_push_unsubscribe", { p_self: selfId(self), p_endpoint: endpoint });
}

/** Marks the thread read by me; returns when the other person last read it (ms) or null. */
export async function markRead(self: string, withId: string): Promise<number | null> {
  const r = await rpc<string | null>("hdar_mark_read", {
    p_self: selfId(self),
    p_with: otherId(withId),
  });
  return r ? pgTime(r) : null;
}

export type ContactSubject = "rgpd" | "signalement" | "autre";
export type AdminContactRow = {
  id: number;
  user_id: string | null;
  subject: ContactSubject;
  body: string;
  reply_to: string | null;
  at: string;
  handled: boolean;
};
export function sendContact(subject: ContactSubject, body: string, reply: string) {
  return rpc("hdar_contact_send", { p_subject: subject, p_body: body, p_reply: reply });
}

export type ActivitySpot = { id: string; created: string; mine: boolean; joined: boolean; last: string | null; near: boolean };
export function activity(lat: number | null, lng: number | null, areaSince: string | null) {
  return rpc<{ area: number; spots: ActivitySpot[]; places?: { id: string; last: string }[] }>("hdar_activity", { p_lat: lat, p_lng: lng, p_area_since: areaSince });
}

export type PlaceKind = "cruising" | "beach" | "park" | "garden" | "viewpoint" | "square" | "promenade" | "aire" | "other" | "toilets" | "bar" | "club" | "sauna";
export type PlacePin = { id: string; kind: PlaceKind; name: string; lat: number; lng: number; partner: boolean; pro_boost?: boolean };
export type PlaceDetail = PlacePin & { description: string; source: string; source_ref: string | null };
export function listPlaces(s: number, w: number, n: number, e: number) {
  return rpc<PlacePin[]>("hdar_places", { p_s: s, p_w: w, p_n: n, p_e: e });
}
export async function getPlace(id: string) {
  const rows = await rpc<PlaceDetail[]>("hdar_place_get", { p_id: id });
  return rows[0] ?? null;
}
export function proposePlace(kind: PlaceKind, name: string, description: string, lat: number, lng: number) {
  return rpc("hdar_place_propose", { p_kind: kind, p_name: name, p_description: description, p_lat: lat, p_lng: lng });
}
export type AdminPlaceRow = { id: string; kind: PlaceKind; name: string; description: string; lat: number; lng: number; submitted_by: string | null; at: string };
export const adminPlaces = {
  list: (key: string) => rpc<AdminPlaceRow[]>("hdar_admin_places", { p_key: key }),
  review: (key: string, id: string, ok: boolean) => rpc("hdar_admin_place_review", { p_key: key, p_id: id, p_ok: ok }),
};

export type PlaceLine = { id: string; from_id: string; pseudo: string; body: string; at: string; mine: boolean };
export function placeMessages(id: string) {
  return rpc<PlaceLine[]>("hdar_place_messages", { p_id: id });
}
export async function placeSend(id: string, body: string, lat: number | null, lng: number | null) {
  await rpc("hdar_place_send", { p_id: id, p_body: body, p_lat: lat, p_lng: lng });
  track("msg_place");
}
export function placeHide(msg: string) {
  return rpc("hdar_place_hide", { p_msg: msg });
}

export function listOutings(s: number, w: number, n: number, e: number) {
  return rpc<{ id: string; kind: PlaceKind; name: string; lat: number; lng: number }[]>("hdar_outings", { p_s: s, p_w: w, p_n: n, p_e: e });
}
export function listToilets(s: number, w: number, n: number, e: number) {
  return rpc<{ id: string; lat: number; lng: number }[]>("hdar_toilets", { p_s: s, p_w: w, p_n: n, p_e: e });
}

// Admin analytics + monetization (v23/v24) ----------------------------------
export type OverviewDay = {
  day: string; visitors: number; sessions: number; new_devices: number; new_profiles: number;
  pm: number; area: number; place: number;
};
export type AdminOverview = {
  profiles_total: number; profiles_photo: number; devices_total: number; active_now: number; visible_now: number;
  dau: number; wau: number; mau: number; favorites_total: number; partners_active: number; boosts_active: number;
  retention: { d1: number; d1_cohort: number; d7: number; d7_cohort: number };
  days: OverviewDay[];
};
export type HeatCell = { lat: number; lng: number; presence: number; peak: number; hours: number };
export type WeekCell = { dow: number; hour: number; sessions: number; messages: number; presence: number };
export type TopPlace = {
  id: string; name: string; kind: string; partner: boolean; lat: number; lng: number;
  messages: number; views: number; visitors: number;
};
export type Influencer = {
  user_id: string; pseudo: string; photo: string | null; banned: boolean; online: boolean;
  pm: number; convs: number; area: number; place: number; views: number; favs: number; sessions: number; score: number;
};
export type BoostRow = {
  id: string; user_id: string; pseudo: string; starts_at: string; ends_at: string;
  price_cents: number; note: string | null; cancelled: boolean; active: boolean;
};
export type ListingRow = {
  id: string; starts_at: string; ends_at: string; price_cents: number; contact: string | null; note: string | null; cancelled: boolean;
};
export type PartnerRow = {
  id: string; name: string; kind: string; description: string | null; lat: number; lng: number;
  partner_until: string | null; active: boolean; listings: ListingRow[];
};

const num = <T extends Record<string, unknown>>(rows: T[]) =>
  rows.map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const k of Object.keys(o)) if (typeof o[k] === "string" && /^-?\d+(\.\d+)?$/.test(o[k] as string) && !["day", "user_id", "id", "pseudo", "name"].includes(k)) o[k] = Number(o[k]);
    return o as T;
  });

export const analytics = {
  overview: (key: string, days: number) => rpc<AdminOverview>("hdar_admin_overview", { p_key: key, p_days: days }),
  heat: async (key: string, days: number) => num(await rpc<HeatCell[]>("hdar_admin_heat", { p_key: key, p_days: days })),
  week: async (key: string, days: number) => num(await rpc<WeekCell[]>("hdar_admin_week", { p_key: key, p_days: days })),
  places: async (key: string, days: number) => num(await rpc<TopPlace[]>("hdar_admin_top_places", { p_key: key, p_days: days })),
  influencers: async (key: string, days: number) =>
    num(await rpc<Influencer[]>("hdar_admin_influencers", { p_key: key, p_days: days })),
  boosts: (key: string) => rpc<BoostRow[]>("hdar_admin_boosts", { p_key: key }),
  boostCreate: (key: string, user: string, starts: string | null, ends: string, price: number, note: string) =>
    rpc<string>("hdar_admin_boost_create", { p_key: key, p_user: user, p_starts: starts, p_ends: ends, p_price: price, p_note: note }),
  boostCancel: (key: string, id: string) => rpc("hdar_admin_boost_cancel", { p_key: key, p_id: id }),
  partners: (key: string) => rpc<PartnerRow[]>("hdar_admin_partners", { p_key: key }),
  partnerCreate: (key: string, p: { kind: string; name: string; description: string; lat: number; lng: number; ends: string; price: number; contact: string; note: string }) =>
    rpc<string>("hdar_admin_partner_create", {
      p_key: key, p_kind: p.kind, p_name: p.name, p_description: p.description, p_lat: p.lat, p_lng: p.lng,
      p_ends: p.ends, p_price: p.price, p_contact: p.contact, p_note: p.note,
    }),
  listingAdd: (key: string, place: string, starts: string | null, ends: string, price: number, contact: string, note: string) =>
    rpc("hdar_admin_listing_add", { p_key: key, p_place: place, p_starts: starts, p_ends: ends, p_price: price, p_contact: contact, p_note: note }),
  listingCancel: (key: string, id: string) => rpc("hdar_admin_listing_cancel", { p_key: key, p_id: id }),
};

export async function listBoosted(): Promise<string[]> {
  const rows = await rpc<{ id: string }[]>("hdar_boosted", {});
  return rows.map((r) => r.id);
}

// Avis, espace partenaire, boosts payants, paiements (v25) ---------------------
export type PlaceComment = { id: string; body: string; at: string; pseudo: string; mine: boolean; stars: number | null; reply?: string | null };
export type PlaceInfo = {
  website: string | null; contact: string | null; photos: string[]; owner: boolean;
  ratings_on: boolean; comments_on: boolean; comments_public: boolean;
  avg: number | null; count: number; mine: number | null; comments: PlaceComment[];
};
export const placeInfo = (id: string) => rpc<PlaceInfo | null>("hdar_place_info", { p_id: id });
export const placeRate = (id: string, stars: number | null) => rpc("hdar_place_rate", { p_id: id, p_stars: stars });
export const placeComment = (id: string, body: string) => rpc("hdar_place_comment", { p_id: id, p_body: body });
export const placeCommentDelete = (id: string) => rpc("hdar_place_comment_delete", { p_id: id });
export const placeCommentReport = (id: string, reason: string) => rpc("hdar_place_comment_report", { p_id: id, p_reason: reason });
export const placeClick = (id: string) => rpc("hdar_place_click", { p_id: id });
export const placeSeen = (id: string, lat: number | null, lng: number | null) => rpc("hdar_place_seen", { p_id: id, p_lat: lat, p_lng: lng });

export type PriceRow = { product: string; kind: "listing" | "boost" | "place_boost" | "premium" | "hearts" | "pro_boost"; label: string; price_cents: number };
export const pricing = () => rpc<PriceRow[]>("hdar_pricing", {});

export type MyPlace = {
  id: string; kind: PlaceKind; name: string; description: string; lat: number; lng: number;
  website: string | null; contact: string | null; photos: string[];
  ratings_on: boolean; comments_on: boolean; comments_public: boolean;
  partner_until: string | null; pro_boost_until?: string | null; active: boolean; status: string; sub_status: string | null;
};
export type PartnerInput = Omit<MyPlace, "id" | "partner_until" | "pro_boost_until" | "active" | "status" | "sub_status"> & { id: string | null };
export const myPlaces = () => rpc<MyPlace[]>("hdar_my_places", {});
export const partnerSave = (p: PartnerInput) =>
  rpc<string>("hdar_partner_save", {
    p_id: p.id, p_kind: p.kind, p_name: p.name, p_description: p.description, p_lat: p.lat, p_lng: p.lng,
    p_website: p.website, p_contact: p.contact, p_photos: p.photos,
    p_ratings_on: p.ratings_on, p_comments_on: p.comments_on, p_comments_public: p.comments_public,
  });
export type ZoneCount = { lat: number; lng: number; n: number };
export type PartnerStats = {
  views: number; clicks: number; messages: number; visitors: number; avg: number | null; ratings: number; comments: number;
  days: { day: string; views: number; clicks: number; messages: number; visitors: number }[];
  zones: ZoneCount[]; hours: { hour: number; n: number }[];
};
export const partnerStats = (id: string, days: number) => rpc<PartnerStats>("hdar_partner_stats", { p_id: id, p_days: days });
export type MyBoost = { id: string; starts_at: string; ends_at: string; active: boolean; cancelled: boolean; views: number; messages: number };
export type MySpot = { id: string; title: string; closes_at: string; boosted_until: string | null };
export const mySpots = () => rpc<MySpot[]>("hdar_my_spots", {});
export const myBoosts = () => rpc<MyBoost[]>("hdar_my_boosts", {});

async function checkoutCall(method: "GET" | "POST", body?: unknown) {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hdar-checkout`, {
    method,
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const b = (await res.json().catch(() => ({}))) as { url?: string; enabled?: boolean; error?: string; message?: string };
  if (res.status === 503 || b.error === "not_configured") throw new Error("Paiement bientôt disponible");
  if (!res.ok) throw new Error(b.message || `Serveur indisponible (${res.status})`);
  return b;
}
export async function paymentsEnabled() {
  if (!PAYMENTS_ENABLED) return true; // boutons actifs : ils ouvrent l'offre de lancement
  try {
    return !!(await checkoutCall("GET")).enabled;
  } catch {
    return false;
  }
}
export async function startCheckout(product: string, placeId: string | null) {
  if (!PAYMENTS_ENABLED) { showLaunchOffer(product, placeId); return; }
  const b = await checkoutCall("POST", { product, place_id: placeId });
  if (b.url) window.location.assign(b.url);
}
export async function openBillingPortal(back?: "premium" | "boost") {
  const b = await checkoutCall("POST", { action: "portal", back });
  if (b.url) window.location.assign(b.url);
}

export type AdminComment = {
  id: string; body: string; at: string; hidden: boolean; user_id: string; pseudo: string; place_id: string; place: string;
  reports: number; reasons: string[] | null;
};
export type PricingRow = PriceRow & { duration: string; active: boolean; sort: number; stripe_interval: string | null; stripe_interval_count: number | null };
export type RoiRow = {
  id: string; name: string; kind: string; partner: boolean; active: boolean; lat: number; lng: number;
  views: number; visitors: number; clicks: number; messages: number; ratings: number; avg_stars: number | null; comments: number; revenue_cents: number;
};
export type Growth = {
  funnel: { visitors: number; profiles: number; first_message: number };
  retention: { w1: number; w1_cohort: number; m1: number; m1_cohort: number };
  trend_zones: { lat: number; lng: number; now: number; prev: number | null }[];
  trend_places: { id: string; name: string; kind: string; lat: number; lng: number; now: number; prev: number | null }[];
  revenue: { total: number; count: number; payers: number; listings: number; boosts: number; premium?: number; hearts?: number; mau: number };
  revenue_zones: { lat: number; lng: number; cents: number; payers: number }[];
  payments: { at: string; kind: string; product: string; cents: number; user_id: string; place: string | null }[];
};
export const business = {
  growth: (key: string, days: number) => rpc<Growth>("hdar_admin_growth", { p_key: key, p_days: days }),
  roi: async (key: string, days: number) => num(await rpc<RoiRow[]>("hdar_admin_places_roi", { p_key: key, p_days: days })),
  origin: (key: string, place: string, days: number) =>
    rpc<{ zones: ZoneCount[]; hours: { hour: number; n: number }[] }>("hdar_admin_place_origin", { p_key: key, p_place: place, p_days: days }),
  comments: (key: string, reported: boolean) => rpc<AdminComment[]>("hdar_admin_comments", { p_key: key, p_reported: reported }),
  moderate: (key: string, id: string, action: "hide" | "show" | "delete" | "ok") =>
    rpc("hdar_admin_comment_moderate", { p_key: key, p_id: id, p_action: action }),
  pricing: (key: string) => rpc<PricingRow[]>("hdar_admin_pricing", { p_key: key }),
  pricingSet: (key: string, product: string, label: string, price: number, active: boolean) =>
    rpc("hdar_admin_pricing_set", { p_key: key, p_product: product, p_label: label, p_price: price, p_active: active }),
};

// Premium hdar+ (v29) ------------------------------------------------------------
export type MyPremium = { premium: boolean; until: string | null; status: string | null; photo_limit: number };
export const myPremium = () => rpc<MyPremium>("hdar_my_premium", {});
export type MapFilters = { minAge: number | null; maxAge: number | null; desires: string[]; places: string[]; iam: string[]; online: boolean; photo: boolean };
export const NO_FILTERS: MapFilters = { minAge: null, maxAge: null, desires: [], places: [], iam: [], online: false, photo: false };
export const filtersOn = (f: MapFilters) =>
  f.minAge != null || f.maxAge != null || f.desires.length > 0 || f.places.length > 0 || f.iam.length > 0 || f.online || f.photo;
export async function liveMap(f: MapFilters): Promise<(LivePin & { premium: boolean })[]> {
  const on = filtersOn(f);
  const rows = await rpc<{ id: string; pseudo: string; lat: number; lng: number; desires: string; premium: boolean }[]>("hdar_live_map", {
    p_min_age: on ? f.minAge : null, p_max_age: on ? f.maxAge : null,
    p_desires: on && f.desires.length ? f.desires : null, p_places: on && f.places.length ? f.places : null,
    p_online: on && f.online, p_photo: on && f.photo, p_iam: on && f.iam.length ? f.iam : null,
  });
  return rows.map((r) => ({ id: r.id, pseudo: r.pseudo, lat: Number(r.lat), lng: Number(r.lng), hot: (r.desires ?? "").split(",").includes("plan"), premium: !!r.premium }));
}
export type Admirer = { id: string; pseudo: string; at: string; live: boolean; photo: boolean };
export type Admirers = { premium: boolean; views: number; favs: number; viewers?: Admirer[]; fans?: Admirer[] };
export const admirers = () => rpc<Admirers>("hdar_admirers", {});
export type SearchHit = { id: string; pseudo: string; live: boolean; photo: boolean; premium: boolean };
export const searchPseudo = (q: string) => rpc<SearchHit[]>("hdar_search_pseudo", { p_q: q });
export const setIdentity = (iam: string, seeking: string[]) => rpc("hdar_identity_set", { p_iam: iam || null, p_seeking: seeking });
export const GENDERS = [
  { id: "h", short: "H", label: "Homme" },
  { id: "f", short: "F", label: "Femme" },
  { id: "x", short: "X", label: "X / non-binaire" },
] as const;
/** « H · cherche H, X » */
export function identityLine(iam: string, seeking: string[]) {
  const sh = (id: string) => GENDERS.find((g) => g.id === id)?.short ?? "";
  const a = sh(iam);
  const b = seeking.map(sh).filter(Boolean).join(", ");
  return [a, b && `cherche ${b}`].filter(Boolean).join(" · ");
}
// Media in public rooms (v30) ---------------------------------------------------

export type RoomMediaRow = { id: string; kind: "image" | "video" | "audio"; media: string; duration: number | null };
const roomMediaCache = new Map<string, Promise<RoomMediaRow | null>>();
export function roomMedia(scope: "area" | "place" | "spot" | "salon", id: string): Promise<RoomMediaRow | null> {
  const key = `${scope}:${id}`;
  let hit = roomMediaCache.get(key);
  if (!hit) {
    hit = rpc<RoomMediaRow[]>("hdar_room_media", { p_scope: scope, p_ids: [id] }).then((r) => r[0] ?? null);
    hit.catch(() => roomMediaCache.delete(key));
    roomMediaCache.set(key, hit);
  }
  return hit;
}
export const areaSendMedia = (lat: number, lng: number, pseudo: string, kind: string, path: string, duration: number | null) =>
  rpc("hdar_area_send_media", { p_lat: lat, p_lng: lng, p_pseudo: pseudo, p_kind: kind, p_path: path, p_duration: duration });
export const spotSendMedia = (id: string, pseudo: string, kind: string, path: string, duration: number | null) =>
  rpc("hdar_spot_send_media", { p_id: id, p_pseudo: pseudo, p_kind: kind, p_path: path, p_duration: duration });
export const placeSendMedia = (id: string, kind: string, path: string, duration: number | null, lat: number, lng: number) =>
  rpc("hdar_place_send_media", { p_id: id, p_kind: kind, p_path: path, p_duration: duration, p_lat: lat, p_lng: lng });
export const mediaReport = (scope: "area" | "place" | "spot" | "salon", id: string) => rpc("hdar_media_report", { p_scope: scope, p_id: id });

// Live roulette (v32) -------------------------------------------------------------
export type LiveCard = { pro?: { place: string; name: string; kind: string } | null; id: string; pseudo: string; age: number | null; iam: string | null; seeking: string | null; note: string | null; premium: boolean; role: "offer" | "answer" };
export type LiveState = Partial<LiveCard> & { waiting?: boolean; in_queue?: boolean; back_gone?: boolean; peer_gone?: boolean; online?: number };
/** Position pour la règle des 2 km du Live (arrondie à ~500 m côté serveur, jamais stockée exacte). */
let livePosVal: { lat: number; lng: number } | null = null; let livePosAt = 0;
export function livePos(): Promise<{ lat: number; lng: number } | null> {
  if (livePosVal && Date.now() - livePosAt < 600_000) return Promise.resolve(livePosVal);
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(livePosVal);
  return new Promise((res) => navigator.geolocation.getCurrentPosition(
    (g) => { livePosVal = { lat: g.coords.latitude, lng: g.coords.longitude }; livePosAt = Date.now(); res(livePosVal); },
    () => res(livePosVal), { enableHighAccuracy: false, maximumAge: 600_000, timeout: 8000 }));
}
export const rouletteNext = async (o: { iam?: string[]; minAge?: number | null; maxAge?: number | null; back?: string | null } = {}) => {
  const at = await livePos();
  return rpc<LiveState>("hdar_live_next", { p_iam: o.iam?.length ? o.iam : null, p_min_age: o.minAge ?? null, p_max_age: o.maxAge ?? null, p_back: o.back ?? null, p_lat: at?.lat ?? null, p_lng: at?.lng ?? null });
};
export const roulettePoll = () => rpc<LiveState>("hdar_live_poll", {});
export const rouletteLeave = (stay = false) => rpc("hdar_live_leave", { p_stay: stay });
export const rouletteReport = (other: string, reason: string) => rpc("hdar_live_report", { p_other: other, p_reason: reason });
export async function rouletteSignal(to: string, kind: "live-offer" | "live-answer" | "live-bye" | "live-ice", payload = "") {
  await rpc("hdar_signal_send", { p_self: "", p_to: to, p_kind: kind, p_payload: payload });
}
export const roulettePollSignals = (after: number) => rpc<SignalRow[]>("hdar_signal_poll", { p_self: "", p_after: after });
/** Serveurs TURN (Cloudflare) de courte durée ; liste vide si non configuré. */
let turnAt = 0; let turnVal: RTCIceServer[] = [];
export function turnCached(): RTCIceServer[] { if (Date.now() - turnAt > 240000) void turnServers(); return turnVal; }
export async function turnServers(): Promise<RTCIceServer[]> {
  if (turnVal.length && Date.now() - turnAt < 240000) return turnVal;
  try {
    const token = await accessToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hdar-turn`, { method: "POST", headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
    const d = (await res.json()) as { iceServers?: RTCIceServer[] };
    if (d.iceServers?.length) { turnVal = d.iceServers; turnAt = Date.now(); }
    return d.iceServers ?? [];
  } catch { return turnVal; }
}
export const LIVE_TERMS_VERSION = 1;
export const liveAccept = () => rpc("hdar_live_accept", { p_version: LIVE_TERMS_VERSION });
export const liveCount = async () => {
  // Position seulement si déjà autorisée (aucune demande de permission depuis le badge)
  let at = livePosVal;
  try { if (!at && (await navigator.permissions?.query({ name: "geolocation" as PermissionName }))?.state === "granted") at = await livePos(); } catch { /* ignore */ }
  return rpc<number>("hdar_live_count", { p_lat: at?.lat ?? null, p_lng: at?.lng ?? null });
};
export const liveAsk = () => rpc("hdar_live_ask", {});
export const liveIds = () => rpc<string[]>("hdar_live_ids", {});
const regionCache = new Map<string, Promise<string | null>>();
/** Région générale (« Hérault, France ») calculée côté serveur ; jamais de coordonnées. */
export function regionOf(id: string): Promise<string | null> {
  if (!regionCache.has(id)) {
    regionCache.set(id, (async () => {
      try {
        const token = await accessToken();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/hdar-region`, { method: "POST", headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ id }) });
        return ((await res.json()) as { label?: string | null }).label ?? null;
      } catch { return null; }
    })());
  }
  return regionCache.get(id)!;
}

// Cœurs du Live (v37)
export const myHearts = () => rpc<{ balance: number; received: number; unlimited?: boolean }>("hdar_my_hearts", {});
export const heartsReceived = (id: string) => rpc<number>("hdar_hearts_received", { p_id: id });
export const heartSend = () => rpc<{ balance: number; unlimited?: boolean }>("hdar_heart_send", {});

export type AdminUserRow = { id: string; pseudo: string; age: number | null; iam: string | null; has_photo: boolean; photo_status: string | null; created: string | null; last: string | null; region: string | null; city: string | null; premium: boolean; boosts: number; hearts: { balance: number; received: number } | null; spent: number; reports: number; banned: boolean };
export type AdminUserExtra = { region: string | null; iam: string | null; seeking: string | null; created: string | null; bio: string | null; note: string | null; premium_until: string | null;
  hearts: { balance: number; received: number; bought: number } | null;
  activity: Record<string, number>; payments: { at: string; product: string; kind: string; cents: number; ref: string }[]; gifts: { at: string; detail: { kind: string; amount: number; msg: string | null } }[] };
export const myNotices = () => rpc<{ id: number; title: string; body: string | null; at: string; gift?: ProGift | null }[]>("hdar_my_notices", {});

/** Nouveautés hdar (opt-in, email lié requis). */
export const newsStatus = () => rpc<{ on: boolean; at: string | null }>("hdar_news_status", {});
export const newsSet = (on: boolean) => rpc<{ on: boolean; at: string | null }>("hdar_news_set", { p_on: on });
export const adminNewsInfo = (key: string) => rpc<{ optin: number; history: { at: string; subject: string; recipients: number }[] }>("hdar_admin_news_count", { p_key: key });
export type MailTemplate = "news" | "gift" | "invite";
export async function adminNewsSend(subject: string, body: string, test?: string, extra: { template?: MailTemplate; code?: string; title?: string } = {}): Promise<{ sent: number }> {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hdar-mail`, { method: "POST", headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ subject, body, test, ...extra }) });
  const d = (await res.json()) as { sent?: number; error?: string };
  if (!res.ok || d.error) throw new Error(d.error || "Envoi impossible");
  return { sent: d.sent ?? 0 };
}

// Live Pro & cadeaux / messages des partenaires (v41)
export type ProPlace = { id: string; name: string; left: number };
export type ProGift = { id: number; place: string; title: string; description: string | null; code: string | null; expires: string };
export const myPro = () => rpc<ProPlace[]>("hdar_my_pro", {});
export const proLiveNext = (place: string) => rpc<LiveState>("hdar_live_next", { p_pro: place });
export const proGiftSend = (o: { place: string; to: string; title: string; desc?: string; code?: string; days?: number; via?: "live" | "profile" }) =>
  rpc<{ ok: boolean; left: number }>("hdar_pro_gift_send", { p_place: o.place, p_to: o.to, p_title: o.title, p_desc: o.desc || null, p_code: o.code || null, p_days: o.days ?? 7, p_via: o.via ?? "live" });
export const myProGifts = () => rpc<ProGift[]>("hdar_my_pro_gifts", {});
export const proGiftBlock = (gift: number, report = false, reason?: string) => rpc("hdar_pro_gift_block", { p_gift: gift, p_report: report, p_reason: reason ?? null });
export const proGiftsPref = (off: boolean | null = null) => rpc<boolean>("hdar_pro_gifts_pref", { p_off: off });
export const proChatOpen = (place: string, to: string) => rpc<{ ok: boolean }>("hdar_pro_chat_open", { p_place: place, p_to: to });
export const proBadge = (other: string) => rpc<{ place: string; name: string } | null>("hdar_pro_badge", { p_other: other });
export const proChatBlock = (other: string, report = false) => rpc("hdar_pro_chat_block", { p_other: other, p_report: report });
export const adminProGifts = (key: string) => rpc<{ id: number; at: string; place: string; to: string | null; title: string; description: string | null; code: string | null; expires: string; via: string; reported: boolean; reason: string | null }[]>("hdar_admin_pro_gifts", { p_key: key });
export const adminProThreads = (key: string) => rpc<{ at: string; place: string; to: string | null; reported: boolean }[]>("hdar_admin_pro_threads", { p_key: key });

// Codes cadeaux, parrainage, surprises (v42)
export type GiftCode = { code: string; kind: "premium" | "boost" | "hearts"; amount: number; max_uses: number; uses: number; expires_at: string | null; note: string | null; created_at: string };
export const codeRedeem = (code: string) => rpc<{ title: string; body: string }>("hdar_code_redeem", { p_code: code });
export const myRef = () => rpc<{ code: string; invited: number; rewarded: number }>("hdar_my_ref", {});
export const refClaim = (code: string) => rpc<{ ok: boolean; reason?: string }>("hdar_ref_claim", { p_code: code });
export const surprise = () => rpc<{ kind: string; amount: number; label: string } | null>("hdar_surprise", {});
export const adminCodes = (key: string) => rpc<GiftCode[]>("hdar_admin_codes", { p_key: key });
export const adminCodeCreate = (key: string, o: { kind: string; amount: number; maxUses: number; days: number; code?: string; note?: string }) =>
  rpc<{ code: string }>("hdar_admin_code_create", { p_key: key, p_kind: o.kind, p_amount: o.amount, p_max_uses: o.maxUses, p_days: o.days, p_code: o.code || null, p_note: o.note || null });
export const shareReward = () => rpc<{ kind: string; amount: number; label: string } | null>("hdar_share_reward", {});

// Tableau de bord pro (v45)
export type ProDash = {
  views: number; clicks: number; messages: number; visitors: number; favorites: number;
  live_views: number; live_minutes: number; live_avg_sec: number;
  gifts_sent: number; gifts_opened: number; gifts_used: number; threads: number;
  avg: number | null; ratings: number;
  days: { day: string; views: number; clicks: number; live: number }[];
  heat: { dow: number; hour: number; n: number }[];
  boosts: { from: string; to: string; label: string }[]; boost_in: number; boost_out: number;
  reviews: { id: string; body: string; at: string; reply: string | null; reply_at: string | null; stars: number | null }[];
};
export const proDashboard = (id: string, days: number) => rpc<ProDash>("hdar_pro_dashboard", { p_id: id, p_days: days });
export const proReviewReply = (comment: string, text: string) => rpc("hdar_pro_review_reply", { p_comment: comment, p_text: text });
export const proReviewReport = (comment: string, reason?: string) => rpc("hdar_pro_review_report", { p_comment: comment, p_reason: reason ?? null });
export const proGiftUse = (place: string, code: string) => rpc<{ title: string; description: string | null }>("hdar_pro_gift_use", { p_place: place, p_code: code });
export type AdminPartner = { id: string; name: string; kind: string; active: boolean; until: string | null; sub: string | null; pro_boost_until: string | null; revenue: number; boosts: number; views: number; live: number; gifts: number };
export const adminPartners = (key: string, days = 30) => rpc<AdminPartner[]>("hdar_admin_partners", { p_key: key, p_days: days });
export type Revenue = { gross: number; refunds: number; fees: number; net: number; count: number; fees_estimated: boolean;
  series: { t: string; cents: number }[]; sources: { kind: string; product: string; label: string; cents: number; n: number }[];
  partners: { name: string; cents: number; n: number }[]; spenders: { pseudo: string; cents: number; n: number }[] };
export const liveEvent = (outcome: "video" | "failed" | "abandon" | "timeout", ms: number, ice: string) => rpc("hdar_live_event", { p_outcome: outcome, p_ms: Math.round(ms), p_ice: ice }).catch(() => undefined);
export type LiveEventsSummary = { days: { day: string; video: number; failed: number; abandon: number; median_ms: number | null; relay: number }[]; last: { at: string; outcome: string; ms: number; ice: string }[] };
export const adminLiveEvents = (key: string) => rpc<LiveEventsSummary>("hdar_admin_live_events", { p_key: key });
export const adminRevenue = (key: string, period: string) => rpc<Revenue>("hdar_admin_revenue", { p_key: key, p_period: period });
export type AmbStats = { signups: number; validated: number; codes_created: number; codes_redeemed: number; places: number; places_claimed: number; places_active: number; revenue_users: number; revenue_partners: number; commission: number; paid: number; bonuses?: number; signup_bonus?: number };
export type AmbMe = { needs_terms?: boolean; user_pct: number; user_months: number; bonus_cents: number; bonus_at: number; min_payout_cents: number; paid_total: number; connect: "none" | "pending" | "ready"; paused: boolean; contract?: { version: string; at: string; name: string } | null; code: string; codes_per_week: number; codes_left: number; max_days: number; max_boost_h: number; max_hearts: number; per_signup_cents: number; partner_pct: number; partner_months: number;
  month: AmbStats; total: AmbStats; codes: { code: string; kind: string; amount: number; used: boolean; expires_at: string }[];
  places: { id: string; name: string; kind: string; claimed: boolean; active: boolean; token: string | null; promo: string | null; promo_status: string | null }[] };
export type AdminAmb = { user_pct: number; user_months: number; bonus_cents: number; bonus_at: number; min_payout_cents: number; signup_cap_cents: number | null; terms_at: string | null; contract?: { version: string; at: string; name: string } | null; stripe_account: string | null; payouts_enabled: boolean; paused: boolean; hold_next: boolean; user_id: string; pseudo: string; code: string; active: boolean; codes_per_week: number; max_days: number; max_boost_h: number; max_hearts: number; per_signup_cents: number; partner_pct: number; partner_months: number; note: string | null;
  stats: AmbStats; paid_total: number; due_total: number; payouts: { amount: number; from: string | null; to: string | null; note: string | null; at: string; status?: string; error?: string | null }[]; promos: { id: string; name: string; promo: string; status: string }[] };
export const ambMe = () => rpc<AmbMe | null>("hdar_amb_me", {});
export const ambAttach = (code: string) => rpc<boolean>("hdar_amb_attach", { p_code: code });
export const ambCodeCreate = (kind: string, amount: number) => rpc<string>("hdar_amb_code_create", { p_kind: kind, p_amount: amount });
export const ambPlaceCreate = (o: { kind: string; name: string; description: string; lat: number; lng: number; contact: string; promo: string }) =>
  rpc<{ id: string; token: string }>("hdar_amb_place_create", { p_kind: o.kind, p_name: o.name, p_description: o.description, p_lat: o.lat, p_lng: o.lng, p_contact: o.contact, p_promo: o.promo });
export const placeClaim = (token: string) => rpc<{ id: string; name: string; promo: string | null }>("hdar_place_claim", { p_token: token });
export const placeClaimInfo = (token: string) => rpc<{ name: string; kind: string; promo: string | null } | null>("hdar_place_claim_info", { p_token: token });
export const adminAmbSearch = (key: string, q: string) => rpc<{ user_id: string; pseudo: string; amb: boolean }[]>("hdar_admin_amb_search", { p_key: key, p_q: q });
export const adminAmbSet = (key: string, user: string, active: boolean, rules: Record<string, unknown> = {}) => rpc("hdar_admin_amb_set", { p_key: key, p_user: user, p_active: active, p_rules: rules });
export const adminAmbs = (key: string, from: string | null, to: string | null) => rpc<AdminAmb[]>("hdar_admin_ambs", { p_key: key, p_from: from ?? "-infinity", p_to: to });
export const adminAmbPayout = (key: string, user: string, cents: number, from: string | null, to: string | null, note: string) => rpc("hdar_admin_amb_payout", { p_key: key, p_user: user, p_cents: cents, p_from: from, p_to: to, p_note: note });
export const adminAmbPromo = (key: string, place: string, status: "approved" | "refused") => rpc("hdar_admin_amb_promo", { p_key: key, p_place: place, p_status: status });
export const ambInviteInfo = (token: string) => rpc<{ valid: boolean; photo_ok: boolean }>("hdar_amb_invite_info", { p_token: token });
export const ambAccept = (token: string) => rpc("hdar_amb_accept", { p_token: token });
export const adminAmbFlags = (key: string, user: string, paused: boolean | null, hold: boolean | null) => rpc("hdar_admin_amb_flags", { p_key: key, p_user: user, p_paused: paused, p_hold: hold });
export async function ambConnect(action: "onboard" | "dashboard" = "onboard"): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hdar-amb-connect`, { method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action }) });
  const b = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (b.error === "connect_disabled" || b.error === "not_configured") throw new Error("Les versements Stripe ne sont pas encore activés par hdar. Ton espace fonctionne, tes commissions sont comptées.");
  if (!res.ok || !b.url) throw new Error(b.error || `Serveur indisponible (${res.status})`);
  return b.url;
}
export const adminAmbInvite = (key: string, note?: string) => rpc<string>("hdar_admin_amb_invite", { p_key: key, p_note: note ?? null });
async function contractCall(body: Record<string, unknown>) {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hdar-amb-contract`, { method: "POST",
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { error?: string }; throw new Error(b.error || `Serveur indisponible (${res.status})`); }
  return res;
}
export const ambSign = async (token: string, name: string, email: string) =>
  (await (await contractCall({ action: "sign", accept: true, token, name, email })).json()) as { ok: boolean; mailed: boolean; version: string; at: string };
async function saveBlob(res: Response, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
}
export const ambContractPdf = async () => saveBlob(await contractCall({ action: "pdf" }), "contrat-ambassadeur-hdar.pdf");
export const adminAmbContractPdf = async (key: string, user: string) => saveBlob(await contractCall({ action: "admin_pdf", key, user }), `contrat-ambassadeur-${user.slice(0, 8)}.pdf`);
export type AmbBudget = { signup_cap_cents: number; global_budget_cents: number; month_requested_cents: number; month_used_cents: number; factor: number };
export const adminAmbBudget = (key: string, cap?: number | null, budget?: number | null) => rpc<AmbBudget>("hdar_admin_amb_budget", { p_key: key, p_cap: cap ?? null, p_budget: budget ?? null });
export const adminAmbCap = (key: string, user: string, cap: number | null) => rpc("hdar_admin_amb_cap", { p_key: key, p_user: user, p_cap: cap });

// Partager mon live (v50)
export type LiveShareView = { pseudo: string; active: boolean; ref: string | null; lat: number; lng: number; area: string | null; live: number; pins: { lat: number; lng: number; live: boolean }[]; places: { kind: string; name: string | null; lat: number; lng: number }[] };
export const liveShareCreate = () => rpc<{ code: string; ref: string }>("hdar_live_share_create", {});
export const liveShareDone = (code: string) => rpc<{ kind: string; amount: number; label: string } | null>("hdar_live_share_done", { p_code: code });
/** Appel public (visiteur non inscrit) : clé anonyme seulement, aucune session créée. */
export async function anonRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) throw new Error((await res.text()).slice(0, 200));
  return (await res.json()) as T;
}
export const liveShareView = (code: string) => anonRpc<LiveShareView | null>("hdar_live_share_view", { p_code: code });
export const liveShareMeta = (code: string) => anonRpc<{ pseudo: string; active: boolean; area: string | null; around: number } | null>("hdar_live_share_meta", { p_code: code });

// Live à plusieurs (v52, LiveKit) : une personne diffuse (« Inviter »), les spectateurs regardent et chattent -------------
export type RoomFeedItem = { room: string; host: string; pseudo: string | null; viewers: number; cap: number };
export type RoomMsg = { id: number; from: string; pseudo: string | null; kind: "msg" | "react" | "sys"; body: string };
export type RoomState = { gone?: boolean; banned?: boolean; role: "viewer" | "stage"; host: string; host_pseudo: string | null; host_premium: boolean;
  viewers: number; cap: number; viewer_list: { id: string; pseudo: string | null }[]; msgs: RoomMsg[] };
const withPos = async () => { const at = await livePos(); return { p_lat: at?.lat ?? null, p_lng: at?.lng ?? null }; };
export const roomOpen = async () => rpc<{ room: string }>("hdar_room_open", await withPos());
export const roomFeed = async () => rpc<RoomFeedItem[]>("hdar_room_feed", await withPos());
export const roomOf = (user: string) => rpc<string | null>("hdar_room_of", { p_user: user });
export const roomState = (room: string, after: number) => rpc<RoomState>("hdar_room_state", { p_room: room, p_after: after });
export const roomSay = (room: string, body: string, kind: "msg" | "react" = "msg") => rpc<{ balance: number | null; unlimited?: boolean } | null>("hdar_room_say", { p_room: room, p_body: body, p_kind: kind });
export const roomLeave = (room: string) => rpc("hdar_room_leave", { p_room: room });
export const roomReportMsg = (msg: number, reason: string) => rpc("hdar_room_report_msg", { p_msg: msg, p_reason: reason });
export type AdminRooms = { usage: { month_minutes: number; concurrent: number; rooms: number; cap_minutes: number; cap_concurrent: number };
  settings: { month_minutes_cap: number; concurrent_cap: number; viewer_cap: number; viewer_cap_premium: number; enabled: boolean };
  rooms: { room: string; host: string | null; since: string; viewers: number; cap: number; msgs: number }[] };
export const adminLiveRooms = (key: string) => rpc<AdminRooms>("hdar_admin_live_rooms", { p_key: key });
export const adminLiveSettings = (key: string, o: { minutes?: number; concurrent?: number; enabled?: boolean; cap?: number; capPremium?: number }) =>
  rpc("hdar_admin_live_settings", { p_key: key, p_free: null, p_minutes: o.minutes ?? null, p_concurrent: o.concurrent ?? null, p_enabled: o.enabled ?? null, p_cap: o.cap ?? null, p_cap_premium: o.capPremium ?? null });
async function lkFn<T>(fn: string, body: unknown): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || d.error) throw new Error(d.error || `Serveur indisponible (${res.status})`);
  return d;
}
let groupOk: Promise<boolean> | null = null;
/** Le Live à plusieurs n'apparaît que si LiveKit est configuré côté serveur. */
export function groupEnabled(): Promise<boolean> {
  if (!groupOk) groupOk = lkFn<{ configured: boolean }>("hdar-live-token", { check: true }).then((d) => !!d.configured).catch(() => { groupOk = null; return false; });
  return groupOk;
}
export const roomToken = async (room: string) => { const p = await livePos(); return lkFn<{ url: string; token: string; role: "viewer" | "stage"; identity: string; configured?: boolean }>("hdar-live-token", { room, lat: p?.lat ?? null, lng: p?.lng ?? null }); };
export const roomStage = (action: "kick" | "remove" | "kill" | "usage", room: string | null, user?: string) =>
  lkFn<{ ok?: boolean; rooms?: number; participants?: number }>("hdar-live-stage", { action, room, user });

// v53 — candidatures ambassadeur
export type AmbApplyStatus = { profile: boolean; ambassador: boolean; application: { status: "pending" | "accepted" | "refused"; at: string; decided_at: string | null; note: string | null } | null };
export type AmbApplyForm = { motivation: string; city: string; audience: string; promote: string; email: string; consent: boolean };
export const ambApplyStatus = () => rpc<AmbApplyStatus>("hdar_amb_apply_status", {});
export const ambApply = (f: AmbApplyForm) => rpc<{ status: string }>("hdar_amb_apply", { p_motivation: f.motivation, p_city: f.city, p_audience: f.audience, p_promote: f.promote, p_email: f.email, p_consent: f.consent });
export type AdminAmbApp = { id: number; user_id: string; pseudo: string; age: number | null; photo_ok: boolean; motivation: string; city: string; audience: string | null; promote: string; status: "pending" | "accepted" | "refused"; note: string | null; at: string; decided_at: string | null; already_amb: boolean };
export const adminAmbApps = (key: string) => rpc<AdminAmbApp[]>("hdar_admin_amb_applications", { p_key: key });
export const adminAmbDecide = async (key: string, id: number, accept: boolean, note: string) => {
  await rpc("hdar_admin_amb_apply_decide", { p_key: key, p_id: id, p_accept: accept, p_note: note || null });
  try { return ((await (await contractCall({ action: "apply_mail", key, id })).json()) as { mailed: boolean }).mailed; } catch { return false; }
};
export type AdminAmbContract = { user_id: string; pseudo: string; name: string; version: string; at: string; code: string | null };
export const adminAmbContracts = (key: string) => rpc<AdminAmbContract[]>("hdar_admin_amb_contracts", { p_key: key });

// Salons (v58) : discussions ouvertes à tous, sans limite de distance ---------------------------
export type Salon = { id: string; name: string; description: string | null; emoji: string | null; official: boolean; region?: string | null; mine: boolean; last_at: string; recent: number; people: number };
/** Une ligne de discussion de groupe (salon ou chat du quartier). */
export type GroupLine = {
  id: string;
  fromId: string;
  pseudo: string;
  body: string;
  kind: "text" | "image" | "video" | "audio";
  at: number;
  mine: boolean;
  replyTo: string | null;
  reply: { pseudo: string; body: string } | null;
  reactions?: Reaction[];
  editedAt?: string | null;
  fwd?: string | null;
  lat?: number;
  lng?: number;
};
type GroupRow = {
  id: string; from_id: string; pseudo: string; body: string; kind?: string | null; at: string; mine: boolean;
  reply_to?: string | null; reply?: { pseudo: string; body: string } | null; reactions?: Reaction[]; edited_at?: string | null; fwd?: string | null; lat?: number; lng?: number;
};
const toLine = (r: GroupRow): GroupLine => ({
  id: r.id,
  fromId: r.from_id,
  pseudo: r.pseudo,
  body: r.body,
  kind: (r.kind || (r.body ? "text" : "image")) as GroupLine["kind"],
  at: r.at.includes("T") ? Date.parse(r.at) : pgTime(r.at),
  mine: r.mine,
  replyTo: r.reply_to ?? null,
  reply: r.reply ?? null,
  reactions: r.reactions ?? [],
  editedAt: r.edited_at ?? null,
  fwd: r.fwd ?? null,
  lat: r.lat == null ? undefined : Number(r.lat),
  lng: r.lng == null ? undefined : Number(r.lng),
});
/** Fonction SQL absente (base pas encore à jour) : on retombe sur l'ancienne. */


export const listSalons = () => rpc<Salon[]>("hdar_salons", {});
export type InboxSalon = Salon & {
  wrote?: boolean;
  unread?: number;
  replies?: number;
  last?: { pseudo: string; body: string; at: string; mine: boolean } | null;
};
/** Salons + non lus / réponses à moi pour ceux suivis (v60), repli sur la simple liste sinon. */
export async function salonsInbox(seen: Record<string, string>): Promise<InboxSalon[]> {
  try {
    return await rpc<InboxSalon[]>("hdar_salons_inbox", { p_seen: seen });
  } catch (e) {
    if (!missingFn(e)) throw e;
    return listSalons();
  }
}
export const getSalon = (id: string) => rpc<Salon | null>("hdar_salon_get", { p_id: id });
export const createSalon = (name: string, description: string, emoji: string) =>
  rpc<string>("hdar_salon_create", { p_name: name, p_description: description, p_emoji: emoji });
export const salonMessages = async (id: string) => (await rpc<GroupRow[]>("hdar_salon_messages", { p_id: id })).map(toLine);
export async function salonSend(id: string, body: string, replyTo: string | null = null) {
  const b = body.trim().slice(0, 1000);
  try {
    await rpc("hdar_salon_send2", { p_id: id, p_body: b, p_reply: replyTo });
  } catch (e) {
    if (!missingFn(e)) throw e;
    await rpc("hdar_salon_send", { p_id: id, p_body: b.slice(0, 500) });
  }
  track("msg_salon");
  // Propose les notifications après un vrai geste de conversation (réponses à mes messages).
  if (typeof window !== "undefined") window.dispatchEvent(new Event("hdar-ask-push"));
}
export async function salonSendMedia(id: string, kind: string, path: string, duration: number | null, replyTo: string | null) {
  await rpc("hdar_salon_send_media", { p_id: id, p_kind: kind, p_path: path, p_duration: duration, p_reply: replyTo });
  track("msg_salon");
}

/** Chat du quartier avec réponses citées (v59), repli sur l'ancien flux sinon. */
export async function areaFeed2(lat: number, lng: number): Promise<GroupLine[]> {
  try {
    return (await rpc<GroupRow[]>("hdar_area_feed2", { p_lat: lat, p_lng: lng })).map(toLine);
  } catch (e) {
    if (!missingFn(e)) throw e;
    const rows = await areaFeed(deviceId(), lat, lng);
    return rows.map((r) => toLine({ id: r.id, from_id: r.fromId, pseudo: r.pseudo, body: r.body, at: r.at, mine: r.mine, lat: r.lat, lng: r.lng }));
  }
}
export async function areaSend2(lat: number, lng: number, pseudo: string, body: string, replyTo: string | null) {
  try {
    await rpc("hdar_area_send2", { p_lat: lat, p_lng: lng, p_pseudo: pseudo, p_body: body, p_reply: replyTo });
    track("msg_area");
  } catch (e) {
    if (!missingFn(e)) throw e;
    await areaSend(deviceId(), lat, lng, pseudo, body);
  }
}
export const salonHide = (msg: string) => rpc("hdar_salon_hide", { p_msg: msg });
export const salonClose = (id: string) => rpc("hdar_salon_close", { p_id: id });

// Présence (v61) : qui a le salon ou le chat du quartier ouvert en ce moment ---------------------
export type RoomPerson = { id: string; pseudo: string; profile: boolean; mine: boolean; photo: boolean; /** Secondes depuis le dernier passage. */ ago?: number };
/** Signale que j'ai la pièce ouverte et renvoie les présents (null = base pas encore à jour). */
export async function roomHere(room: string, pseudo: string, lat: number | null = null, lng: number | null = null) {
  try {
    return await rpc<{ n: number; people: RoomPerson[] }>("hdar_room_here", { p_room: room, p_pseudo: pseudo, p_lat: lat, p_lng: lng });
  } catch (e) {
    if (missingFn(e)) return null;
    throw e;
  }
}
/** Nombre de présents (hors moi) : chat du quartier autour de la position et chaque salon. */
export async function roomsOnline(lat: number | null, lng: number | null) {
  try {
    return await rpc<{ area: number; area_last?: string | null; salons: Record<string, number> }>("hdar_rooms_online", { p_lat: lat, p_lng: lng });
  } catch (e) {
    if (missingFn(e)) return null;
    throw e;
  }
}

// Admin v58 : visiteurs, chats de lieux, notes, salons ------------------------------------------
export type VisitorRow = {
  id: string; first: string; last: string; sessions: number; days: number; city: string | null; source: string | null;
  landing: string | null; platform: string | null; pwa: boolean | null; profile: boolean; pseudo: string | null;
  pm: number; area: number; place: number; steps: string[];
};
export type Breakdown = { k: string; n: number; p: number };
export type AdminVisitors = {
  tracked_since: string | null; total: number; with_profile: number; bounce: number; returning: number;
  gate: Record<string, number>; steps: Record<string, number>;
  sources: Breakdown[]; landings: Breakdown[]; platforms: Breakdown[]; rows: VisitorRow[];
};
export type AdminPlaceMsg = { id: string; scope: "place" | "spot"; from_id: string; pseudo: string; body: string; kind: string; at: string; removed: boolean; where: string; where_id: string };
export type AdminRating = { id: string; name: string; kind: string; partner: boolean; avg: number | null; n: number; dist: Record<string, number> | null; comments: number; last: string | null };
export type AdminSalon = { id: string; name: string; description: string | null; emoji: string | null; official: boolean; removed: boolean; created_at: string; last_at: string; creator_id: string | null; creator: string | null; messages: number; people: number };
export type AdminSalonMsg = { id: string; from_id: string; pseudo: string; body: string; at: string; removed: boolean };
export const admin58 = {
  visitors: (key: string, days: number) => rpc<AdminVisitors>("hdar_admin_visitors", { p_key: key, p_days: days }),
  placeMsgs: (key: string) => rpc<AdminPlaceMsg[]>("hdar_admin_place_msgs", { p_key: key }),
  hideMsg: (key: string, scope: "place" | "spot" | "salon" | "area", id: string) => rpc("hdar_admin_hide_msg", { p_key: key, p_scope: scope, p_id: id }),
  ratings: (key: string) => rpc<AdminRating[]>("hdar_admin_ratings", { p_key: key }),
  salons: (key: string) => rpc<AdminSalon[]>("hdar_admin_salons", { p_key: key }),
  salonMessages: (key: string, id: string) => rpc<AdminSalonMsg[]>("hdar_admin_salon_messages", { p_key: key, p_id: id }),
  salonSet: (key: string, id: string, removed: boolean) => rpc("hdar_admin_salon_set", { p_key: key, p_id: id, p_removed: removed }),
  salonCreate: (key: string, name: string, description: string, emoji: string) =>
    rpc<string>("hdar_admin_salon_create", { p_key: key, p_name: name, p_description: description, p_emoji: emoji }),
};

// Admin v62 : en direct (connectés, salons, messages privés des dernières 24 h) ----------------
export type AdminOnline = {
  id: string; pseudo: string; profile: boolean; photo: boolean; city: string | null; platform: string | null; pwa: boolean | null;
  last: string; first: string; sessions: number; on_map: boolean; banned: boolean; rooms: string[];
  pm_24h: number; salon_24h: number; area_24h: number;
};
export type AdminRoomNow = { room: string; name: string; emoji: string | null; people: { id: string; pseudo: string; at: string }[] };
export type AdminPmPair = { a: string; b: string; a_pseudo: string; b_pseudo: string; n: number; a_n: number; last: string; first: string };
export type AdminLive = { online: AdminOnline[]; rooms: AdminRoomNow[]; pm: AdminPmPair[] };
export const adminLive = (key: string) => rpc<AdminLive>("hdar_admin_live", { p_key: key });

// Modération dans l'appli (v63) : les comptes admin retirent tout message et écrivent partout -----
let amAdminP: Promise<boolean> | null = null;
/** Ce compte est-il admin ? (une fois par session ; faux si la base n'est pas à jour). */
export function amAdmin(): Promise<boolean> {
  if (!amAdminP) amAdminP = rpc<boolean>("hdar_am_admin", {}).then(Boolean).catch(() => false);
  return amAdminP;
}
export type AdminMediaRow = RoomMediaRow & { removed: boolean };
export const adminMedia = (key: string, scope: "area" | "place" | "spot" | "salon", id: string) =>
  rpc<AdminMediaRow[]>("hdar_admin_media", { p_key: key, p_scope: scope, p_id: id }).then((r) => r[0] ?? null);

// Admin v64 : conversations signalées (lecture journalisée) et journal des connexions (IP, 1 an) --
export type AdminReportedThread = { other: string; pseudo: string; reported_by_other: boolean; reported_other: boolean; n: number; last: string | null };
export type AdminThreadMsg = { id: string; from_id: string; pseudo: string; kind: string; body: string; media: string | null; duration: number | null; at: string };
export type AdminIp = { ip: string; ua: string | null; first: string; last: string; hits: number; others: number };
export const adminReports = {
  threads: (key: string, id: string) => rpc<AdminReportedThread[]>("hdar_admin_reported_threads", { p_key: key, p_id: id }),
  thread: (key: string, a: string, b: string) => rpc<AdminThreadMsg[]>("hdar_admin_thread", { p_key: key, p_a: a, p_b: b }),
  ips: (key: string, id: string) => rpc<AdminIp[]>("hdar_admin_user_ips", { p_key: key, p_id: id }),
};

// Carte jamais vide (v73) : profils vus < 48 h (estompés) + visiteurs anonymes (bulles ~1 km) -------------
export type RecentPin = { id: string; pseudo: string; lat: number; lng: number; h: number };
export type VisitorBubble = { lat: number; lng: number; n: number; h: number };
export async function mapRecent(b: { s: number; w: number; n: number; e: number }) {
  const r = await rpc<{ people: RecentPin[]; visitors: VisitorBubble[] }>("hdar_map_recent", { p_s: b.s, p_w: b.w, p_n: b.n, p_e: b.e });
  return {
    people: (r?.people ?? []).map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng), h: Number(p.h) || 0 })),
    visitors: (r?.visitors ?? []).map((v) => ({ lat: Number(v.lat), lng: Number(v.lng), n: Number(v.n) || 1, h: Number(v.h) || 0 })),
  };
}
const VISITOR_HIDDEN = "hdar-visitor-hidden";
export const visitorHidden = () => { try { return localStorage.getItem(VISITOR_HIDDEN) === "1"; } catch { return false; } };
export function setVisitorHidden(on: boolean) {
  try { localStorage.setItem(VISITOR_HIDDEN, on ? "1" : "0"); } catch { /* rien */ }
  if (on) void rpc("hdar_visitor_forget", {}).catch(() => undefined);
}
let lastPing = 0;
/** Visiteur sans profil, position acceptée : le serveur n'enregistre qu'un carreau ~1 km (48 h max). */
export function visitorPing(lat: number, lng: number) {
  if (visitorHidden() || Date.now() - lastPing < 10 * 60_000) return;
  lastPing = Date.now();
  void rpc("hdar_visitor_ping", { p_lat: Math.round(lat * 100) / 100, p_lng: Math.round(lng * 100) / 100 }).catch(() => undefined);
}
export const hideOfflineGet = () => rpc<boolean>("hdar_map_hide_offline_get", {});
export const hideOfflineSet = (on: boolean) => rpc("hdar_map_hide_offline_set", { p_on: on });

// Provenance des liens partenaires ?ref= (v77) -------------------------------------------------
export type RefRow = { ref: string; visits: number; profiles: number; conv: number | null };
export type AdminRefs = { days: number; total: RefRow[]; daily: (RefRow & { day: string })[] };
export const adminRefs = (key: string, days: number) => rpc<AdminRefs>("hdar_admin_refs", { p_key: key, p_days: days });
export type RefLink = { ref: string; label: string; with_code: boolean; archived: boolean; created_at: string | null; visits: number; profiles: number };
export const adminRefLinks = (key: string) => rpc<RefLink[]>("hdar_admin_ref_links", { p_key: key });
export const adminRefLinkSave = (key: string, ref: string, label: string, withCode: boolean) =>
  rpc("hdar_admin_ref_link_save", { p_key: key, p_ref: ref, p_label: label, p_with_code: withCode });
export const adminRefLinkArchive = (key: string, ref: string, archived: boolean) =>
  rpc("hdar_admin_ref_link_archive", { p_key: key, p_ref: ref, p_archived: archived });
export type RefPerson = { id: string | null; pseudo: string; photo: string | null; created: string; active: boolean; rewarded?: boolean };
export type Referrer = { id: string; pseudo: string; photo: string | null; count: number; rewarded: number; last: string; referred: RefPerson[] };
export const adminRefProfiles = (key: string, ref: string) => rpc<RefPerson[]>("hdar_admin_ref_profiles", { p_key: key, p_ref: ref });
export const adminReferrers = (key: string) => rpc<Referrer[]>("hdar_admin_referrers", { p_key: key });

// Transfert (v80) ----------------------------------------------------------------
export type FwdScope = "dm" | "salon";
/** Copie côté serveur d'un message (texte ou média) vers un message privé ou un salon. */
export const forwardMessage = (src: FwdScope, id: string, dst: FwdScope, to: string) =>
  rpc("hdar_forward", { p_src: src, p_id: id, p_dst: dst, p_to: dst === "dm" ? otherId(to) : to });
/** Libellé d'en-tête : « Transféré » (d'un privé) ou « Transféré de X » (d'un salon). */
export const fwdLabel = (f: string | null | undefined) => (f == null ? null : f ? `Transféré de ${f}` : "Transféré");
