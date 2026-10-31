import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { meetAccept, meetFlash, meetPropose, meetState, meetStop, type MeetState } from "./live";
import { supabase } from "./session";

/** « Se retrouver » : boussole partagée entre deux personnes qui se sont déjà écrit.
 *  Les positions précises ne transitent que par un canal Realtime privé, pendant la session : rien n'est stocké. */
export type Fix = { lat: number; lng: number; acc: number; at: number };
export type MeetDemo = { state: MeetState; me?: Fix; other?: Fix; heading?: number; flash?: string };

/** Action venue d'une notification (appli ouverte par la notif). Appliquée une seule fois. */
type Intent = { with: string; accept: string | null; refuse: string | null; flash: string | null };
let intent: Intent | null = null;
export const setMeetIntent = (i: Intent) => { intent = i.accept || i.refuse || i.flash ? i : null; };
const askPush = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("hdar-ask-push")); };

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
/** Distance arrondie honnêtement : jamais plus précise que le GPS. */
export function approxDistance(m: number, acc: number) {
  const step = m < 50 ? 5 : m < 200 ? 10 : m < 1000 ? 50 : 100;
  const floor = Math.max(step, Math.round(acc / step) * step);
  if (m <= floor) return `< ${floor} m`;
  if (m >= 1000) return `~${(Math.round(m / 100) / 10).toString().replace(".", ",")} km`;
  return `~${Math.round(m / step) * step} m`;
}
/** Froid (bleu, loin) → chaud (corail, tout près). */
export function warmth(m: number) {
  const t = Math.max(0, Math.min(1, Math.log10(Math.max(m, 10) / 10) / Math.log10(600 / 10))); // 10 m → 600 m
  const hue = 4 + t * 206; // 4 = corail, 210 = bleu
  return { color: `hsl(${hue} 90% 62%)`, t };
}

