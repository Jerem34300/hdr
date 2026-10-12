import { useEffect, useState } from "react";
import { activity, type ActivitySpot } from "./live";
import { playSoftSound } from "./sounds";
import { useHdar } from "./store";

/** Badges for the neighborhood chat and lieux (counts only, never message text). */
type State = { area: number; unread: Set<string>; fresh: Set<string>; places: Set<string> };
let state: State = { area: 0, unread: new Set(), fresh: new Set(), places: new Set() };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const AREA_SEEN = "hdar-area-seen";
const SPOT_SEEN = "hdar-spot-seen";
const SPOT_KNOWN = "hdar-spot-known";
const PLACE_SEEN = "hdar-place-seen";
const NEWSPOT_SOUND_AT = "hdar-newspot-sound-at";
const FRESH_MS = 6 * 3600 * 1000;

function readJson<T>(k: string, d: T): T {
  try {
    return JSON.parse(localStorage.getItem(k) || "") as T;
  } catch {
    return d;
  }
}
const spotSeen = () => readJson<Record<string, string>>(SPOT_SEEN, {});
const spotKnown = () => readJson<string[]>(SPOT_KNOWN, []);

export function markAreaSeen() {
  localStorage.setItem(AREA_SEEN, new Date().toISOString());
  if (state.area) {
    state = { ...state, area: 0 };
    emit();
  }
}
export function markSpotSeen(id: string) {
  const seen = spotSeen();
  seen[id] = new Date().toISOString();
  localStorage.setItem(SPOT_SEEN, JSON.stringify(seen));
  const known = spotKnown();
  if (!known.includes(id)) localStorage.setItem(SPOT_KNOWN, JSON.stringify([...known, id].slice(-300)));
  if (state.unread.has(id) || state.fresh.has(id)) {
    const unread = new Set(state.unread);
    const fresh = new Set(state.fresh);
    unread.delete(id);
    fresh.delete(id);
    state = { ...state, unread, fresh };
    emit();
  }
}

export function markPlaceSeen(id: string) {
  const seen = readJson<Record<string, string>>(PLACE_SEEN, {});
  seen[id] = new Date().toISOString();
  localStorage.setItem(PLACE_SEEN, JSON.stringify(seen));
  if (state.places.has(id)) {
    const places = new Set(state.places);
    places.delete(id);
    state = { ...state, places };
    emit();
  }
}
let openPlace: string | null = null;
export function setOpenPlace(id: string | null) {
  openPlace = id;
  if (id) markPlaceSeen(id);
}

let first = true;
async function poll() {
  const st = useHdar.getState();
  const here = st.here;
  const view = st.view;
  if (view.name === "pocket") localStorage.setItem(AREA_SEEN, new Date().toISOString());
  if (view.name === "spot") markSpotSeen(view.id);
  let res: { area: number; spots: ActivitySpot[]; places?: { id: string; last: string }[] };
  try {
    res = await activity(here?.lat ?? null, here?.lng ?? null, localStorage.getItem(AREA_SEEN));
  } catch {
    return;
  }
  const seen = spotSeen();
  const known = new Set(spotKnown());
  const unread = new Set<string>();
  const fresh = new Set<string>();
  const now = Date.now();
  for (const s of res.spots) {
    if (s.joined && s.last && (!seen[s.id] || Date.parse(s.last) > Date.parse(seen[s.id]))) unread.add(s.id);
    if (!s.mine && s.near && !known.has(s.id) && now - Date.parse(s.created) < FRESH_MS) fresh.add(s.id);
  }
  const placeSeen = readJson<Record<string, string>>(PLACE_SEEN, {});
  const places = new Set<string>();
  for (const p of res.places ?? []) {
    if (p.id === openPlace) continue;
    if (!placeSeen[p.id] || Date.parse(p.last) > Date.parse(placeSeen[p.id])) places.add(p.id);
  }
  const cur = useHdar.getState().view;
  if (cur.name === "pocket") res.area = 0;
  if (cur.name === "spot") unread.delete(cur.id);
  if (!first) {
    if (res.area > state.area) playSoftSound("area");
    if ([...unread].some((id) => !state.unread.has(id)) || [...places].some((id) => !state.places.has(id))) playSoftSound("spot");
    if ([...fresh].some((id) => !state.fresh.has(id))) {
      const last = Number(localStorage.getItem(NEWSPOT_SOUND_AT) || 0);
      if (now - last > 30 * 60 * 1000) {
        localStorage.setItem(NEWSPOT_SOUND_AT, String(now));
        playSoftSound("newspot");
      }
    }
  }
  first = false;
  state = { area: res.area, unread, fresh, places };
  emit();
}

let timer = 0;
/** Mounted once in the app shell: polls every 20 s while visible. */
export function useActivityPolling() {
  const view = useHdar((s) => s.view);
  useEffect(() => {
    if (view.name === "pocket") markAreaSeen();
    if (view.name === "spot") markSpotSeen(view.id);
  }, [view]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void poll();
    };
    tick();
    timer = window.setInterval(tick, 20000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
}

export function useActivity() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}

