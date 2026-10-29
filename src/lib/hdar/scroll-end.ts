/** Fait défiler une liste de messages jusqu'en bas, dans SA propre zone seulement.
 *  (scrollIntoView ferait aussi défiler la feuille / la page qui la contient : fiche ouverte « en bas », titre caché.) */
export function scrollListEnd(end: HTMLElement | null, smooth = false) {
  const box = end?.parentElement;
  if (!box) return;
  box.scrollTo({ top: box.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

import { useLayoutEffect, type RefObject } from "react";
/** Feuille / fiche : toujours ouverte en haut (titre visible), et remise en haut à chaque changement de contenu (autre lieu…). */
export function useOpenAtTop(ref: RefObject<HTMLElement | null>, key: unknown) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
    // Les contenus chargés juste après (fiche, horaires, chat) ne doivent pas déplacer la vue.
    const t = [60, 300, 900].map((ms) => window.setTimeout(() => { if (el.scrollTop > 0 && !el.matches(":focus-within")) el.scrollTop = 0; }, ms));
    return () => t.forEach(clearTimeout);
  }, [key]);
}
/** Remplace autoFocus : met le focus sans faire défiler la feuille. */
export const focusNoScroll = (el: HTMLElement | null) => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }); };
