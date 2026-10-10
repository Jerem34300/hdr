import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { listLive, pulse, goDark, type LivePin } from "@/lib/hdar/live";
import { deviceId } from "@/lib/hdar/device";
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
  const visible = useHdar((s) => !!(s.me.tonight && s.me.tonight.expiresAt > s.now));

  useEffect(() => {
    let stop = false;
    const load = () => {
      void listLive({ data: deviceId() })
        .then((rows) => {
          if (!stop) setLive(rows);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

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
          desires: tonight.desires.join(","),
          hours: 3,
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

  const pins = live.map((p) => ({
    id: p.id,
    pseudo: p.pseudo,
    hot: p.hot,
    at: { lat: p.lat, lng: p.lng },
  }));

  const youPx = project(you.lat, you.lng);
  const face = zoom >= 10.5 ? 46 : 34;

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
            <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-signal" />
          </span>
          <p className="text-sm text-muted">Localisation…</p>
        </div>
      )}
      <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: youPx.x, top: youPx.y }}>
        <span className="radar-sweep block size-48" />
        <span className="ping-ring absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2" />
        <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-signal" />
      </div>
      {pins.map((pin) => {
        const p = project(pin.at.lat, pin.at.lng);
        if (p.x < -40 || p.y < -40 || p.x > size.w + 40 || p.y > size.h + 40) return null;
        return (
          <button
            key={pin.id}
            type="button"
            data-act="live"
            data-id={pin.id}
            data-pseudo={pin.pseudo}
            aria-label={pin.pseudo}
            className={
              "absolute z-20 grid -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full border-2 border-white bg-surface font-display text-sm font-bold " +
              (pin.hot ? "pin-hot" : "")
            }
            style={{ left: p.x, top: p.y, width: face, height: face }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => useHdar.getState().openProfile(pin.id, pin.pseudo)}
          >
            {pin.pseudo.slice(0, 1).toUpperCase()}
          </button>
        );
      })}
      {spots.filter((s) => s.creator || s.live).map((spot) => {
        const p = project(spot.lat, spot.lng);
        if (p.x < -20 || p.y < -20 || p.x > size.w + 20 || p.y > size.h + 20) return null;
        return (
          <button
            key={spot.id}
            type="button"
            data-act="join"
            data-id={spot.id}
            className="absolute z-20 h-8 max-w-36 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-spot bg-night/90 px-3 text-xs text-ink"
            style={{ left: p.x, top: p.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSpot(spot.id)}
          >
            {spot.title}
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
      <div className="absolute right-3 bottom-6 z-30 flex flex-col gap-2">
        <button type="button" className="size-11 rounded-full bg-night/90 text-lg text-ink" aria-label="Zoom avant" onClick={() => animateTo(viewRef.current.zoom + 1)}>
          +
        </button>
        <button type="button" className="size-11 rounded-full bg-night/90 text-lg text-ink" aria-label="Zoom arrière" onClick={() => animateTo(viewRef.current.zoom - 1)}>
          −
        </button>
      </div>
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