export function useMeetup(withId: string, enabled: boolean, demo?: MeetDemo) {
  const [st, setSt] = useState<MeetState | null>(demo?.state ?? null);
  const [me, setMe] = useState<Fix | null>(demo?.me ?? null);
  const [other, setOther] = useState<Fix | null>(demo?.other ?? null);
  const [flash, setFlash] = useState<string | null>(demo?.flash ?? null);
  const [heading, setHeading] = useState<number | null>(demo?.heading ?? null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const chan = useRef<RealtimeChannel | null>(null);
  const meRef = useRef<Fix | null>(null);
  const active = st?.status === "active";

  // État : au chargement, puis toutes les 8 s tant que le chat est ouvert (4 s pendant une demande/session).
  useEffect(() => {
    if (demo || !enabled) return;
    let alive = true;
    const load = () => void meetState(withId).then((s) => alive && setSt(s)).catch(() => undefined);
    load();
    const id = setInterval(load, st?.status === "pending" || active ? 4000 : 8000);
    return () => { alive = false; clearInterval(id); };
  }, [withId, enabled, demo, st?.status, active]);

  // Canal privé + GPS haute précision, seulement pendant la session active.
  useEffect(() => {
    if (demo || !active || !st?.topic) return;
    let alive = true;
    let ch: RealtimeChannel | null = null;
    const sb = supabase();
    void (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) await sb.realtime.setAuth(data.session.access_token);
      if (!alive) return;
      ch = sb.channel(st.topic!, { config: { private: true, broadcast: { self: false } } });
      ch.on("broadcast", { event: "p" }, ({ payload }) => {
        const p = payload as Partial<Fix> & { id?: string };
        if (p.id === st.me || typeof p.lat !== "number" || typeof p.lng !== "number") return;
        setOther({ lat: p.lat, lng: p.lng, acc: Math.max(3, Number(p.acc) || 50), at: Date.now() });
      });
      ch.on("broadcast", { event: "f" }, ({ payload }) => {
        const p = payload as { id?: string; color?: string };
        if (p.id === st.me) return;
        if (/^#[0-9a-f]{6}$/i.test(p.color ?? "")) setFlash(p.color!);
      });
      ch.on("broadcast", { event: "s" }, () => void meetState(withId).then((s) => alive && setSt(s)).catch(() => undefined));
      ch.subscribe((status) => { if (status === "SUBSCRIBED" && meRef.current) send(meRef.current); });
      chan.current = ch;
    })();
    const send = (f: Fix) => void chan.current?.send({ type: "broadcast", event: "p", payload: { id: st.me, lat: f.lat, lng: f.lng, acc: Math.round(f.acc) } });
    let last = 0;
    const watch = navigator.geolocation?.watchPosition(
      (pos) => {
        const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: Date.now() };
        meRef.current = f; setMe(f); setGpsErr(null);
        if (Date.now() - last > 2000) { last = Date.now(); send(f); }
      },
      (e) => setGpsErr(e.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    const keep = setInterval(() => meRef.current && send(meRef.current), 5000);
    return () => {
      alive = false;
      if (watch != null) navigator.geolocation.clearWatch(watch);
      clearInterval(keep);
      if (ch) void sb.removeChannel(ch);
      chan.current = null;
      meRef.current = null;
      setMe(null); setOther(null); // rien ne reste en mémoire après la session
    };
  }, [active, st?.topic, st?.me, withId, demo]);

  // Fin automatique à l'heure d'expiration.
  useEffect(() => {
    if (demo || !active || !st?.expires_at) return;
    const ms = Date.parse(st.expires_at) - Date.now();
    const id = setTimeout(() => void meetState(withId).then(setSt).catch(() => undefined), Math.max(0, ms) + 500);
    return () => clearTimeout(id);
  }, [active, st?.expires_at, withId, demo]);

  // Boussole (DeviceOrientation). iOS : permission demandée au geste via askCompass().
  useEffect(() => {
    if (demo || !active) return;
    const on = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
      if (h != null && !Number.isNaN(h)) setHeading(h);
    };
    window.addEventListener("deviceorientationabsolute", on as EventListener);
    window.addEventListener("deviceorientation", on as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", on as EventListener);
      window.removeEventListener("deviceorientation", on as EventListener);
    };
  }, [active, demo]);

  // Intention venue d'une notification.
  useEffect(() => {
    if (demo || !st || !intent || intent.with !== withId) return;
    const i = intent;
    if (st.status === "pending" && !st.mine && st.id && (i.accept === st.id || i.refuse === st.id)) {
      intent = null;
      if (i.accept) void meetAccept(st.id).then(setSt).catch(() => undefined);
      else void meetStop(st.id).then(() => setSt({ ...st, status: "ended", ended_by: "me" })).catch(() => undefined);
    } else if (st.status === "active" && i.flash) { intent = null; setFlash(i.flash); }
    else if (st.status !== "pending") intent = null;
  }, [st, withId, demo]);

  const notify = () => void chan.current?.send({ type: "broadcast", event: "s", payload: {} });
  return {
    st, me, other, heading, flash, gpsErr,
    clearFlash: () => setFlash(null),
    propose: async () => { await askCompass(); askPush(); if (demo) return setSt({ allowed: true, id: "demo", status: "pending", mine: true }); setSt(await meetPropose(withId)); },
    accept: async () => { await askCompass(); askPush(); if (demo) return setSt({ ...st!, status: "active" }); setSt(await meetAccept(st!.id!)); },
    stop: async () => { if (st?.id && !demo) { notify(); await meetStop(st.id); } setSt(st ? { ...st, status: "ended", ended_by: "me" } : null); },
    sendFlash: (color: string) => { if (demo || !st?.id) return; void chan.current?.send({ type: "broadcast", event: "f", payload: { id: st.me, color } }); void meetFlash(st.id, color).catch(() => undefined); },
  };
}

export async function askCompass() {
  const D = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  try { if (D?.requestPermission) await D.requestPermission(); } catch { /* refus : on garde la flèche « nord en haut » */ }
}
