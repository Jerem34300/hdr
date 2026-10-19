import { useEffect, useLayoutEffect, useState } from "react";
import { myPhotos, useHdar } from "@/lib/hdar/store";
import { useActiveBoost } from "./boost";

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
  { id: "connect", target: "connect", text: "Montre aux autres que tu es là", sub: "Connecte-toi", arrow: "down" },
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

type Pos = { left: number; top: number; arrow: Arrow };

function placeNear(root: DOMRect, el: DOMRect, arrow: Arrow): Pos {
  const pad = 10;
  if (arrow === "down") {
    return { left: el.left - root.left + el.width / 2, top: el.top - root.top - pad, arrow };
  }
  if (arrow === "up") {
    return { left: el.left - root.left + el.width / 2, top: el.bottom - root.top + pad, arrow };
  }
  if (arrow === "right") {
    return { left: el.left - root.left - pad, top: el.top - root.top + el.height / 2, arrow };
  }
  return { left: el.right - root.left + pad, top: el.top - root.top + el.height / 2, arrow };
}

function arrowGlyph(a: Arrow) {
  return a === "down" ? "↓" : a === "up" ? "↑" : a === "right" ? "→" : "←";
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
  }, [hasPhoto, active]);

  useEffect(() => {
    let stop = false;
    let hideTimer = 0;
    const pick = () => {
      if (stop) return;
      // Pas encore connecté ou sans photo : les deux bulles clés reviennent plus souvent.
      if (Date.now() - readTs(LAST_KEY) < (!visible || !hasPhoto ? EVERY_KEY : EVERY)) return;

      const eligible = TIPS.filter((t) => {
        if (!notSnoozed(t.id)) return false;
        if (t.id === "connect") return !visible;
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
      ? "flex -translate-x-1/2 -translate-y-full flex-col items-center"
      : arrow === "up"
        ? "flex -translate-x-1/2 flex-col items-center"
        : arrow === "right"
          ? "flex -translate-x-full -translate-y-1/2 flex-row items-center"
          : "flex -translate-y-1/2 flex-row items-center";

  const tri =
    arrow === "down"
      ? "-mt-1 size-0 border-x-[10px] border-t-[12px] border-x-transparent border-t-[#FA6F6C]"
      : arrow === "up"
        ? "order-first -mb-1 size-0 border-x-[10px] border-b-[12px] border-x-transparent border-b-[#FA6F6C]"
        : arrow === "right"
          ? "-mr-1 size-0 border-y-[10px] border-l-[12px] border-y-transparent border-l-[#FA6F6C]"
          : "order-first -ml-1 size-0 border-y-[10px] border-r-[12px] border-y-transparent border-r-[#FA6F6C]";

  return (
    <div
      className={`pointer-events-none absolute z-[45] animate-bounce ${wrap}`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="pointer-events-auto relative max-w-[14rem] whitespace-normal rounded-2xl bg-[#FA6F6C] py-2 pl-4 pr-8 text-center font-display text-sm font-bold text-night shadow-[0_0_24px_rgba(250,111,108,0.7)]">
        {active.text}
        <span className="block text-xs font-semibold">
          {active.sub ? `${active.sub} ${arrowGlyph(arrow)}` : arrowGlyph(arrow)}
        </span>
        <button
          type="button"
          aria-label="Fermer"
          onClick={close}
          className="absolute top-1 right-1 grid size-6 place-items-center rounded-full text-night/70 hover:bg-black/10"
        >
          ✕
        </button>
      </div>
      <span className={tri} />
    </div>
  );
}
