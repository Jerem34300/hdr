/**
 * Compression vidéo dans le navigateur, sans bibliothèque : la vidéo est relue dans un <video>,
 * redessinée en ≈720p sur un <canvas> et ré-encodée avec MediaRecorder (H.264/AAC en MP4 si le
 * navigateur sait le faire, sinon WebM VP8/VP9 + Opus). Le son est conservé.
 * L'encodage se fait en temps réel (une vidéo de 60 s prend ≈60 s), avec une progression.
 * Au passage : une vignette (poster JPEG) et quelques images pour le contrôle NSFW.
 */
export const TARGET_LONG_SIDE = 1280; // 720p en paysage (1280×720) ou portrait (720×1280)
export const VIDEO_BPS = 1_200_000;
export const AUDIO_BPS = 96_000;

export type CompressedVideo = {
  blob: Blob;
  duration: number;
  poster: Blob | null;
  /** 3 images (data:image/jpeg) prises à 15 %, 50 % et 85 % pour le contrôle NSFW. */
  frames: string[];
  compressed: boolean;
};

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const list = [
    "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.playsInline = true;
    v.muted = false;
    v.crossOrigin = "anonymous";
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error("Vidéo illisible"));
    v.src = URL.createObjectURL(file);
  });
}

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    const done = () => (v.removeEventListener("seeked", done), resolve());
    v.addEventListener("seeked", done);
    v.currentTime = t;
    window.setTimeout(done, 3000);
  });
}

function snap(v: HTMLVideoElement, max: number, q = 0.7) {
  const s = Math.min(1, max / Math.max(v.videoWidth || 1, v.videoHeight || 1));
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round((v.videoWidth || 2) * s));
  c.height = Math.max(2, Math.round((v.videoHeight || 2) * s));
  c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

const dataToBlob = (d: string) => fetch(d).then((r) => r.blob());

/** Compresse (si utile) et renvoie la vidéo, sa durée, sa vignette et des images de contrôle. */
export async function compressVideo(
  file: Blob,
  opts: { maxSec: number; onProgress?: (pct: number) => void },
): Promise<CompressedVideo> {
  const v = await loadVideo(file);
  try {
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    if (duration > opts.maxSec + 0.5) {
      throw new Error(`Vidéo trop longue (max ${opts.maxSec >= 120 ? `${opts.maxSec / 60} min` : `${opts.maxSec} s`})`);
    }
    // Vignette + images de contrôle.
    const frames: string[] = [];
    for (const f of [0.15, 0.5, 0.85]) {
      await seek(v, Math.max(0.1, duration * f));
      frames.push(snap(v, 480));
    }
    await seek(v, Math.min(0.5, duration / 2));
    const poster = await dataToBlob(snap(v, 640, 0.75));

    const w = v.videoWidth, h = v.videoHeight;
    const bps = duration > 0 ? (file.size * 8) / duration : Infinity;
    const small = Math.max(w, h) <= TARGET_LONG_SIDE && bps <= (VIDEO_BPS + AUDIO_BPS) * 1.4;
    const mime = pickMime();
    const canvas = document.createElement("canvas");
    if (small || !mime || typeof canvas.captureStream !== "function") {
      opts.onProgress?.(100);
      return { blob: file, duration, poster, frames, compressed: false };
    }
    const s = Math.min(1, TARGET_LONG_SIDE / Math.max(w, h));
    canvas.width = Math.round((w * s) / 2) * 2;
    canvas.height = Math.round((h * s) / 2) * 2;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    // Son : la piste audio passe par WebAudio (rien n'est joué sur le haut-parleur).
    let ac: AudioContext | null = null;
    try {
      ac = new AudioContext();
      const src = ac.createMediaElementSource(v);
      const dst = ac.createMediaStreamDestination();
      src.connect(dst);
      dst.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch {
      /* pas de son disponible : vidéo muette */
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    await seek(v, 0);
    let raf = 0;
    const draw = () => {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      opts.onProgress?.(Math.min(99, Math.round((v.currentTime / (duration || 1)) * 100)));
      if (!v.ended) raf = requestAnimationFrame(draw);
    };
    rec.start(1000);
    await v.play();
    draw();
    await new Promise<void>((r) => (v.onended = () => r()));
    cancelAnimationFrame(raf);
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    void ac?.close();
    const out = new Blob(chunks, { type: mime.split(";")[0] });
    opts.onProgress?.(100);
    // Si le ré-encodage n'a rien gagné, on garde l'original.
    if (out.size === 0 || out.size >= file.size) return { blob: file, duration, poster, frames, compressed: false };
    return { blob: out, duration, poster, frames, compressed: true };
  } finally {
    URL.revokeObjectURL(v.src);
  }
}
