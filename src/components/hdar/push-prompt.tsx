import { useEffect, useState } from "react";
import { toast } from "sonner";
import { dismissPushAsk, enablePush, refreshPush, shouldAskPush } from "@/lib/hdar/push";
import { useHdar } from "@/lib/hdar/store";

/** Offers notifications once, right after the user sends their first private message (never on load). */
export function PushPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    void refreshPush();
    // Opened from a notification: /?chat=<id>
    const chat = new URLSearchParams(window.location.search).get("chat");
    if (chat) {
      useHdar.getState().openLive(chat, "Message");
      window.history.replaceState(null, "", "/");
    }
    // Réponse dans un salon (/?salon=<id>) ou dans le chat du quartier (/?quartier=1).
    const q = new URLSearchParams(window.location.search);
    const salon = q.get("salon");
    if (salon) {
      useHdar.getState().openSalon(salon, "Salon");
      window.history.replaceState(null, "", "/");
    } else if (q.get("quartier")) {
      useHdar.getState().openPocket();
      window.history.replaceState(null, "", "/");
    }
    const ask = () => {
      if (shouldAskPush()) window.setTimeout(() => setShow(true), 1500);
    };
    window.addEventListener("hdar-ask-push", ask);
    return () => window.removeEventListener("hdar-ask-push", ask);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md rounded-3xl border border-line bg-surface p-4 shadow-2xl">
      <p className="font-display font-bold">Être prévenu de sa réponse ?</p>
      <p className="mt-1 text-sm text-muted">
        Une notification seulement pour tes messages privés et quand on répond à tes messages dans les salons, appli fermée. Jamais le contenu des messages, jamais de pub.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="h-11 flex-1 rounded-full bg-signal text-night"
          onClick={() => {
            setShow(false);
            void enablePush()
              .then((ok) => toast(ok ? "Notifications activées" : "Notifications refusées"))
              .catch(() => toast("Notifications indisponibles sur cet appareil"));
          }}
        >
          Activer
        </button>
        <button
          type="button"
          className="h-11 flex-1 rounded-full border border-line"
          onClick={() => {
            dismissPushAsk();
            setShow(false);
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
