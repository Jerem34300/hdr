import { useEffect, useRef, useState } from "react";
import { approxGeo, recentActivity, type Recent } from "@/lib/hdar/recent";

const TILE = 256;
const wx = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const wy = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
const FALLBACK = { city: "Montpellier", lat: 43.61, lng: 3.88 };

/**
 * Aperçu de la carte derrière l'écran 18+ : vraie carte de la ville approximative (réseau),
 * floutée, avec l'activité anonyme des dernières 24 h. Rien d'identifiant : carreaux ~5 km.
 */
export function GateTeaser({ onCity }: { onCity?: (city: string | null, recent: Recent | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 800 });
  const [geo, setGeo] = useState<{ city: string | null; lat: number; lng: number }>(FALLBACK);
  const [recent, setRecent] = useState<Recent | null>(null);
  const cb = useRef(onCity);
  cb.current = onCity;

  useEffect(() => {
    const el = box.current;
    if (el) setSize({ w: el.clientWidth || 390, h: el.clientHeight || 800 });
    let alive = true;
    void approxGeo().then(async (g) => {
      const at = g ?? FALLBACK;
      if (alive) setGeo(at);
      const r = await recentActivity(at.lat, at.lng);
      if (!alive) return;
      setRecent(r);
      cb.current?.(at.city, r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const z = 10;
  const left = wx(geo.lng, z) - size.w / 2;
  const top = wy(geo.lat, z) - size.h / 2;
  const tiles: { x: number; y: number; l: number; t: number }[] = [];
  for (let x = Math.floor(left / TILE); x <= Math.floor((left + size.w) / TILE); x++)
    for (let y = Math.floor(top / TILE); y <= Math.floor((top + size.h) / TILE); y++) tiles.push({ x, y, l: x * TILE - left, t: y * TILE - top });

  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0c1014]">
      <div className="absolute inset-0 scale-105 blur-[2px]">
        {tiles.map((t) => (
          <img key={`${t.x}-${t.y}`} alt="" src={`/tiles/plan/${z}/${t.x}/${t.y}.png`} className="map-tile absolute max-w-none" style={{ left: t.l, top: t.t, width: TILE, height: TILE }} />
        ))}
      </div>
      {(recent?.cells ?? []).map((c) => {
        const x = wx(c.lng, z) - left;
        const y = wy(c.lat, z) - top;
        if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) return null;
        const d = 34 + Math.min(4, c.n) * 10;
        return (
          <span key={`${c.lat}-${c.lng}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
            <span className="block animate-pulse rounded-full bg-[#FA6F6C]/35 shadow-[0_0_30px_rgba(250,111,108,.8)]" style={{ width: d, height: d }} />
          </span>
        );
      })}
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="radar-sweep block size-48" />
      </span>
      <div className="absolute inset-0 bg-gradient-to-b from-night/10 via-night/20 to-night/90" />
    </div>
  );
}
