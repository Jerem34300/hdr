import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Apparence des discussions : seulement sur cet appareil, seulement pour ta vue. */
export const BUBBLES = [
  { id: "corail", name: "Corail", bg: "#ff5a4e", ink: "#0b0b10", meta: "rgba(11,11,16,.6)" },
  { id: "bleu", name: "Bleu", bg: "#2f7cf6", ink: "#ffffff", meta: "rgba(255,255,255,.72)" },
  { id: "vert", name: "Menthe", bg: "#3ddc97", ink: "#0b0b10", meta: "rgba(11,11,16,.6)" },
  { id: "violet", name: "Violet", bg: "#7c5cff", ink: "#ffffff", meta: "rgba(255,255,255,.72)" },
  { id: "rose", name: "Rose", bg: "#e8458b", ink: "#ffffff", meta: "rgba(255,255,255,.75)" },
  { id: "ambre", name: "Ambre", bg: "#fbbf24", ink: "#0b0b10", meta: "rgba(11,11,16,.6)" },
  { id: "turquoise", name: "Turquoise", bg: "#14b8a6", ink: "#0b0b10", meta: "rgba(11,11,16,.62)" },
  { id: "graphite", name: "Graphite", bg: "#3a3a46", ink: "#f4f4f6", meta: "rgba(244,244,246,.65)" },
] as const;
export const FONTS = [
  { id: "defaut", name: "Par défaut", css: "inherit" },
  { id: "moderne", name: "Moderne", css: '"Bricolage Grotesque", "DM Sans", sans-serif' },
  { id: "serif", name: "Serif", css: 'ui-serif, Georgia, "Noto Serif", serif' },
  { id: "mono", name: "Mono", css: 'ui-monospace, "SF Mono", Menlo, "Roboto Mono", monospace' },
] as const;
export const SIZES = [
  { id: "s", name: "Petit", px: 13 },
  { id: "m", name: "Moyen", px: 15 },
  { id: "l", name: "Grand", px: 17 },
  { id: "xl", name: "Très grand", px: 20 },
] as const;
export const WALLS = [
  { id: "aucun", name: "Uni", css: "none", size: "auto" },
  { id: "points", name: "Points", css: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px)", size: "18px 18px" },
  { id: "aube", name: "Aube", css: "linear-gradient(160deg, rgba(124,92,255,.14), rgba(255,90,78,.08) 60%, transparent)", size: "auto" },
  { id: "lignes", name: "Lignes", css: "repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0 2px, transparent 2px 14px)", size: "auto" },
  { id: "nuit", name: "Nuit", css: "radial-gradient(circle at 20% 10%, rgba(47,124,246,.16), transparent 45%), radial-gradient(circle at 85% 80%, rgba(61,220,151,.10), transparent 40%)", size: "auto" },
] as const;

/** typing = montrer aux autres quand j'écris / j'envoie un média (activé par défaut). */
export type Appearance = { bubble: string; font: string; size: string; wall: string; typing?: boolean };
export const DEFAULT_APPEARANCE: Appearance = { bubble: "corail", font: "defaut", size: "m", wall: "aucun", typing: true };

export const useAppearance = create<Appearance & { set: (p: Partial<Appearance>) => void; reset: () => void }>()(
  persist((set) => ({ ...DEFAULT_APPEARANCE, set: (p) => set(p), reset: () => set(DEFAULT_APPEARANCE) }), { name: "hdar-appearance" }),
);

/** Variables CSS d'une apparence (appliquées sur <html>, ou sur un aperçu). */
export function appearanceVars(a: Appearance): Record<string, string> {
  const b = BUBBLES.find((x) => x.id === a.bubble) ?? BUBBLES[0];
  const f = FONTS.find((x) => x.id === a.font) ?? FONTS[0];
  const z = SIZES.find((x) => x.id === a.size) ?? SIZES[1];
  const w = WALLS.find((x) => x.id === a.wall) ?? WALLS[0];
  return { "--my-bubble": b.bg, "--my-bubble-ink": b.ink, "--my-bubble-meta": b.meta, "--msg-font": f.css, "--msg-size": `${z.px}px`, "--chat-wall": w.css, "--chat-wall-size": w.size };
}

export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  for (const [k, v] of Object.entries(appearanceVars(a))) document.documentElement.style.setProperty(k, v);
}
if (typeof window !== "undefined") {
  applyAppearance(useAppearance.getState());
  useAppearance.subscribe((s) => applyAppearance(s));
}

/** Style d'une bulle reçue dans la couleur choisie par son auteur (null = gris neutre par défaut). */
export function authorBubble(id: string | null | undefined): Record<string, string> | undefined {
  const b = id ? BUBBLES.find((x) => x.id === id) : undefined;
  return b ? { "--b-bg": b.bg, "--b-ink": b.ink, "--b-meta": b.meta } : undefined;
}
