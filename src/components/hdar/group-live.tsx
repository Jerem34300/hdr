import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Room, RoomEvent, Track, type LocalTrackPublication, type RemoteTrack } from "livekit-client";
import { Flag, MessageCircle, MessageCircleOff, Mic, MicOff, Video, VideoOff, X } from "lucide-react";
import { roomLeave, roomOpen, roomReportMsg, roomSay, roomStage, roomState, roomToken, rouletteReport, type RoomMsg, type RoomState } from "@/lib/hdar/live";
import { usePhoto } from "@/lib/hdar/photos";
import { REPORT_REASONS } from "@/lib/hdar/report";

/**
 * Live à plusieurs : la personne qui diffuse touche « Inviter » et ouvre SA caméra aux gens qui font défiler le Live.
 * Les spectateurs ne publient jamais rien (ni caméra ni micro) : ils regardent, chattent, réagissent.
 * Le partenaire du 1:1 reste en privé (P2P) : son image n'est jamais envoyée au salon.
 */
export const RULES = "18+ · pas de nudité · enregistrement interdit";
export const REACTIONS = ["🔥", "❤️", "😏"] as const;

export function groupError(m: string): string {
  if (m.includes("room_viewers_full")) return "Ce Live est complet, on passe au suivant";
  if (m.includes("room_full") || /quota|limit|exceed|full/i.test(m)) return "Live à plusieurs complet, réessaie plus tard";
  if (m.includes("room_banned")) return "Tu ne peux plus entrer dans les Lives de cette personne aujourd'hui";
  if (m.includes("room_gone")) return "Ce Live est terminé";
  if (m.includes("live_nopos")) return "Active ta position : jamais personne à moins de 2 km dans le Live";
  if (m.includes("live_photo")) return "Le Live est réservé aux profils avec une photo validée";
  return m.replace(/^[a-z_]+: /, "") || "Live indisponible";
}

/** Chat et état du salon, sondés toutes les 1,5 s. */
function useRoomState(room: string | null, onGone: (banned: boolean) => void) {
  const [st, setSt] = useState<RoomState | null>(null);
  const [msgs, setMsgs] = useState<RoomMsg[]>([]);
  const [pops, setPops] = useState<{ k: number; e: string }[]>([]);
  const after = useRef(0);
  const goneRef = useRef(onGone); goneRef.current = onGone;
  useEffect(() => {
    if (!room) return;
    let on = true; after.current = 0; setMsgs([]); setSt(null);
    const tick = async () => {
      try {
        const s = await roomState(room, after.current);
        if (!on) return;
        if (s.gone) { on = false; goneRef.current(!!s.banned); return; }
        setSt(s);
        if (s.msgs.length) {
          const first = after.current === 0;
          after.current = Math.max(after.current, ...s.msgs.map((m) => m.id));
          setMsgs((l) => [...l, ...s.msgs.filter((m) => m.kind !== "react")].slice(-30));
          if (!first) setPops((p) => [...p, ...s.msgs.filter((m) => m.kind === "react").map((m) => ({ k: m.id, e: m.body }))].slice(-12));
        }
      } catch { /* réseau */ }
    };
    void tick();
    const t = setInterval(() => void tick(), 1500);
    return () => { on = false; clearInterval(t); };
  }, [room]);
  return { st, msgs, pops };
}

function Chat({ room, msgs, pops, show, canReport }: { room: string; msgs: RoomMsg[]; pops: { k: number; e: string }[]; show: boolean; canReport: boolean }) {
  const [txt, setTxt] = useState("");
  const [rep, setRep] = useState<RoomMsg | null>(null);
  const send = async () => {
    const b = txt.trim(); if (!b) return;
    try { await roomSay(room, b); setTxt(""); } catch (e) { toast(groupError(e instanceof Error ? e.message : "")); }
  };
  return (
    <>
      <div className="pointer-events-none absolute right-3 bottom-44 z-10 flex flex-col items-center gap-1">
        {pops.map((p) => <span key={p.k} className="animate-[ping_1.2s_ease-out_1] text-3xl">{p.e}</span>)}
      </div>
      {show && (
        <div className="absolute inset-x-0 bottom-36 z-10 px-3" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto pr-16 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]">
            {msgs.map((m) => (
              <li key={m.id}><button type="button" onClick={() => canReport && setRep(m)} className="max-w-full rounded-2xl bg-black/45 px-3 py-1 text-left text-sm backdrop-blur">
                <b className="text-[#FA6F6C]">{m.pseudo ?? "?"}</b> {m.body}</button></li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <input value={txt} maxLength={200} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} placeholder="Écris un message…"
              className="min-w-0 flex-1 rounded-full bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/50 backdrop-blur" />
            {REACTIONS.map((r) => <button key={r} type="button" aria-label={`Réagir ${r}`} onClick={() => void roomSay(room, r, "react").catch(() => undefined)} className="text-2xl">{r}</button>)}
          </div>
        </div>
      )}
      {rep && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setRep(null)}>
          <div className="w-full space-y-2 rounded-t-3xl bg-surface p-4 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display font-bold">Signaler le message de {rep.pseudo}</p>
            {["Exhibition non désirée", ...REPORT_REASONS].map((r) => <button key={r} type="button" onClick={() => { void roomReportMsg(rep.id, r).then(() => toast("Signalé, merci")).catch(() => toast("Signalement impossible")); setRep(null); }} className="block w-full rounded-xl bg-night px-4 py-3 text-left text-sm">{r}</button>)}
          </div>
        </div>
      )}
    </>
  );
}

