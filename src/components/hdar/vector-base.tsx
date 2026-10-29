import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useLang } from "@/lib/hdar/i18n";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

const RTL = "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js";
let rtlSet = false;

/** Fond de carte vectoriel OpenFreeMap (gratuit, sans clé, usage commercial permis), style sombre,
 *  noms de lieux dans la langue de l'appli (name:xx, repli sur le nom local). Non interactif : la carte hdar garde ses gestes.
 *  Si WebGL ou le réseau manquent, onFail() rend la main aux tuiles images d'origine. */
const STYLE = "https://tiles.openfreemap.org/styles/dark";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const label = (lang: string): any => lang === "ar" ? ["coalesce", ["get", "name:ar"], ["get", "name"]] : ["coalesce", ["get", "name:" + lang], ["get", "name:latin"], ["get", "name"]];

export function VectorBase({ lat, lng, zoom, w, h, onFail }: { lat: number; lng: number; zoom: number; w: number; h: number; onFail: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lang = useLang((s) => s.lang);
  const [ready, setReady] = useState(false);
  const view = useRef({ lat, lng, zoom });
  view.current = { lat, lng, zoom };

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const mod = await import("maplibre-gl");
        const ml = ((mod as unknown as { default?: typeof mod }).default ?? mod);
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (ml.getWorkerUrl() !== workerUrl) ml.setWorkerUrl(workerUrl);
        if (!rtlSet) { rtlSet = true; void ml.setRTLTextPlugin(RTL, true).catch(() => {}); }
        if (dead || !el.current) return;
        const v = view.current;
        const m = new ml.Map({ container: el.current, style: STYLE, center: [v.lng, v.lat], zoom: v.zoom - 1, interactive: false, attributionControl: false, fadeDuration: 0 });
        map.current = m;
        m.on("error", (e) => { if (!m.loaded() && /style|webgl/i.test(String((e as unknown as { error?: Error }).error?.message))) onFail(); });
        m.once("load", () => { if (!dead) setReady(true); });
      } catch {
        onFail();
      }
    })();
    return () => { dead = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { map.current?.resize(); }, [w, h]);
  useEffect(() => { map.current?.jumpTo({ center: [lng, lat], zoom: zoom - 1 }); }, [lat, lng, zoom]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const l of m.getStyle().layers ?? []) {
      if (l.type !== "symbol") continue;
      const tf = m.getLayoutProperty(l.id, "text-field");
      if (tf && JSON.stringify(tf).includes('"name')) m.setLayoutProperty(l.id, "text-field", label(lang));
    }
  }, [lang, ready]);

  return <div ref={el} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ width: w, height: h, direction: "ltr" }} />;
}
