import { useEffect, useState } from "react";
import { toast } from "sonner";
import { dismissPushAsk, enablePush, refreshPush, shouldAskPush } from "@/lib/hdar/push";
import { useHdar } from "@/lib/hdar/store";

/** Asks for notifications once, a little after entering the app (never on the 18+ screen). */
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
    if (!shouldAskPush()) return;
    const t = window.setTimeout(() => setShow(true), 20000);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md rounded-3xl border border-line bg-surface p-4 shadow-2xl">
      <p className="font-display font-bold">Être prévenu quand on t'écrit ?</p>
      <p className="mt-1 text-sm text-muted">
        Notifications pour les nouveaux messages et quand un favori apparaît sur la carte, même appli fermée. Sans contenu des messages.
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
