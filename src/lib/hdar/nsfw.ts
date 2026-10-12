/**
 * Free, in-browser NSFW check (nsfwjs, open source, no account) on the main
 * profile photo only. Loaded lazily the first time a photo needs checking.
 * Explicit images are not blocked here: the server hides them from others
 * and puts them in the admin queue. The album is never checked.
 */
type Prediction = { className: string; probability: number };
let modelPromise: Promise<{ classify: (img: HTMLImageElement) => Promise<Prediction[]> }> | null = null;

function model() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      tf.enableProdMode();
      const nsfw = await import("nsfwjs");
      return nsfw.load("MobileNetV2");
    })();
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** Returns a reason when the photo looks explicit, null otherwise (or when the check can't run). */
export async function explicitReason(dataUrl: string): Promise<string | null> {
  try {
    const [m, img] = await Promise.all([model(), loadImage(dataUrl)]);
    const preds = await m.classify(img);
    const p = (name: string) => preds.find((x) => x.className === name)?.probability ?? 0;
    const porn = p("Porn") + p("Hentai");
    if (porn >= 0.6) return `nsfw:${porn.toFixed(2)}`;
    return null;
  } catch {
    return null;
  }
}
