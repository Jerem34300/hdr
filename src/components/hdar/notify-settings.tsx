import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, pushActive, pushSupported } from "@/lib/hdar/push";
import { useHdar } from "@/lib/hdar/store";
import { hideOfflineGet, hideOfflineSet, setVisitorHidden, visitorHidden } from "@/lib/hdar/live";
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
  useEffect(() => {
    setOn(softEnabled(kind));
  }, [kind]);
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

/** Confidentialité carte : profil → « Me cacher quand je suis hors ligne » ; visiteur → bulle anonyme. */
export function MapPrivacyToggle({ compact }: { compact?: boolean }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (onboarded) void hideOfflineGet().then((v) => setOn(!!v)).catch(() => undefined);
    else setOn(visitorHidden());
  }, [onboarded]);
  const label = onboarded ? "Me cacher de la carte quand je suis hors ligne" : "Ne pas m'afficher en bulle anonyme sur la carte";
  return (
    <label className={compact ? "flex items-center justify-center gap-2 text-[11px] text-muted" : "flex min-h-11 items-center justify-between gap-3 text-sm"}>
      {compact && <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />}
      <span>{label}{!compact && <span className="block text-xs text-muted">{onboarded ? "Sinon, ton pin estompé « vu il y a … » reste visible 48 h, à ~400 m près." : "Sinon, une bulle sans pseudo ni photo, à ~1 km près, pendant 48 h."}</span>}</span>
      {!compact && <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />}
    </label>
  );
  function change(v: boolean) {
    setOn(v);
    if (onboarded) void hideOfflineSet(v).catch(() => setOn(!v));
    else setVisitorHidden(v);
  }
}
