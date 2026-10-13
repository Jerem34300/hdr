import { MapGiftButton } from "./growth";
import { consumeNear } from "./live-share";
import { noticeLiveFavorites, useFavorites } from "@/lib/hdar/favorites";
import { useActivity } from "@/lib/hdar/activity";
import { PLACE_KINDS, PlaceSheet, ProposePlaceSheet, placesLayerOn, setPlacesLayer, setToiletsLayer, toiletsLayerOn, usePlaces, useOutings, useToilets } from "./places-layer";
import { useEffect, useRef, useState } from "react";
import { Layers, LocateFixed, Video } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Safe } from "./safe";
import { BoostNudge } from "./boost-nudge";
import { useActiveBoost } from "./boost";
import { liveIds } from "@/lib/hdar/live";
import { useMapFocus } from "@/lib/hdar/map-focus";
import { listBoosted, liveCount, liveMap, pulse, goDark, type LivePin } from "@/lib/hdar/live";
import { usePremium } from "@/lib/hdar/premium";
import { FilterButton, FilterSheet, PremiumBadge } from "./premium";
import { deviceId } from "@/lib/hdar/device";
import { usePhoto } from "@/lib/hdar/photos";
import { bucketDistance, haversine } from "@/lib/hdar/rules";
import { useHdar } from "@/lib/hdar/store";
import type { Zone } from "@/lib/hdar/data";
import type { LivePerson, LiveSpot, Place } from "@/lib/hdar/scene";

type Props = {
  place: Place;
  people: LivePerson[];
  spots: LiveSpot[];
  zones: Array<Zone & { count: number }>;
  onPerson: (id: string) => void;
  onSpot: (id: string) => void;
  onArea?: (name: string) => void;
};

type View = { lat: number; lng: number; zoom: number };

const TILE = 256;

