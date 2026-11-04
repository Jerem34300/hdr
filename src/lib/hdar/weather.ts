import { useEffect, useState } from "react";

/** Météo actuelle d'une zone (Open-Meteo, gratuit, sans clé).
 * Confidentialité : la position (déjà approximative) est encore arrondie à 0,1° (~10 km) avant tout appel ;
 * seule cette case part chez Open-Meteo, jamais la position exacte.
 * Charge : une requête par case et par 30 min et par appareil (cache mémoire + localStorage, requêtes en vol partagées). */
export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";
export type Weather = { temp: number; sky: Sky; day: boolean };

const TTL = 30 * 60_000;
const mem = new Map<string, { at: number; w: Weather | null }>();
const inflight = new Map<string, Promise<Weather | null>>();

export const weatherCell = (lat: number, lng: number) => `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lng * 10) / 10).toFixed(1)}`;

export function skyOf(code: number): Sky {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

export const SKY_LABEL: Record<Sky, string> = {
  clear: "Ciel dégagé", partly: "Éclaircies", cloudy: "Nuageux", fog: "Brouillard",
  drizzle: "Bruine", rain: "Pluie", snow: "Neige", storm: "Orage",
};

function readLS(cell: string): { at: number; w: Weather | null } | null {
  try { const r = JSON.parse(localStorage.getItem("hdar.wx." + cell) || "null"); return r && Date.now() - r.at < TTL ? r : null; } catch { return null; }
}

export async function weatherAt(lat: number, lng: number): Promise<Weather | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cell = weatherCell(lat, lng);
  const m = mem.get(cell) ?? readLS(cell);
  if (m && Date.now() - m.at < TTL) { mem.set(cell, m); return m.w; }
  const run = inflight.get(cell);
  if (run) return run;
  const [la, lo] = cell.split(",");
  const p = (async () => {
    let w: Weather | null = null;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code,is_day&timezone=auto`, { signal: ctl.signal, referrerPolicy: "no-referrer", credentials: "omit" });
      clearTimeout(t);
      if (r.ok) {
        const j = (await r.json()) as { current?: { temperature_2m?: number; weather_code?: number; is_day?: number } };
        const c = j.current;
        if (c && typeof c.temperature_2m === "number" && typeof c.weather_code === "number") w = { temp: Math.round(c.temperature_2m), sky: skyOf(c.weather_code), day: c.is_day !== 0 };
      }
    } catch { /* réseau indisponible : on masque simplement la météo */ }
    const e = { at: Date.now(), w };
    mem.set(cell, e);
    if (w) try { localStorage.setItem("hdar.wx." + cell, JSON.stringify(e)); } catch { /* quota */ }
    return w;
  })().finally(() => inflight.delete(cell));
  inflight.set(cell, p);
  return p;
}

export function useWeather(lat: number | null | undefined, lng: number | null | undefined, demo?: Weather) {
  const [w, setW] = useState<Weather | null>(demo ?? null);
  useEffect(() => {
    if (demo) { setW(demo); return; }
    setW(null);
    if (lat == null || lng == null) return;
    let a = true;
    void weatherAt(lat, lng).then((x) => a && setW(x));
    return () => { a = false; };
  }, [lat, lng, demo]);
  return w;
}
