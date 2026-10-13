/** Photos, videos and voice notes in chats, stored in the private `hdar-media` bucket (signed URLs only). */
import { supabase, accessToken, authUserId } from "./session";

export type MediaKind = "image" | "video" | "audio";
export type MediaScope = "area" | "place" | "spot";
export const MAX_VIDEO_MB = 50;
export const MAX_VIDEO_SEC = 60;
export const MAX_VOICE_SEC = 60;
const BUCKET = "hdar-media";

function compressImage(file: Blob, max = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Photo illisible"))), "image/jpeg", 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Photo illisible"));
    };
    img.src = url;
  });
}

export function videoDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
    window.setTimeout(() => done(0), 8000);
    v.src = url;
  });
}

function extFor(type: string) {
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("png")) return "png";
  if (type.includes("quicktime")) return "mov";
  if (type.startsWith("video/mp4")) return "mp4";
  if (type.startsWith("audio/mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg")) return "mp3";
  return "webm";
}

/** Validates, compresses (photos) and uploads; returns the storage path + duration. */
export async function uploadChatMedia(
  input: Blob,
  kind: MediaKind,
  seconds?: number,
): Promise<{ path: string; duration: number | null }> {
  await accessToken();
  const uid = await authUserId();
  if (!uid) throw new Error("Session expirée, recharge l'appli");
  let blob = input;
  let duration: number | null = null;
  if (kind === "image") {
    blob = await compressImage(input);
  } else if (kind === "video") {
    if (input.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`Vidéo trop lourde (max ${MAX_VIDEO_MB} Mo)`);
    const d = seconds ?? (await videoDuration(input));
    if (d > MAX_VIDEO_SEC + 0.5) throw new Error(`Vidéo trop longue (max ${MAX_VIDEO_SEC} s)`);
    duration = Math.max(1, Math.round(d || 1));
  } else {
    if (input.size > 5 * 1024 * 1024) throw new Error("Vocal trop long");
    duration = Math.min(MAX_VOICE_SEC, Math.max(1, Math.round(seconds ?? 1)));
  }
  const type = (blob.type || (kind === "video" ? "video/mp4" : "audio/webm")).split(";")[0];
  const rand = crypto.getRandomValues(new Uint8Array(12));
  const name = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  const path = `${uid}/${Date.now().toString(36)}${name}.${extFor(type)}`;
  const { error } = await supabase().storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error(error.message.includes("size") ? "Fichier trop lourd" : "Envoi du fichier impossible");
  return { path, duration };
}

const signed = new Map<string, Promise<string>>();
/** Short-lived signed URL (1 h), cached for the session. */
export function signedMediaUrl(path: string): Promise<string> {
  let hit = signed.get(path);
  if (!hit) {
    hit = accessToken()
      .then(() => supabase().storage.from(BUCKET).createSignedUrl(path, 3600))
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) throw new Error("media");
        return data.signedUrl;
      });
    hit.catch(() => signed.delete(path));
    signed.set(path, hit);
    window.setTimeout(() => signed.delete(path), 50 * 60 * 1000);
  }
  return hit;
}
