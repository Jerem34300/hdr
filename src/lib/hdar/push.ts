import { deviceId } from "./device";
import { pushSubscribe, pushUnsubscribe } from "./live";

export const VAPID_PUBLIC_KEY =
  "BCYFlSj5FLTQ-HnjgG0xBXkB_xGD5d39kSzuKQY_G0l_t8DHRSxmEak0FvkxUGgAdmdYkXuzqS3zvwuUCcvLeEQ";
const DISMISS_KEY = "hdar-push-asked";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function shouldAskPush() {
  return pushSupported() && Notification.permission === "default" && !localStorage.getItem(DISMISS_KEY);
}
export function dismissPushAsk() {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks permission (must be called from a tap) and registers this device for push. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const perm = await Notification.requestPermission();
  dismissPushAsk();
  if (perm !== "granted") return false;
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await pushSubscribe(deviceId(), j.endpoint, j.keys.p256dh, j.keys.auth);
  return true;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await pushUnsubscribe(deviceId(), sub?.endpoint ?? null).catch(() => undefined);
  await sub?.unsubscribe().catch(() => undefined);
}

export async function pushActive() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Keeps the server copy of an existing subscription fresh (e.g. after reinstall). */
export async function refreshPush() {
  if (!(await pushActive())) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await pushSubscribe(deviceId(), j.endpoint, j.keys.p256dh, j.keys.auth).catch(() => undefined);
}
