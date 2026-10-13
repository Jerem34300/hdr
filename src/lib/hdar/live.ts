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
  premium?: boolean;
};

export type LiveMsg = {
  id: string;
  mine: boolean;
  body: string;
  at: string;
  kind: "text" | "image" | "audio" | "location" | "video";
  duration: number | null;
};

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

export async function readThread({
  data,
}: {
  data: { self: string; withId: string };
}): Promise<LiveMsg[]> {
  const self = selfId(data.self);
  const withId = otherId(data.withId);
  if (!withId || withId === self) return [];
  const rows = await rpc<
    {
      id: string;
      from_id: string;
      body: string;
      at: string;
      kind: LiveMsg["kind"];
      duration: number | null;
    }[]
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
  const body = String(data.body || "")
    .trim()
    .slice(0, 500);
  if (!body) return;
  await rpc("hdar_send", { p_self: selfId(data.self), p_to: otherId(data.to), p_body: body });
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

export type PlaceKind = "cruising" | "beach" | "park" | "aire" | "other" | "toilets" | "bar" | "club" | "sauna";
export type PlacePin = { id: string; kind: PlaceKind; name: string; lat: number; lng: number; partner: boolean };
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
export function placeSend(id: string, body: string, lat: number | null, lng: number | null) {
  return rpc("hdar_place_send", { p_id: id, p_body: body, p_lat: lat, p_lng: lng });
}
export function placeHide(msg: string) {
  return rpc("hdar_place_hide", { p_msg: msg });
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
export type PlaceComment = { id: string; body: string; at: string; pseudo: string; mine: boolean; stars: number | null };
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

export type PriceRow = { product: string; kind: "listing" | "boost" | "place_boost" | "premium"; label: string; price_cents: number };
export const pricing = () => rpc<PriceRow[]>("hdar_pricing", {});

export type MyPlace = {
  id: string; kind: PlaceKind; name: string; description: string; lat: number; lng: number;
  website: string | null; contact: string | null; photos: string[];
  ratings_on: boolean; comments_on: boolean; comments_public: boolean;
  partner_until: string | null; active: boolean; status: string; sub_status: string | null;
};
export type PartnerInput = Omit<MyPlace, "id" | "partner_until" | "active" | "status" | "sub_status"> & { id: string | null };
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
  try {
    return !!(await checkoutCall("GET")).enabled;
  } catch {
    return false;
  }
}
export async function startCheckout(product: string, placeId: string | null) {
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
  revenue: { total: number; count: number; payers: number; listings: number; boosts: number; mau: number };
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
export function roomMedia(scope: "area" | "place" | "spot", id: string): Promise<RoomMediaRow | null> {
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
export const mediaReport = (scope: "area" | "place" | "spot", id: string) => rpc("hdar_media_report", { p_scope: scope, p_id: id });
