// hdar service worker: makes the web app installable and shows a page offline.
// Never caches API traffic (Supabase) or private data.
const CACHE = "hdar-v9";
const CFG = "hdar-cfg"; // adresse + clé publique Supabase et langue, envoyées par l'appli (pour « Refuser » depuis la notif)
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icon-192.png", "/badge-96.png", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== CFG).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
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

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "hdar-cfg" && typeof d.url === "string" && typeof d.key === "string")
    e.waitUntil(caches.open(CFG).then((c) => c.put("/__cfg", new Response(JSON.stringify({ url: d.url, key: d.key, lang: d.lang || "fr" })))));
});
const cfg = () => caches.open(CFG).then((c) => c.match("/__cfg")).then((r) => (r ? r.json() : null)).catch(() => null);

// « Se retrouver » : textes de notification dans la langue de l'appli (jamais de position).
const MEET_TXT = {
  fr: ["{n} propose de vous retrouver (15 min)", "{n} ne te trouve pas : lève ton téléphone", "Accepter", "Refuser", "Quelqu'un"],
  en: ["{n} suggests meeting up (15 min)", "{n} can't find you: hold up your phone", "Accept", "Decline", "Someone"],
  es: ["{n} propone encontraros (15 min)", "{n} no te encuentra: levanta tu móvil", "Aceptar", "Rechazar", "Alguien"],
  de: ["{n} schlägt ein Treffen vor (15 Min)", "{n} findet dich nicht: halte dein Handy hoch", "Annehmen", "Ablehnen", "Jemand"],
  it: ["{n} propone di ritrovarvi (15 min)", "{n} non ti trova: alza il telefono", "Accetta", "Rifiuta", "Qualcuno"],
  pt: ["{n} propõe encontrarem-se (15 min)", "{n} não te encontra: levanta o telemóvel", "Aceitar", "Recusar", "Alguém"],
  ar: ["يقترح {n} أن تلتقيا (15 دقيقة)", "{n} لا يجدك: ارفع هاتفك", "قبول", "رفض", "شخص ما"],
};

// Web Push: private messages only (one notification per conversation, collapsed by tag).
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "hdar.", body: e.data ? e.data.text() : "" };
  }
  const meet = d.type === "meet" || d.type === "meetflash";
  e.waitUntil(
    Promise.all([self.clients.matchAll({ type: "window", includeUncontrolled: true }), meet ? cfg() : null]).then(([wins, c]) => {
      // App open and visible: it already plays its own sound + toast.
      if (wins.some((w) => w.visibilityState === "visible" || w.focused)) return;
      if (meet) {
        const T = MEET_TXT[(c && c.lang) || "fr"] || MEET_TXT.fr;
        const who = d.pseudo || T[4];
        const ask = d.type === "meet";
        return self.registration.showNotification("hdar.", {
          body: (ask ? T[0] : T[1]).replace("{n}", who),
          tag: d.tag || "hdar-meet",
          renotify: true,
          requireInteraction: true,
          icon: "/icon-192.png",
          badge: "/badge-96.png",
          vibrate: ask ? [80, 60, 80] : [200, 100, 200, 100, 200],
          // Boutons dans la notification (Android / ordinateur). Sur iPhone, toucher la notif ouvre le chat.
          actions: ask ? [{ action: "accept", title: T[2] }, { action: "refuse", title: T[3] }] : [],
          data: { url: d.url || "/", meet: d.meet || null, token: d.token || null },
        });
      }
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
  const data = e.notification.data || {};
  let url = data.url || "/";
  if (data.meet && e.action === "refuse") {
    // Refus sans ouvrir l'appli ; à défaut (pas de config), on ouvre le chat qui refusera.
    e.waitUntil(
      cfg().then((c) => {
        if (!c) throw new Error("cfg");
        return fetch(c.url + "/rest/v1/rpc/hdar_meet_refuse_push", {
          method: "POST",
          headers: { "content-type": "application/json", apikey: c.key, authorization: "Bearer " + c.key },
          body: JSON.stringify({ p_id: data.meet, p_token: data.token }),
        }).then((r) => { if (!r.ok) throw new Error(String(r.status)); });
      }).catch(() => openUrl(url + "&meetrefuse=" + data.meet)),
    );
    return;
  }
  if (data.meet && e.action === "accept") url += "&meetaccept=" + data.meet;
  e.waitUntil(openUrl(url));
});
function openUrl(url) {
  return (
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
}
