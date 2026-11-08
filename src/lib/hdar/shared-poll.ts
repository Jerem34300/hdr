/**
 * Une donnée relue en arrière-plan, partagée par tous les écrans qui l'affichent : UNE requête par
 * période quel que soit le nombre de composants abonnés (avant, chaque écran avait son propre minuteur).
 * Relue seulement au premier plan, au retour sur l'appli, et à l'abonnement si la valeur a plus de `fresh` ms.
 */
import { useEffect, useState } from "react";

type Shared<T> = { use: () => T; refresh: () => void };

export function sharedPoll<T>(load: () => Promise<T>, initial: T, every: number, fresh = 30_000): Shared<T> {
  let value = initial;
  let at = 0;
  let users = 0;
  let timer = 0;
  let inflight: Promise<void> | null = null;
  const listeners = new Set<(v: T) => void>();

  const run = () => {
    if (document.visibilityState !== "visible") return;
    inflight ??= load()
      .then((v) => {
        value = v;
        at = Date.now();
        listeners.forEach((l) => l(v));
      })
      .catch(() => undefined)
      .finally(() => (inflight = null));
  };
  // Étalé entre clients (±15 %) pour que des milliers de téléphones ne tapent pas la base ensemble.
  const arm = () => {
    window.clearTimeout(timer);
    if (users > 0) timer = window.setTimeout(() => (run(), arm()), every * (0.85 + Math.random() * 0.3));
  };
  const onVis = () => {
    if (document.visibilityState === "visible" && Date.now() - at > fresh) run();
  };

  return {
    refresh: () => {
      at = 0;
      if (users > 0) run();
    },
    use: () => {
      const [v, setV] = useState(value);
      useEffect(() => {
        listeners.add(setV);
        if (++users === 1) {
          document.addEventListener("visibilitychange", onVis);
          arm();
        }
        if (Date.now() - at > fresh) run();
        else setV(value);
        return () => {
          listeners.delete(setV);
          if (--users === 0) {
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVis);
          }
        };
      }, []);
      return v;
    },
  };
}
