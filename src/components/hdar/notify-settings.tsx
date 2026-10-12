import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, pushActive, pushSupported } from "@/lib/hdar/push";
import { playMessageSound, setSoundEnabled, soundEnabled } from "@/lib/hdar/sounds";

export function NotifySettings() {
  const [sound, setSound] = useState(true);
  const [push, setPush] = useState(false);
  const [canPush, setCanPush] = useState(false);
  useEffect(() => {
    setSound(soundEnabled());
    setCanPush(pushSupported());
    void pushActive().then(setPush);
  }, []);
  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-bold">Notifications</h2>
      <label className="mt-2 flex h-11 items-center justify-between text-sm">
        Son et vibration
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => {
            setSound(e.target.checked);
            setSoundEnabled(e.target.checked);
            if (e.target.checked) playMessageSound();
          }}
        />
      </label>
      {canPush && (
        <label className="flex h-11 items-center justify-between text-sm">
          Notifications appli fermée
          <input
            type="checkbox"
            checked={push}
            onChange={(e) => {
              const on = e.target.checked;
              void (on ? enablePush() : disablePush().then(() => false))
                .then((ok) => {
                  setPush(!!ok);
                  if (on && !ok) toast("Autorise les notifications dans les réglages du navigateur");
                })
                .catch(() => toast("Notifications indisponibles"));
            }}
          />
        </label>
      )}
    </section>
  );
}
