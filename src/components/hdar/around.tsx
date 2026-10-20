import { useEffect, useState } from "react";
import { onlineCount } from "@/lib/hdar/recent";
import { useScene } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { bindTap } from "./tap";
import { Wordmark } from "./logo";
import { MapView } from "./map-view";
import { useActivity } from "@/lib/hdar/activity";
import { adsCount, listAds, regionFromPos, slugify, type Ad } from "@/lib/hdar/ads";
import { X } from "lucide-react";

export function Around({ demoTicker }: { demoTicker?: Ad[] } = {}) {
  const enterLine = useHdar((s) => s.enterLine);
  const openPocket = useHdar((s) => s.openPocket);
  const openCity = useHdar((s) => s.openCity);
  const setTab = useHdar((s) => s.setTab);
  const joinSpot = useHdar((s) => s.joinSpot);
  const { place, people, spots, zones } = useScene();
  const [area, setArea] = useState<string | null>(null);
  const { area: areaUnread } = useActivity();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <Wordmark />
          <button
            type="button"
            data-act="city"
            className="min-w-0 truncate text-right text-sm text-muted"
            {...bindTap(openCity)}
          >
            📍 {area ?? (place.slug === "ici" ? "Autour de toi" : place.name)}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <OnlinePill />
          <AdsButton lat={place.lat} lng={place.lng} />
          <button type="button" data-act="salons" {...bindTap(() => setTab("inbox"))} className={`${TOP_BTN} bg-[#fbbf24]/10 text-[#f5d27a] ring-[#fbbf24]/35`}>
            Salons
          </button>
          <button
            type="button"
            data-act="pocket"
            data-tip="pocket"
            {...bindTap(openPocket)}
            aria-label={areaUnread ? `Chat du quartier, ${areaUnread} nouveaux messages` : "Chat du quartier"}
            className={`${TOP_BTN} bg-signal/15 text-[#ff8a80] ring-signal/45`}
          >
            Quartier
            {areaUnread > 0 && <Badge n={areaUnread} cls="bg-signal" />}
          </button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <MapView
          place={place}
          people={people}
          spots={spots}
          zones={zones}
          onPerson={enterLine}
          onSpot={joinSpot}
          onArea={setArea}
        />
      </div>
      <AdTicker lat={place.lat} lng={place.lng} city={place.slug === "ici" ? "" : place.name} demo={demoTicker} />
    </div>
  );
}

/** « ● 3 en ligne » : tout le monde avec l'appli ouverte (5 min), pas seulement les gens visibles sur la carte. */
function OnlinePill() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let stop = false;
    const run = () => { if (document.visibilityState === "visible") void onlineCount().then((v) => !stop && setN(v)); };
    run();
    const id = window.setInterval(run, 60_000);
    return () => { stop = true; window.clearInterval(id); };
  }, []);
  return (
    <span className={`${TOP_BTN} bg-online/10 text-online ring-online/35`} aria-label={`${n} en ligne`}>
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-online" />
      {n} en ligne
    </span>
  );
}

/** Les 4 boutons du haut de la carte : même taille, même forme, une teinte de la palette chacun. */
const TOP_BTN = "relative flex h-10 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-[12px] font-semibold whitespace-nowrap ring-1";
function Badge({ n, cls }: { n: number; cls: string }) {
  return (
    <span className={`absolute -top-1.5 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-night px-1 text-[10px] font-bold text-night ${cls}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** « 📌 Annonces » : ouvre les petites annonces ; pastille = annonces en ligne dans la région (compteur anonyme). */
function AdsButton({ lat, lng }: { lat: number; lng: number }) {
  const openAnnonces = useHdar((s) => s.openAnnonces);
  const region = regionFromPos(lat, lng);
  const [n, setN] = useState(0);
  useEffect(() => {
    let stop = false;
    const t = window.setTimeout(() => void adsCount(region).then((v) => !stop && setN(Number(v) || 0)).catch(() => undefined), 1500);
    return () => { stop = true; window.clearTimeout(t); };
  }, [region]);
  return (
    <button
      type="button"
      data-act="annonces"
      aria-label={n ? `Petites annonces, ${n} en ligne dans ta région` : "Petites annonces"}
      {...bindTap(() => openAnnonces())}
      className={`${TOP_BTN} bg-spot/15 text-[#b3a8ff] ring-spot/40`}
    >
      📌 Annonces
      {n > 0 && <Badge n={n} cls="bg-spot" />}
    </button>
  );
}

const TICKER_KEY = "hdar-ticker-off";
/** Bandeau « info » des annonces : titres seulement (jamais de photo), ville puis région, boostées d'abord. */
function AdTicker({ lat, lng, city, demo }: { lat: number; lng: number; city: string; demo?: Ad[] }) {
  const openAnnonces = useHdar((s) => s.openAnnonces);
  const region = regionFromPos(lat, lng);
  const [ads, setAds] = useState<Ad[]>([]);
  const [off, setOff] = useState(true);
  useEffect(() => {
    try { setOff(Date.now() - Number(localStorage.getItem(TICKER_KEY) || 0) < 24 * 3600_000); } catch { setOff(false); }
  }, []);
  useEffect(() => {
    if (off) return;
    if (demo) { setAds(demo); return; }
    let stop = false;
    const run = () => { if (document.visibilityState === "visible") void listAds(region, "", "").then((r) => !stop && setAds(r)).catch(() => undefined); };
    const t = window.setTimeout(run, 2500);
    const id = window.setInterval(run, 3 * 60_000);
    return () => { stop = true; window.clearTimeout(t); window.clearInterval(id); };
  }, [region, off, demo]);
  if (off || ads.length === 0) return null;
  const cs = slugify(city);
  const rank = (a: Ad) => (a.boost_scope ? 0 : cs && a.city_slug === cs ? 1 : 2);
  const items = [...ads].sort((a, b) => rank(a) - rank(b)).slice(0, 15);
  const row = (k: string) => items.map((a) => (
    <button key={k + a.id} type="button" tabIndex={k === "b" ? -1 : 0} aria-hidden={k === "b" || undefined} onClick={() => openAnnonces(a.id)} className="mx-3 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      {a.boost_scope && <span className="rounded-full bg-[#fbbf24] px-1.5 text-[10px] font-bold text-night">Boostée</span>}
      <span>📌 {a.title}{a.photos?.length > 0 ? <span className="ml-1 opacity-80" role="img" aria-label="avec photos" title="Avec photos">📷</span> : null}</span><span className="text-muted">· {a.city}</span>
    </button>
  ));
  return (
    <div className="ad-ticker relative flex h-8 shrink-0 items-center overflow-hidden border-t border-line bg-night text-xs" role="region" aria-label="Petites annonces autour de toi">
      <span className="z-10 flex h-full shrink-0 items-center bg-signal px-2 text-[11px] font-extrabold tracking-wide text-night uppercase">Annonces</span>
      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
        <div className="ad-ticker-track flex w-max" style={{ ["--ticker-dur" as string]: `${Math.max(20, items.length * 7)}s` }}>{row("a")}{row("b")}</div>
      </div>
      <button type="button" aria-label="Masquer le bandeau des annonces (24 h)" onClick={() => { try { localStorage.setItem(TICKER_KEY, String(Date.now())); } catch { /* privé */ } setOff(true); }} className="z-10 grid h-full w-8 shrink-0 place-items-center border-l border-line bg-night text-ink"><X className="size-4" /></button>
    </div>
  );
}
