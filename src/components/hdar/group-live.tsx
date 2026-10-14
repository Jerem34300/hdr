import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Room, RoomEvent, Track, type LocalTrack, type LocalTrackPublication, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from "livekit-client";
import { Flag, LayoutGrid, MessageCircle, MessageCircleOff, Mic, MicOff, Video, VideoOff, X } from "lucide-react";
import { createBlurPipe, type BlurPipe } from "@/lib/hdar/blur-cam";
import { StageGrid, type Tile } from "./stage-grid";
import { myHearts, roomLeave, roomOpen, roomReportMsg, roomSay, roomStage, roomState, roomToken, rouletteReport, type RoomMsg, type RoomState } from "@/lib/hdar/live";
import { usePhoto } from "@/lib/hdar/photos";
import { REPORT_REASONS } from "@/lib/hdar/report";
import { HeartPacks } from "./hearts";

/**
 * Live à plusieurs : la personne qui diffuse touche « Inviter » et ouvre SA caméra aux gens qui font défiler le Live.
 * Les spectateurs regardent et chattent. Sur demande du diffuseur (ou d'eux-mêmes), et seulement s'ils acceptent,
 * ils peuvent allumer caméra / micro : SEUL le diffuseur les voit et les entend (permissions d'abonnement LiveKit,
 * appliquées par le serveur vidéo), jamais les autres spectateurs.
 * Le partenaire du 1:1 reste en privé (P2P) : son image n'est jamais envoyée au salon.
 */
/** Badge permanent : juste « 18+ ». La règle complète reste dans les règles d'entrée, le coach mark et les CGU. */
export const RULES = "18+";
export const FULL_RULES = "18+ · pas de nudité · enregistrement interdit";
/** Réactions du Live : toutes payantes, 1 réaction = 1 cœur du solde (packs Stripe, prix dans l'admin). Vérifié côté serveur (hdar_room_say). */
export const REACTIONS = ["🔥", "🥵", "😛", "❤️"] as const;

export function groupError(m: string): string {
  if (m.includes("room_viewers_full")) return "Ce Live est complet, on passe au suivant";
  if (m.includes("room_full") || /quota|limit|exceed|full/i.test(m)) return "Live à plusieurs complet, réessaie plus tard";
  if (m.includes("room_banned")) return "Tu ne peux plus entrer dans les Lives de cette personne aujourd'hui";
  if (m.includes("room_gone")) return "Ce Live est terminé";
  if (m.includes("live_nopos")) return "Active ta position : jamais personne à moins de 2 km dans le Live";
  if (m.includes("live_photo")) return "Le Live est réservé aux profils avec une photo validée";
  return m.replace(/^[a-z_]+: /, "") || "Live indisponible";
}

