import { create } from "zustand";

/**
 * Le Live vit AU-DESSUS du routeur (monté une fois dans __root) : réduire, changer d'onglet ou revenir à la carte ne
 * démonte jamais le composant, donc la connexion WebRTC / LiveKit, la caméra et l'audio continuent sans coupure.
 */
type Dock = { open: boolean; min: boolean; search: string; openLive: (search: string) => void; setMin: (v: boolean) => void; close: () => void };
export const useLiveDock = create<Dock>()((set) => ({
  open: false, min: false, search: "",
  openLive: (search) => set((s) => (s.open ? { min: false } : { open: true, min: false, search })),
  setMin: (min) => set({ min }),
  close: () => set({ open: false, min: false }),
}));
