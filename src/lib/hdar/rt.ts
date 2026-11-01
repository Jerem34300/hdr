/**
 * Canaux Realtime partagés : UN canal par sujet pour toute l'appli (compteur de références), quel que soit le nombre
 * d'écrans qui l'écoutent. Les « sonnettes » de la base (v127) sont des broadcasts vides : on relit la RPC habituelle.
 * À chaque (re)connexion du canal, les abonnés reçoivent l'événement « resync » (rattraper ce qui a pu être manqué).
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./session";

type Handler = (event: string, payload: unknown) => void;
type Entry = { ch: RealtimeChannel; hs: Set<Handler>; ok: boolean };
const chans = new Map<string, Entry>();
let authAt = 0;
let authing: Promise<void> | null = null;

async function ensureAuth() {
  if (Date.now() - authAt < 10 * 60_000) return;
  authing ??= (async () => {
    const sb = supabase();
    const { data } = await sb.auth.getSession();
    if (data.session) await sb.realtime.setAuth(data.session.access_token);
    authAt = Date.now();
  })().finally(() => (authing = null));
  await authing;
}

/** S'abonne à un sujet privé. Renvoie la fonction de désabonnement. */
export function subscribeTopic(topic: string, h: Handler): () => void {
  let e = chans.get(topic);
  if (e) { e.hs.add(h); if (e.ok) queueMicrotask(() => h("ready", null)); }
  else {
    const sb = supabase();
    const ch = sb.channel(topic, { config: { private: true, broadcast: { self: false } } });
    const entry: Entry = { ch, hs: new Set([h]), ok: false };
    chans.set(topic, entry);
    e = entry;
    ch.on("broadcast", { event: "*" }, (m) => { for (const f of entry.hs) f(String(m.event), m.payload); });
    void ensureAuth().catch(() => undefined).then(() => {
      if (chans.get(topic) !== entry) return;
      let joined = false;
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const ev = joined ? "resync" : "ready"; joined = true; entry.ok = true;
          for (const f of entry.hs) f(ev, null);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          entry.ok = false;
          for (const f of entry.hs) f("down", null);
        }
      });
    });
  }
  const entry = e;
  return () => {
    entry.hs.delete(h);
    if (!entry.hs.size && chans.get(topic) === entry) { chans.delete(topic); void supabase().removeChannel(entry.ch); }
  };
}

/** Envoi sur un sujet déjà ouvert (indicateurs « en train d'écrire »). */
export function sendTopic(topic: string, event: string, payload: Record<string, unknown>) {
  const e = chans.get(topic);
  if (e?.ok) void e.ch.send({ type: "broadcast", event, payload });
}

export const topicConnected = (topic: string) => !!chans.get(topic)?.ok;
