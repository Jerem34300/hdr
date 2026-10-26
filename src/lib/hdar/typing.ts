import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { typingTopic } from "./live";
import { supabase } from "./session";
import { useHdar } from "./store";
import { useAppearance } from "./appearance";

/** Indicateurs éphémères (Supabase Realtime Broadcast, canal privé) : rien n'est stocké. */
export type TypingKind = "text" | "photo" | "video" | "audio";
export type Typer = { id: string; pseudo: string; kind: TypingKind; at: number };
const TTL = 5000; // un indicateur s'efface seul après ~5 s sans nouvelle
const EVERY = 2500; // au plus un envoi toutes les 2,5 s (sauf changement d'action / arrêt)

export function useTyping(scope: "salon" | "area" | "dm", ref: string | null, pseudo: string, demo?: Typer[]) {
  const [typers, setTypers] = useState<Typer[]>(demo ?? []);
  const chan = useRef<RealtimeChannel | null>(null);
  const me = useRef<string | null>(null);
  const last = useRef<{ at: number; kind: TypingKind | "stop" }>({ at: 0, kind: "stop" });

  useEffect(() => {
    if (demo || !ref) return;
    let alive = true;
    let ch: RealtimeChannel | null = null;
    void typingTopic(scope, ref)
      .then(async (t) => {
        if (!alive || !t?.topic) return;
        me.current = t.me;
        const sb = supabase();
        const { data } = await sb.auth.getSession();
        if (data.session) await sb.realtime.setAuth(data.session.access_token);
        if (!alive) return;
        ch = sb.channel(t.topic, { config: { private: true, broadcast: { self: false } } });
        ch.on("broadcast", { event: "t" }, ({ payload }) => {
          const p = payload as { id?: string; pseudo?: string; kind?: string };
          if (!p?.id || p.id === me.current || useHdar.getState().blocks.includes(p.id)) return;
          setTypers((list) => {
            const rest = list.filter((x) => x.id !== p.id);
            if (p.kind === "stop") return rest;
            const kind = (["text", "photo", "video", "audio"].includes(p.kind ?? "") ? p.kind : "text") as TypingKind;
            return [...rest, { id: p.id!, pseudo: String(p.pseudo ?? "Quelqu'un").slice(0, 30), kind, at: Date.now() }];
          });
        }).subscribe();
        chan.current = ch;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (ch) void supabase().removeChannel(ch);
      chan.current = null;
      setTypers([]);
    };
  }, [scope, ref, demo]);

  // Expiration locale.
  useEffect(() => {
    if (demo) return;
    const id = setInterval(() => setTypers((l) => (l.some((x) => Date.now() - x.at > TTL) ? l.filter((x) => Date.now() - x.at <= TTL) : l)), 1000);
    return () => clearInterval(id);
  }, [demo]);

  const send = (kind: TypingKind | "stop") => {
    const ch = chan.current;
    if (!ch || !me.current || useAppearance.getState().typing === false) return;
    const now = Date.now();
    if (kind === last.current.kind && kind !== "stop" && now - last.current.at < EVERY) return;
    if (kind === "stop" && last.current.kind === "stop") return;
    last.current = { at: now, kind };
    void ch.send({ type: "broadcast", event: "t", payload: { id: me.current, pseudo, kind } });
  };
  return { typers, ping: (k: TypingKind = "text") => send(k), stop: () => send("stop") };
}

const VERB: Record<TypingKind, [string, string]> = {
  text: ["est en train d'écrire", "sont en train d'écrire"],
  photo: ["envoie une photo", "envoient une photo"],
  video: ["envoie une vidéo", "envoient une vidéo"],
  audio: ["enregistre un vocal", "enregistrent un vocal"],
};

/** « Nina est en train d'écrire… », « Nina, Sam sont en train d'écrire… », « Nina et 3 autres… ». */
export function typingText(typers: Typer[]) {
  if (!typers.length) return "";
  const kind = typers[typers.length - 1].kind;
  const same = typers.every((t) => t.kind === kind);
  if (typers.length === 1) return `${typers[0].pseudo} ${VERB[kind][0]}…`;
  const names = typers.length <= 3 ? typers.map((t) => t.pseudo).join(", ") : `${typers[0].pseudo}, ${typers[1].pseudo} et ${typers.length - 2} autres`;
  return same ? `${names} ${VERB[kind][1]}…` : `${names} sont actifs…`;
}
