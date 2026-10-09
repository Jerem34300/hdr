export function readImage(file: File, max = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

export function safeSrc(src: string | undefined | null) {
  if (!src) return "";
  if (src.startsWith("/avatars/")) return src;
  if (src.startsWith("data:image/")) return src;
  if (src.startsWith("blob:")) return src;
  return "";
}

const urls = new Map<string, string>();

export function rememberMedia(id: string, url: string) {
  urls.set(id, url);
}

export function mediaUrl(id: string) {
  return urls.get(id) ?? "";
}

export function logClientError(message: string, source: string) {
  try {
    const prev = JSON.parse(localStorage.getItem("hdar-errors") || "[]") as {
      message: string;
      source: string;
      at: number;
    }[];
    prev.unshift({ message: message.slice(0, 400), source: source.slice(0, 180), at: Date.now() });
    localStorage.setItem("hdar-errors", JSON.stringify(prev.slice(0, 40)));
  } catch {
    /* private mode */
  }
}

let seq = 0;
export function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function playPop() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
  osc.onended = () => void ctx.close();
}
