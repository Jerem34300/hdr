/**
 * Android : au retour du sélecteur Google Photos (ou d'une autre activité), Chrome garde parfois
 * une hauteur périmée ou une page défilée : la barre du bas reste au milieu avec du noir dessous.
 * On remesure la hauteur visible et on remet la page en haut à chaque retour.
 */
export function startViewportFix() {
  if (typeof window === "undefined") return () => undefined;
  const root = document.documentElement;
  let raf = 0;
  const measure = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.round(window.visualViewport?.height ?? window.innerHeight);
      // Clavier ouvert : on ne rétrécit pas l'appli (le clavier gère déjà son espace).
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      if (!typing || h > window.innerHeight * 0.8) root.style.setProperty("--app-h", `${Math.max(h, window.innerHeight)}px`);
      if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });
  };
  // Plusieurs passes : Chrome finit de restaurer la fenêtre un peu après le retour.
  const settle = () => { measure(); window.setTimeout(measure, 120); window.setTimeout(measure, 450); window.setTimeout(measure, 1000); };
  const onVis = () => document.visibilityState === "visible" && settle();
  measure();
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", settle);
  window.addEventListener("focus", settle);
  window.addEventListener("pageshow", settle);
  document.addEventListener("visibilitychange", onVis);
  window.visualViewport?.addEventListener("resize", measure);
  // Sélection d'un fichier : l'évènement change arrive au retour du sélecteur.
  const onChange = (e: Event) => { if ((e.target as HTMLInputElement | null)?.type === "file") settle(); };
  document.addEventListener("change", onChange, true);
  return () => {
    window.removeEventListener("resize", measure);
    window.removeEventListener("orientationchange", settle);
    window.removeEventListener("focus", settle);
    window.removeEventListener("pageshow", settle);
    document.removeEventListener("visibilitychange", onVis);
    window.visualViewport?.removeEventListener("resize", measure);
    document.removeEventListener("change", onChange, true);
  };
}
