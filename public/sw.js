// hdar service worker: makes the web app installable and shows a page offline.
// Never caches API traffic (Supabase) or private data.
const CACHE = "hdar-v6";
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icon-192.png", "/badge-96.png", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Web Push: private messages only (one notification per conversation, collapsed by tag).
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "hdar.", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // App open and visible: it already plays its own sound + toast.
      if (wins.some((w) => w.visibilityState === "visible" || w.focused)) return;
      return self.registration.showNotification(d.title || "hdar.", {
        body: d.body || "",
        tag: d.tag || "hdar",
        renotify: false,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        vibrate: [60, 40, 60],
        data: { url: d.url || "/" },
      });
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
