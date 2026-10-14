import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Room, RoomEvent, Track, type LocalTrack, type LocalTrackPublication, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from "livekit-client";
import { ChevronUp, Flag, MessageCircle, MessageCircleOff, Mic, MicOff, MoreHorizontal, Radio, Video, VideoOff, X } from "lucide-react";
import { ShareLiveButton } from "./live-share";
import { createBlurPipe, type BlurPipe } from "@/lib/hdar/blur-cam";
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
  // ref « callback » : se remesure à chaque fois que la barre est (re)montée (diffusion ↔ 1:1)
  const ro = useRef<ResizeObserver | null>(null);
  return useCallback((el: T | null) => {
    ro.current?.disconnect(); ro.current = null;
    const host = el?.parentElement; if (!el || !host) return;
    const set = () => host.style.setProperty("--live-bb", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    ro.current = new ResizeObserver(set); ro.current.observe(el);
  }, []);
}

/** Chat et état du salon, sondés toutes les 1,5 s. */
function useRoomState(room: string | null, onGone: (banned: boolean) => void) {
  const [st, setSt] = useState<RoomState | null>(null);
  const [msgs, setMsgs] = useState<RoomMsg[]>([]);
  const [pops, setPops] = useState<{ k: number; e: string }[]>([]);
  const after = useRef(0);
  const kick = useRef<() => void>(() => undefined);
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
    kick.current = () => void tick();
    void tick();
    const t = setInterval(() => void tick(), 1500);
    return () => { on = false; clearInterval(t); };
  }, [room]);
  return { st, msgs, pops, refresh: () => kick.current() };
}

/** Une ligne du chat : message du salon (spectateurs) ou message privé du partenaire 1:1 (canal P2P). */
export type ChatLine = { key: string; pseudo: string | null; body: string; room?: RoomMsg; mine?: boolean };
export const roomLines = (msgs: RoomMsg[]): ChatLine[] => msgs.map((m) => ({ key: `r${m.id}`, pseudo: m.pseudo, body: m.body, room: m }));

/** Bandeau « son bloqué » : petit, en haut, ne recouvre jamais les boutons. N'apparaît que si le navigateur a VRAIMENT bloqué le son. */
export function SoundToast({ show, onTap }: { show: boolean; onTap: () => void }) {
  if (!show) return null;
  return (
    <button type="button" data-testid="sound-toast" onClick={onTap} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
      className="absolute top-[5.5rem] right-3 z-20 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-night shadow-lg">
      🔇 Son coupé par le navigateur · <u>activer</u>
    </button>
  );
}