/** Mesure la barre du bas et publie sa hauteur dans --live-bb sur l'écran parent : le chat et l'aperçu se posent au-dessus, sans jamais la chevaucher. */
export function useBottomBar<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current, host = el?.parentElement;
    if (!el || !host) return;
    const set = () => host.style.setProperty("--live-bb", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
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

function Chat({ room, msgs, pops, show, canReport, reserve }: { room: string; msgs: RoomMsg[]; pops: { k: number; e: string }[]; show: boolean; canReport: boolean; reserve?: "l" | "r" }) {
  const [txt, setTxt] = useState("");
  const [rep, setRep] = useState<RoomMsg | null>(null);
  const demo = room === "demo";
  const [bal, setBal] = useState<number | null>(demo ? (location.search.includes("nohearts") ? 0 : 12) : null);
  const [packs, setPacks] = useState(demo && location.search.includes("packs"));
  useEffect(() => { if (!demo) void myHearts().then((h) => setBal(h.unlimited ? Infinity : h.balance)).catch(() => undefined); }, [demo]);
  const react = async (r: string) => {
    if (bal === 0) return setPacks(true);
    if (demo) return setBal((b) => (b ?? 1) - 1);
    try { const x = await roomSay(room, r, "react"); if (x) setBal(x.unlimited ? Infinity : x.balance ?? 0); }
    catch (e) { const m = e instanceof Error ? e.message : ""; if (m.includes("no_hearts")) { setBal(0); setPacks(true); } else toast(groupError(m)); }
  };
  const send = async () => {
    const b = txt.trim(); if (!b) return;
    try { await roomSay(room, b); setTxt(""); } catch (e) { toast(groupError(e instanceof Error ? e.message : "")); }
  };
  return (
    <>
      <div className="pointer-events-none absolute right-3 z-10 flex flex-col items-center gap-1" style={{ bottom: "calc(var(--live-bb, 9rem) + 4rem)" }}>
        {pops.map((p) => <span key={p.k} className="animate-[ping_1.2s_ease-out_1] text-3xl">{p.e}</span>)}
      </div>
      {show && (
        <div className={`absolute inset-x-0 z-10 ${reserve === "l" ? "pl-[7.5rem]" : "pl-3"} ${reserve === "r" ? "pr-[7.5rem]" : "pr-3"}`} style={{ bottom: "calc(var(--live-bb, 9rem) + 0.5rem)" }} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto pr-16 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]">
            {msgs.map((m) => (
              <li key={m.id}><button type="button" onClick={() => canReport && setRep(m)} className="max-w-full rounded-2xl bg-black/45 px-3 py-1 text-left text-sm backdrop-blur">
                <b className="text-[#FA6F6C]">{m.pseudo ?? "?"}</b> {m.body}</button></li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <input value={txt} maxLength={200} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} placeholder="Écris un message…"
              className="min-w-0 flex-1 rounded-full bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/50 backdrop-blur" />
            <div className="relative flex shrink-0 items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 backdrop-blur">
              {REACTIONS.map((r) => <button key={r} type="button" aria-label={`Réagir ${r} (1 cœur)`} onClick={() => void react(r)} className="text-[22px] leading-none">{r}</button>)}
              <span className="absolute -top-2 -right-1 rounded-full bg-[#FA6F6C] px-1 text-[9px] font-bold text-night">{bal === Infinity ? "∞" : bal ?? "·"}</span>
            </div>
          </div>
        </div>
      )}
      {packs && <HeartPacks empty={!bal} onClose={() => setPacks(false)} demo={demo ? [{ product: "hearts_10", kind: "hearts", label: "10 cœurs", price_cents: 199 }, { product: "hearts_50", kind: "hearts", label: "50 cœurs", price_cents: 699 }, { product: "hearts_150", kind: "hearts", label: "150 cœurs", price_cents: 1499 }] : undefined} />}
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
  const [lkRoom, setLkRoom] = useState<Room | null>(null);
  const vPub = useRef<LocalTrackPublication | null>(null);
  const clones = useRef<MediaStreamTrack[]>([]);
  const stop = async (r = room) => {
    const l = lk.current; lk.current = null; vPub.current = null; setLkRoom(null);
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
      const l = new Room({ adaptiveStream: true, dynacast: true });
      await l.connect(t.url, t.token, { autoSubscribe: true });
      lk.current = l; setLkRoom(l);
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
  const self = () => vPub.current?.track?.mediaStreamTrack ?? null;
  return { room, busy, cam, start, stop: () => stop(), syncVideo, setMic, toggleCam, lk: lkRoom, self };
}

/** Petite vidéo branchée sur une piste (LiveKit ou locale). */
function TrackVideo({ track, mirror, blur }: { track: MediaStreamTrack | RemoteTrack | null; mirror?: boolean; blur?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !track) return;
    if (track instanceof MediaStreamTrack) { el.srcObject = new MediaStream([track]); void el.play().catch(() => undefined); return () => { el.srcObject = null; }; }
    track.attach(el); return () => { track.detach(el); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`pointer-events-none size-full object-cover ${mirror ? "-scale-x-100" : ""}`} style={{ filter: blur ? "blur(10px)" : "none" }} />;
}

function Avatar({ id, pseudo }: { id: string; pseudo: string | null }) {
  const ph = usePhoto(id);
  return (
    <div className="flex size-full items-center justify-center bg-gradient-to-br from-[#2a1830] to-night">
      <span className="flex aspect-square w-1/2 max-w-28 items-center justify-center overflow-hidden rounded-full border-2 border-[#FA6F6C]/70 bg-[#c9a58c]/40 text-2xl font-bold">
        {ph ? <img src={ph} alt="" className="size-full scale-110 object-cover blur-md" /> : (pseudo ?? "?").slice(0, 1).toUpperCase()}
      </span>
    </div>
  );
}

export type Ask = { t: "ask"; what: "cam" | "mic" };
const ENC = new TextEncoder(), DEC = new TextDecoder();

/** Pistes (vidéo/son) que chaque spectateur envoie au diffuseur, et à lui seul. */
function useViewerMedia(lk: Room | null, audios: React.RefObject<HTMLDivElement | null>) {
  const [media, setMedia] = useState<Record<string, { video?: RemoteTrack; mic?: boolean }>>({});
  const [needTap, setNeedTap] = useState(false);
  useEffect(() => {
    if (!lk) return;
    const sync = () => {
      const m: Record<string, { video?: RemoteTrack; mic?: boolean }> = {};
      lk.remoteParticipants.forEach((p: RemoteParticipant) => {
        const v = p.getTrackPublication(Track.Source.Camera), a = p.getTrackPublication(Track.Source.Microphone);
        m[p.identity] = { video: v?.track && !v.isMuted ? v.track : undefined, mic: !!a?.track && !a.isMuted };
      });
      setMedia(m);
    };
    const onSub = (t: RemoteTrack) => { if (t.kind === Track.Kind.Audio && audios.current) audios.current.appendChild(t.attach()); sync(); };
    const onUnsub = (t: RemoteTrack) => { t.detach().forEach((e) => e.remove()); sync(); };
    const onAudio = () => setNeedTap(!lk.canPlaybackAudio);
    lk.on(RoomEvent.TrackSubscribed, onSub).on(RoomEvent.TrackUnsubscribed, onUnsub).on(RoomEvent.TrackMuted, sync).on(RoomEvent.TrackUnmuted, sync)
      .on(RoomEvent.ParticipantDisconnected, sync).on(RoomEvent.ParticipantConnected, sync).on(RoomEvent.AudioPlaybackStatusChanged, onAudio);
    sync();
    return () => { lk.off(RoomEvent.TrackSubscribed, onSub).off(RoomEvent.TrackUnsubscribed, onUnsub).off(RoomEvent.TrackMuted, sync).off(RoomEvent.TrackUnmuted, sync)
      .off(RoomEvent.ParticipantDisconnected, sync).off(RoomEvent.ParticipantConnected, sync).off(RoomEvent.AudioPlaybackStatusChanged, onAudio); };
  }, [lk, audios]);
  return { media, needTap, setNeedTap };
}

export type GridViewer = { id: string; pseudo: string | null; video?: RemoteTrack | MediaStreamTrack | null; mic?: boolean };
/** Les cases du diffuseur : lui-même + chaque spectateur (sa vidéo s'il la partage, sinon sa photo floutée). */
export function BroadcastGrid({ self, selfBlur, viewers, onAsk, onAct }: { self: MediaStreamTrack | null; selfBlur?: boolean; viewers: GridViewer[]; onAsk?: (id: string, what: "cam" | "mic") => void; onAct?: (id: string) => void }) {
  const [focus, setFocus] = useState<string | null>(null);
  const tiles: Tile[] = [
    { key: "me", node: <>{self ? <TrackVideo track={self} mirror blur={selfBlur} /> : <div className="size-full bg-night" />}<span className="absolute bottom-1 left-1 rounded-full bg-[#FA6F6C] px-1.5 text-[10px] font-bold text-night">Toi · en direct</span></> },
    ...viewers.map((v) => ({ key: v.id, node: (
      <>
        {v.video ? <TrackVideo track={v.video} /> : <Avatar id={v.id} pseudo={v.pseudo} />}
        <span className="absolute bottom-1 left-1 max-w-[70%] truncate rounded-full bg-black/60 px-1.5 text-[10px] font-bold">{v.mic ? "🎤 " : ""}{v.pseudo ?? "?"}</span>
        {onAsk && (
          <span className="absolute top-1 right-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
            {!v.video && <button type="button" aria-label={`Demander à ${v.pseudo} d'allumer sa caméra`} onClick={() => onAsk(v.id, "cam")} className="flex size-7 items-center justify-center rounded-full bg-black/60"><Video className="size-3.5" /></button>}
            {!v.mic && <button type="button" aria-label={`Demander à ${v.pseudo} d'allumer son micro`} onClick={() => onAsk(v.id, "mic")} className="flex size-7 items-center justify-center rounded-full bg-black/60"><Mic className="size-3.5" /></button>}
            {onAct && <button type="button" aria-label={`Gérer ${v.pseudo}`} onClick={() => onAct(v.id)} className="flex size-7 items-center justify-center rounded-full bg-black/60 text-xs">⋯</button>}
          </span>
        )}
      </>
    ) })),
  ];
  return <StageGrid tiles={tiles} focus={focus} onFocus={setFocus} />;
}

/** Surcouche du diffuseur (dans son 1:1) : grille animée, compteur, chat, demandes caméra/micro, faire sortir / expulser / signaler. */
export function BroadcastOverlay({ room, cam, onCam, onStop, lk, self, selfBlur, reserve }: { room: string; cam: boolean; onCam: () => void; onStop: () => void; lk: Room | null; self: () => MediaStreamTrack | null; selfBlur?: boolean; reserve?: "l" | "r" }) {
  const { st, msgs, pops } = useRoomState(room, () => { toast("Ton Live à plusieurs s'est arrêté"); onStop(); });
  const [chat, setChat] = useState(true);
  const [grid, setGrid] = useState(true);
  const [list, setList] = useState<string | true | false>(false);
  const audios = useRef<HTMLDivElement>(null);
  const { media, needTap, setNeedTap } = useViewerMedia(lk, audios);
  const act = async (action: "remove" | "kick", id: string) => {
    try { await roomStage(action, room, id); toast(action === "kick" ? "Expulsé de tes Lives pour 24 h" : "Fait sortir"); } catch (e) { toast(groupError(e instanceof Error ? e.message : "")); }
  };
  const ask = async (id: string, what: "cam" | "mic") => {
    try { await lk?.localParticipant.publishData(ENC.encode(JSON.stringify({ t: "ask", what } satisfies Ask)), { reliable: true, topic: "hdar", destinationIdentities: [id] }); toast(what === "cam" ? "Demande envoyée : il choisit d'allumer sa caméra ou non" : "Demande envoyée : il choisit d'allumer son micro ou non"); }
    catch { toast("Demande impossible"); }
  };
  const viewers: GridViewer[] = (st?.viewer_list ?? []).map((v) => ({ ...v, video: media[v.id]?.video, mic: media[v.id]?.mic }));
  const shown = list === true ? st?.viewer_list ?? [] : (st?.viewer_list ?? []).filter((v) => v.id === list);
  return (
    <>
      <div ref={audios} className="hidden" />
      <div className="absolute top-24 left-3 z-20 flex flex-col items-start gap-1.5">
        <button type="button" onClick={() => setList(true)} className="rounded-full bg-[#FA6F6C] px-3 py-1 text-xs font-bold text-night shadow-[0_0_16px_#FA6F6C]">📣 En diffusion · 👁 {st?.viewers ?? 0}/{st?.cap ?? 6}</button>
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/80">{RULES}</span>
        <div className="flex gap-1.5">
          <button type="button" aria-label={cam ? "Couper ta caméra pour les spectateurs" : "Rallumer ta caméra pour les spectateurs"} onClick={onCam} className={`flex size-9 items-center justify-center rounded-full ${cam ? "bg-white text-night" : "bg-white/15"}`}>{cam ? <Video className="size-4" /> : <VideoOff className="size-4" />}</button>
          <button type="button" aria-label={chat ? "Masquer le chat" : "Afficher le chat"} onClick={() => setChat(!chat)} className={`flex size-9 items-center justify-center rounded-full ${chat ? "bg-white text-night" : "bg-white/15"}`}>{chat ? <MessageCircle className="size-4" /> : <MessageCircleOff className="size-4" />}</button>
          <button type="button" aria-label={grid ? "Masquer les spectateurs" : "Afficher les spectateurs"} onClick={() => setGrid(!grid)} className={`flex size-9 items-center justify-center rounded-full ${grid ? "bg-white text-night" : "bg-white/15"}`}><LayoutGrid className="size-4" /></button>
          <button type="button" onClick={onStop} className="rounded-full bg-black/60 px-3 text-xs font-bold">Arrêter</button>
        </div>
      </div>
      {grid && (
        <div className="absolute inset-x-3 top-48 z-10 h-[38vh] rounded-3xl bg-black/35 p-1.5 backdrop-blur-sm">
          <BroadcastGrid self={self()} selfBlur={selfBlur} viewers={viewers} onAsk={(id, w) => void ask(id, w)} onAct={(id) => setList(id)} />
        </div>
      )}
      {needTap && <button type="button" onClick={() => { void lk?.startAudio(); setNeedTap(false); }} className="absolute top-[calc(12rem+38vh+0.5rem)] left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-bold text-night shadow-lg">🔊 Touche pour activer le son</button>}
      <Chat room={room} msgs={msgs} pops={pops} show={chat} canReport reserve={reserve} />
      {list !== false && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setList(false)}>
          <div className="max-h-[70%] w-full space-y-2 overflow-y-auto rounded-t-3xl bg-surface p-4 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-bold">Qui te regarde ({st?.viewers ?? 0}/{st?.cap ?? 6})</p>
            <p className="text-xs text-ink/60">Personne ne te voit à moins de 2 km. Ton partenaire en 1:1 n'est jamais montré. Un spectateur qui allume sa caméra ou son micro n'est vu et entendu que par toi.</p>
            {shown.length === 0 && <p className="py-3 text-sm text-ink/60">Personne pour l'instant. Reste là, les gens qui font défiler vont arriver.</p>}
            {shown.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-night px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold">{v.pseudo ?? "?"}</span>
                <button type="button" aria-label="Demander la caméra" onClick={() => void ask(v.id, "cam")} className="rounded-full bg-white/10 p-1.5"><Video className="size-3.5" /></button>
                <button type="button" aria-label="Demander le micro" onClick={() => void ask(v.id, "mic")} className="rounded-full bg-white/10 p-1.5"><Mic className="size-3.5" /></button>
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

/** Côté spectateur : on regarde et on entend la personne qui diffuse. Caméra / micro seulement si on accepte, et vus par elle seule. */
export function WatchView({ room, onNext, onExit, onTooClose }: { room: string; onNext: () => void; onExit: () => void; onTooClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null);
  const audios = useRef<HTMLDivElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [chat, setChat] = useState(true);
  const [reporting, setReporting] = useState(false);
  const bottomBar = useBottomBar<HTMLDivElement>();
  const lk = useRef<Room | null>(null);
  const hostId = useRef<string | null>(null);
  const done = useRef(false);
  // ce que j'envoie au diffuseur (et à lui seul)
  const [myCam, setMyCam] = useState(false);
  const [myMic, setMyMic] = useState(false);
  const [myBlur, setMyBlur] = useState(true);
  const [preview, setPreview] = useState<MediaStreamTrack | null>(null);
  const [asked, setAsked] = useState<"cam" | "mic" | null>(null);
  const mine = useRef<{ cam?: { pub: LocalTrack; raw: MediaStream; pipe: BlurPipe }; mic?: { pub: LocalTrack; raw: MediaStream } }>({});
  const unpublishAll = () => {
    const m = mine.current; mine.current = {};
    if (m.cam) { m.cam.pipe.stop(); m.cam.raw.getTracks().forEach((t) => t.stop()); }
    if (m.mic) m.mic.raw.getTracks().forEach((t) => t.stop());
    setMyCam(false); setMyMic(false); setPreview(null);
  };
  const leave = () => { if (done.current) return; done.current = true; unpublishAll(); void lk.current?.disconnect(); void roomLeave(room).catch(() => undefined); };
  const { st, msgs, pops } = useRoomState(room, (banned) => { toast(banned ? "Tu as été expulsé de ce Live" : "Ce Live est terminé"); leave(); onNext(); });
  const host = usePhoto(st?.host ?? null);
  /** Allume / éteint ma caméra ou mon micro — uniquement après un geste explicite (accepter / toucher le bouton). */
  const setMine = async (what: "cam" | "mic", on: boolean) => {
    const l = lk.current, h = hostId.current; if (!l || !h) return;
    try {
      if (!on) {
        const m = mine.current[what]; if (!m) return;
        await l.localParticipant.unpublishTrack(m.pub as LocalTrack, true).catch(() => undefined);
        if (what === "cam") { mine.current.cam?.pipe.stop(); mine.current.cam?.raw.getTracks().forEach((t) => t.stop()); delete mine.current.cam; setMyCam(false); setPreview(null); }
        else { mine.current.mic?.raw.getTracks().forEach((t) => t.stop()); delete mine.current.mic; setMyMic(false); }
        return;
      }
      if (mine.current[what]) return;
      // seul le diffuseur peut s'abonner à mes pistes (appliqué par le serveur vidéo)
      await l.localParticipant.setTrackSubscriptionPermissions(false, [{ participantIdentity: h, allowAll: true }]);
      if (what === "cam") {
        const raw = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
        const pipe = createBlurPipe(raw);
        const track = myBlur ? pipe.track : raw.getVideoTracks()[0];
        const pub = await l.localParticipant.publishTrack(track, { source: Track.Source.Camera, name: "cam", simulcast: false });
        mine.current.cam = { pub: pub.track as LocalTrack, raw, pipe }; setMyCam(true); setPreview(track);
      } else {
        const raw = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const pub = await l.localParticipant.publishTrack(raw.getAudioTracks()[0], { source: Track.Source.Microphone, name: "mic" });
        mine.current.mic = { pub: pub.track as LocalTrack, raw }; setMyMic(true);
      }
    } catch { toast(what === "cam" ? "Caméra indisponible" : "Micro indisponible"); }
  };
  const toggleBlur = async () => {
    const c = mine.current.cam; const n = !myBlur; setMyBlur(n); if (!c) return;
    const t = n ? c.pipe.track : c.raw.getVideoTracks()[0];
    await (c.pub as LocalTrack).replaceTrack(t, true).catch(() => undefined); setPreview(t);
  };
  useEffect(() => {
    done.current = false;
    let alive = true;
    void (async () => {
      try {
        const s0 = await roomState(room, 0).catch(() => null);
        if (s0?.gone) throw new Error("room_gone");
        hostId.current = s0?.host ?? null;
        const t = await roomToken(room);
        if (!alive) return;
        const l = new Room({ adaptiveStream: true, dynacast: true });
        lk.current = l;
        const attach = (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video && vid.current) { track.attach(vid.current); setHasVideo(!track.isMuted); }
          if (track.kind === Track.Kind.Audio && audios.current) { const el = track.attach(); audios.current.appendChild(el); }
        };
        // je ne m'abonne qu'au diffuseur, jamais aux autres spectateurs
        const want = (pub: RemoteTrackPublication, p: RemoteParticipant) => { if (p.identity === hostId.current) pub.setSubscribed(true); };
        l.on(RoomEvent.TrackPublished, want);
        l.on(RoomEvent.TrackSubscribed, (track, _pub, p) => { if (p.identity === hostId.current) attach(track); });
        l.on(RoomEvent.TrackMuted, (p, who) => { if (p.kind === Track.Kind.Video && who.identity === hostId.current) setHasVideo(false); });
        l.on(RoomEvent.TrackUnmuted, (p, who) => { if (p.kind === Track.Kind.Video && who.identity === hostId.current) setHasVideo(true); });
        l.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedTap(!l.canPlaybackAudio));
        l.on(RoomEvent.DataReceived, (payload, p, _k, topic) => {
          if (topic !== "hdar" || !p || p.identity !== hostId.current) return;
          try { const m = JSON.parse(DEC.decode(payload)) as Ask; if (m.t === "ask" && (m.what === "cam" || m.what === "mic")) setAsked(m.what); } catch { /* ignoré */ }
        });
        l.on(RoomEvent.Disconnected, () => { if (!done.current) { toast("Ce Live est terminé"); leave(); onNext(); } });
        await l.connect(t.url, t.token, { autoSubscribe: false });
        if (!alive) { void l.disconnect(); return; }
        await l.localParticipant.setTrackSubscriptionPermissions(false, hostId.current ? [{ participantIdentity: hostId.current, allowAll: true }] : []);
        setNeedTap(!l.canPlaybackAudio);
        l.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => want(pub, p)));
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
          <p className="text-xs text-white/80">📣 Diffuse en direct · {myCam || myMic ? `seul·e ${st?.host_pseudo ?? "la personne qui diffuse"} te ${myCam ? "voit" : "entend"}` : "tu regardes, personne ne te voit"}</p>
          <span className="mt-1 inline-block rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/80">{RULES}</span>
        </div>
        <span className="rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[11px] font-bold">● LIVE · 👁 {st?.viewers ?? 0}/{st?.cap ?? 6}</span>
        <button type="button" aria-label="Signaler" onClick={() => setReporting(true)} className="flex size-10 items-center justify-center rounded-full bg-red-500/80"><Flag className="size-5" /></button>
        <button type="button" aria-label="Quitter" onClick={() => { leave(); onExit(); }} className="flex size-10 items-center justify-center rounded-full bg-black/50"><X className="size-5" /></button>
      </div>
      <Chat room={room} msgs={msgs} pops={pops} show={chat} canReport />
      <div ref={bottomBar} className="absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center gap-2">
          <button type="button" aria-label={myCam ? "Éteindre ma caméra" : "Proposer ma caméra (seul le diffuseur la voit)"} onClick={() => myCam ? void setMine("cam", false) : setAsked("cam")} className={`flex size-11 items-center justify-center rounded-full ${myCam ? "bg-[#A1E3C3] text-night" : "bg-white/15"}`}>{myCam ? <Video className="size-5" /> : <VideoOff className="size-5" />}</button>
          <button type="button" aria-label={myMic ? "Couper mon micro" : "Proposer mon micro (seul le diffuseur l'entend)"} onClick={() => myMic ? void setMine("mic", false) : setAsked("mic")} className={`flex size-11 items-center justify-center rounded-full ${myMic ? "bg-[#A1E3C3] text-night" : "bg-white/15"}`}>{myMic ? <Mic className="size-5" /> : <MicOff className="size-5" />}</button>
          <button type="button" aria-label={chat ? "Masquer le chat" : "Afficher le chat"} onClick={() => setChat(!chat)} className={`flex size-11 items-center justify-center rounded-full ${chat ? "bg-white text-night" : "bg-white/15"}`}>{chat ? <MessageCircle className="size-5" /> : <MessageCircleOff className="size-5" />}</button>
        </div>
        <button type="button" onClick={() => { leave(); onNext(); }} className="w-full rounded-full bg-gradient-to-r from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] py-3 font-display font-bold text-night">Suivant <span className="text-xs font-normal opacity-70">· ou glisse vers le haut</span></button>
      </div>
      {preview && (
        <div className="absolute top-28 right-3 z-20 h-36 w-24 overflow-hidden rounded-2xl border-2 border-[#A1E3C3]" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <TrackVideo track={preview} mirror />
          <button type="button" onClick={() => void toggleBlur()} className={`absolute inset-x-1 bottom-1 rounded-full px-1 text-[9px] font-bold ${myBlur ? "bg-black/60" : "bg-[#A1E3C3] text-night"}`}>{myBlur ? "Flouté · me montrer" : "Visible · me flouter"}</button>
        </div>
      )}
      {asked && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/60" onClick={() => setAsked(null)} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <div className="w-full space-y-3 rounded-t-3xl bg-surface p-5 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-bold">{asked === "cam" ? "📷 Allumer ta caméra ?" : "🎤 Allumer ton micro ?"}</p>
            <p className="text-sm text-ink/75">{asked === "cam" ? "Seul·e" : "Seul·e"} <b>{st?.host_pseudo ?? "la personne qui diffuse"}</b> {asked === "cam" ? "te verra" : "t'entendra"}. Les autres spectateurs, jamais. {asked === "cam" ? "Tu restes flouté tant que tu ne choisis pas « me montrer »." : ""} Tu coupes quand tu veux.</p>
            <p className="text-[11px] text-ink/55">{FULL_RULES}</p>
            <button type="button" onClick={() => { const w = asked; setAsked(null); void setMine(w, true); }} className="w-full rounded-full bg-[#FA6F6C] py-3 font-display font-bold text-night">{asked === "cam" ? "Allumer ma caméra" : "Allumer mon micro"}</button>
            <button type="button" onClick={() => setAsked(null)} className="w-full rounded-full bg-night py-3 text-sm font-bold text-white">Non merci</button>
          </div>
        </div>
      )}
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

const COACH_KEY = "hdar-live-coach-v3";
export function CoachMark({ group }: { group: boolean }) {
  const [open, setOpen] = useState(() => typeof localStorage !== "undefined" && !localStorage.getItem(COACH_KEY));
  if (!open) return null;
  const close = () => { localStorage.setItem(COACH_KEY, "1"); setOpen(false); };
  const items: [string, string][] = [
    ["👆", "Glisse vers le haut pour passer au Live suivant, à l'infini."],
    ...(group ? [
      ["📣", "« Inviter » ouvre ta caméra aux gens qui font défiler le Live (6 places). Ton partenaire en 1:1 reste en privé : il n'est jamais montré."],
      ["👁", "Quand tu tombes sur quelqu'un qui diffuse, tu le vois, tu l'entends et tu chattes. Personne ne te voit, sauf si tu acceptes d'allumer ta caméra ou ton micro : seule la personne qui diffuse te voit alors, jamais les autres."],
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
