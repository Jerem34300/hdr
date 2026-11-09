import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bell, BellRing, MessageCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { countrySalon, nearAlertGet, nearAlertSet } from "@/lib/hdar/live";
import { currentCountry, useCountry } from "@/lib/hdar/country";
import { enablePush, pushActive, pushSupported } from "@/lib/hdar/push";
import { refreshSalonInbox } from "@/lib/hdar/salon-inbox";
import { useHdar } from "@/lib/hdar/store";
import { track } from "@/lib/hdar/track";
import { canOfferInstall } from "./install-prompt";
import { CreateSalon } from "./salons";
import { EyeIcon } from "./visibility-button";

/** Au-delà de cette distance, la personne la plus proche n'est plus « près de chez toi ». Même rayon que l'alerte (v140). */
export const NEAR_M = 30_000;
const CLOSED_KEY = "hdar-nobody-near-closed";
const SNOOZE = 6 * 3600 * 1000;

export function nobodyNearClosed() {
  try {
    return Date.now() - Number(localStorage.getItem(CLOSED_KEY) || 0) < SNOOZE;
  } catch {
    return false;
  }
}

/** Alerte « quelqu'un arrive près de moi » : null = indisponible (base pas à jour), sinon active ou non sur cet appareil. */
export function useNearAlert() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([nearAlertGet(), pushActive().catch(() => false)])
      .then(([a, p]) => live && setOn(a === null ? null : a && p))
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return [on, setOn] as const;
}

/**
 * Demande les notifications (au toucher) puis enregistre l'alerte autour de `at`.
 * Sans notifications possibles dans le navigateur (iPhone hors appli installée) : propose d'installer l'appli.
 */
export async function turnOnNearAlert(at: { lat: number; lng: number }): Promise<boolean> {
  if (!pushSupported()) {
    if (canOfferInstall()) {
      toast("Installe l'appli pour être prévenu");
      window.dispatchEvent(new Event("hdar-install-open"));
    } else toast("Notifications indisponibles sur cet appareil");
    return false;
  }
  if (!(await enablePush())) {
    toast("Autorise les notifications dans les réglages du navigateur");
    return false;
  }
  await nearAlertSet(at.lat, at.lng, true);
  track("near_alert_on");
  return true;
}

/**
 * Radar sans personne à proximité : au lieu d'une carte muette, trois sorties.
 * Discuter (salon Général du pays), créer un salon, et être prévenu quand quelqu'un arrive.
 */
export function NobodyNear({ at, nearest, onNearest, visible, onClose, children }: {
  at: { lat: number; lng: number };
  /** Distance de la personne visible la plus proche (« ~80 km »), s'il y en a une. */
  nearest: string | null;
  onNearest: () => void;
  visible: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const openSalon = useHdar((s) => s.openSalon);
  const setTab = useHdar((s) => s.setTab);
  const onboarded = useHdar((s) => s.me.onboarded);
  const cc = useCountry(currentCountry);
  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useNearAlert();
  const [busy, setBusy] = useState(false);
  useEffect(() => track("nobody_near"), []);

  const chat = () => {
    track("nobody_near_chat");
    void countrySalon(cc).then((s) => openSalon(s.id, s.name)).catch((e) => toast(e instanceof Error ? e.message : "Salon indisponible"));
  };
  const create = () => {
    if (!onboarded) return void toast("Crée ton profil pour ouvrir un salon", { action: { label: "Créer", onClick: () => setTab("me") } });
    track("nobody_near_create");
    setCreating(true);
  };
  const notify = () => {
    if (busy) return;
    setBusy(true);
    void turnOnNearAlert(at)
      .then((ok) => { if (ok) { setAlert(true); toast("C'est noté : on te prévient dès que quelqu'un arrive"); } })
      .catch((e) => toast(e instanceof Error ? e.message : "Notifications indisponibles"))
      .finally(() => setBusy(false));
  };
  const chip = "flex h-9 items-center gap-1.5 rounded-full px-3.5 font-bold whitespace-nowrap";

  return (
    <div
      data-act="empty-banner"
      className="absolute top-3 end-3 start-[4.25rem] z-30 mx-auto max-w-[22rem] rounded-2xl border border-line bg-night/90 px-3 py-2.5 text-center shadow-xl backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" aria-label="Fermer" data-act="nobody-close" className="absolute top-0 end-0 grid size-9 place-items-center text-muted"
        onClick={() => { try { localStorage.setItem(CLOSED_KEY, String(Date.now())); } catch { /* */ } onClose(); }}>
        <X className="size-4" />
      </button>
      <p className="px-6 font-display text-sm font-bold">Tu es parmi les premiers ici 🔥</p>
      <p className="mt-0.5 text-xs text-muted">Lance la discussion ou crée ton salon, les autres arrivent.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
        <button type="button" data-act="nobody-chat" className={chip + " bg-signal text-night"} onClick={chat}>
          <MessageCircle className="size-4 shrink-0" aria-hidden />
          <span>Discuter</span>
        </button>
        <button type="button" data-act="nobody-create" className={chip + " border border-line text-ink"} onClick={create}>
          <Plus className="size-4 shrink-0" aria-hidden />
          <span>Créer un salon</span>
        </button>
        {!visible && (
          // Même action que le gros bouton « Se montrer » de la barre du bas.
          <button type="button" data-act="banner-show" className={chip + " vis-btn vis-off relative overflow-hidden text-white"}
            onClick={() => document.querySelector<HTMLElement>('[data-act="tonight"]')?.click()}>
            <EyeIcon open={false} className="relative z-10 size-4 shrink-0" />
            <span className="relative z-10">Se montrer</span>
            <span className="vis-shine" />
          </button>
        )}
      </div>
      {alert === false && (
        <button type="button" data-act="nobody-notify" disabled={busy} onClick={notify}
          className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-signal/60 px-3 py-1.5 text-xs font-semibold text-signal disabled:opacity-60">
          <Bell className="size-4 shrink-0" aria-hidden />
          <span>Préviens-moi quand quelqu'un arrive</span>
        </button>
      )}
      {alert === true && (
        <p data-act="nobody-notify-on" className="mt-2 flex items-center justify-center gap-1.5 text-xs text-online">
          <BellRing className="size-4 shrink-0" aria-hidden />
          <span>On te prévient dès que quelqu'un arrive</span>
        </p>
      )}
      {nearest && (
        <button type="button" data-act="nobody-nearest" className="mt-2 text-xs text-muted" onClick={onNearest}>
          Le plus proche : {nearest} · <span className="text-signal">Voir</span>
        </button>
      )}
      {children}
      {creating && typeof document !== "undefined" && createPortal(
        <CreateSalon cc={cc} onClose={() => setCreating(false)}
          onCreated={(id, name) => { setCreating(false); refreshSalonInbox(); openSalon(id, name); }} />,
        document.body,
      )}
    </div>
  );
}