/** Côté diffuseur : publie une COPIE de sa caméra (floutée ou non, comme en 1:1) et de son micro. Jamais le partenaire. */
export function useBroadcast(getVideo: () => MediaStreamTrack | null, getAudio: () => MediaStreamTrack | null) {
  const [room, setRoom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(true);
  const lk = useRef<Room | null>(null);
  const vPub = useRef<LocalTrackPublication | null>(null);
  const clones = useRef<MediaStreamTrack[]>([]);
  const stop = async (r = room) => {
    const l = lk.current; lk.current = null; vPub.current = null;
    clones.current.forEach((t) => t.stop()); clones.current = [];
    await l?.disconnect().catch(() => undefined);
    if (r) await roomLeave(r).catch(() => undefined);
    setRoom(null);
  };
  const start = async () => {
    if (busy || room) return;
    setBusy(true);
    let id: string | null = null;
    try {
      id = (await roomOpen()).room;
      const t = await roomToken(id);
      if (t.configured === false || !t.token) throw new Error("room_full");
      const l = new Room({ adaptiveStream: false, dynacast: true });
      await l.connect(t.url, t.token);
      lk.current = l;
      const v = getVideo()?.clone(), a = getAudio()?.clone();
      if (v) { clones.current.push(v); vPub.current = await l.localParticipant.publishTrack(v, { source: Track.Source.Camera, name: "cam" }); }
      if (a) { clones.current.push(a); await l.localParticipant.publishTrack(a, { source: Track.Source.Microphone, name: "mic" }); }
      setRoom(id); setCam(true);
      toast("📣 Ton Live est ouvert : les gens qui font défiler peuvent te regarder");
    } catch (e) {
      toast(groupError(e instanceof Error ? e.message : ""));
      await stop(id);
    } finally { setBusy(false); }
  };
  /** Le flou (ou non) suit exactement l'image envoyée au 1:1. */
  const syncVideo = async () => {
    const p = vPub.current; const src = getVideo(); if (!p?.track || !src) return;
    const c = src.clone(); c.enabled = cam;
    await p.track.replaceTrack(c, true).catch(() => undefined);
    clones.current.forEach((t) => t.kind === "video" && t.stop());
    clones.current = [...clones.current.filter((t) => t.kind !== "video"), c];
  };
  const setMic = (on: boolean) => clones.current.forEach((t) => t.kind === "audio" && (t.enabled = on));
  const toggleCam = async () => { const n = !cam; setCam(n); const p = vPub.current; if (p) await (n ? p.unmute() : p.mute()).catch(() => undefined); };
  useEffect(() => () => { void stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { room, busy, cam, start, stop: () => stop(), syncVideo, setMic, toggleCam };
}

/** Surcouche du diffuseur (dans son 1:1) : compteur, chat, spectateurs (faire sortir / expulser / signaler). */
export function BroadcastOverlay({ room, cam, onCam, onStop }: { room: string; cam: boolean; onCam: () => void; onStop: () => void }) {
  const { st, msgs, pops } = useRoomState(room, () => { toast("Ton Live à plusieurs s'est arrêté"); onStop(); });
  const [chat, setChat] = useState(true);
  const [list, setList] = useState(false);
  const act = async (action: "remove" | "kick", id: string) => {
    try { await roomStage(action, room, id); toast(action === "kick" ? "Expulsé de tes Lives pour 24 h" : "Fait sortir"); } catch (e) { toast(groupError(e instanceof Error ? e.message : "")); }
  };
  return (
    <>
      <div className="absolute top-24 left-3 z-20 flex flex-col items-start gap-1.5">
        <button type="button" onClick={() => setList(true)} className="rounded-full bg-[#FA6F6C] px-3 py-1 text-xs font-bold text-night shadow-[0_0_16px_#FA6F6C]">📣 En diffusion · 👁 {st?.viewers ?? 0}/{st?.cap ?? 6}</button>
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/80">{RULES}</span>
        <div className="flex gap-1.5">
          <button type="button" aria-label={cam ? "Couper ta caméra pour les spectateurs" : "Rallumer ta caméra pour les spectateurs"} onClick={onCam} className={`flex size-9 items-center justify-center rounded-full ${cam ? "bg-white text-night" : "bg-white/15"}`}>{cam ? <Video className="size-4" /> : <VideoOff className="size-4" />}</button>
          <button type="button" aria-label={chat ? "Masquer le chat" : "Afficher le chat"} onClick={() => setChat(!chat)} className={`flex size-9 items-center justify-center rounded-full ${chat ? "bg-white text-night" : "bg-white/15"}`}>{chat ? <MessageCircle className="size-4" /> : <MessageCircleOff className="size-4" />}</button>
          <button type="button" onClick={onStop} className="rounded-full bg-black/60 px-3 text-xs font-bold">Arrêter</button>
        </div>
      </div>
      <Chat room={room} msgs={msgs} pops={pops} show={chat} canReport />
      {list && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setList(false)}>
          <div className="max-h-[70%] w-full space-y-2 overflow-y-auto rounded-t-3xl bg-surface p-4 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-bold">Qui te regarde ({st?.viewers ?? 0}/{st?.cap ?? 6})</p>
            <p className="text-xs text-ink/60">Personne ne te voit à moins de 2 km. Ton partenaire en 1:1 n'est jamais montré.</p>
            {(st?.viewer_list ?? []).length === 0 && <p className="py-3 text-sm text-ink/60">Personne pour l'instant. Reste là, les gens qui font défiler vont arriver.</p>}
            {(st?.viewer_list ?? []).map((v) => (
              <div key={v.id} className="flex items-center gap-2 rounded-xl bg-night px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold">{v.pseudo ?? "?"}</span>
                <button type="button" onClick={() => void act("remove", v.id)} className="rounded-full bg-white/10 px-2 py-1 text-xs">Faire sortir</button>
                <button type="button" onClick={() => void act("kick", v.id)} className="rounded-full bg-red-500/80 px-2 py-1 text-xs font-bold">Expulser 24 h</button>
                <button type="button" aria-label="Signaler" onClick={() => void rouletteReport(v.id, "Live à plusieurs (spectateur)").then(() => { toast("Signalé et bloqué"); void act("kick", v.id); }).catch(() => toast("Signalement impossible"))} className="rounded-full bg-white/10 p-1.5"><Flag className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Côté spectateur : on regarde seulement la personne qui diffuse. Rien n'est publié. */
export function WatchView({ room, onNext, onExit, onTooClose }: { room: string; onNext: () => void; onExit: () => void; onTooClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null);
  const audios = useRef<HTMLDivElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [chat, setChat] = useState(true);
  const [reporting, setReporting] = useState(false);
  const lk = useRef<Room | null>(null);
  const done = useRef(false);
  const leave = () => { if (done.current) return; done.current = true; void lk.current?.disconnect(); void roomLeave(room).catch(() => undefined); };
  const { st, msgs, pops } = useRoomState(room, (banned) => { toast(banned ? "Tu as été expulsé de ce Live" : "Ce Live est terminé"); leave(); onNext(); });
  const host = usePhoto(st?.host ?? null);
  useEffect(() => {
    done.current = false;
    let alive = true;
    void (async () => {
      try {
        const t = await roomToken(room);
        if (!alive) return;
        const l = new Room({ adaptiveStream: true, dynacast: true });
        lk.current = l;
        const attach = (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video && vid.current) { track.attach(vid.current); setHasVideo(!track.isMuted); }
          if (track.kind === Track.Kind.Audio && audios.current) { const el = track.attach(); audios.current.appendChild(el); }
        };
        l.on(RoomEvent.TrackSubscribed, (track) => attach(track));
        l.on(RoomEvent.TrackMuted, (p) => { if (p.kind === Track.Kind.Video) setHasVideo(false); });
        l.on(RoomEvent.TrackUnmuted, (p) => { if (p.kind === Track.Kind.Video) setHasVideo(true); });
        l.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedTap(!l.canPlaybackAudio));
        l.on(RoomEvent.Disconnected, () => { if (!done.current) { toast("Ce Live est terminé"); leave(); onNext(); } });
        await l.connect(t.url, t.token, { autoSubscribe: true });
        if (!alive) { void l.disconnect(); return; }
        setNeedTap(!l.canPlaybackAudio);
        l.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => pub.track && attach(pub.track as RemoteTrack)));
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (m.includes("live_tooclose")) { leave(); return onTooClose(); }
        toast(groupError(m)); leave(); onNext();
      }
    })();
    return () => { alive = false; leave(); };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps
  const touchY = useRef<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black text-white"
      onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => { const y0 = touchY.current; touchY.current = null; if (y0 != null && y0 - e.changedTouches[0].clientY > 70) { leave(); onNext(); } }}
      onWheel={(e) => { if (e.deltaY > 60) { leave(); onNext(); } }}>
      <video ref={vid} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />
      <div ref={audios} className="hidden" />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-night">
          <span className="size-28 overflow-hidden rounded-full border-2 border-[#FA6F6C] bg-[#c9a58c]/60">{host && <img src={host} alt="" className="size-full object-cover blur-md" />}</span>
          <p className="text-sm text-white/70">{st ? "Caméra coupée pour l'instant" : "Connexion…"}</p>
        </div>
      )}
      {needTap && <button type="button" onClick={() => { void lk.current?.startAudio(); setNeedTap(false); }} className="absolute top-40 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-bold text-night shadow-lg">🔊 Touche pour activer le son</button>}
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-bold">{st?.host_pseudo ?? "…"}{st?.host_premium && <span className="ml-1 text-sm">👑+</span>}</p>
          <p className="text-xs text-white/80">📣 Diffuse en direct · tu regardes, personne ne te voit</p>
          <span className="mt-1 inline-block rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/80">{RULES}</span>
        </div>
        <span className="rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[11px] font-bold">● LIVE · 👁 {st?.viewers ?? 0}/{st?.cap ?? 6}</span>
        <button type="button" aria-label="Signaler" onClick={() => setReporting(true)} className="flex size-10 items-center justify-center rounded-full bg-red-500/80"><Flag className="size-5" /></button>
        <button type="button" aria-label="Quitter" onClick={() => { leave(); onExit(); }} className="flex size-10 items-center justify-center rounded-full bg-black/50"><X className="size-5" /></button>
      </div>
      <Chat room={room} msgs={msgs} pops={pops} show={chat} canReport />
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center gap-2">
          <button type="button" aria-label={chat ? "Masquer le chat" : "Afficher le chat"} onClick={() => setChat(!chat)} className={`flex size-11 items-center justify-center rounded-full ${chat ? "bg-white text-night" : "bg-white/15"}`}>{chat ? <MessageCircle className="size-5" /> : <MessageCircleOff className="size-5" />}</button>
        </div>
        <button type="button" onClick={() => { leave(); onNext(); }} className="w-full rounded-full bg-gradient-to-r from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] py-3 font-display font-bold text-night">Suivant <span className="text-xs font-normal opacity-70">· ou glisse vers le haut</span></button>
      </div>
      {reporting && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setReporting(false)}>
          <div className="w-full space-y-2 rounded-t-3xl bg-surface p-4 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display font-bold">Signaler {st?.host_pseudo} — il sera bloqué tout de suite</p>
            {["Nudité", "Exhibition non désirée", ...REPORT_REASONS].map((r) => <button key={r} type="button" onClick={() => { setReporting(false); if (st) void rouletteReport(st.host, `Live à plusieurs — ${r}`).then(() => toast("Signalé et bloqué")).catch(() => undefined); leave(); onNext(); }} className="block w-full rounded-xl bg-night px-4 py-3 text-left text-sm">{r}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

const COACH_KEY = "hdar-live-coach-v2";
export function CoachMark({ group }: { group: boolean }) {
  const [open, setOpen] = useState(() => typeof localStorage !== "undefined" && !localStorage.getItem(COACH_KEY));
  if (!open) return null;
  const close = () => { localStorage.setItem(COACH_KEY, "1"); setOpen(false); };
  const items: [string, string][] = [
    ["👆", "Glisse vers le haut pour passer au Live suivant, à l'infini."],
    ...(group ? [
      ["📣", "« Inviter » ouvre ta caméra aux gens qui font défiler le Live (6 places). Ton partenaire en 1:1 reste en privé : il n'est jamais montré."],
      ["👁", "Quand tu tombes sur quelqu'un qui diffuse, tu regardes et tu chattes. Personne ne te voit, ni ta caméra ni ton micro."],
    ] as [string, string][] : []),
    ["📷", "Coupe ou rallume ta caméra 📷, ton micro 🎤 et le chat 💬 quand tu veux."],
    ["🚫", "18+, pas de nudité, enregistrement interdit. Jamais personne à moins de 2 km."],
  ];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-6 backdrop-blur" onClick={close}>
      <div className="w-full max-w-sm rounded-3xl border border-[#FA6F6C]/40 bg-night p-5 text-ink shadow-[0_0_50px_#FA6F6C55]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-xl font-bold">Comment marche le Live</p>
        <ul className="mt-3 space-y-2.5 text-sm">{items.map(([i, t]) => <li key={i} className="flex gap-2"><span className="text-xl">{i}</span><span>{t}</span></li>)}</ul>
        <button type="button" onClick={close} className="mt-4 w-full rounded-full bg-[#FA6F6C] py-3 font-display font-bold text-night">C'est parti</button>
      </div>
    </div>
  );
}
