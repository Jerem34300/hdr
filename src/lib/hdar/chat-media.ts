/** Photos, videos and voice notes in chats, stored in the private `hdar-media` bucket (signed URLs only). */
import { supabase, accessToken, authUserId } from "./session";
import { toast } from "sonner";
import { compressVideo } from "./video";

export type MediaKind = "image" | "video" | "audio";
export type MediaScope = "area" | "place" | "spot" | "salon";
/** Après compression (≈1,3 Mbit/s) : 3 min ≈ 30 Mo, 60 s ≈ 10 Mo. Le serveur refuse au-delà (40 / 16 Mo). */
export const MAX_VIDEO_MB = 40;
export const MAX_SHORT_VIDEO_MB = 16;
/** Chats (salons, quartier, lieux, DM) : 3 min. Annonces, profil, page de lieu : 60 s. */
export const MAX_VIDEO_SEC = 180;
export const MAX_SHORT_VIDEO_SEC = 60;
/** Fichier source accepté avant compression. */
export const MAX_SOURCE_MB = 500;
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

export type UploadOpts = {
  /** Vidéo courte (annonce, profil, page de lieu) : 60 s / 16 Mo au lieu de 3 min / 40 Mo. */
  short?: boolean;
  /** Progression de la compression (0-100). Par défaut : un toast « Compression de la vidéo… ». */
  onProgress?: (pct: number) => void;
};

async function putFile(path: string, blob: Blob, type: string) {
  const { error } = await supabase().storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error(error.message.includes("size") ? "Fichier trop lourd" : "Envoi du fichier impossible");
}

/**
 * Validates, compresses (photos and videos) and uploads; returns the storage path + duration.
 * Videos: re-encoded in the browser to ≈720p / ≈1.3 Mbit/s with sound, a poster is stored next to
 * them (`<path>.jpg`), and `frames` (3 stills) are returned for the NSFW check.
 */
export async function uploadChatMedia(
  input: Blob,
  kind: MediaKind,
  seconds?: number,
  opts: UploadOpts = {},
): Promise<{ path: string; duration: number | null; poster?: string; frames?: string[] }> {
  await accessToken();
  const uid = await authUserId();
  if (!uid) throw new Error("Session expirée, recharge l'appli");
  let blob = input;
  let duration: number | null = null;
  let posterBlob: Blob | null = null;
  let frames: string[] | undefined;
  if (kind === "image") {
    blob = await compressImage(input);
  } else if (kind === "video") {
    if (input.size > MAX_SOURCE_MB * 1024 * 1024) throw new Error(`Vidéo trop lourde (max ${MAX_SOURCE_MB} Mo)`);
    const maxSec = opts.short ? MAX_SHORT_VIDEO_SEC : MAX_VIDEO_SEC;
    const maxMb = opts.short ? MAX_SHORT_VIDEO_MB : MAX_VIDEO_MB;
    let t: string | number | undefined;
    const progress =
      opts.onProgress ??
      ((pct: number) => {
        const msg = `Compression de la vidéo… ${pct} %`;
        t = t === undefined ? toast.loading(msg) : toast.loading(msg, { id: t });
      });
    try {
      const c = await compressVideo(input, { maxSec, onProgress: progress });
      blob = c.blob;
      posterBlob = c.poster;
      frames = c.frames;
      duration = Math.max(1, Math.round(c.duration || seconds || 1));
    } finally {
      if (t !== undefined) toast.dismiss(t);
    }
    if (blob.size > maxMb * 1024 * 1024) throw new Error(`Vidéo trop lourde même compressée (max ${maxMb} Mo)`);
  } else {
    if (input.size > 5 * 1024 * 1024) throw new Error("Vocal trop long");
    duration = Math.min(MAX_VOICE_SEC, Math.max(1, Math.round(seconds ?? 1)));
  }
  const type = (blob.type || (kind === "video" ? "video/mp4" : "audio/webm")).split(";")[0];
  const rand = crypto.getRandomValues(new Uint8Array(12));
  const name = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  const path = `${uid}/${Date.now().toString(36)}${name}.${extFor(type)}`;
  await putFile(path, blob, type);
  let poster: string | undefined;
  if (posterBlob) {
    poster = `${path}.jpg`;
    await putFile(poster, posterBlob, "image/jpeg").catch(() => (poster = undefined));
  }
  return { path, duration, poster, frames };
}

/** Contrôle NSFW sur les images extraites d'une vidéo : raison si l'une d'elles semble explicite. */
export async function explicitVideoReason(frames: string[] | undefined): Promise<string | null> {
  if (!frames?.length) return null;
  const { explicitReason } = await import("./nsfw");
  for (const f of frames) {
    const r = await explicitReason(f);
    if (r) return r;
  }
  return null;
}

/** Vignette d'une vidéo stockée (même chemin + .jpg). */
export const posterPath = (videoPath: string) => `${videoPath}.jpg`;

const signed = new Map<string, Promise<string>>();
/** Short-lived signed URL (1 h), cached for the session. */
export function signedMediaUrl(path: string): Promise<string> {
  // Captures de dev uniquement (?…demo) : fichiers locaux, jamais en production.
  if (import.meta.env.DEV && path.startsWith("demo/") && /\.(mp4|webm)(\.jpg)?$/.test(path)) {
    const v = path.includes("vert") ? "vertical" : "horizontal";
    return Promise.resolve(path.endsWith(".jpg") ? `/promo/poster_${v}.png` : `/promo/hdar_pro_${v === "vertical" ? "vertical_1080x1920" : "horizontal_1920x1080"}.mp4`);
  }
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
