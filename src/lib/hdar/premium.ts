import { create } from "zustand";
import { persist } from "zustand/middleware";
import { myPremium, NO_FILTERS, type MapFilters } from "./live";

type S = {
  premium: boolean;
  until: string | null;
  status: string | null;
  photoLimit: number;
  filters: MapFilters;
  setFilters: (f: MapFilters) => void;
  refresh: () => Promise<void>;
};

/** État hdar+. Le serveur reste juge : ceci ne sert qu'à l'affichage. */
export const usePremium = create<S>()(
  persist(
    (set) => ({
      premium: false,
      until: null,
      status: null,
      photoLimit: 5,
      filters: NO_FILTERS,
      setFilters: (filters) => set({ filters }),
      refresh: async () => {
        try {
          const p = await myPremium();
          set({ premium: p.premium, until: p.until, status: p.status, photoLimit: p.photo_limit ?? 5 });
          if (!p.premium) set({ filters: NO_FILTERS });
        } catch {
          /* pas de session : on garde l'état */
        }
      },
    }),
    { name: "hdar-premium", partialize: (s) => ({ filters: s.filters, premium: s.premium, photoLimit: s.photoLimit }) },
  ),
);