function worldX(lng: number, zoom: number) {
  return ((lng + 180) / 360) * TILE * 2 ** zoom;
}
function worldY(lat: number, zoom: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** zoom;
}
function lngFromX(x: number, zoom: number) {
  return (x / (TILE * 2 ** zoom)) * 360 - 180;
}
function latFromY(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** zoom);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function MapView({ place, spots, onPerson, onSpot, onArea }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 520 });
  const favIds = new Set(useFavorites().map((f) => f.id));
  const convoIds = new Set(useHdar((s) => s.liveConvos).map((c) => c.otherId));
  const inLive = useMapFocus((s) => s.liveIds);
  const focus = useMapFocus((s) => s.focus);
  const fly = useMapFocus((s) => s.fly);
  const [hl, setHl] = useState<string | null>(null);
  useEffect(() => {
    const t = () => { if (document.visibilityState === "visible") void liveIds().then((ids) => useMapFocus.setState({ liveIds: new Set(ids ?? []) })).catch(() => undefined); };
    t(); const i = setInterval(t, 30000); return () => clearInterval(i);
  }, []);
  const act = useActivity();
  const [boosted, setBoosted] = useState<Set<string>>(new Set());
  const myBoost = useActiveBoost();
  const meBoosted = !!myBoost && new Date(myBoost.ends_at).getTime() > Date.now();
  useEffect(() => {
    let stop = false;
    const run = () => void listBoosted().then((ids) => !stop && setBoosted(new Set(ids))).catch(() => undefined);
    run();
    const id = window.setInterval(run, 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  const [placesOn, setPlacesOn] = useState(true);
  const [toiletsOn, setToiletsOn] = useState(true);
  useEffect(() => {
    setPlacesOn(placesLayerOn());
    setToiletsOn(toiletsLayerOn());
  }, []);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [view, setView] = useState<View>({ lat: place.lat, lng: place.lng, zoom: place.slug === "ici" ? 15 : 13 });
  // First launch (no saved position): hide the default city until the GPS answers.
  const [finding, setFinding] = useState(place.slug !== "ici");
  const [you, setYou] = useState({ lat: place.lat, lng: place.lng });
  const [located, setLocated] = useState(false);
  const follow = useRef(true);
  const locked = useRef(false);
  const frame = useRef({ left: 0, top: 0, z: 13, scale: 1 });
  const pending = useHdar((s) => s.pendingSpot);
  const cancelSpot = useHdar((s) => s.cancelSpot);
  const onAreaRef = useRef(onArea);
  onAreaRef.current = onArea;

  const latKey = view.lat.toFixed(2);
  const lngKey = view.lng.toFixed(2);
  useEffect(() => {
    const lat = Number(latKey);
    const lng = Number(lngKey);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=fr`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: { features?: Array<{ properties?: { city?: string; name?: string; county?: string } }> }) => {
          const props = data.features?.[0]?.properties;
          const name = props?.city || props?.county || props?.name;
          if (name) onAreaRef.current?.(name);
        })
        .catch(() => undefined);
    }, 280);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [latKey, lngKey]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ zoom: number; dist: number; lat: number; lng: number; x: number; y: number } | null>(null);
  const anim = useRef(0);
  const [live, setLive] = useState<LivePin[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(() => { try { const v = sessionStorage.getItem("hdar-open-filters"); sessionStorage.removeItem("hdar-open-filters"); return !!v; } catch { return false; } });
  const mapFilters = usePremium((s) => (s.premium ? s.filters : null));
  const filterKey = JSON.stringify(mapFilters);
  const visible = useHdar((s) => !!(s.me.tonight && s.me.tonight.expiresAt > s.now));

  useEffect(() => {
    let stop = false;
    const load = () => {
      const f = usePremium.getState();
      void liveMap(f.premium ? f.filters : { minAge: null, maxAge: null, desires: [], places: [], iam: [], online: false, photo: false })
        .catch((e: Error) => {
          // Premium expiré : le serveur refuse les filtres, on repasse sans filtre.
          if (/premium_required/.test(e.message)) { usePremium.setState({ premium: false }); return liveMap({ minAge: null, maxAge: null, desires: [], places: [], iam: [], online: false, photo: false }); }
          throw e;
        })
        .then((rows) => {
          if (!stop) setLive(rows);
          useMapFocus.setState({ pins: Object.fromEntries(rows.map((r) => [r.id, { lat: r.lat, lng: r.lng }])) });
          noticeLiveFavorites(rows);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [filterKey]);
  useEffect(() => void usePremium.getState().refresh(), []);
  // Arrivée via un lien « Partager mon live » : on centre sur la zone partagée.
  useEffect(() => { const n = consumeNear(); if (n) useMapFocus.setState({ fly: { lat: n.lat, lng: n.lng, zoom: 14, at: Date.now() } }); }, []);

  useEffect(() => {
    if (!visible) void goDark({ data: deviceId() }).catch(() => undefined);
  }, [visible]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const apply = () => setSize({ w: el.clientWidth || 390, h: Math.max(320, el.clientHeight) });
    apply();
    const obs = new ResizeObserver(apply);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function askLocation() {
    follow.current = true;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => applyFix(pos.coords.latitude, pos.coords.longitude, true),
      () => setLocated(false),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
  }

  function applyFix(lat: number, lng: number, recenter: boolean) {
    setYou({ lat, lng });
    setLocated(true);
    useHdar.setState({ here: { lat, lng } });
    const first = !locked.current;
    if (first) {
      locked.current = true;
      setFinding(false);
      // Remember where the user is so the next launch opens right here.
      useHdar.setState({ cityId: "ici", customCenter: { lat, lng } });
      const mine = useHdar.getState().customSpots;
      if (mine.some((s) => s.lat == null || s.lng == null)) {
        useHdar.setState({
          customSpots: mine.map((s, i) =>
            s.lat == null || s.lng == null ? { ...s, lat: lat + 0.0014, lng: lng + 0.0014 * (i + 1) } : s,
          ),
        });
      }
    }
    const st = useHdar.getState();
    const tonight = st.me.tonight;
    if (tonight && tonight.expiresAt > Date.now()) {
      void pulse({
        data: {
          self: deviceId(),
          lat,
          lng,
          pseudo: st.me.pseudo || "Anonyme",
          desires: [...tonight.desires, tonight.place].filter(Boolean).join(","),
          hours: 3,
          note: tonight.note,
        },
      }).catch(() => undefined);
    }
    if (recenter && follow.current) setView((v) => ({ ...v, lat, lng, zoom: first ? 16 : v.zoom }));
  }

  useEffect(() => {
    const giveUp = window.setTimeout(() => setFinding(false), 7000);
    if (!navigator.geolocation) {
      setFinding(false);
      return () => window.clearTimeout(giveUp);
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => applyFix(pos.coords.latitude, pos.coords.longitude, follow.current),
      () => {
        setLocated(false);
        setFinding(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
    return () => {
      window.clearTimeout(giveUp);
      navigator.geolocation.clearWatch(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoom = Math.min(17, Math.max(4, view.zoom));
  const z = Math.round(zoom);
  const scale = 2 ** (zoom - z);
  const cx = worldX(view.lng, z) * scale;
  const cy = worldY(view.lat, z) * scale;
  const left = cx - size.w / 2;
  const top = cy - size.h / 2;
  const tilePx = TILE * scale;
  const x0 = Math.floor(left / tilePx);
  const x1 = Math.floor((left + size.w) / tilePx);
  const y0 = Math.floor(top / tilePx);
  const y1 = Math.floor((top + size.h) / tilePx);
  const max = 2 ** z;
  const tiles = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (x < 0 || y < 0 || x >= max || y >= max) continue;
      tiles.push({ x, y, left: x * tilePx - left, top: y * tilePx - top });
    }
  }

  const project = (lat: number, lng: number) => ({
    x: worldX(lng, z) * scale - left,
    y: worldY(lat, z) * scale - top,
  });
  frame.current = { left, top, z, scale };
  const basePlaces = usePlaces(placesOn);
  const toilets = useToilets(
    toiletsOn,
    {
      s: latFromY((top + size.h) / scale, z),
      n: latFromY(top / scale, z),
      w: lngFromX(left / scale, z),
      e: lngFromX((left + size.w) / scale, z),
    },
    zoom,
  );
  const outings = useOutings(
    placesOn,
    {
      s: latFromY((top + size.h) / scale, z),
      n: latFromY(top / scale, z),
      w: lngFromX(left / scale, z),
      e: lngFromX((left + size.w) / scale, z),
    },
    zoom,
  );
  const places = toilets.length || outings.length ? [...basePlaces, ...outings, ...toilets] : basePlaces;
  const placeClusterPx = zoom < 14 ? 44 : 0; // numbered bubbles that split as you zoom in
  const placeClusters: { key: string; x: number; y: number; lat: number; lng: number; items: typeof places }[] = [];
  for (const pl of places) {
    const pt = project(pl.lat, pl.lng);
    if (pt.x < -40 || pt.y < -40 || pt.x > size.w + 40 || pt.y > size.h + 40) continue;
    const near = placeClusterPx ? placeClusters.find((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < placeClusterPx) : undefined;
    if (near) {
      near.items.push(pl);
      const k = near.items.length;
      near.x += (pt.x - near.x) / k;
      near.y += (pt.y - near.y) / k;
      near.lat += (pl.lat - near.lat) / k;
      near.lng += (pl.lng - near.lng) / k;
    } else placeClusters.push({ key: `p-${pl.id}`, x: pt.x, y: pt.y, lat: pl.lat, lng: pl.lng, items: [pl] });
  }

  useEffect(() => {
    if (!focus || Date.now() - focus.at > 5000) return;
    follow.current = false;
    setView((v) => ({ ...v, lat: focus.lat, lng: focus.lng }));
    animateTo(16);
    setHl(focus.id);
    const t = setTimeout(() => setHl(null), 6000);
    useMapFocus.setState({ focus: null });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    if (!fly || Date.now() - fly.at > 5000) return;
    follow.current = !!fly.mine;
    const to = fly.mine ? you : fly;
    setView((v) => ({ ...v, lat: to.lat, lng: to.lng }));
    animateTo(fly.zoom);
    useMapFocus.setState({ fly: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly]);

  const pins = live.map((p) => ({
    id: p.id,
    pseudo: p.pseudo,
    hot: p.hot,
    premium: !!p.premium,
    at: { lat: p.lat, lng: p.lng },
  }));

  const youPx = project(you.lat, you.lng);
  const face = zoom >= 10.5 ? 46 : 34;

  // Group pins that would overlap on screen (only matters when zoomed out).
  const clusterPx = zoom < 12 ? 56 : 0;
  const clusters: { key: string; x: number; y: number; lat: number; lng: number; pins: typeof pins }[] = [];
  for (const pin of pins) {
    const pt = project(pin.at.lat, pin.at.lng);
    const near = clusterPx ? clusters.find((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < clusterPx) : undefined;
    if (near) {
      near.pins.push(pin);
      const k = near.pins.length;
      near.x += (pt.x - near.x) / k;
      near.y += (pt.y - near.y) / k;
      near.lat += (pin.at.lat - near.lat) / k;
      near.lng += (pin.at.lng - near.lng) / k;
    } else {
      clusters.push({ key: `c-${pin.id}`, x: pt.x, y: pt.y, lat: pin.at.lat, lng: pin.at.lng, pins: [pin] });
    }
  }

  // Places (lieux) cluster too when zoomed out; numbered groups split as you zoom in.
  const spotClusterPx = zoom < 15 ? 48 : 0;
  const spotClusters: { key: string; x: number; y: number; lat: number; lng: number; items: LiveSpot[] }[] = [];
  for (const spot of spots.filter((sp) => sp.creator || sp.live)) {
    const pt = project(spot.lat, spot.lng);
    const glowing = (spot.boostedUntil ?? 0) > Date.now();
    const near = spotClusterPx && !glowing
      ? spotClusters.find((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < spotClusterPx)
      : undefined;
    if (near) {
      near.items.push(spot);
      const k = near.items.length;
      near.x += (pt.x - near.x) / k;
      near.y += (pt.y - near.y) / k;
      near.lat += (spot.lat - near.lat) / k;
      near.lng += (spot.lng - near.lng) / k;
    } else {
      spotClusters.push({ key: `s-${spot.id}`, x: pt.x, y: pt.y, lat: spot.lat, lng: spot.lng, items: [spot] });
    }
  }

  // Nearest connected person, measured from where you are.
  const nearest = live.reduce<{ pin: LivePin; d: number } | null>((best, p) => {
    const d = haversine(you, p);
    return !best || d < best.d ? { pin: p, d } : best;
  }, null);
  const halfViewM = (156543.03392 * Math.cos((view.lat * Math.PI) / 180) * (Math.min(size.w, size.h) / 2 - 40)) / 2 ** zoom;
  const nearestHidden = nearest != null && nearest.d > halfViewM;

  /** Zooms out (centred on you) until the nearest connected person is on screen. */
  function fitNearest() {
    if (!nearest) return;
    const half = Math.max(60, Math.min(size.w, size.h) / 2 - 40);
    const target = Math.log2((156543.03392 * Math.cos((you.lat * Math.PI) / 180) * half) / (nearest.d * 1.15));
    follow.current = false;
    setView((v) => ({ ...v, lat: you.lat, lng: you.lng }));
    animateTo(Math.min(16, Math.max(4, target)));
  }

  // Never open on an empty map: once located, zoom out to the nearest person if needed.
  const autoFitted = useRef(false);
  useEffect(() => {
    if (autoFitted.current || finding || !nearestHidden) return;
    autoFitted.current = true;
    fitNearest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding, nearestHidden]);

  function animateTo(nextZoom: number) {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current.zoom;
    const to = Math.min(17, Math.max(4, nextZoom));
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 280);
      const eased = 1 - (1 - k) ** 3;
      setView((v) => ({ ...v, zoom: from + (to - from) * eased }));
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }

  return (
    <div
      ref={box}
      className="relative h-full min-h-0 overflow-hidden bg-[#0c1014]"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...pointers.current.values()];
        const current = viewRef.current;
        if (pts.length >= 2) {
          gesture.current = {
            zoom: current.zoom,
            dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
            lat: current.lat,
            lng: current.lng,
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2,
          };
        } else {
          gesture.current = { zoom: current.zoom, dist: 0, lat: current.lat, lng: current.lng, x: e.clientX, y: e.clientY };
        }
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const start = gesture.current;
        if (!start) return;
        const pts = [...pointers.current.values()];
        if (pts.length >= 2) {
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
          const mx = (pts[0].x + pts[1].x) / 2;
          const my = (pts[0].y + pts[1].y) / 2;
          const nextZoom = Math.min(17, Math.max(4, start.zoom + Math.log2(dist / start.dist)));
          const z0 = Math.round(start.zoom);
          const s0 = 2 ** (start.zoom - z0);
          const dx = mx - start.x;
          const dy = my - start.y;
          setView({
            zoom: nextZoom,
            lng: lngFromX(worldX(start.lng, z0) - dx / s0, z0),
            lat: latFromY(worldY(start.lat, z0) - dy / s0, z0),
          });
          return;
        }
        if (start.dist !== 0) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 14) follow.current = false;
        const z0 = Math.round(start.zoom);
        const s0 = 2 ** (start.zoom - z0);
        setView({
          zoom: start.zoom,
          lng: lngFromX(worldX(start.lng, z0) - dx / s0, z0),
          lat: latFromY(worldY(start.lat, z0) - dy / s0, z0),
        });
      }}
      onPointerUp={(e) => {
        const start = gesture.current;
        pointers.current.delete(e.pointerId);
        const waiting = useHdar.getState().pendingSpot;
        if (waiting && start && start.dist === 0 && pointers.current.size === 0 && box.current) {
          const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
          const target = e.target as HTMLElement;
          if (moved < 16 && !target.closest("button")) {
            const rect = box.current.getBoundingClientRect();
            const f = frame.current;
            const lat = latFromY((f.top + (e.clientY - rect.top)) / f.scale, f.z);
            const lng = lngFromX((f.left + (e.clientX - rect.left)) / f.scale, f.z);
            useHdar.getState().dropSpot(lat, lng);
          }
        }
        if (pointers.current.size === 0) gesture.current = null;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = null;
      }}
    >
      {tiles.map((tile) => (
        <img
          key={`${z}-${tile.x}-${tile.y}`}
          alt=""
          draggable={false}
          src={`/tiles/plan/${z}/${tile.x}/${tile.y}.png`}
          className="map-tile pointer-events-none absolute max-w-none"
          style={{ left: tile.left, top: tile.top, width: tilePx, height: tilePx }}
        />
      ))}
      {pins.length === 0 && !finding && (
        <p className="pointer-events-none absolute top-4 left-1/2 z-20 max-w-[70%] -translate-x-1/2 rounded-full bg-night/85 px-4 py-2 text-center text-xs text-muted">
          {visible ? "Personne d'autre en ligne pour l'instant" : "Touche Connexion pour apparaître sur la carte"}
        </p>
      )}
      {nearest && nearestHidden && !finding && (
        <button
          type="button"
          className="absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-night/90 px-4 py-2 text-xs text-ink"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={fitNearest}
        >
          Le plus proche : {bucketDistance(nearest.d)} · <span className="text-signal">Voir</span>
        </button>
      )}
      {finding && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-night">
          <span className="relative block size-12 rounded-full">
            <span className="ping-ring rounded-full" />
            {meBoosted ? (
          <>
            <span className="partner-glow absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#fbbf24] bg-gradient-to-br from-[#FA6F6C] to-[#f472b6]" />
            <span className="absolute top-1/2 left-1/2 mt-7 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#FA6F6C] to-[#fbbf24] px-2 py-0.5 text-[10px] font-extrabold whitespace-nowrap text-night shadow">🚀 Boosté</span>
          </>
        ) : (
          <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-signal" />
        )}
          </span>
          <p className="text-sm text-muted">Localisation…</p>
        </div>
      )}
      <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: youPx.x, top: youPx.y }}>
        <span className="radar-sweep block size-48" />
        <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-signal" />
      </div>
      {clusters.map((c) => {
        if (c.x < -40 || c.y < -40 || c.x > size.w + 40 || c.y > size.h + 40) return null;
        if (c.pins.length === 1) {
          const pin = c.pins[0];
          const live = inLive.has(pin.id), convo = convoIds.has(pin.id), fav = favIds.has(pin.id);
          return (
            <span key={pin.id} className="contents">
            {(live || hl === pin.id) && <span className={`pointer-events-none absolute z-[19] -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 ${hl === pin.id ? "border-[#A1E3C3]" : "border-red-500"}`} style={{ left: c.x, top: c.y, width: face + 10, height: face + 10 }} />}
            {live && <span className="pointer-events-none absolute z-[19] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-red-500" style={{ left: c.x, top: c.y, width: face + 4, height: face + 4 }} />}
            {(live || convo || fav) && (
              <span className="pointer-events-none absolute z-[22] flex items-center gap-px" style={{ left: c.x + face / 2 - 10, top: c.y - face / 2 - 6 }}>
                {live && <span className="flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white shadow" aria-label="En Live">🎥</span>}
                {convo && <span className="flex size-4 items-center justify-center rounded-full bg-[#A1E3C3] text-[9px] shadow" aria-label="Conversation">💬</span>}
                {fav && <span className="flex size-4 items-center justify-center rounded-full bg-amber-400 text-[9px] shadow" aria-label="Favori">⭐</span>}
              </span>
            )}
            <button
              type="button"
              data-act="live"
              data-id={pin.id}
              data-pseudo={pin.pseudo}
              aria-label={`Voir le profil de ${pin.pseudo}${favIds.has(pin.id) ? " (favori)" : ""}`}
              className={
                "absolute z-20 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 bg-surface " +
                (hl === pin.id ? "border-[#A1E3C3] ring-4 ring-[#A1E3C3]/60 z-[23] " : favIds.has(pin.id) ? "border-amber-400 ring-2 ring-amber-400/50 " : "border-white ") +
                (boosted.has(pin.id) ? "partner-glow z-[21] " : pin.hot ? "pin-hot" : "")
              }
              style={{ left: c.x, top: c.y, width: boosted.has(pin.id) ? face * 1.25 : face, height: boosted.has(pin.id) ? face * 1.25 : face, borderColor: boosted.has(pin.id) ? "#fbbf24" : undefined }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => useHdar.getState().openProfile(pin.id, pin.pseudo)}
            >
              <PinFace id={pin.id} pseudo={pin.pseudo} />
              {pin.premium && <PremiumBadge className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 scale-75 !px-1" />}
            </button>
            {boosted.has(pin.id) && <span className="pointer-events-none absolute z-[22] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#FA6F6C] to-[#fbbf24] px-1.5 text-[9px] font-extrabold text-night shadow" style={{ left: c.x, top: c.y + face / 2 - 2 }}>🚀</span>}
            </span>
          );
        }
        // Zoomed out: people close together become one glowing bubble showing where it's busy.
        const n = c.pins.length;
        const d = Math.min(76, 40 + n * 4);
        return (
          <button
            key={c.key}
            type="button"
            aria-label={`${n} personnes connectées ici, zoomer`}
            className="cluster-glow absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-signal font-display font-extrabold text-night"
            style={{ left: c.x, top: c.y, width: d, height: d }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              follow.current = false;
              setView((v) => ({ ...v, lat: c.lat, lng: c.lng }));
              animateTo(Math.max(viewRef.current.zoom + 2, 12));
            }}
          >
            {n}
          </button>
        );
      })}
      {placeClusters.map((c) => {
        if (c.items.length > 1) {
          const d = Math.min(52, 26 + c.items.length * 2);
          return (
            <button
              key={c.key}
              type="button"
              aria-label={`${c.items.length} lieux permanents ici, zoomer`}
              className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-300/70 bg-night/85 text-xs font-bold text-emerald-200"
              style={{ left: c.x, top: c.y, width: d, height: d }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                follow.current = false;
                setView((v) => ({ ...v, lat: c.lat, lng: c.lng }));
                animateTo(Math.min(17, Math.max(viewRef.current.zoom + 2, 10)));
              }}
            >
              {c.items.length}
              {c.items.some((x) => act.places.has(x.id)) && (
                <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-night bg-signal" />
              )}
            </button>
          );
        }
        const pl = c.items[0];
        const k = PLACE_KINDS[pl.kind];
        return (
          <button
            key={pl.id}
            type="button"
            aria-label={`${k.label} : ${pl.name}`}
            className={"absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-night/90 text-sm shadow " + (pl.pro_boost ? "partner-glow z-[16] size-12 shadow-[0_0_24px_#fbbf24]" : pl.partner ? "partner-glow z-[15] size-10" : "z-10 size-8")}
            style={{ left: c.x, top: c.y, borderColor: pl.pro_boost ? "#fbbf24" : k.color }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPlaceId(pl.id)}
          >
            {k.icon}
            {act.places.has(pl.id) && <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-night bg-signal" />}
          </button>
        );
      })}
      {spotClusters.map((c) => {
        if (c.x < -40 || c.y < -40 || c.x > size.w + 40 || c.y > size.h + 40) return null;
        if (c.items.length > 1) {
          const n = c.items.length;
          const d = Math.min(64, 30 + n * 4);
          return (
            <button
              key={c.key}
              type="button"
              aria-label={`${n} lieux ici, zoomer`}
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border-2 border-spot bg-night/95 font-display text-sm font-extrabold text-ink shadow-lg"
              style={{ left: c.x, top: c.y, width: d, height: d }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                follow.current = false;
                setView((v) => ({ ...v, lat: c.lat, lng: c.lng }));
                animateTo(Math.min(17, Math.max(viewRef.current.zoom + 2, 14)));
              }}
            >
              📍{n}
            </button>
          );
        }
        const spot = c.items[0];
        const glow = (spot.boostedUntil ?? 0) > Date.now();
        const compact = zoom < 13 && !glow;
        return (
          <button
            key={spot.id}
            type="button"
            data-act="join"
            data-id={spot.id}
            aria-label={`Lieu : ${spot.title}${act.unread.has(spot.id) ? " (nouveaux messages)" : act.fresh.has(spot.id) ? " (nouveau)" : ""}`}
            className={
              (compact
                ? "absolute z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-spot bg-night/90 text-xs"
                : "absolute z-20 flex h-8 max-w-40 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-spot bg-night/90 px-3 text-xs text-ink") +
              (act.fresh.has(spot.id) ? " spot-fresh" : "") +
              (glow ? " partner-glow !z-[22] border-2 font-bold" : "")
            }
            style={{ left: c.x, top: c.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSpot(spot.id)}
          >
            {compact ? "📍" : <span className="truncate">{glow ? "✨ " : ""}{spot.title}</span>}
            {act.fresh.has(spot.id) && !compact && (
              <span className="ml-1.5 shrink-0 rounded-full bg-spot px-1.5 text-[10px] font-bold text-night">nouveau</span>
            )}
            {act.unread.has(spot.id) && (
              <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-night bg-signal" />
            )}
          </button>
        );
      })}
      <button
        type="button"
        className="absolute top-3 left-3 z-30 flex size-11 items-center justify-center rounded-full bg-night/90 text-ink"
        aria-label={located ? "Recentrer" : "Me localiser"}
        onClick={askLocation}
      >
        <LocateFixed className="size-5" />
      </button>
      <div className="absolute top-16 left-3 z-30">
        <button
          type="button"
          aria-label="Calques de la carte"
          aria-expanded={layersOpen}
          className="flex size-11 items-center justify-center rounded-full bg-night/90 text-ink"
          onClick={() => setLayersOpen((v) => !v)}
        >
          <Layers className="size-5" />
        </button>
        {layersOpen && (
          <div className="mt-2 w-56 rounded-2xl border border-line bg-night/95 p-2 text-sm shadow-xl">
            <label className="flex h-10 items-center justify-between px-2">
              Lieux permanents
              <input
                type="checkbox"
                checked={placesOn}
                onChange={(e) => {
                  setPlacesOn(e.target.checked);
                  setPlacesLayer(e.target.checked);
                }}
              />
            </label>
            <label className="flex h-10 items-center justify-between px-2">
              <span>
                🚻 Toilettes <span className="text-xs text-muted">(zoom proche)</span>
              </span>
              <input
                type="checkbox"
                checked={toiletsOn}
                onChange={(e) => {
                  setToiletsOn(e.target.checked);
                  setToiletsLayer(e.target.checked);
                }}
              />
            </label>
            <button
              type="button"
              className="flex h-10 w-full items-center rounded-xl px-2 text-left hover:bg-surface"
              onClick={() => {
                setLayersOpen(false);
                setProposing(true);
              }}
            >
              + Proposer un lieu ici
            </button>
          </div>
        )}
      </div>
      <div className="absolute top-[7.25rem] left-3 z-30">
        <FilterButton onClick={() => setFiltersOpen(true)} />
      </div>
      {filtersOpen && <FilterSheet onClose={() => setFiltersOpen(false)} />}
      {places.length > 0 && (
        <p className="pointer-events-none absolute bottom-1 left-2 z-30 text-[10px] text-white/70">© OpenStreetMap contributors</p>
      )}
      {placeId && (
        <Safe key={placeId} onError={() => setPlaceId(null)}>
          <PlaceSheet id={placeId} onClose={() => setPlaceId(null)} />
        </Safe>
      )}
      {proposing && (
        <Safe onError={() => setProposing(false)}>
          <ProposePlaceSheet at={{ lat: view.lat, lng: view.lng }} onClose={() => setProposing(false)} />
        </Safe>
      )}
      {proposing && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 text-3xl">⌖</span>
      )}
      <div className="absolute right-3 bottom-6 z-30 flex flex-col gap-2">
        <MapGiftButton />
        <Link to="/live" aria-label="Live vidéo" className="relative flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] text-night shadow-[0_0_18px_#FA6F6C]">
          <Video className="size-5" />
          <LiveBadge />
        </Link>
        <button type="button" className="size-11 rounded-full bg-night/90 text-lg text-ink" aria-label="Zoom avant" onClick={() => animateTo(viewRef.current.zoom + 1)}>
          +
        </button>
        <button type="button" className="size-11 rounded-full bg-night/90 text-lg text-ink" aria-label="Zoom arrière" onClick={() => animateTo(viewRef.current.zoom - 1)}>
          −
        </button>
      </div>
      {!pending && <BoostNudge />}
      {pending && (
        <div className="absolute inset-x-3 bottom-24 z-30 flex items-center gap-2 rounded-full bg-spot px-4 py-2 text-sm text-night">
          <span className="min-w-0 flex-1 truncate">Tape la carte pour poser « {pending.title} »</span>
          <button type="button" className="font-bold" onClick={cancelSpot}>
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

export function PinFace({ id, pseudo }: { id: string; pseudo: string }) {
  const photo = usePhoto(id);
  if (photo) return <img src={photo} alt="" draggable={false} className="pointer-events-none size-full object-cover" />;
  return (
    <span className="flex size-full items-center justify-center font-display text-sm font-bold">
      {pseudo.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LiveBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => { if (document.visibilityState === "visible") void liveCount().then((c) => alive && setN(Number(c) || 0)).catch(() => undefined); };
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return n > 0 ? (
    <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 rounded-full bg-night px-1.5 py-0.5 text-[10px] font-bold text-white">
      <span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex size-1.5 rounded-full bg-red-500" /></span>
      {n}
    </span>
  ) : (
    <span className="absolute -top-1 -right-1 rounded-full bg-night px-1 text-[8px] font-bold text-[#FA6F6C]/70">LIVE</span>
  );
}
