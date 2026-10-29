import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { useEffect } from "react";
import { rememberLanding } from "@/lib/hdar/track";
import { captureSourceRef } from "@/lib/hdar/source-ref";
import { startI18n } from "@/lib/hdar/i18n";
import { FounderCelebration, LaunchOfferSheet, WelcomeFirst } from "@/components/hdar/launch-offer";
import appCss from "../styles.css?url";

/** Mémorise la page d'arrivée et la provenance (statistique anonyme, admin « Visiteurs »). */
function LandingMemo() {
  useEffect(() => {
    rememberLanding();
    captureSourceRef();
    startI18n();
  }, []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "hdar." },
      { name: "theme-color", content: "#0B0B10" },
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
  component: () => (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <LandingMemo />
        <AuthProvider>
          <Outlet />
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
  ),
});
