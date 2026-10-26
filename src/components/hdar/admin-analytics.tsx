import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, RefreshCw } from "lucide-react";
import {
  analytics,
  type AdminOverview,
  type BoostRow,
  type HeatCell,
  type Influencer,
  type PartnerRow,
  type TopPlace,
  type WeekCell,
} from "@/lib/hdar/live";
import { Avatar } from "./avatar";
import { PLACE_KINDS } from "./places-layer";

// ---------------------------------------------------------------- shared
export function useAsync<T>(load: () => Promise<T>, everyMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const run = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [load]);
  useEffect(() => {
    run();
    if (!everyMs) return;
    const id = window.setInterval(run, everyMs);
    return () => window.clearInterval(id);
  }, [run, everyMs]);
  return { data, error, reload: run };
}

export const fmt = (n: number) => n.toLocaleString("fr-FR");
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
export const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function Period({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1 rounded-full border border-line bg-surface p-1 text-xs">
      {[1, 7, 30, 90].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={"h-8 rounded-full px-3 " + (value === d ? "bg-signal font-bold text-night" : "text-muted")}
        >
          {d === 1 ? "24 h" : `${d} j`}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={"font-display text-2xl font-extrabold tabular-nums sm:text-3xl " + (accent ? "text-signal" : "")}>{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Bars({ rows, series }: { rows: { label: string; values: number[] }[]; series: { name: string; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0)));
  const step = Math.max(1, Math.ceil(rows.length / 10));
  return (
    <div>
      <div className="flex h-40 items-end gap-[2px]">
        {rows.map((r, i) => (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${r.label} · ${r.values.map((v, j) => `${series[j].name} ${v}`).join(" · ")}`}>
            <div className="flex w-full flex-1 flex-col-reverse">
              {r.values.map((v, j) => (
                <span key={j} className="w-full first:rounded-b-sm last:rounded-t-sm" style={{ height: `${(v / max) * 100}%`, background: series[j].color }} />
              ))}
            </div>
            <span className="mt-1 h-3 text-[9px] text-muted">{i % step === 0 ? r.label : ""}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
        <span className="ml-auto">max {fmt(max)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- overview
export function Overview({ adminKey, onReports }: { adminKey: string; onReports?: ReactNode }) {
  const [days, setDays] = useState(30);
  const load = useCallback(() => analytics.overview(adminKey, Math.max(days, 7)), [adminKey, days]);
  const { data: s, error, reload } = useAsync<AdminOverview>(load, 60_000);
  if (error) return <p className="text-signal">{error}</p>;
  if (!s) return <p className="text-muted">Chargement…</p>;
  const d = s.days;
  const lab = (x: string) => x.slice(8, 10) + "/" + x.slice(5, 7);
  const sum = (k: keyof (typeof d)[number]) => d.reduce((a, r) => a + Number(r[k]), 0);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Period value={days} onChange={setDays} />
        <button type="button" className="flex items-center gap-1 text-xs text-muted" onClick={reload}>
          <RefreshCw className="size-3" /> Actualiser
        </button>
      </div>
      {onReports}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="En ligne maintenant" value={fmt(s.active_now)} hint={`${s.visible_now} visibles sur la carte`} accent />
        <Kpi label="Actifs aujourd'hui (DAU)" value={fmt(s.dau)} />
        <Kpi label="Actifs 7 j (WAU)" value={fmt(s.wau)} hint={`DAU/MAU ${pct(s.dau, s.mau)}`} />
        <Kpi label="Actifs 30 j (MAU)" value={fmt(s.mau)} />
        <Kpi label="Profils créés" value={fmt(s.profiles_total)} hint={`${s.profiles_photo} avec photo · ${fmt(s.devices_total)} appareils`} />
        <Kpi label="Rétention J+1" value={pct(s.retention.d1, s.retention.d1_cohort)} hint={`${s.retention.d1}/${s.retention.d1_cohort} nouveaux revenus le lendemain`} />
        <Kpi label="Rétention J+7" value={pct(s.retention.d7, s.retention.d7_cohort)} hint={s.retention.d7_cohort ? `${s.retention.d7}/${s.retention.d7_cohort} revenus la 2e semaine` : "pas encore assez de recul"} />
        <Kpi label="Monétisation" value={`${s.boosts_active} / ${s.partners_active}`} hint="boosts actifs / partenaires actifs" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={`Nouveaux appareils (${d.length} j)`} value={fmt(sum("new_devices"))} />
        <Kpi label="Messages privés" value={fmt(sum("pm"))} />
        <Kpi label="Chat du quartier" value={fmt(sum("area"))} />
        <Kpi label="Chats de lieux" value={fmt(sum("place"))} />
      </div>
      <Card title="Nouveaux utilisateurs par jour">
        <Bars
          rows={d.map((r) => ({ label: lab(r.day), values: [r.new_devices - Math.min(r.new_devices, r.new_profiles), Math.min(r.new_devices, r.new_profiles)] }))}
          series={[
            { name: "Nouveaux visiteurs", color: "var(--color-muted)" },
            { name: "dont profils créés", color: "var(--color-signal)" },
          ]}
        />
      </Card>
      <Card title="Utilisateurs actifs par jour">
        <Bars rows={d.map((r) => ({ label: lab(r.day), values: [r.visitors] }))} series={[{ name: "Visiteurs uniques", color: "var(--color-online)" }]} />
      </Card>
      <Card title="Messages par jour">
        <Bars
          rows={d.map((r) => ({ label: lab(r.day), values: [r.pm, r.area, r.place] }))}
          series={[
            { name: "Privés", color: "var(--color-signal)" },
            { name: "Quartier", color: "#38bdf8" },
            { name: "Lieux / spots", color: "#34d399" },
          ]}
        />
      </Card>
      <p className="mt-3 text-[11px] text-muted">
        Les compteurs de messages démarrent le 13/10/2026 (historique reconstitué à partir des messages encore présents). Visites : 90 jours d'historique.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- heatmap
const TILE = 256;
const wx = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const wy = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
const lngX = (x: number, z: number) => (x / (TILE * 2 ** z)) * 360 - 180;
const latY = (y: number, z: number) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z)));

const CITIES: [string, number, number][] = [
  ["Paris", 48.857, 2.352], ["Marseille", 43.296, 5.37], ["Lyon", 45.764, 4.836], ["Toulouse", 43.605, 1.444],
  ["Nice", 43.71, 7.262], ["Nantes", 47.218, -1.554], ["Montpellier", 43.611, 3.877], ["Strasbourg", 48.573, 7.752],
  ["Bordeaux", 44.838, -0.579], ["Lille", 50.629, 3.057], ["Rennes", 48.117, -1.678], ["Reims", 49.258, 4.032],
  ["Toulon", 43.124, 5.928], ["Saint-Étienne", 45.44, 4.387], ["Le Havre", 49.494, 0.108], ["Grenoble", 45.188, 5.724],
  ["Dijon", 47.322, 5.041], ["Angers", 47.478, -0.563], ["Nîmes", 43.837, 4.36], ["Clermont-Ferrand", 45.777, 3.087],
  ["Aix-en-Provence", 43.529, 5.447], ["Brest", 48.39, -4.486], ["Tours", 47.394, 0.685], ["Amiens", 49.894, 2.296],
  ["Limoges", 45.834, 1.261], ["Perpignan", 42.699, 2.895], ["Metz", 49.119, 6.176], ["Besançon", 47.238, 6.024],
  ["Orléans", 47.903, 1.909], ["Rouen", 49.443, 1.1], ["Caen", 49.183, -0.37], ["Nancy", 48.692, 6.184],
  ["Avignon", 43.949, 4.806], ["Poitiers", 46.58, 0.34], ["La Rochelle", 46.16, -1.151], ["Pau", 43.295, -0.37],
  ["Bayonne", 43.493, -1.475], ["Cannes", 43.552, 7.017], ["Béziers", 43.344, 3.215], ["Sète", 43.403, 3.697],
  ["Annecy", 45.899, 6.129], ["Mulhouse", 47.75, 7.336], ["Le Mans", 48.006, 0.199], ["Bruxelles", 50.85, 4.352],
  ["Genève", 46.204, 6.143], ["Lausanne", 46.52, 6.633], ["Luxembourg", 49.611, 6.13], ["Montréal", 45.502, -73.567],
];
export function nearestCity(lat: number, lng: number) {
  let best = "";
  let bd = Infinity;
  for (const [n, a, b] of CITIES) {
    const d = (a - lat) ** 2 + ((b - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return Math.sqrt(bd) * 111 < 25 ? best : `${lat.toFixed(1)}, ${lng.toFixed(1)}`;
}

type Spot = { lat: number; lng: number; w: number; glow?: boolean; label?: string };

export function HeatMapView({ points, height = 380 }: { points: Spot[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(360);
  const [view, setView] = useState({ lat: 46.6, lng: 2.4, zoom: 5 });
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const [s, n, we, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    let z = 15;
    while (z > 3 && (wx(e, z) - wx(we, z) > w * 0.8 || wy(s, z) - wy(n, z) > height * 0.8)) z--;
    setView({ lat: (s + n) / 2, lng: (we + e) / 2, zoom: Math.min(z, 14) });
  }, [points, w, height]);
  const z = view.zoom;
  const cx = wx(view.lng, z) - w / 2;
  const cy = wy(view.lat, z) - height / 2;
  const tiles = useMemo(() => {
    const out: { x: number; y: number; l: number; t: number }[] = [];
    const n = 2 ** z;
    for (let tx = Math.floor(cx / TILE); tx <= Math.floor((cx + w) / TILE); tx++)
      for (let ty = Math.floor(cy / TILE); ty <= Math.floor((cy + height) / TILE); ty++)
        if (ty >= 0 && ty < n) out.push({ x: ((tx % n) + n) % n, y: ty, l: tx * TILE - cx, t: ty * TILE - cy });
    return out;
  }, [cx, cy, w, height, z]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, height);
    const max = Math.max(1, ...points.map((p) => p.w));
    // ~1 km cells: radius grows with zoom, never below a readable blob.
    const r = Math.max(14, (1000 / (156543 * Math.cos((view.lat * Math.PI) / 180) / 2 ** z)) * 1.2);
    g.globalCompositeOperation = "lighter";
    for (const p of points) {
      const x = wx(p.lng, z) - cx;
      const y = wy(p.lat, z) - cy;
      if (x < -r || y < -r || x > w + r || y > height + r) continue;
      const a = 0.25 + 0.75 * Math.sqrt(p.w / max);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(255,90,95,${a})`);
      grd.addColorStop(0.45, `rgba(255,140,60,${a * 0.55})`);
      grd.addColorStop(1, "rgba(52,211,153,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }, [points, w, height, z, cx, cy, view.lat]);
  const zoomBy = (d: number) => setView((v) => ({ ...v, zoom: Math.min(16, Math.max(3, v.zoom + d)) }));
  return (
    <div
      ref={box}
      className="relative touch-none overflow-hidden rounded-xl bg-[#0c1014] select-none"
      style={{ height }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, lat: view.lat, lng: view.lng };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setView((v) => ({ ...v, lng: lngX(wx(d.lng, v.zoom) - (e.clientX - d.x), v.zoom), lat: latY(wy(d.lat, v.zoom) - (e.clientY - d.y), v.zoom) }));
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 1 : -1)}
    >
      {tiles.map((t) => (
        <img key={`${z}-${t.x}-${t.y}-${t.l}`} alt="" draggable={false} src={`/tiles/plan/${z}/${t.x}/${t.y}.png`} className="map-tile pointer-events-none absolute max-w-none" style={{ left: t.l, top: t.t, width: TILE, height: TILE }} />
      ))}
      <canvas ref={canvas} className="pointer-events-none absolute inset-0" style={{ width: w, height }} />
      {points.filter((p) => p.glow).map((p, i) => (
        <span key={i} title={p.label} className="partner-glow pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#f472b6]" style={{ left: wx(p.lng, z) - cx, top: wy(p.lat, z) - cy }} />
      ))}
      {points.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-muted">Pas encore de données sur cette période.</p>
      )}
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        <button type="button" aria-label="Zoom avant" className="flex size-9 items-center justify-center rounded-full bg-night/90" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomBy(1)}>
          <Plus className="size-4" />
        </button>
        <button type="button" aria-label="Zoom arrière" className="flex size-9 items-center justify-center rounded-full bg-night/90" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomBy(-1)}>
          <Minus className="size-4" />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-white/70">© OpenStreetMap contributors</p>
    </div>
  );
}

export function Heat({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(7);
  const load = useCallback(() => analytics.heat(adminKey, days), [adminKey, days]);
  const { data, error } = useAsync<HeatCell[]>(load);
  const areas = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number; presence: number; peak: number; cells: number }>();
    for (const c of data ?? []) {
      const k = `${Math.round(c.lat * 10)}:${Math.round(c.lng * 10)}`;
      const a = m.get(k) ?? { lat: c.lat, lng: c.lng, presence: 0, peak: 0, cells: 0 };
      a.presence += c.presence;
      a.peak = Math.max(a.peak, c.peak);
      a.cells++;
      m.set(k, a);
    }
    const byCity = new Map<string, { name: string; presence: number; peak: number; cells: number }>();
    for (const a of m.values()) {
      const name = nearestCity(a.lat, a.lng);
      const b = byCity.get(name) ?? { name, presence: 0, peak: 0, cells: 0 };
      b.presence += a.presence;
      b.peak = Math.max(b.peak, a.peak);
      b.cells += a.cells;
      byCity.set(name, b);
    }
    return [...byCity.values()].sort((x, y) => y.presence - x.presence).slice(0, 15);
  }, [data]);
  const total = areas.reduce((a, b) => a + b.presence, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Period value={days} onChange={setDays} />
        <p className="text-xs text-muted">Présence sur la carte, regroupée par carreau d'≈1 km. Aucune position individuelle.</p>
      </div>
      {error && <p className="text-signal">{error}</p>}
      <HeatMapView key={days} points={(data ?? []).map((c) => ({ lat: c.lat, lng: c.lng, w: c.presence }))} height={420} />
      <Card title="Villes et zones les plus actives">
        {areas.length === 0 && <p className="text-sm text-muted">Pas encore de données.</p>}
        <ul className="space-y-1.5">
          {areas.map((a, i) => (
            <li key={a.name} className="text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  <b>{a.name}</b>
                </span>
                <span className="text-xs text-muted tabular-nums">pic {a.peak} simultanés · {pct(a.presence, total)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-night">
                <div className="h-full rounded-full bg-signal" style={{ width: `${(a.presence / (areas[0]?.presence || 1)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- week heatmap
const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export function Week({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<"sessions" | "messages" | "presence">("sessions");
  const load = useCallback(() => analytics.week(adminKey, days), [adminKey, days]);
  const { data, error } = useAsync<WeekCell[]>(load);
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const c of data ?? []) g[c.dow - 1][c.hour] += c[metric];
    return g;
  }, [data, metric]);
  const max = Math.max(1, ...grid.flat());
  const byHour = grid[0].map((_, h) => grid.reduce((a, r) => a + r[h], 0));
  const peakH = byHour.indexOf(Math.max(...byHour));
  const byDay = grid.map((r) => r.reduce((a, b) => a + b, 0));
  const peakD = byDay.indexOf(Math.max(...byDay));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Period value={days} onChange={setDays} />
        <select className="h-10 rounded-full border border-line bg-surface px-3 text-sm" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
          <option value="sessions">Ouvertures de l'appli</option>
          <option value="messages">Messages envoyés</option>
          <option value="presence">Présence sur la carte</option>
        </select>
      </div>
      {error && <p className="text-signal">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Heure de pointe" value={max > 1 || grid.flat().some(Boolean) ? `${peakH} h – ${peakH + 1} h` : "—"} />
        <Kpi label="Jour le plus actif" value={grid.flat().some(Boolean) ? DOW[peakD] : "—"} />
      </div>
      <Card title="Heures × jours (heure de Paris)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-[2px] text-[10px]">
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="font-normal text-muted">{h % 3 === 0 ? h : ""}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, d) => (
                <tr key={d}>
                  <td className="pr-1 text-muted">{DOW[d]}</td>
                  {row.map((v, h) => (
                    <td key={h} title={`${DOW[d]} ${h} h : ${v}`} className="h-6 rounded-sm" style={{ background: v ? `rgba(255,90,95,${0.15 + 0.85 * (v / max)})` : "rgba(255,255,255,0.04)" }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- places
export function TopPlaces({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(30);
  const load = useCallback(() => analytics.places(adminKey, days), [adminKey, days]);
  const { data, error } = useAsync<TopPlace[]>(load);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Period value={days} onChange={setDays} />
        <p className="text-xs text-muted">Messages dans le chat du lieu, ouvertures de la fiche, visiteurs uniques.</p>
      </div>
      {error && <p className="text-signal">{error}</p>}
      {data && data.length > 0 && (
        <HeatMapView points={data.map((p) => ({ lat: p.lat, lng: p.lng, w: p.messages * 3 + p.views + p.visitors * 2, glow: p.partner, label: p.name }))} height={300} />
      )}
      {data && data.length === 0 && <p className="py-12 text-center text-muted">Aucune activité sur les lieux pour cette période (le suivi démarre le 13/10/2026).</p>}
      <ol className="mt-3 space-y-2">
        {data?.map((p, i) => {
          const k = PLACE_KINDS[p.kind as keyof typeof PLACE_KINDS];
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="w-6 font-display font-extrabold text-muted">{i + 1}</span>
              <span className="text-xl">{k?.icon ?? "📌"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {p.name} {p.partner && <span className="ml-1 rounded-full bg-[#f472b6] px-2 text-[10px] text-night">PARTENAIRE</span>}
                </span>
                <span className="text-xs text-muted">{k?.label ?? p.kind} · {nearestCity(p.lat, p.lng)}</span>
              </span>
              <span className="grid shrink-0 grid-cols-3 gap-3 text-center text-xs tabular-nums">
                <span><b className="block text-base text-signal">{p.messages}</b>msg</span>
                <span><b className="block text-base">{p.visitors}</b>visit.</span>
                <span><b className="block text-base">{p.views}</b>vues</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- influencers
type SortKey = "score" | "pm" | "convs" | "favs" | "views" | "area" | "place" | "sessions";
const COLS: [SortKey, string][] = [
  ["score", "Score"], ["pm", "Msg privés"], ["convs", "Conv. lancées"], ["favs", "En favori"],
  ["views", "Vues profil"], ["area", "Quartier"], ["place", "Lieux"], ["sessions", "Visites"],
];
export function Influencers({ adminKey, onOpen, onBoost }: { adminKey: string; onOpen: (id: string) => void; onBoost: (u: Influencer) => void }) {
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<SortKey>("score");
  const load = useCallback(() => analytics.influencers(adminKey, days), [adminKey, days]);
  const { data, error } = useAsync<Influencer[]>(load);
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => b[sort] - a[sort]), [data, sort]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Period value={days} onChange={setDays} />
        <select className="h-10 rounded-full border border-line bg-surface px-3 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {COLS.map(([k, l]) => (
            <option key={k} value={k}>Trier : {l}</option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-xs text-muted">
        Score = messages privés + 3 × conversations lancées + messages quartier/lieux + 2 × vues de profil + 5 × mises en favori + visites.
      </p>
      {error && <p className="text-signal">{error}</p>}
      <ol className="space-y-2">
        {rows.map((u, i) => (
          <li key={u.user_id} className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <span className="w-6 font-display font-extrabold text-muted">{i + 1}</span>
              <Avatar src={u.photo ?? ""} name={u.pseudo} className="size-11 shrink-0 rounded-full" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(u.user_id)}>
                <span className="flex items-center gap-2">
                  <span className="truncate font-display font-bold underline">{u.pseudo}</span>
                  {u.online && <span className="size-2 rounded-full bg-online" title="visible sur la carte" />}
                  {u.banned && <span className="rounded-full bg-signal px-2 text-[10px] font-bold text-night">BANNI</span>}
                </span>
                <span className="text-xs text-muted">Score {fmt(u.score)}</span>
              </button>
              <button type="button" className="h-9 shrink-0 rounded-full border border-[#f472b6] px-3 text-xs text-[#f472b6]" onClick={() => onBoost(u)}>
                ✨ Booster
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] text-muted sm:grid-cols-7">
              {COLS.slice(1).map(([k, l]) => (
                <span key={k} className={"rounded-lg bg-night px-1 py-1 " + (sort === k ? "ring-1 ring-signal" : "")}>
                  <b className="block text-sm text-ink tabular-nums">{fmt(u[k])}</b>
                  {l}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- monetization
const inputCls = "h-11 w-full rounded-xl border border-line bg-night px-3 text-base outline-none focus-visible:border-signal";
const plusDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 16);
const toIso = (local: string) => new Date(local).toISOString();

function parseLatLng(s: string): [number, number] | null {
  const m = s.match(/(-?\d{1,2}\.\d+)[,\s/]+(-?\d{1,3}\.\d+)/) ?? s.match(/mlat=(-?[\d.]+).*mlon=(-?[\d.]+)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

export function Monetization({ adminKey, prefill, onOpen }: { adminKey: string; prefill: Influencer | null; onOpen: (id: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        Saisie manuelle (pas encore de paiement en ligne) : enregistre ici les boosts et annonces vendus. Ils s'affichent sur la carte avec un halo lumineux.
      </p>
      <Boosts adminKey={adminKey} prefill={prefill} onOpen={onOpen} />
      <Partners adminKey={adminKey} />
    </div>
  );
}

function Boosts({ adminKey, prefill, onOpen }: { adminKey: string; prefill: Influencer | null; onOpen: (id: string) => void }) {
  const load = useCallback(() => analytics.boosts(adminKey), [adminKey]);
  const { data, error, reload } = useAsync<BoostRow[]>(load);
  const [user, setUser] = useState(prefill?.user_id ?? "");
  const [ends, setEnds] = useState(plusDays(1));
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const revenue = (data ?? []).filter((b) => !b.cancelled).reduce((a, b) => a + b.price_cents, 0);
  return (
    <Card title="✨ Boosts utilisateurs" right={<span className="text-xs text-muted">CA enregistré {euros(revenue)}</span>}>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg("");
          analytics
            .boostCreate(adminKey, user.trim(), null, toIso(ends), Math.round(Number(price || 0) * 100), note)
            .then(() => {
              setMsg("Boost créé ✓");
              setNote("");
              reload();
            })
            .catch((err: unknown) => setMsg(err instanceof Error ? err.message : "Erreur"));
        }}
      >
        <label className="text-xs text-muted sm:col-span-2">
          Utilisateur (id) {prefill && user === prefill.user_id && <b className="text-ink">— {prefill.pseudo}</b>}
          <input className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} placeholder="Choisis-le depuis l'onglet Influenceurs (bouton Booster)" required />
        </label>
        <label className="text-xs text-muted">
          Fin du boost
          <input type="datetime-local" className={inputCls} value={ends} onChange={(e) => setEnds(e.target.value)} required />
          <span className="mt-1 flex gap-1">
            {[[1 / 24, "1 h"], [3 / 24, "3 h"], [1, "24 h"], [7, "7 j"], [30, "30 j"]].map(([d, l]) => (
              <button key={String(l)} type="button" className="rounded-full border border-line px-2 py-0.5" onClick={() => setEnds(plusDays(Number(d)))}>
                {l}
              </button>
            ))}
          </span>
        </label>
        <label className="text-xs text-muted">
          Prix payé (€)
          <input inputMode="decimal" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value.replace(",", "."))} placeholder="0" />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Note
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. offert, test, payé par virement…" />
        </label>
        <button type="submit" className="h-11 rounded-full bg-signal font-bold text-night sm:col-span-2">Créer le boost</button>
        {msg && <p className="text-sm sm:col-span-2">{msg}</p>}
      </form>
      {error && <p className="mt-2 text-signal">{error}</p>}
      <ul className="mt-4 space-y-2">
        {data?.length === 0 && <li className="text-sm text-muted">Aucun boost pour l'instant.</li>}
        {data?.map((b) => (
          <li key={b.id} className={"flex items-center gap-2 rounded-xl bg-night px-3 py-2 text-sm " + (b.active ? "" : "opacity-50")}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(b.user_id)}>
              <span className="font-bold underline">{b.pseudo}</span> {b.active && <span className="partner-glow ml-1 inline-block size-2 rounded-full bg-[#f472b6]" />}
              <span className="block text-xs text-muted">
                {dt(b.starts_at)} → {dt(b.ends_at)} · {euros(b.price_cents)}{b.note ? ` · ${b.note}` : ""}{b.cancelled ? " · annulé" : ""}
              </span>
            </button>
            {!b.cancelled && new Date(b.ends_at).getTime() > Date.now() && (
              <button type="button" className="shrink-0 text-xs text-signal" onClick={() => void analytics.boostCancel(adminKey, b.id).then(reload)}>
                Annuler
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const PARTNER_KINDS = ["bar", "club", "sauna", "other", "cruising", "beach", "park", "aire"] as const;

function Partners({ adminKey }: { adminKey: string }) {
  const load = useCallback(() => analytics.partners(adminKey), [adminKey]);
  const { data, error, reload } = useAsync<PartnerRow[]>(load);
  const [f, setF] = useState({ kind: "bar", name: "", description: "", pos: "", ends: plusDays(30), price: "", contact: "", note: "" });
  const [msg, setMsg] = useState("");
  const [extend, setExtend] = useState<{ id: string; ends: string; price: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const revenue = (data ?? []).flatMap((p) => p.listings).filter((l) => !l.cancelled).reduce((a, l) => a + l.price_cents, 0);
  return (
    <Card title="🍸 Lieux partenaires (annonces)" right={<span className="text-xs text-muted">CA enregistré {euros(revenue)}</span>}>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg("");
          const ll = parseLatLng(f.pos);
          if (!ll) {
            setMsg("Position invalide : colle « 43.61, 3.87 » ou un lien OpenStreetMap / Google Maps.");
            return;
          }
          analytics
            .partnerCreate(adminKey, { kind: f.kind, name: f.name, description: f.description, lat: ll[0], lng: ll[1], ends: toIso(f.ends), price: Math.round(Number(f.price || 0) * 100), contact: f.contact, note: f.note })
            .then(() => {
              setMsg("Lieu partenaire publié ✓");
              setF((x) => ({ ...x, name: "", description: "", pos: "", price: "", contact: "", note: "" }));
              reload();
            })
            .catch((err: unknown) => setMsg(err instanceof Error ? err.message : "Erreur"));
        }}
      >
        <label className="text-xs text-muted">
          Type
          <select className={inputCls} value={f.kind} onChange={set("kind")}>
            {PARTNER_KINDS.map((k) => (
              <option key={k} value={k}>{PLACE_KINDS[k].icon} {PLACE_KINDS[k].label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Nom
          <input className={inputCls} value={f.name} onChange={set("name")} required maxLength={80} />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Description (visible dans la fiche)
          <input className={inputCls} value={f.description} onChange={set("description")} maxLength={600} />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Position (« lat, lng » ou lien de carte)
          <input className={inputCls} value={f.pos} onChange={set("pos")} placeholder="43.6108, 3.8767" required />
        </label>
        <label className="text-xs text-muted">
          Fin de l'annonce
          <input type="datetime-local" className={inputCls} value={f.ends} onChange={set("ends")} required />
        </label>
        <label className="text-xs text-muted">
          Prix payé (€)
          <input inputMode="decimal" className={inputCls} value={f.price} onChange={set("price")} placeholder="0" />
        </label>
        <label className="text-xs text-muted">
          Contact (privé)
          <input className={inputCls} value={f.contact} onChange={set("contact")} />
        </label>
        <label className="text-xs text-muted">
          Note (privée)
          <input className={inputCls} value={f.note} onChange={set("note")} />
        </label>
        <button type="submit" className="h-11 rounded-full bg-signal font-bold text-night sm:col-span-2">Publier le lieu partenaire</button>
        {msg && <p className="text-sm sm:col-span-2">{msg}</p>}
      </form>
      {error && <p className="mt-2 text-signal">{error}</p>}
      <ul className="mt-4 space-y-2">
        {data?.length === 0 && <li className="text-sm text-muted">Aucun partenaire pour l'instant.</li>}
        {data?.map((p) => (
          <li key={p.id} className={"rounded-xl bg-night px-3 py-2 text-sm " + (p.active ? "" : "opacity-60")}>
            <p className="font-bold">
              {PLACE_KINDS[p.kind as keyof typeof PLACE_KINDS]?.icon} {p.name}{" "}
              <span className={"ml-1 rounded-full px-2 text-[10px] " + (p.active ? "bg-[#f472b6] text-night" : "border border-line")}>
                {p.active ? `en ligne jusqu'au ${dt(p.partner_until)}` : "hors ligne"}
              </span>
            </p>
            <p className="text-xs text-muted">{nearestCity(p.lat, p.lng)} · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {p.listings.map((l) => (
                <li key={l.id} className={l.cancelled ? "line-through" : ""}>
                  {dt(l.starts_at)} → {dt(l.ends_at)} · {euros(l.price_cents)}{l.contact ? ` · ${l.contact}` : ""}{l.note ? ` · ${l.note}` : ""}
                  {!l.cancelled && (
                    <button type="button" className="ml-2 text-signal" onClick={() => void analytics.listingCancel(adminKey, l.id).then(reload)}>
                      annuler
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {extend?.id === p.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input type="datetime-local" className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" value={extend.ends} onChange={(e) => setExtend({ ...extend, ends: e.target.value })} />
                <input inputMode="decimal" className="h-9 w-20 rounded-lg border border-line bg-surface px-2 text-sm" placeholder="€" value={extend.price} onChange={(e) => setExtend({ ...extend, price: e.target.value.replace(",", ".") })} />
                <button
                  type="button"
                  className="h-9 rounded-full bg-signal px-3 text-xs font-bold text-night"
                  onClick={() =>
                    void analytics
                      .listingAdd(adminKey, p.id, null, toIso(extend.ends), Math.round(Number(extend.price || 0) * 100), "", "")
                      .then(() => {
                        setExtend(null);
                        reload();
                      })
                  }
                >
                  Ajouter
                </button>
              </div>
            ) : (
              <button type="button" className="mt-1 text-xs underline" onClick={() => setExtend({ id: p.id, ends: plusDays(30), price: "" })}>
                + Nouvelle période / renouveler
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
