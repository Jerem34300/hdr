import { LiveDock } from "@/components/hdar/live-dock";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { useEffect } from "react";
import { rememberLanding } from "@/lib/hdar/track";
import { captureSourceRef } from "@/lib/hdar/source-ref";
import { startI18n } from "@/lib/hdar/i18n";
import { hydrateHdar } from "@/lib/hdar/store";
import { startViewportFix } from "@/lib/hdar/viewport-fix";
import { FounderCelebration, LaunchOfferSheet, WelcomeFirst } from "@/components/hdar/launch-offer";
import appCss from "../styles.css?url";

/** Mémorise la page d'arrivée et la provenance (statistique anonyme, admin « Visiteurs »). */
function LandingMemo() {
  useEffect(() => {
    rememberLanding();
    captureSourceRef();
    startI18n();
    void hydrateHdar();
    return startViewportFix();
  }, []);
  return null;
}

/**
 * Cache CDN (v141) des pages qui sont les mêmes pour tout le monde : pages publiques (SEO) et accueil de l'appli.
 * Un robot qui parcourt les milliers de communes, ou 1 000 personnes qui ouvrent l'appli, sont servis par le CDN
 * de Netlify sans relancer le rendu serveur ni lire la base. Le navigateur, lui, revérifie à chaque fois
 * (max-age=0), et Netlify vide ce cache à chaque mise en ligne. Jamais pour les pages d'erreur ou introuvables.
 */
const SEO_ROUTES = new Set([
  "/alternative-chatroulette", "/alternative-omegle", "/cam-to-cam", "/cgu", "/confidentialite", "/faq", "/live-coquin",
  "/tchat-webcam-aleatoire", "/webcam-gay-live", "/$lang/$slug", "/$lang/city/$slug", "/fr/sortir-rencontrer-{$ville}",
  "/petites-annonces/", "/petites-annonces/$slug", "/rencontre/", "/rencontre/$slug", "/rencontre/$slug_/$theme",
  "/rencontre/departement/$slug", "/rencontre/region/$slug",
]);
type MatchLite = { routeId: string; status: string; _notFound?: boolean; globalNotFound?: boolean };
function cdnHeaders(matches: MatchLite[]): Record<string, string> | undefined {
  if (!matches.length || matches.some((m) => m.status !== "success" || m._notFound || m.globalNotFound)) return undefined;
  const leaf = matches[matches.length - 1].routeId;
  const ttl = SEO_ROUTES.has(leaf) ? 3600 : leaf === "/" ? 300 : 0;
  if (!ttl) return undefined;
  return { "Cache-Control": "public, max-age=0, must-revalidate", "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${ttl}, stale-while-revalidate=86400` };
}

export const Route = createRootRoute({
  headers: ({ matches }) => cdnHeaders(matches as unknown as MatchLite[]),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "hdar." },
      { name: "theme-color", content: "#0B0D12" },
      { name: "google", content: "notranslate" },
      { name: "google-site-verification", content: "GUj-5VvdUijZY32Tv7JysJVtjGwGBwtXMrPYf2QGkm4" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "hdar." },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48.png" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: RootDoc,
});

/** <html lang> follows native intl pages (/de/…, /es/…, /en/…); everything else stays French. */
function docLang(path: string) {
  const m = /^\/(de|es|nl|it|pt|en|ar)(\/|$)/.exec(path);
  return m ? m[1] : "fr";
}

function RootDoc() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <html lang={docLang(path)} translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <LandingMemo />
        <AuthProvider>
          <Outlet />
          <LiveDock />
          <LaunchOfferSheet />
          <WelcomeFirst />
          <FounderCelebration />
        </AuthProvider>
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){if(location.hostname==='localhost')return;var W=window,base=null,pending=false,reg=null;function busy(){return !!(W.__hdarLive||W.__hdarCall)}function go(){if(busy()){pending=true;return}pending=false;location.reload()}W.__hdarIdle=function(){if(pending)go()};function check(){if(reg)reg.update().catch(function(){});fetch('/version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){if(!d||!d.v)return;if(base===null)base=d.v;else if(d.v!==base)go()}).catch(function(){})}if('serviceWorker' in navigator){var had=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',function(){if(had)go();had=true});W.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').then(function(r){reg=r}).catch(function(){})})}check();document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check()});setInterval(check,300000)})()",
          }}
        />
      </body>
    </html>
  );
}