function Chat({ room, lines, pops, show, canReport, reserve, onP2P, onSent }: { room: string | null; lines: ChatLine[]; pops: { k: number; e: string }[]; show: boolean; canReport: boolean; reserve?: "l" | "r"; onP2P?: (body: string, echo: boolean) => void; onSent?: () => void }) {
  const [txt, setTxt] = useState("");
  const [rep, setRep] = useState<RoomMsg | null>(null);
  const demo = room === "demo";
  const [bal, setBal] = useState<number | null>(demo ? (location.search.includes("nohearts") ? 0 : 12) : null);
  const [packs, setPacks] = useState(demo && location.search.includes("packs"));
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { if (room && !demo) void myHearts().then((h) => setBal(h.unlimited ? Infinity : h.balance)).catch(() => undefined); }, [room, demo]);
  useEffect(() => { const l = list.current; if (l) l.scrollTop = l.scrollHeight; }, [lines.length]);
  const react = async (r: string) => {
    if (!room) return;
    if (bal === 0) return setPacks(true);
    if (demo) return setBal((b) => (b ?? 1) - 1);
    try { const x = await roomSay(room, r, "react"); if (x) setBal(x.unlimited ? Infinity : x.balance ?? 0); }
    catch (e) { const m = e instanceof Error ? e.message : ""; if (m.includes("no_hearts")) { setBal(0); setPacks(true); } else toast(groupError(m)); }
  };
  const send = async () => {
    const b = txt.trim(); if (!b) return;
    setTxt("");
    onP2P?.(b, !room); // pendant une diffusion, l'écho vient déjà du salon : pas de doublon
    if (!room || demo) return;
    try { await roomSay(room, b); onSent?.(); } catch (e) { setTxt(b); toast(groupError(e instanceof Error ? e.message : "")); }
  };
  return (
    <>
      <div className="pointer-events-none absolute right-3 z-10 flex flex-col items-center gap-1" style={{ bottom: "calc(var(--live-bb, 9rem) + 6rem)" }}>
        {pops.map((p) => <span key={p.k} className="animate-[ping_1.2s_ease-out_1] text-3xl">{p.e}</span>)}
      </div>
      {show && (
        <div data-testid="chat" className={`absolute inset-x-0 z-10 ${reserve === "l" ? "pl-[7.5rem]" : "pl-3"} ${reserve === "r" ? "pr-[7.5rem]" : "pr-3"}`} style={{ bottom: "calc(var(--live-bb, 9rem) + 0.5rem)" }} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <ul ref={list} className="mb-2 max-h-40 space-y-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_25%)]">
            {lines.map((m) => (
              <li key={m.key} data-testid="chat-line"><button type="button" onClick={() => canReport && m.room && setRep(m.room)} className="max-w-full rounded-2xl bg-black/50 px-3 py-1 text-left text-sm backdrop-blur">
                <b className={m.mine ? "text-[#A1E3C3]" : "text-[#FA6F6C]"}>{m.pseudo ?? "?"}</b> {m.body}</button></li>
            ))}
          </ul>
          {room && (
            <div className="mb-1.5 flex items-center gap-2">
              {REACTIONS.map((r) => <button key={r} type="button" aria-label={`Réagir ${r} (1 cœur)`} onClick={() => void react(r)} className="flex size-9 items-center justify-center rounded-full bg-black/45 text-xl backdrop-blur">{r}</button>)}
              <span className="rounded-full bg-[#FA6F6C] px-1.5 text-[10px] font-bold text-night">{bal === Infinity ? "∞" : bal ?? "·"} ❤️</span>
            </div>
          )}
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input data-testid="chat-input" value={txt} maxLength={200} onChange={(e) => setTxt(e.target.value)} placeholder="Écris un message…" enterKeyHint="send"
              className="min-w-0 flex-1 rounded-full bg-black/55 px-4 py-2 text-sm text-white placeholder:text-white/50 backdrop-blur" />
            <button type="submit" aria-label="Envoyer" className="shrink-0 rounded-full bg-[#FA6F6C] px-4 py-2 text-sm font-bold text-night">Envoyer</button>
          </form>
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
export { Chat };

/**
 * Côté diffuseur : publie dans LiveKit LES MÊMES pistes caméra/micro que le 1:1 (aucune copie, aucun 2e getUserMedia).
 * La caméra n'est jamais ouverte deux fois. Couper la caméra « pour les spectateurs » met juste l'envoi LiveKit en pause
 * (pauseUpstream) : la piste partagée n'est jamais coupée ni arrêtée, le 1:1 continue.
 */
export function useBroadcast(getVideo: () => MediaStreamTrack | null, getAudio: () => MediaStreamTrack | null, opts?: { demoToken?: boolean }) {
  const [room, setRoom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(true);
  const lk = useRef<Room | null>(null);
  const [lkRoom, setLkRoom] = useState<Room | null>(null);
  const vPub = useRef<LocalTrackPublication | null>(null);
  const aPub = useRef<LocalTrackPublication | null>(null);
  const roomRef = useRef<string | null>(null);
  const stop = async (r = roomRef.current) => {
    const l = lk.current; lk.current = null; setLkRoom(null);
    // jamais stopper les pistes : elles appartiennent au 1:1
    for (const p of [vPub.current, aPub.current]) if (p?.track && l) await l.localParticipant.unpublishTrack(p.track, false).catch(() => undefined);
    vPub.current = null; aPub.current = null;
    await l?.disconnect(false).catch(() => undefined);
    if (r) await roomLeave(r).catch(() => undefined);
    roomRef.current = null; setRoom(null);
  };
  const start = async () => {
    if (busy || roomRef.current) return;
    setBusy(true);
    let id: string | null = null;
    try {
      id = (await roomOpen()).room;
      const t = await roomToken(id);
      if (t.configured === false || !t.token) throw new Error("room_full");
      const l = new Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: false });
      await l.connect(t.url, t.token, { autoSubscribe: true });
      void l.startAudio().catch(() => undefined); // dans la foulée du geste « Inviter » : débloque le son des spectateurs
      lk.current = l; setLkRoom(l);
      const v = getVideo(), a = getAudio();
      if (v) vPub.current = await l.localParticipant.publishTrack(v, { source: Track.Source.Camera, name: "cam", simulcast: false });
      if (a) aPub.current = await l.localParticipant.publishTrack(a, { source: Track.Source.Microphone, name: "mic" });
      roomRef.current = id; setRoom(id); setCam(true);
      toast("📣 Tu diffuses : les gens qui font défiler peuvent te regarder");
    } catch (e) {
      toast(groupError(e instanceof Error ? e.message : ""));
      await stop(id);
    } finally { setBusy(false); }
  };
  /** Flou / changement de caméra : on envoie la nouvelle piste du 1:1 (même objet), sans copie. */
  const syncVideo = async () => {
    const p = vPub.current; const src = getVideo(); if (!p?.track || !src || p.track.mediaStreamTrack === src) return;
    await p.track.replaceTrack(src, true).catch(() => undefined);
  };
  const toggleCam = async () => {
    const n = !cam; setCam(n); const t = vPub.current?.track; if (!t) return;
    await (n ? t.resumeUpstream() : t.pauseUpstream()).catch(() => undefined);
  };
  useEffect(() => () => { void stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  void opts;
  return { room, busy, cam, start, stop: () => stop(), syncVideo, toggleCam, lk: lkRoom };
}

/** Vidéo branchée UNE fois sur une piste (LiveKit ou locale) : pas de re-branchement à chaque rendu. */
export const TrackVideo = memo(function TrackVideo({ track, mirror, blur }: { track: MediaStreamTrack | RemoteTrack | null; mirror?: boolean; blur?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !track) return;
    if (track instanceof MediaStreamTrack) {
      if ((el.srcObject as MediaStream | null)?.getTracks()[0] !== track) el.srcObject = new MediaStream([track]);
      void el.play().catch(() => undefined);
      return;
    }
    track.attach(el); return () => { track.detach(el); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`pointer-events-none size-full object-cover ${mirror ? "-scale-x-100" : ""}`} style={{ filter: blur ? "blur(10px)" : "none" }} />;
});

function Avatar({ id, pseudo }: { id: string; pseudo: string | null }) {
  const ph = usePhoto(id);
  return (
    <div className="flex size-full items-center justify-center bg-gradient-to-br from-[#2a1830] to-night">
      <span className="flex aspect-square w-2/3 max-w-28 items-center justify-center overflow-hidden rounded-full border-2 border-[#FA6F6C]/70 bg-[#c9a58c]/40 text-lg font-bold">
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
    const onSub = (t: RemoteTrack) => { if (t.kind === Track.Kind.Audio && audios.current) { const el = t.attach(); el.dataset.lk = "audio"; audios.current.appendChild(el); setNeedTap(!lk.canPlaybackAudio); } sync(); };
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

/** Bandeau horizontal des spectateurs : n'apparaît que s'il y a du monde ; les cases entrent / sortent en s'animant. */
export function ViewerStrip({ viewers, onOpen }: { viewers: GridViewer[]; onOpen: (id: string) => void }) {
  const [gone, setGone] = useState<GridViewer[]>([]);
  const prev = useRef<GridViewer[]>([]);
  useEffect(() => {
    const left = prev.current.filter((p) => !viewers.some((v) => v.id === p.id));
    prev.current = viewers;
    if (!left.length) return;
    setGone((g) => [...g, ...left]);
    const t = setTimeout(() => setGone((g) => g.filter((x) => !left.includes(x))), 320);
    return () => clearTimeout(t);
  }, [viewers]);
  const all = [...viewers.map((v) => ({ v, out: false })), ...gone.filter((g) => !viewers.some((v) => v.id === g.id)).map((v) => ({ v, out: true }))];
  if (!all.length) return null;
  return (
    <div data-testid="viewer-strip" className="absolute inset-x-3 top-[11rem] z-10 flex gap-2 overflow-x-auto pb-1" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
      {all.map(({ v, out }) => (
        <button key={v.id} type="button" onClick={() => !out && onOpen(v.id)} aria-label={`Voir ${v.pseudo ?? "spectateur"}`}
          className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-night ring-1 ring-white/25 ${out ? "pointer-events-none animate-[tileout_.32s_ease-in_forwards]" : "animate-[tilein_.32s_cubic-bezier(.2,.8,.2,1)]"}`}>
          {v.video ? <TrackVideo track={v.video} /> : <Avatar id={v.id} pseudo={v.pseudo} />}
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[9px] font-bold">{v.mic ? "🎤 " : ""}{v.pseudo ?? "?"}</span>
        </button>
      ))}
    </div>
  );
}

/** Bouton de la barre du bas : rond compact (libellé en aria-label) ; « wide » = pilule avec texte (Arrêter la diffusion). */
export function BarBtn({ label, on, danger, wide, onClick, children, testid }: { label: string; on?: boolean; danger?: boolean; wide?: boolean; onClick: () => void; children: React.ReactNode; testid?: string }) {
  if (wide) return <button type="button" data-testid={testid} aria-label={label} onClick={onClick} className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold ${danger ? "bg-red-600 text-white" : "bg-white/15 text-white"}`}>{children}{label}</button>;
  return <button type="button" data-testid={testid} aria-label={label} title={label} onClick={onClick} className={`relative flex size-11 shrink-0 items-center justify-center rounded-full backdrop-blur ${danger ? "bg-red-600 text-white" : on ? "bg-white text-night" : "bg-black/35 text-white"}`}>{children}</button>;
}

/** Petite flèche « suivant » sur le bord droit (accessibilité) : hors de la zone de glissement centrale. */
export function NextChevron({ onClick, testid }: { onClick: () => void; testid?: string }) {
  return <button type="button" data-testid={testid ?? "next"} aria-label="Live suivant" onClick={onClick} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
    className="absolute top-1/2 right-1.5 z-[9] flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/80 backdrop-blur"><ChevronUp className="size-4" /></button>;
}

/** Indice « ↑ glisse pour la suite » : les 3 premières fois seulement, s'efface tout seul. */
const HINT_KEY = "hdar-live-swipehint";
export function SwipeHint() {
  const [show, setShow] = useState(() => { try { const n = Number(localStorage.getItem(HINT_KEY) ?? 0); if (n >= 3 && !location.search.includes("hint")) return false; localStorage.setItem(HINT_KEY, String(n + 1)); return true; } catch { return false; } });
  useEffect(() => { if (!show || location.search.includes("hint")) return; const t = setTimeout(() => setShow(false), 4000); return () => clearTimeout(t); }, [show]);
  if (!show) return null;
  return <span data-testid="swipe-hint" className="pointer-events-none absolute left-1/2 z-[9] -translate-x-1/2 animate-[pulse_2s_ease-in-out_infinite] rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur" style={{ bottom: "calc(var(--live-bb, 5rem) + 0.75rem)" }}>↑ glisse pour la suite</span>;
}

/** Confirmation avant d'ouvrir sa caméra au fil : pas de diffusion lancée par erreur. */
export function ConfirmBroadcast({ onOk, onCancel }: { onOk: () => void; onCancel: () => void }) {
  return (
    <div data-testid="confirm-bc" className="absolute inset-0 z-40 flex items-end bg-black/60" onClick={onCancel} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
      <div className="w-full space-y-3 rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink" onClick={(e) => e.stopPropagation()}>
        <p className="flex items-center gap-2 font-display text-lg font-bold"><Radio className="size-5 text-[#FA6F6C]" /> Ouvrir ta caméra aux gens qui font défiler ?</p>
        <p className="text-sm text-ink/75">Jusqu'à 6 personnes pourront te voir et t'entendre en même temps. Ton partenaire en face à face reste privé : il n'est jamais montré. Tu arrêtes quand tu veux.</p>
        <p className="text-[11px] text-ink/55">{FULL_RULES}</p>
        <button type="button" data-testid="confirm-bc-ok" onClick={onOk} className="w-full rounded-full bg-[#FA6F6C] py-3 font-display font-bold text-night">Diffuser</button>
        <button type="button" onClick={onCancel} className="w-full rounded-full bg-night py-3 text-sm font-bold text-white">Annuler</button>
      </div>
    </div>
  );
}

/**
 * Surcouche du diffuseur (dans son 1:1) : le partenaire reste en plein écran, UN seul petit aperçu de soi (celui du 1:1),
 * un badge « En diffusion », le bandeau des spectateurs, le chat et UNE barre de boutons nommés.
 */
export function BroadcastOverlay({ room, cam, onCam, mic, onMic, onStop, lk, reserve, p2p }: {
  room: string; cam: boolean; onCam: () => void; mic: boolean; onMic: () => void; onStop: () => void; lk: Room | null; reserve?: "l" | "r";
  p2p?: { lines: ChatLine[]; send: (b: string, echo: boolean) => void };
}) {
  const { st, msgs, pops, refresh } = useRoomState(room === "demo" ? null : room, () => { toast("Ta diffusion s'est arrêtée"); onStop(); });
  const [chat, setChat] = useState(true);
  const [list, setList] = useState<string | true | false>(false);
  const audios = useRef<HTMLDivElement>(null);
  const bar = useBottomBar<HTMLDivElement>();
  const { media, needTap, setNeedTap } = useViewerMedia(lk, audios);
  const act = async (action: "remove" | "kick", id: string) => {
    try { await roomStage(action, room, id); toast(action === "kick" ? "Expulsé de tes Lives pour 24 h" : "Fait sortir"); } catch (e) { toast(groupError(e instanceof Error ? e.message : "")); }
  };
  const ask = async (id: string, what: "cam" | "mic") => {
    try { await lk?.localParticipant.publishData(ENC.encode(JSON.stringify({ t: "ask", what } satisfies Ask)), { reliable: true, topic: "hdar", destinationIdentities: [id] }); toast(what === "cam" ? "Demande envoyée : il choisit d'allumer sa caméra ou non" : "Demande envoyée : il choisit d'allumer son micro ou non"); }
    catch { toast("Demande impossible"); }
  };
  const vl = st?.viewer_list;
  const viewers: GridViewer[] = useMemo(() => (vl ?? []).map((v) => ({ ...v, video: media[v.id]?.video, mic: media[v.id]?.mic })), [vl, media]);
  const shown = list === true ? vl ?? [] : (vl ?? []).filter((v) => v.id === list);
  const one = typeof list === "string" ? viewers.find((v) => v.id === list) : undefined;
  const lines = useMemo(() => [...roomLines(msgs), ...(p2p?.lines ?? [])], [msgs, p2p?.lines]);
  return (
    <>
      <div ref={audios} className="hidden" />
      <button type="button" data-testid="bc-badge" onClick={() => setList(true)} className="absolute top-[8.75rem] left-3 z-20 rounded-full bg-[#FA6F6C] px-3 py-1 text-xs font-bold text-night shadow-[0_0_16px_#FA6F6C]">
        ● En diffusion · 👁 {st?.viewers ?? 0}/{st?.cap ?? 12}
      </button>
      <ViewerStrip viewers={viewers} onOpen={(id) => setList(id)} />
      <SoundToast show={needTap} onTap={() => { void lk?.startAudio(); setNeedTap(false); }} />
      <Chat room={room} lines={lines} pops={pops} show={chat} canReport reserve={reserve} onP2P={p2p?.send} onSent={refresh} />
      <div ref={bar} data-testid="bc-bar" className="absolute inset-x-0 bottom-0 z-[12] bg-gradient-to-t from-black/60 to-transparent px-4 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-3">
          <BarBtn testid="bc-cam" label={cam ? "Couper ma caméra pour les spectateurs" : "Rallumer ma caméra pour les spectateurs"} on={!cam} onClick={onCam}>{cam ? <Video className="size-5" /> : <VideoOff className="size-5" />}</BarBtn>
          <BarBtn testid="bc-mic" label={mic ? "Couper le micro" : "Activer le micro"} on={!mic} onClick={onMic}>{mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}</BarBtn>
          <BarBtn testid="bc-chat" label={chat ? "Masquer le chat" : "Afficher le chat"} on={!chat} onClick={() => setChat(!chat)}>{chat ? <MessageCircle className="size-5" /> : <MessageCircleOff className="size-5" />}</BarBtn>
          <BarBtn testid="bc-stop" label="Arrêter la diffusion" danger wide onClick={onStop}><X className="size-4" /></BarBtn>
        </div>
      </div>
      {list !== false && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setList(false)} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <div className="max-h-[80%] w-full space-y-2 overflow-y-auto rounded-t-3xl bg-surface p-4 text-ink" onClick={(e) => e.stopPropagation()}>
            {one && <div data-testid="viewer-big" className="relative mx-auto aspect-[3/4] w-2/3 overflow-hidden rounded-2xl bg-night">{one.video ? <TrackVideo track={one.video} /> : <Avatar id={one.id} pseudo={one.pseudo} />}</div>}
            <p className="font-display text-lg font-bold">{one ? one.pseudo : `Qui te regarde (${st?.viewers ?? 0}/${st?.cap ?? 12})`}</p>
            <p className="text-xs text-ink/60">Ton partenaire en 1:1 n'est jamais montré. Un spectateur qui allume sa caméra ou son micro n'est vu et entendu que par toi.</p>
            {shown.length === 0 && <p className="py-3 text-sm text-ink/60">Personne pour l'instant. Reste là, les gens qui font défiler vont arriver.</p>}
            {shown.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-night px-3 py-2 text-sm text-white">
                <span className="min-w-0 flex-1 truncate font-bold">{v.pseudo ?? "?"}</span>
                <button type="button" onClick={() => void ask(v.id, "cam")} className="rounded-full bg-white/10 px-2 py-1 text-xs">📷 Demander caméra</button>
                <button type="button" onClick={() => void ask(v.id, "mic")} className="rounded-full bg-white/10 px-2 py-1 text-xs">🎤 Demander micro</button>
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
  const [more, setMore] = useState(false);
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
  const { st, msgs, pops, refresh } = useRoomState(room, (banned) => { toast(banned ? "Tu as été expulsé de ce Live" : "Ce Live est terminé"); leave(); onNext(); });
  const host = usePhoto(st?.host ?? null);
  const lines = useMemo(() => roomLines(msgs), [msgs]);
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
      <SoundToast show={needTap} onTap={() => { void lk.current?.startAudio(); setNeedTap(false); }} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-bold">{st?.host_pseudo ?? "…"}{st?.host_premium && <span className="ml-1 text-sm">👑+</span>}</p>
          <p className="text-xs text-white/80">📣 Diffuse en direct · {myCam || myMic ? `seul·e ${st?.host_pseudo ?? "la personne qui diffuse"} te ${myCam ? "voit" : "entend"}` : "tu regardes, personne ne te voit"}</p>
          <span className="mt-1 inline-block rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/80">{RULES}</span>
        </div>
        <span className="rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[11px] font-bold">● LIVE · 👁 {st?.viewers ?? 0}/{st?.cap ?? 6}</span>
        <ShareLiveButton compact />
        <button type="button" aria-label="Quitter" onClick={() => { leave(); onExit(); }} className="flex size-9 items-center justify-center rounded-full bg-black/50"><X className="size-5" /></button>
      </div>
      <Chat room={room} lines={lines} pops={pops} show={chat} canReport onSent={refresh} />
      <div ref={bottomBar} data-testid="watch-bar" className="absolute inset-x-0 bottom-0 z-[12] bg-gradient-to-t from-black/60 to-transparent px-4 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-4">
          <BarBtn testid="w-cam" label={myCam ? "Couper ma caméra" : "Allumer ma caméra (vue par la personne qui diffuse seulement)"} on={myCam} onClick={() => myCam ? void setMine("cam", false) : setAsked("cam")}>{myCam ? <Video className="size-5" /> : <VideoOff className="size-5" />}</BarBtn>
          <BarBtn testid="w-mic" label={myMic ? "Couper mon micro" : "Allumer mon micro"} on={myMic} onClick={() => myMic ? void setMine("mic", false) : setAsked("mic")}>{myMic ? <Mic className="size-5" /> : <MicOff className="size-5" />}</BarBtn>
          <BarBtn testid="w-chat" label={chat ? "Masquer le chat" : "Afficher le chat"} on={!chat} onClick={() => setChat(!chat)}>{chat ? <MessageCircle className="size-5" /> : <MessageCircleOff className="size-5" />}</BarBtn>
          <BarBtn testid="w-more" label="Plus d'options" on={more} onClick={() => setMore(true)}><MoreHorizontal className="size-5" /></BarBtn>
        </div>
      </div>
      <NextChevron testid="w-next" onClick={() => { leave(); onNext(); }} />
      <SwipeHint />
      {more && (
        <div data-testid="w-more-sheet" className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setMore(false)} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <div className="w-full space-y-2 rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setMore(false); setReporting(true); }} className="flex w-full items-center gap-3 rounded-xl bg-red-500/15 px-4 py-3 text-left text-sm font-semibold text-red-400"><Flag className="size-5" /> Signaler {st?.host_pseudo ?? ""}</button>
          </div>
        </div>
      )}
      {preview && (
        <button type="button" data-testid="w-self" aria-label={myBlur ? "Me montrer" : "Me flouter"} onClick={() => void toggleBlur()} className="absolute top-28 left-3 z-20 h-36 w-24 overflow-hidden rounded-2xl border-2 border-[#A1E3C3]" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <TrackVideo track={preview} mirror />
          <span className={`absolute inset-x-1 bottom-1 rounded-full py-0.5 text-[9px] font-bold ${myBlur ? "bg-black/70" : "bg-[#A1E3C3] text-night"}`}>{myBlur ? "Flouté · toucher" : "Visible"}</span>
        </button>
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
      ["📡", "« Diffuser » (en haut) ouvre ta caméra aux gens qui font défiler le Live (6 places). Ton partenaire en 1:1 reste en privé : il n'est jamais montré."],
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
