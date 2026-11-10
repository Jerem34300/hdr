import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, pushActive, pushSupported } from "@/lib/hdar/push";
import { resolvePlace } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { nearAlertSet } from "@/lib/hdar/live";
import { turnOnNearAlert, useNearAlert } from "./nobody-near";
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
      {canPush && <NearAlertToggle onPush={() => setPush(true)} />}
    </section>
  );
}

/** « Préviens-moi quand quelqu'un arrive près de moi » : même alerte que le bouton du radar vide. */
function NearAlertToggle({ onPush }: { onPush: () => void }) {
  const [on, setOn] = useNearAlert();
  if (on === null) return null;
  const at = () => {
    const s = useHdar.getState();
    if (s.here) return s.here;
    const p = resolvePlace(s.cityId, s.customCenter);
    return { lat: p.lat, lng: p.lng };
  };
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>Quelqu'un arrive près de moi<span className="block text-xs text-muted">Une notification au plus toutes les 12 h, sans pseudo ni position.</span></span>
      <input
        type="checkbox"
        data-act="near-alert"
        checked={on}
        onChange={(e) => {
          const want = e.target.checked;
          setOn(want);
          void (want ? turnOnNearAlert(at()).then((ok) => { if (ok) onPush(); return ok; }) : nearAlertSet(0, 0, false).then(() => false))
            .then((ok) => setOn(ok))
            .catch(() => { setOn(!want); toast("Notifications indisponibles"); });
        }}
      />
    </label>
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

/** Confidentialité carte : profil → « Retirer aussi mon pin estompé quand je suis caché » ; visiteur → bulle anonyme. */
export function MapPrivacyToggle({ compact }: { compact?: boolean }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (onboarded) void hideOfflineGet().then((v) => setOn(!!v)).catch(() => undefined);
    else setOn(visitorHidden());
  }, [onboarded]);
  const label = onboarded ? "Retirer aussi mon pin estompé quand je suis caché" : "Ne pas m'afficher en bulle anonyme sur la carte";
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
