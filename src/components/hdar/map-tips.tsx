import { useEffect, useLayoutEffect, useState } from "react";
import { myPhotos, useHdar } from "@/lib/hdar/store";
import { useActiveBoost } from "./boost";
import { TipBubble } from "./tip-bubble";

type TipId = "connect" | "live" | "pocket" | "spots" | "photo" | "boost";
type Arrow = "up" | "down" | "left" | "right";

type TipDef = {
  id: TipId;
  target: string;
  text: string;
  sub: string;
  arrow: Arrow;
};

const TIPS: TipDef[] = [
  { id: "connect", target: "connect", text: "Touche pour te montrer sur la carte", sub: "Se montrer", arrow: "down" },
  { id: "live", target: "live", text: "Tente un Live, rencontre en vidéo", sub: "", arrow: "right" },
  { id: "pocket", target: "pocket", text: "Dis bonjour au quartier", sub: "", arrow: "up" },
  { id: "spots", target: "spots", text: "Trouve où sortir ce soir", sub: "", arrow: "down" },
  { id: "photo", target: "me", text: "Ajoute une photo pour plus de messages", sub: "", arrow: "down" },
  { id: "boost", target: "me", text: "Fais-toi remarquer", sub: "", arrow: "down" },
];

const SNOOZE = 2 * 60 * 60 * 1000;
const EVERY = 10 * 60 * 1000;
const EVERY_KEY = 4 * 60 * 1000;
const DELAY = 3500;
const AUTO = 12_000;
const LAST_KEY = "hdar_tip_last";
const LEGACY_CONNECT = "hdar_connect_hint_closed";

function snoozeKey(id: TipId) {
  return `hdar_tip_${id}_closed`;
}
function readTs(key: string) {
  try {
    return Number(localStorage.getItem(key) || 0);
  } catch {
    return 0;
  }
}
function writeTs(key: string, n = Date.now()) {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* */
  }
}
function notSnoozed(id: TipId) {
  let at = readTs(snoozeKey(id));
  if (id === "connect" && !at) at = readTs(LEGACY_CONNECT);
  return Date.now() - at > SNOOZE;
}

type Pos = { left: number; top: number; arrow: Arrow; shift?: number };

/** Largeur de la bulle (w-52) : sert à la garder dans l'écran, la pointe restant sur la cible. */
const BUBBLE_W = 208;
function clampShift(cx: number, rootW: number) {
  const half = BUBBLE_W / 2, m = 8;
  return Math.max(m + half - cx, Math.min(0, rootW - m - half - cx)) || 0;
}
function placeNear(root: DOMRect, el: DOMRect, arrow: Arrow): Pos {
  const pad = 10;
  if (arrow === "down") {
    const cx = el.left - root.left + el.width / 2;
    return { left: cx, top: el.top - root.top - pad, arrow, shift: clampShift(cx, root.width) };
  }
  if (arrow === "up") {
    const cx = el.left - root.left + el.width / 2;
    return { left: cx, top: el.bottom - root.top + pad, arrow, shift: clampShift(cx, root.width) };
  }
  if (arrow === "right") {
    return { left: el.left - root.left - pad, top: el.top - root.top + el.height / 2, arrow };
  }
  return { left: el.right - root.left + pad, top: el.top - root.top + el.height / 2, arrow };
}


/** One coral tip bubble at a time on the map / dock. */
export function MapTips() {
  const visible = useHdar((s) => !!(s.me.tonight && s.me.tonight.expiresAt > s.now));
  // Strict: any album/main photo means the Profil photo tip must never show.
  const hasPhoto = useHdar((s) => myPhotos(s.me).length > 0);
  const boost = useActiveBoost();
  const boosted = !!boost && new Date(boost.ends_at).getTime() > Date.now();
  const [active, setActive] = useState<TipDef | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  // Drop photo tip immediately if a photo appears while it's open.
  useEffect(() => {
    if (hasPhoto && active?.id === "photo") setActive(null);
    // Captures de dev : ?tip=<id> affiche une bulle précise.
    const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get("tip") : null;
    if (forced) {
      const t = TIPS.find((x) => x.id === forced);
      if (t) setActive(t);
      return;
    }
  }, [hasPhoto, active]);

  useEffect(() => {
    if (import.meta.env.DEV && location.search.includes("tip=")) return;
    let stop = false;
    let hideTimer = 0;
    const pick = () => {
      if (stop) return;
      // Pas encore connecté ou sans photo : les deux bulles clés reviennent plus souvent.
      // La bulle « Touche pour te montrer » du bouton central passe d'abord, seule.
      if (!visible && !localStorage.getItem("hdar-visibility-tip")) return;
      if (Date.now() - readTs(LAST_KEY) < (!visible || !hasPhoto ? EVERY_KEY : EVERY)) return;

      const eligible = TIPS.filter((t) => {
        if (!notSnoozed(t.id)) return false;
        if (t.id === "connect") return false; // remplacée par la bulle unique du bouton « Se montrer »
        if (t.id === "photo") return !hasPhoto;
        if (t.id === "boost") return visible && !boosted;
        return true;
      });

      let chosen: TipDef | null = null;
      if (!visible) {
        chosen = eligible.find((t) => t.id === "connect") ?? null;
        chosen ??= eligible.find((t) => t.id === "photo") ?? null;
        if (!chosen) {
          const rest = eligible.filter((t) => t.id !== "connect");
          if (rest.length) chosen = rest[Math.floor(Math.random() * rest.length)]!;
        }
      } else {
        // Connecté sans photo : une fois sur deux, la bulle photo.
        if (!hasPhoto && Math.random() < 0.5) chosen = eligible.find((t) => t.id === "photo") ?? null;
        const rest = eligible.filter((t) => t.id !== "connect");
        if (!chosen && rest.length) chosen = rest[Math.floor(Math.random() * rest.length)]!;
      }
      if (!chosen) return;
      if (!document.querySelector(`[data-tip="${chosen.target}"]`)) return;
      writeTs(LAST_KEY);
      setActive(chosen);
      hideTimer = window.setTimeout(() => setActive(null), AUTO);
    };

    const start = window.setTimeout(pick, DELAY);
    return () => {
      stop = true;
      window.clearTimeout(start);
      window.clearTimeout(hideTimer);
    };
  }, [visible, hasPhoto, boosted]);

  useLayoutEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }
    const measure = () => {
      const root = document.querySelector("[data-tip-root]") as HTMLElement | null;
      const el = document.querySelector(`[data-tip="${active.target}"]`) as HTMLElement | null;
      if (!root || !el) {
        setPos(null);
        return;
      }
      setPos(placeNear(root.getBoundingClientRect(), el.getBoundingClientRect(), active.arrow));
    };
    measure();
    const id = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [active]);

  if (!active || !pos) return null;

  const close = () => {
    writeTs(snoozeKey(active.id));
    if (active.id === "connect") writeTs(LEGACY_CONNECT);
    setActive(null);
  };

  const arrow = pos.arrow;
  const wrap =
    arrow === "down"
      ? "-translate-x-1/2 -translate-y-full pb-2"
      : arrow === "up"
        ? "-translate-x-1/2 pt-2"
        : arrow === "right"
          ? "-translate-x-full -translate-y-1/2 pr-2"
          : "-translate-y-1/2 pl-2";

  return (
    <div className={`pointer-events-none absolute z-[45] ${wrap}`} style={{ left: pos.left + (pos.shift ?? 0), top: pos.top }}>
      <TipBubble arrow={arrow} pointerShift={pos.shift ?? 0} onClose={close} testId={`tip-${active.id}`}>
        {active.text}
      </TipBubble>
    </div>
  );
}
