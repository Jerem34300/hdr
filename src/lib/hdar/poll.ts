/**
 * Rafraîchissement économe, commun à toute l'appli :
 * - seulement au premier plan (rien en arrière-plan, sauf `hidden` explicite) ;
 * - sonnette Realtime facultative : quand le canal est connecté, le polling passe au rythme lent `idle`,
 *   et chaque sonnette relance un chargement (regroupé, avec un petit délai aléatoire pour étaler la charge) ;
 * - en cas d'erreur : attente exponentielle avec gigue (jusqu'à 5 min), pour ne pas marteler une base en difficulté ;
 * - premières échéances décalées au hasard : 1 000 téléphones rouverts en même temps ne tapent pas la base ensemble.
 */
import { subscribeTopic } from "./rt";

export type PollOpts = {
  every: number; // rythme normal au premier plan (ms)
  idle?: number; // rythme quand la sonnette Realtime est connectée (ms)
  hidden?: number; // rythme en arrière-plan ; absent = pause
  topic?: string | null | Promise<string | null>; // sujet Realtime privé
  events?: string[]; // événements qui déclenchent un rechargement (défaut : « m »)
  immediate?: boolean; // premier chargement tout de suite (défaut : oui)
};

const MAX_BACKOFF = 5 * 60_000;
const jitter = (ms: number, k = 0.2) => ms * (1 - k + Math.random() * 2 * k);

export function startPoll(load: () => Promise<unknown> | unknown, o: PollOpts): () => void {
  let stop = false, timer = 0, running = false, again = false, fails = 0, live = false, unsub: (() => void) | null = null;
  const events = new Set(o.events ?? ["m"]);
  const schedule = (ms: number) => { window.clearTimeout(timer); if (!stop) timer = window.setTimeout(run, ms); };
  const next = () => {
    if (fails) return schedule(Math.min(MAX_BACKOFF, jitter(o.every * 2 ** fails, 0.5)));
    if (document.hidden) { if (o.hidden) schedule(jitter(o.hidden)); return; }
    schedule(jitter(live && o.idle ? o.idle : o.every));
  };
  async function run() {
    if (stop) return;
    if (document.hidden && !o.hidden) return; // reprise au retour au premier plan
    if (running) { again = true; return; }
    running = true;
    try { await load(); fails = 0; } catch { fails = Math.min(fails + 1, 8); }
    running = false;
    if (again) { again = false; return schedule(150); }
    next();
  }
  // sonnette : regroupe les rafales (un seul rechargement par 0,3-1 s)
  let soon = 0;
  const ring = () => { if (stop || document.hidden || soon) return; soon = window.setTimeout(() => { soon = 0; void run(); }, 300 + Math.random() * 700); };
  const onVis = () => { if (!document.hidden) schedule(jitter(400, 0.5)); };
  document.addEventListener("visibilitychange", onVis);
  if (o.immediate === false) schedule(jitter(o.every * 0.5, 0.9)); else void run();
  if (o.topic) void Promise.resolve(o.topic).then((t) => {
    if (stop || !t) return;
    unsub = subscribeTopic(t, (ev) => {
      if (ev === "ready") { live = true; next(); }
      else if (ev === "resync") { live = true; ring(); }
      else if (ev === "down") { live = false; next(); }
      else if (events.has(ev)) ring();
    });
  }).catch(() => undefined);
  return () => { stop = true; window.clearTimeout(timer); window.clearTimeout(soon); unsub?.(); document.removeEventListener("visibilitychange", onVis); };
}
