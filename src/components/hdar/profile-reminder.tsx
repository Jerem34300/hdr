import { useEffect, useState } from "react";
import { myPhotos, useHdar } from "@/lib/hdar/store";
import { track } from "@/lib/hdar/track";

const FIRST = "hdar_first_seen";
const LAST = "hdar_profile_nudge";
const DAY = 24 * 60 * 60 * 1000;
const num = (k: string) => {
  try {
    return Number(localStorage.getItem(k) || 0);
  } catch {
    return 0;
  }
};
const put = (k: string) => {
  try {
    localStorage.setItem(k, String(Date.now()));
  } catch {
    /* */
  }
};

/** Rappel in-app : 24 h après la première visite (puis au plus une fois par jour),
 *  si le profil n'a toujours pas de pseudo ou de photo. Rien n'est envoyé hors de l'appli. */
export function ProfileReminder() {
  const pseudo = useHdar((s) => s.me.pseudo.trim());
  const hasPhoto = useHdar((s) => myPhotos(s.me).length > 0);
  const [show, setShow] = useState(false);
  const missing = !pseudo || !hasPhoto;
  useEffect(() => {
    if (!num(FIRST)) put(FIRST);
    if (!missing) return setShow(false);
    const t = window.setTimeout(() => {
      if (Date.now() - num(FIRST) >= DAY && Date.now() - num(LAST) >= DAY) {
        put(LAST);
        track("nudge_profile");
        setShow(true);
      }
    }, 6000);
    return () => window.clearTimeout(t);
  }, [missing]);
  if (!show) return null;
  const close = () => setShow(false);
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md rounded-3xl border border-[#FA6F6C]/60 bg-surface p-4 shadow-[0_0_30px_rgba(250,111,108,.35)]">
      <p className="font-display font-bold">{!pseudo ? "Ton profil est encore vide 👀" : "Ajoute une photo 📸"}</p>
      <p className="mt-1 text-sm text-muted">
        {!pseudo
          ? "Choisis un pseudo et une photo : les profils complets reçoivent bien plus de messages."
          : "Les profils avec photo reçoivent bien plus de messages. Elle peut être floue, de dos ou juste un détail, tu restes discret."}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="h-11 flex-1 rounded-full bg-signal font-bold text-night"
          onClick={() => {
            track("nudge_profile_ok");
            close();
            useHdar.getState().setTab("me");
          }}
        >
          {!pseudo ? "Compléter mon profil" : "Ajouter une photo"}
        </button>
        <button type="button" className="h-11 flex-1 rounded-full border border-line" onClick={close}>
          Plus tard
        </button>
      </div>
    </div>
  );
}
