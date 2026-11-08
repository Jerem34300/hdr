/** Nombre de personnes dans le Live : lu dans le battement commun (v138, toutes les 40-50 s). */
import { useTick } from "./tick";

export const useLiveCount = () => useTick((t) => t.live_count) ?? 0;
