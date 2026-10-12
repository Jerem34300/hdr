/**
 * hdar's own notification sounds, synthesised with WebAudio (no audio files):
 * - message: two soft rising bell notes (G5 → D6)
 * - favorite: three-note sparkle arpeggio (C6 → E6 → G6) with a shimmer
 * Plus vibration on phones. Sound can be switched off in "Mon profil".
 */
const SOUND_KEY = "hdar-sound";
let ctx: AudioContext | null = null;

export function soundEnabled() {
  return typeof localStorage === "undefined" || localStorage.getItem(SOUND_KEY) !== "off";
}
export function setSoundEnabled(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
}

function audio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

// Browsers only allow audio after a user gesture: unlock on the first tap.
if (typeof window !== "undefined") {
  const unlock = () => {
    audio();
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
}

function bell(ac: AudioContext, freq: number, at: number, dur: number, gain: number) {
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  out.connect(ac.destination);
  for (const [mult, g] of [[1, 1], [2, 0.18], [3.01, 0.06]] as const) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * mult, at);
    og.gain.value = g;
    o.connect(og).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}

export function playMessageSound() {
  vibrate([60, 40, 60]);
  if (!soundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  bell(ac, 783.99, t, 0.45, 0.22);
  bell(ac, 1174.66, t + 0.11, 0.6, 0.18);
}

export function playFavoriteSound() {
  vibrate([40, 30, 40, 30, 90]);
  if (!soundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  bell(ac, 1046.5, t, 0.5, 0.16);
  bell(ac, 1318.51, t + 0.09, 0.5, 0.15);
  bell(ac, 1567.98, t + 0.18, 0.8, 0.15);
  bell(ac, 2093, t + 0.27, 0.7, 0.05);
}

/** Quieter, separately toggleable chimes for public activity (app open only, never pushed). */
export type SoftKind = "area" | "spot" | "newspot";
const SOFT_KEY = (k: SoftKind) => `hdar-sound-${k}`;
export function softEnabled(k: SoftKind) {
  return typeof localStorage === "undefined" || localStorage.getItem(SOFT_KEY(k)) !== "off";
}
export function setSoftEnabled(k: SoftKind, on: boolean) {
  localStorage.setItem(SOFT_KEY(k), on ? "on" : "off");
}
export function playSoftSound(k: SoftKind) {
  if (!softEnabled(k)) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  if (k === "area") {
    // one low, round "pop"
    bell(ac, 587.33, t, 0.35, 0.07);
  } else if (k === "spot") {
    // two soft falling notes
    bell(ac, 880, t, 0.3, 0.06);
    bell(ac, 659.25, t + 0.1, 0.4, 0.06);
  } else {
    // airy rising fifth
    bell(ac, 523.25, t, 0.4, 0.06);
    bell(ac, 783.99, t + 0.14, 0.6, 0.06);
  }
}
