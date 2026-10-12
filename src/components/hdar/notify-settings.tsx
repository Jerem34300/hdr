import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, pushActive, pushSupported } from "@/lib/hdar/push";
import { playMessageSound, playSoftSound, setSoftEnabled, setSoundEnabled, softEnabled, soundEnabled, type SoftKind } from "@/lib/hdar/sounds";

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
      <p className="mt-3 text-xs text-muted">Sons discrets, appli ouverte seulement (jamais de notification ni de texte) :</p>
      {(
        [
          ["area", "Chat du quartier"],
          ["spot", "Messages dans tes lieux"],
          ["newspot", "Nouveau lieu près de toi (max 1 / 30 min)"],
        ] as [SoftKind, string][]
      ).map(([k, label]) => (
        <SoftToggle key={k} kind={k} label={label} />
      ))}
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

function SoftToggle({ kind, label }: { kind: SoftKind; label: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(softEnabled(kind)), [kind]);
  return (
    <label className="flex h-11 items-center justify-between text-sm">
      {label}
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          setSoftEnabled(kind, e.target.checked);
          if (e.target.checked) playSoftSound(kind);
        }}
      />
    </label>
  );
}
