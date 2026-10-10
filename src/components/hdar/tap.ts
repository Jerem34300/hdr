import type { MouseEvent } from "react";
import { useHdar, type Filter, type Mode, type Tab } from "@/lib/hdar/store";
import type { SignalKind } from "@/lib/hdar/data";

/** Mouse clicks. Touch is handled by installTouchTap so a scrollable grid cannot swallow them. */
export function bindTap(fn: () => void) {
  return {
    onClick: (e: MouseEvent) => {
      if (e.nativeEvent.isTrusted) {
        const el = e.currentTarget;
        if (el instanceof HTMLElement && Date.now() - Number(el.dataset.lock || 0) < 700) return;
      }
      fn();
    },
  };
}

function controlAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest("input, textarea, select")) return null;
  return el.closest("button, [role='button'], a");
}

function runControl(btn: HTMLElement) {
  const act = btn.dataset.act;
  const id = btn.dataset.id ?? "";
  const s = useHdar.getState();
  if (act === "person") s.openPerson(id);
  else if (act === "tab") s.setTab(id as Tab);
  else if (act === "tonight") s.openTonight();
  else if (act === "mode") s.setMode(id as Mode);
  else if (act === "filter") s.setFilter(id as Filter);
  else if (act === "city") s.openCity();
  else if (act === "locate") s.locate();
  else if (act === "join") s.joinSpot(id);
  else if (act === "create") s.openCreate();
  else if (act === "close") s.closeSheet();
  else if (act === "near" || act === "line") s.enterLine(id);
  else if (act === "live") s.openProfile(id, btn.dataset.pseudo || "Anonyme");
  else if (act === "pocket") s.openPocket();
  else if (act === "signal") s.signal(id, (btn.dataset.kind ?? "verre") as SignalKind);
  else if (act === "chat") s.openChat(id);
  else if (act === "dismiss") s.dismissCelebrate();
  else btn.click();
}

/** Finger taps inside a scroller never become clicks on Android. Fire the action from touchend. */
export function installTouchTap() {
  const w = window as Window & { __hdarTap?: boolean };
  if (w.__hdarTap) return;
  w.__hdarTap = true;
  let sx = 0;
  let sy = 0;
  let armed = false;
  const slop = 14;

  const start = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      armed = false;
      return;
    }
    const hit = controlAt(e.touches[0].clientX, e.touches[0].clientY);
    if (!hit || hit.hasAttribute("disabled")) {
      armed = false;
      return;
    }
    armed = true;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  };

  const move = (e: TouchEvent) => {
    if (!armed || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (dx * dx + dy * dy > slop * slop) armed = false;
  };

  const end = (e: TouchEvent) => {
    if (!armed) return;
    armed = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (dx * dx + dy * dy > slop * slop) return;
    const hit = controlAt(sx, sy);
    if (!(hit instanceof HTMLElement) || hit.hasAttribute("disabled")) return;
    const locked = Number(hit.dataset.lock || 0);
    if (Date.now() - locked < 500) return;
    hit.dataset.lock = String(Date.now());
    if (e.cancelable) e.preventDefault();
    runControl(hit);
  };

  document.addEventListener("touchstart", start, { capture: true, passive: true });
  document.addEventListener("touchmove", move, { capture: true, passive: true });
  document.addEventListener("touchend", end, { capture: true, passive: false });
  document.addEventListener("touchcancel", end, { capture: true, passive: false });
}
