import { useEffect, useRef, useState } from "react";
import { FloatingHearts, HeartPacks } from "./hearts";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShareLiveButton } from "./live-share";
import { ChevronUp, Crown, SwitchCamera, EyeOff, Flag, MoreHorizontal, Radio, MessageCircle, Mic, MicOff, RotateCcw, SlidersHorizontal, Video, VideoOff, X } from "lucide-react";
import { heartSend, myHearts, LIVE_TERMS_VERSION, liveAccept, liveAsk, turnServers, turnCached, liveEvent, rouletteLeave, rouletteNext, roulettePoll, roulettePollSignals, rouletteReport, rouletteSignal, type LiveCard } from "@/lib/hdar/live";
import { createBlurPipe, type BlurPipe } from "@/lib/hdar/blur-cam";
import { useRegion } from "@/lib/hdar/map-focus";
import { useHdar } from "@/lib/hdar/store";
import { startCall } from "@/lib/hdar/call";
import { usePhoto } from "@/lib/hdar/photos";
import { usePremium } from "@/lib/hdar/premium";
import { REPORT_REASONS } from "@/lib/hdar/report";
import { proLiveNext } from "@/lib/hdar/live";
import { PartnerBadge, ProGiftSheet, useMyPro } from "./pro-tools";
import { BroadcastOverlay, Chat, CoachMark, CoInvite, ConfirmBroadcast, useCoBroadcast, NextChevron, SoundToast, SwipeHint, WatchView, useBottomBar, useBroadcast, type ChatLine } from "./group-live";
import { groupEnabled, roomFeed, roomOf } from "@/lib/hdar/live";

/**
 * « Live » : vidéo au hasard, pair-à-pair (WebRTC). Le serveur choisit quelqu'un dans la région
 * (jamais à moins de 2 km) puis plus loin ; aucune position ni distance n'est jamais affichée.
 */
type Phase = "intro" | "searching" | "connecting" | "live";
type Filters = { iam: string[]; minAge: number | null; maxAge: number | null };

let turnCache: RTCIceServer[] = [];
function ice(): RTCIceServer[] {
  const s: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  const turn = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turn) s.push({ urls: turn.split(","), username: import.meta.env.VITE_TURN_USER as string | undefined, credential: import.meta.env.VITE_TURN_PASS as string | undefined });
  turnCache = turnCached().length ? turnCached() : turnCache;
  return [...s, ...turnCache];
}
function gathered(c: RTCPeerConnection) {
  if (c.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((r) => { const t = setTimeout(r, 700); c.addEventListener("icegatheringstatechange", () => { if (c.iceGatheringState === "complete") { clearTimeout(t); r(); } }); });
}
const label = (c: LiveCard) => [c.age ? `${c.age} ans` : null, c.iam || null, c.seeking ? `cherche ${c.seeking.split(",").join(", ")}` : null].filter(Boolean).join(" · ");

export function RouletteScreen({ demo, pro }: { demo?: { peer: LiveCard; premium?: boolean; unblurred?: boolean; online?: number }; pro?: string }) {
  const nav = useNavigate();
  const myPros = useMyPro();
  const proPlace = pro ? myPros.find((p) => p.id === pro) : undefined;
  const [giftOpen, setGiftOpen] = useState(false);
  const premiumState = usePremium((s) => s.premium);
  const premium = demo?.premium ?? premiumState;
  const [phase, setPhase] = useState<Phase>(demo ? "live" : "intro");
  const [peer, setPeer] = useState<LiveCard | null>(demo?.peer ?? null);
  const [prev, setPrev] = useState<LiveCard | null>(null);
  const [online, setOnline] = useState(demo?.online ?? 0);
  const [blurred, setBlurred] = useState(!demo?.unblurred);
  const blurRef = useRef(true);
  const pipe = useRef<BlurPipe | null>(null);
  const [mic, setMic] = useState(true);
  const [asked, setAsked] = useState(false);
  const [burst, setBurst] = useState(demo && typeof location !== "undefined" && location.search.includes("heart") ? 1 : 0);
  const [hearts, setHearts] = useState<number | null>(demo ? (typeof location !== "undefined" && location.search.includes("nohearts") ? 0 : 12) : null);
  const bottomBar = useBottomBar<HTMLDivElement>();
  const demoBc = !!demo && typeof location !== "undefined" && location.search.includes("bcast");
  const [packsOpen, setPacksOpen] = useState(!!demo && typeof location !== "undefined" && location.search.includes("packs"));
  useEffect(() => { if (!demo) void myHearts().then((h) => setHearts(h.unlimited ? Infinity : h.balance)).catch(() => undefined); }, [demo]);
  const sendHeart = async () => {
    if (!peerRef.current && !demo) return;
    if (!hearts) return setPacksOpen(true);
    setBurst(Date.now());
    if (demo) return setHearts(hearts - 1);
    try { const r = await heartSend(); setHearts(r.unlimited ? Infinity : r.balance); }
    catch (e) { const m = e instanceof Error ? e.message : ""; if (m.includes("no_hearts")) { setHearts(0); setPacksOpen(true); } else toast(m || "Impossible"); }
  };
  const [askSent, setAskSent] = useState(false);
  const [gotVideo, setGotVideo] = useState(!!demo);
  const [needTap, setNeedTap] = useState(false);
  const [theyBlur, setTheyBlur] = useState(!demo?.unblurred);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const dc = useRef<RTCDataChannel | null>(null);
  // chat privé du 1:1 (canal P2P) : marche aussi pendant une diffusion, le partenaire n'est jamais dans le salon
  const [p2pLines, setP2pLines] = useState<ChatLine[]>([]);
  const [p2pChat, setP2pChat] = useState(false);
  const sendP2P = (body: string, echo = true) => {
    const ch = dc.current;
    if (ch?.readyState === "open") ch.send(JSON.stringify({ chat: body }));
    else if (!demo) return void toast("Message non envoyé : connexion avec la personne en cours");
    if (echo) setP2pLines((l) => [...l, { key: `p${Date.now()}${Math.random()}`, pseudo: "Toi", body, mine: true }].slice(-30));
  };
  /** Dev uniquement : test de bout en bout avec vraie caméra (factice) et vrai LiveKit, sans compte. */
  const e2e = !!demo && import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("e2e");
    const [filters, setFilters] = useState<Filters>({ iam: [], minAge: null, maxAge: null });
  const [filterOpen, setFilterOpen] = useState(() => typeof location !== "undefined" && new URLSearchParams(location.search).has("filters"));
  const [reporting, setReporting] = useState(false);
  const [more, setMore] = useState(false);
  const [confirmBc, setConfirmBc] = useState(() => !!demo && typeof location !== "undefined" && location.search.includes("confirm"));
  const localRef = useRef<MediaStream | null>(null);
  const meVid = useRef<HTMLVideoElement>(null);
  const themVid = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const peerRef = useRef<LiveCard | null>(null);
  const after = useRef(0);
  const running = useRef(false);
  const touchY = useRef<number | null>(null);

  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  // Live à plusieurs (v52) : diffusion « Inviter » + fil de Lives à regarder
  const [gOn, setGOn] = useState(false);
  useEffect(() => { if (!pro && (!demo || e2e)) void groupEnabled().then(setGOn); }, [demo, pro, e2e]);
  const [watching, setWatching] = useState<string | null>(() => (e2e ? new URLSearchParams(location.search).get("watch") : null));
  const watchRef = useRef<string | null>(watching);
  const feed = useRef<{ at: number; rooms: string[]; seen: Set<string>; turn: number }>({ at: 0, rooms: [], seen: new Set(), turn: 0 });
  const bc = useBroadcast(() => outgoing(), () => localRef.current?.getAudioTracks()[0] ?? null);
  const broadcasting = !!bc.room || demoBc;
  // partenaire du 1:1 : « X diffuse » → il peut diffuser aussi (cam à 3+), uniquement s'il accepte
  const co = useCoBroadcast(() => outgoing(), () => localRef.current?.getAudioTracks()[0] ?? null);
  const [hostBc, setHostBc] = useState<{ room: string; n: number; names: string[] } | null>(() => (demo && typeof location !== "undefined" && location.search.includes("coinvite") ? { room: "demo", n: 3, names: ["Léo", "Sam", "Max"] } : null));
  const [coNo, setCoNo] = useState<string | null>(null);
  const [coWith, setCoWith] = useState<{ id: string; pseudo: string } | null>(null); // côté diffuseur
  const p2pSend = (m: object) => {
    if (e2e) ((window as unknown as { __p2pOut: object[] }).__p2pOut ??= []).push(m);
    if (dc.current?.readyState === "open") dc.current.send(JSON.stringify(m));
  };
  const onCoMsg = (d: { bc?: { room?: unknown; n?: unknown; names?: unknown } | null; co?: unknown }) => {
    if ("bc" in d) {
      const b = d.bc;
      if (b && typeof b.room === "string" && /^[0-9a-f-]{36}$/i.test(b.room)) setHostBc({ room: b.room, n: Number(b.n) || 0, names: Array.isArray(b.names) ? b.names.map(String).slice(0, 12) : [] });
      else { setHostBc(null); setCoNo(null); }
      return true;
    }
    if ("co" in d) { setCoWith(typeof d.co === "string" && d.co.length < 80 ? { id: d.co, pseudo: peerRef.current?.pseudo ?? peer?.pseudo ?? "?" } : null); return true; }
    return false;
  };
  if (e2e && typeof window !== "undefined") (window as unknown as { __p2pIn: typeof onCoMsg }).__p2pIn = onCoMsg;
  useEffect(() => { if (!hostBc && co.room) { void co.stop(); toast("La diffusion est terminée, tu es de nouveau en privé"); } }, [hostBc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!bc.room) { setCoWith(null); if (!demo || e2e) p2pSend({ bc: null }); } }, [bc.room]); // eslint-disable-line react-hooks/exhaustive-deps
  const coJoin = async () => { if (!hostBc) return; const id = await co.join(hostBc.room); if (id) { p2pSend({ co: id }); toast("📣 Tu diffuses avec " + (peer?.pseudo ?? "ton partenaire")); } };
  const coLeave = () => { void co.stop(); p2pSend({ co: null }); toast("Tu es de nouveau en privé"); };
  const closePc = () => { setHostBc(null); setCoWith(null); if (co.room) void co.stop(); dc.current = null; setP2pLines([]); setNeedTap(false); setTheyBlur(true); pc.current?.close(); pc.current = null; if (themVid.current) themVid.current.srcObject = null; };

  useEffect(() => { if (phase !== "intro") showPreview(); });
  useEffect(() => {
    if (!e2e || watchRef.current) return;
    let live = true;
    // le montage de dev peut passer deux fois : on attend 300 ms pour n'ouvrir la caméra qu'une fois (comme le vrai bouton « Entrer »)
    const t = setTimeout(() => live && void navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: { echoCancellation: true, noiseSuppression: true } }).then((s) => {
      if (!live) return s.getTracks().forEach((x) => x.stop());
      localRef.current = s; pipe.current = createBlurPipe(s); blurRef.current = blurred; showPreview();
    }), 300);
    return () => { live = false; clearTimeout(t); localRef.current?.getTracks().forEach((t) => t.stop()); pipe.current?.stop(); };
  }, [e2e]); // eslint-disable-line react-hooks/exhaustive-deps
  const [corner, setCorner] = useState<"tl" | "tr" | "bl" | "br">("br");
  const big = false;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const prevBox = useRef<HTMLDivElement>(null);
  const outgoing = () => (blurRef.current ? pipe.current?.track : localRef.current?.getVideoTracks()[0]) ?? null;
  const showPreview = () => { const v = localRef.current?.getVideoTracks()[0]; if (meVid.current && v && (meVid.current.srcObject as MediaStream | null)?.getVideoTracks()[0] !== v) { meVid.current.srcObject = new MediaStream([v]); void meVid.current.play().catch(() => undefined); } };
  const setBlur = async (b: boolean) => {
    blurRef.current = b; setBlurred(b);
    const v = outgoing();
    const sender = pc.current?.getSenders().find((x) => x.track?.kind === "video");
    if (sender && v) await sender.replaceTrack(v).catch(() => undefined);
    showPreview();
    if (dc.current?.readyState === "open") dc.current.send(JSON.stringify({ blur: b }));
    if (!b) setAsked(false);
    void bc.syncVideo(); void co.syncVideo();
  };
  const askSentRef = useRef(false);
  useEffect(() => { askSentRef.current = askSent; }, [askSent]);
  const ask = async () => {
    if (!premium) return void nav({ to: "/premium" });
    if (askSent) return toast("Demande déjà envoyée");
    if (demo) return setAskSent(true);
    try { await liveAsk(); setAskSent(true); toast("Demande envoyée 👀"); } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); }
  };

  
  const flushIce = async (c: RTCPeerConnection) => { if (!c.remoteDescription) return; const l = pendingIce.current; pendingIce.current = []; for (const x of l) await c.addIceCandidate(x).catch(() => undefined); };
  const makePc = () => {
    closePc();
    setGotVideo(false);
    const c = new RTCPeerConnection({ iceServers: ice() });
    const raw = localRef.current;
    if (raw) {
      const v = outgoing();
      const st = new MediaStream([...raw.getAudioTracks(), ...(v ? [v] : [])]);
      st.getTracks().forEach((t) => c.addTrack(t, st));
    }
    const wire = (ch: RTCDataChannel) => {
      dc.current = ch;
      ch.onopen = () => ch.send(JSON.stringify({ blur: blurRef.current }));
      ch.onmessage = (ev) => { try { const d = JSON.parse(String(ev.data)) as { blur?: boolean; chat?: string; bc?: { room?: unknown; n?: unknown; names?: unknown } | null; co?: unknown };
        if (onCoMsg(d)) return;
        if (typeof d.chat === "string") { const body = d.chat.slice(0, 200); setP2pLines((l) => [...l, { key: `p${Date.now()}${Math.random()}`, pseudo: peerRef.current?.pseudo ?? "?", body }].slice(-30)); setP2pChat(true); return; }
        const b = d.blur !== false; setTheyBlur((was) => { if (was && !b) toast(askSentRef.current ? "Il a accepté, il se montre 👀" : "Il se montre 👀"); return b; }); } catch { /* */ } };
    };
    c.ondatachannel = (e) => wire(e.channel);
    let batch: RTCIceCandidateInit[] = []; let bt: ReturnType<typeof setTimeout> | null = null;
    c.onicecandidate = (e) => {
      if (!e.candidate) return;
      batch.push(e.candidate.toJSON());
      if (!bt) bt = setTimeout(() => { bt = null; const to = peerRef.current?.id; const b = batch; batch = []; if (to && c === pc.current && b.length) void rouletteSignal(to, "live-ice", JSON.stringify(b)).catch(() => undefined); }, 250);
    };
    if (peerRef.current?.role === "offer") wire(c.createDataChannel("ctl"));
    // Un seul flux pour l'audio ET la vidéo : on ne réassigne pas srcObject à chaque piste (la 2e assignation annulait le
    // play() de la 1re -> AbortError -> on coupait le son à tort). « Son bloqué » seulement sur NotAllowedError.
    c.ontrack = (e) => {
      const v = themVid.current; if (!v) return;
      const cur = v.srcObject as MediaStream | null;
      if (e.streams[0]) { if (cur !== e.streams[0]) v.srcObject = e.streams[0]; }
      else if (cur) { if (!cur.getTracks().includes(e.track)) cur.addTrack(e.track); }
      else v.srcObject = new MediaStream([e.track]);
      v.muted = false;
      void v.play().then(() => setNeedTap(false)).catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "NotAllowedError") return;
        v.muted = true; setNeedTap(true); void v.play().catch(() => undefined);
      });
    };
    c.onconnectionstatechange = () => {
      if (c !== pc.current) return;
      if (c.connectionState === "connected") { clearWatch(); setPhase("live"); }
      if (c.connectionState === "failed") { logLive("failed"); toast("Connexion impossible, on passe au suivant"); void next(); }
    };
    pc.current = c;
    return c;
  };

  const lastNext = useRef(0);
  const watchdog = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearWatch = () => { watchdog.current.forEach(clearTimeout); watchdog.current = []; };
  const sendOffer = async (card: LiveCard, restart = false) => {
    const c = restart && pc.current ? pc.current : makePc();
    await c.setLocalDescription(await c.createOffer(restart ? { iceRestart: true } : undefined));
    await gathered(c);
    if (pc.current === c && peerRef.current?.id === card.id) await rouletteSignal(card.id, "live-offer", JSON.stringify(c.localDescription)).catch(() => undefined);
  };
  const tele = useRef<{ t0: number; done: boolean } | null>(null);
  const logLive = (outcome: "video" | "failed" | "abandon" | "timeout") => {
    const t = tele.current; if (!t || t.done || demo) return; t.done = true;
    const ms = Date.now() - t.t0; const c = pc.current;
    if (outcome !== "video" || !c) return void liveEvent(outcome, ms, "unknown");
    void c.getStats().then((st) => {
      let ice = "unknown"; let pairId = "";
      st.forEach((r) => { if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId; });
      st.forEach((r) => { if (r.type === "candidate-pair" && (r.id === pairId || (!pairId && r.nominated && r.state === "succeeded"))) { const l = st.get(r.localCandidateId), rm = st.get(r.remoteCandidateId); ice = l?.candidateType === "relay" || rm?.candidateType === "relay" ? "relay" : "direct"; } });
      void liveEvent("video", ms, ice);
    }).catch(() => void liveEvent("video", ms, "unknown"));
  };
  const matched = async (card: LiveCard) => {
    if (tele.current && !tele.current.done && Date.now() - tele.current.t0 > 3000) logLive("abandon");
    tele.current = { t0: Date.now(), done: false };
    peerRef.current = card; pendingIce.current = []; setPeer(card); setAsked(false); setAskSent(false); setPhase("connecting");
    clearWatch();
    const stuck = () => peerRef.current?.id === card.id && pc.current?.connectionState !== "connected";
    // Pas de connexion après 10 s : on renvoie l'offre (redémarrage ICE) ; après 30 s on passe au suivant.
    watchdog.current.push(setTimeout(() => { if (stuck() && card.role === "offer") void sendOffer(card, true).catch(() => undefined); }, 8000));
    watchdog.current.push(setTimeout(() => { if (stuck()) { toast("Connexion impossible avec cette personne (réseau), on passe au suivant"); logLive("timeout"); void next(); } }, 30000));
    if (card.role === "offer") await sendOffer(card);
  };

  /** Prochain Live à regarder dans le fil (un sur deux), sauf si je diffuse moi-même. */
  async function pickRoom(): Promise<string | null> {
    if (!gOn || bc.room || pro) return null;
    const f = feed.current;
    f.turn++;
    if (Date.now() - f.at > 15000) { try { f.rooms = (await roomFeed()).map((r) => r.room); f.at = Date.now(); } catch { f.rooms = []; } }
    const fresh = f.rooms.filter((r) => !f.seen.has(r));
    if (!fresh.length) { if (f.rooms.length && f.seen.size) f.seen.clear(); return null; }
    if (f.turn % 2 === 1 && online > 1 && !watchRef.current) return null; // alterne avec le 1:1 quand il y a du monde
    f.seen.add(fresh[0]);
    return fresh[0];
  }
  function enterWatch(room: string) {
    if (tele.current && !tele.current.done && Date.now() - tele.current.t0 > 3000) logLive("abandon");
    clearWatch(); closePc();
    const old = peerRef.current; peerRef.current = null; setPeer(null); if (old) setPrev(old);
    void rouletteLeave(false).catch(() => undefined);
    watchRef.current = room; setWatching(room);
  }
  async function next(back?: string) {
    if (!back) { const r = await pickRoom(); if (r) return enterWatch(r); }
    if (watchRef.current) { watchRef.current = null; setWatching(null); }
    if (tele.current && !tele.current.done && Date.now() - tele.current.t0 > 3000) logLive("abandon");
    lastNext.current = Date.now();
    clearWatch();
    closePc();
    const old = peerRef.current;
    peerRef.current = null; setPeer(null); setPhase("searching");
    if (old && !back) setPrev(old);
    try {
      const r = pro ? await proLiveNext(pro) : await rouletteNext(premium ? { ...filters, back: back ?? null } : { back: back ?? null });
      if (typeof r.online === "number") setOnline(r.online);
      if (r.back_gone) { toast("Cette personne n'est plus disponible"); return void next(); }
      if (r.id) await matched(r as LiveCard);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (!(m.includes("live_tooclose") && back)) toast(m.includes("live_nopos") ? "Active ta position : le Live ne te met jamais en relation avec quelqu'un à moins de 2 km" : m.includes("live_photo") ? "Le Live est réservé aux profils avec une photo validée" : m.includes("premium") ? "Réservé à hdar+" : m || "Live indisponible");
      if (m.includes("live_tooclose") && back) { stop(false); setPhase("intro"); setTooClose({ id: back, name: new URLSearchParams(location.search).get("name") || prev?.pseudo || "" }); return; }
      if (m.includes("live_nopos")) { stop(false); setGate("Active ta position pour entrer dans le Live."); setPhase("intro"); }
      else if (m.includes("live_photo") || m.includes("live_age") || m.includes("profil")) { stop(false); setGate(m.includes("live_age") ? "Indique ton âge." : m.includes("live_photo") ? "Ta première photo doit être validée." : "Crée ton profil."); setPhase("intro"); }
      if (m.includes("live_terms")) { localStorage.removeItem(`hdar-live-terms-v${LIVE_TERMS_VERSION}`); stop(); }
    }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") return toast("Ton navigateur ne gère pas la vidéo");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: { echoCancellation: true, noiseSuppression: true } });
      localRef.current = s;
      pipe.current = createBlurPipe(s);
      blurRef.current = !pro; setBlurred(!pro);
      showPreview();
    } catch { return toast("Caméra ou micro refusé. Autorise-les dans ton navigateur."); }
    void turnServers().then((l) => { if (l.length) turnCache = l; });
    running.current = true; (window as unknown as { __hdarLive?: boolean }).__hdarLive = true;
    try { const rows = await roulettePollSignals(0); after.current = rows.reduce((m, r) => Math.max(m, Number(r.id)), 0); } catch { /* */ }
    void loop();
    const w = new URLSearchParams(location.search).get("with");
    const target = w && /^[0-9a-f-]{36}$/i.test(w) ? w : undefined;
    // « Rejoindre son live » : s'il diffuse à plusieurs, on regarde sa diffusion (règle des 2 km vérifiée à l'entrée)
    if (target && (await groupEnabled())) { try { const r = await roomOf(target); if (r) return enterWatch(r); } catch { /* */ } }
    void next(target);
  }

  function stop(leave = true) {
    if (tele.current && !tele.current.done && peerRef.current && Date.now() - tele.current.t0 > 3000) logLive("abandon");
    running.current = false; (window as unknown as { __hdarLive?: boolean }).__hdarLive = false; setTimeout(() => (window as unknown as { __hdarIdle?: () => void }).__hdarIdle?.(), 1500);
    closePc();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pipe.current?.stop(); pipe.current = null;
    void bc.stop();
    watchRef.current = null; setWatching(null);
    void rouletteLeave(false).catch(() => undefined);
    if (leave) void nav({ to: "/" });
  }

  async function loop() {
    while (running.current) {
      if (watchRef.current) { await new Promise((r) => setTimeout(r, 1000)); continue; } // je regarde un Live à plusieurs
      try {
        const st = await roulettePoll();
        if (typeof st.online === "number") setOnline(st.online);
        if (st.id && st.id !== peerRef.current?.id) await matched(st as LiveCard); // offre ou réponse : jamais de match à sens unique
        else if (!st.id && peerRef.current) { if (st.peer_gone) toast("La personne est partie, on cherche quelqu'un d'autre"); void next(); }
        else if (!st.id && !peerRef.current && Date.now() - lastNext.current > 8000) void next(); // deux personnes en attente finissent par se croiser
        const rows = await roulettePollSignals(after.current);
        for (const r of rows) {
          after.current = Math.max(after.current, Number(r.id));
          const k = r.kind as string;
          if (!k.startsWith("live-") || r.from_id !== peerRef.current?.id) continue;
          if (k === "live-bye") { void next(); break; }
          if (k === "live-heart") { setBurst(Date.now()); toast("Tu as reçu un ❤️"); continue; }
          if (k === "live-ask") { if (blurRef.current) { setAsked(true); navigator.vibrate?.(120); } continue; }
          if (k === "live-ice") {
            try { pendingIce.current.push(...(JSON.parse(r.payload) as RTCIceCandidateInit[])); } catch { /* */ }
            if (pc.current) await flushIce(pc.current);
            continue;
          }
          if (k === "live-offer") {
            const c = pc.current && pc.current.signalingState === "stable" && pc.current.connectionState !== "closed" ? pc.current : makePc();
            await c.setRemoteDescription(JSON.parse(r.payload));
            await flushIce(c);
            await c.setLocalDescription(await c.createAnswer());
            await gathered(c);
            if (pc.current === c) await rouletteSignal(r.from_id, "live-answer", JSON.stringify(c.localDescription));
          } else if (k === "live-answer" && pc.current && pc.current.signalingState === "have-local-offer") {
            await pc.current.setRemoteDescription(JSON.parse(r.payload));
            await flushIce(pc.current);
          }
        }
      } catch { /* réseau : on réessaie */ }
      await new Promise((r) => setTimeout(r, peerRef.current && pc.current?.connectionState !== "connected" ? 400 : 1500));
    }
  }

  useEffect(() => () => { (window as unknown as { __hdarLive?: boolean }).__hdarLive = false; setTimeout(() => (window as unknown as { __hdarIdle?: () => void }).__hdarIdle?.(), 1500); if (running.current) { running.current = false; closePc(); localRef.current?.getTracks().forEach((t) => t.stop()); void rouletteLeave(false).catch(() => undefined); } }, []);
  const flip = async () => {
    const nextF = facing === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextF }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: nextF }, audio: false }));
      const track = fresh.getVideoTracks()[0];
      if (!track || !localRef.current) return;
      localRef.current.getVideoTracks().forEach((t) => { t.stop(); localRef.current!.removeTrack(t); });
      localRef.current.addTrack(track);
      pipe.current?.setSource(localRef.current);
      void bc.syncVideo(); void co.syncVideo();
      if (!blurRef.current) {
        const sender = pc.current?.getSenders().find((x) => x.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
      showPreview();
      setFacing(nextF);
    } catch { toast("Impossible de changer de caméra"); }
  };
  useEffect(() => { localRef.current?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic]); // eslint-disable-line react-hooks/exhaustive-deps

  const report = async (reason: string) => {
    setReporting(false);
    const p = peerRef.current;
    if (!p || demo) return;
    try { await rouletteReport(p.id, reason); toast("Signalé et bloqué. On passe au suivant."); } catch (e) { toast(e instanceof Error ? e.message : "Signalement impossible"); }
    setPrev(null);
    peerRef.current = null;
    void next();
  };

  const termsKey = `hdar-live-terms-v${LIVE_TERMS_VERSION}`;
  const [okTerms, setOkTerms] = useState(false);
  const enter = async () => {
    try { await liveAccept(); localStorage.setItem(termsKey, new Date().toISOString()); } catch (e) { return toast(e instanceof Error ? e.message : "Réessaie"); }
    void start();
  };
  const me = useHdar((s) => s.me);
  const [gate, setGate] = useState<string | null>(null);
  const [tooClose, setTooClose] = useState<{ id: string; name: string } | null>(null);
  if (tooClose) {
    const goChat = () => { useHdar.getState().openLive(tooClose.id, tooClose.name); void nav({ to: "/" }); };
    const goCall = () => { const t = tooClose; void nav({ to: "/" }); void startCall(t.id, t.name); };
    const hasProfile = !!me.pseudo;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur">
        <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[#FA6F6C]/40 bg-night p-6 text-center text-ink shadow-[0_0_60px_#FA6F6C55]">
          <span aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-[#FA6F6C] opacity-30 blur-3xl" />
          <span className="relative text-5xl">👀</span>
          <h2 className="relative mt-3 font-display text-2xl font-bold">Vous êtes trop proches</h2>
          <p className="relative mt-2 text-sm text-ink/80">Le Live, c'est pour rencontrer des gens plus loin. Cette personne est juste à côté : écris-lui directement en privé, et passez en appel vidéo à deux. Plus intime, et rien que pour vous deux.</p>
          {hasProfile ? <>
            <button type="button" onClick={goChat} className="relative mt-5 w-full rounded-full bg-[#FA6F6C] py-3.5 font-display text-lg font-bold text-night shadow-[0_0_30px_#FA6F6C88]">💬 Lui écrire en privé</button>
            <button type="button" onClick={goCall} className="relative mt-3 w-full rounded-full border border-[#FA6F6C]/60 py-3 font-bold text-[#FA6F6C]">🎥 Appel vidéo à deux</button>
          </> : (
            <button type="button" onClick={() => { useHdar.getState().setTab("me"); void nav({ to: "/" }); }} className="relative mt-5 w-full rounded-full bg-[#FA6F6C] py-3.5 font-display font-bold text-night">Crée ton profil pour lui écrire</button>
          )}
          <button type="button" onClick={() => { setTooClose(null); void nav({ to: "/" }); }} className="relative mt-4 text-sm text-ink/60 underline">Fermer</button>
        </div>
      </div>
    );
  }
  const missing = !me.pseudo ? "un pseudo" : pro ? null : !me.age ? "ton âge" : !me.photo ? "une photo" : null;
  if (phase === "intro" && !demo && (missing || gate)) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4 bg-night px-6 text-center text-ink">
        <span className="text-5xl">🎥</span>
        <h1 className="font-display text-2xl font-bold">Crée ton profil pour entrer dans le Live</h1>
        <p className="max-w-xs text-sm text-ink/80">{gate ?? `Il te manque ${missing}.`} Le Live est réservé aux profils avec un pseudo, un âge et une première photo validée.</p>
        <button type="button" onClick={() => { useHdar.getState().setTab("me"); void nav({ to: "/" }); }} className="w-full max-w-xs rounded-full bg-[#FA6F6C] py-3.5 font-display font-bold text-night">Compléter mon profil</button>
        <button type="button" onClick={() => void nav({ to: "/" })} className="text-sm text-ink/60">Retour à la carte</button>
      </div>
    );
  }
  if (phase === "intro") {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-5 overflow-hidden bg-night px-6 text-center text-ink">
        <span aria-hidden className="pointer-events-none absolute -top-10 -left-10 size-56 rounded-full bg-[#FA6F6C] opacity-40 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute right-0 bottom-20 size-64 rounded-full bg-[#A1E3C3] opacity-25 blur-3xl" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] shadow-[0_0_40px_#FA6F6C]"><Video className="size-9 text-night" /></span>
        <h1 className="relative font-display text-3xl font-bold">Live</h1>
        <p className="relative max-w-xs text-sm text-ink/80">Des gens au hasard, en vidéo. Glisse vers le haut pour passer au suivant.</p>
        <div className="relative max-w-xs space-y-2 rounded-2xl bg-white/5 p-4 text-left text-sm text-ink/90">
          <p>Ta caméra est envoyée en direct à la personne en face, <b>floutée sur ton téléphone avant l'envoi</b>. Ton image nette n'est jamais envoyée tant que tu n'appuies pas sur « te montrer ».</p>
          <p>Personne ne peut te déflouter à ta place. Rien n'est enregistré par hdar. Jamais personne à moins de 2 km, aucune distance affichée.</p>
          <p className="font-semibold text-[#FA6F6C]">Interdit : mineurs, exhibition non désirée, enregistrer ou capturer l'autre.</p>
        </div>
        {!(typeof localStorage !== "undefined" && localStorage.getItem(termsKey)) && (
          <label className="relative flex max-w-xs items-center gap-2 text-sm"><input type="checkbox" checked={okTerms} onChange={(e) => setOkTerms(e.target.checked)} className="size-5 accent-[#FA6F6C]" /> J'ai compris</label>
        )}
        <button type="button" disabled={!okTerms && !(typeof localStorage !== "undefined" && localStorage.getItem(termsKey))} onClick={() => void enter()} className="relative w-full max-w-xs rounded-full bg-gradient-to-r from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] py-3.5 font-display font-bold text-night shadow-[0_0_30px_#FA6F6C] disabled:opacity-40">Entrer dans le Live</button>
        <button type="button" onClick={() => void nav({ to: "/" })} className="relative text-sm text-ink/60">Retour à la carte</button>
      </div>
    );
  }

  if (watching) {
    return <>
      <WatchView key={watching} room={watching} onNext={() => { watchRef.current = null; setWatching(null); void next(); }} onExit={() => stop()}
        onTooClose={() => { watchRef.current = null; setWatching(null); const w = new URLSearchParams(location.search).get("with"); if (w) { stop(false); setPhase("intro"); setTooClose({ id: w, name: new URLSearchParams(location.search).get("name") || "" }); } else void next(); }} />
      <CoachMark group />
    </>;
  }
  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black text-white"
      onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => { const y0 = touchY.current; touchY.current = null; if (y0 != null && y0 - e.changedTouches[0].clientY > 70 && !demo) void next(); }}
      onWheel={(e) => { if (e.deltaY > 60 && !demo && phase !== "searching") void next(); }}>
      <video ref={themVid} autoPlay playsInline onPlaying={(e) => { if (e.currentTarget.videoWidth > 0) { setGotVideo(true); logLive("video"); } }} onResize={(e) => { if (e.currentTarget.videoWidth > 0) { setGotVideo(true); logLive("video"); } }} className="absolute inset-0 size-full object-cover" />
      {!bc.room && <SoundToast show={needTap} onTap={() => { const v = themVid.current; if (v) { v.muted = false; void v.play().catch(() => undefined); } setNeedTap(false); }} />}
      {demo && <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#3b2a3a,#0b0b10)]" style={{ filter: theyBlur ? "blur(28px)" : "none" }}><div className="absolute top-[22%] left-1/2 size-48 -translate-x-1/2 rounded-full bg-[#c9a58c]/70" /><div className="absolute top-[52%] left-1/2 h-80 w-80 -translate-x-1/2 rounded-t-full bg-[#2b3a55]" /></div>}
      {phase !== "live" && !demo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-night/70">
          <span className="size-14 animate-ping rounded-full bg-[#FA6F6C]/60" />
          <p className="font-display text-lg">{phase === "searching" ? "On cherche quelqu'un…" : "Connexion…"}</p>
          <p className="text-xs text-white/60">{online > 1 ? `${online} dans le Live` : "Reste là, ça arrive"}</p>
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {peer && <PeerPhoto id={peer.id} />}
        <div className="min-w-0 flex-1">
          {peer && <p className="truncate font-display text-xl font-bold">{peer.pseudo}{peer.premium && <span className="ml-1 text-sm">👑+</span>}</p>}
          {peer?.pro && <PartnerBadge name={peer.pro.name} />}
          {pro && !peer && <PartnerBadge name={proPlace?.name ?? "Live Pro"} />}
          {peer && !peer.pro && <p className="text-xs text-white/80">{label(peer)}</p>}
          {peer && <PeerRegion id={peer.id} demo={!!demo} />}
                    {peer?.note && <p className="mt-1 max-w-[16rem] truncate text-xs text-white/70">💬 {peer.note}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[11px] font-bold">● LIVE {online > 0 ? online : ""}</span>
          {gOn && !broadcasting && !co.room && <button type="button" data-testid="diffuser" aria-label="Diffuser à plusieurs" disabled={bc.busy} onClick={() => setConfirmBc(true)} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
            className="flex h-9 items-center gap-1 rounded-full border border-[#FA6F6C] bg-black/50 px-2.5 text-xs font-bold text-[#FA6F6C] backdrop-blur disabled:opacity-50"><Radio className="size-4" /> Diffuser</button>}
          <ShareLiveButton compact />
          <button type="button" aria-label="Quitter" onClick={() => stop()} className="flex size-9 items-center justify-center rounded-full bg-black/50"><X className="size-5" /></button>
        </div>
      </div>
      {peer && theyBlur && !broadcasting && (
        <button type="button" onClick={() => void ask()} disabled={askSent} className="absolute top-[62%] left-1/2 z-[5] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] px-4 py-2 text-sm font-bold text-night shadow-[0_0_20px_#fbbf24] disabled:opacity-60">
          {askSent ? "Demande envoyée 👀" : <>Demande à se voir 👀{!premium && <Crown className="ml-1 inline size-4" />}</>}
        </button>
      )}
      {asked && (
        <div className="absolute inset-x-6 top-1/3 z-20 animate-[pulse_1.6s_ease-in-out_infinite] rounded-3xl border border-[#fbbf24]/60 bg-night/90 p-4 text-center shadow-[0_0_40px_#fbbf24] backdrop-blur">
          <p className="font-display text-lg font-bold">{peer?.pseudo} {pro ? "aimerait vous voir" : "aimerait te voir"} 👀</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsked(false)} className="flex-1 rounded-full bg-white/10 py-2 text-sm">Non merci</button>
            <button type="button" onClick={() => { setAsked(false); void setBlur(false); }} className="flex-1 rounded-full bg-[#A1E3C3] py-2 text-sm font-bold text-night">Me montrer</button>
          </div>
        </div>
      )}
      {peer && (theyBlur || blurred || phase !== "live" || !gotVideo) && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-3xl bg-black/50 px-5 py-3 text-center text-sm font-semibold backdrop-blur">
          {phase !== "live" || !gotVideo ? <span className="inline-flex items-center gap-2">Connexion…</span> : theyBlur && <span className="inline-flex items-center gap-2"><EyeOff className="size-4" /> Caméra floutée</span>}
          {blurred && <span className="text-xs font-normal text-white/85">{pro ? "👆 Touchez votre aperçu pour vous montrer" : "👆 Touche ton aperçu pour te montrer"}</span>}
        </span>
      )}
      <div ref={prevBox}
        data-testid="self-preview" role="button" aria-label={blurred ? "Me montrer" : "Me flouter"} className={`absolute z-10 touch-none overflow-hidden rounded-2xl border border-white/20 bg-night shadow-xl ${drag ? "" : "transition-all duration-200"} ${big && !broadcasting ? "h-60 w-44" : "h-36 w-24"} ${drag ? "" : corner === "tl" ? "top-28 left-3" : corner === "tr" ? "top-28 right-3" : corner === "bl" ? "left-3" : "right-3"}`}
        style={drag ? { left: drag.x, top: drag.y } : corner[0] === "b" ? { bottom: "calc(var(--live-bb, 11rem) + 0.5rem)" } : undefined}
        onPointerDown={(e) => { const r = prevBox.current!.getBoundingClientRect(); dragStart.current = { x: e.clientX, y: e.clientY, ox: r.left, oy: r.top, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); e.stopPropagation(); }}
        onPointerMove={(e) => { const d = dragStart.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (!d.moved && Math.hypot(dx, dy) < 8) return; d.moved = true; setDrag({ x: d.ox + dx, y: d.oy + dy }); }}
        onPointerUp={(e) => {
          const d = dragStart.current; dragStart.current = null; e.stopPropagation();
          if (!d?.moved) { void setBlur(!blurred); return; }
          const r = prevBox.current!.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          setCorner(`${cy < window.innerHeight / 2 ? "t" : "b"}${cx < window.innerWidth / 2 ? "l" : "r"}` as "tl");
          setDrag(null);
        }}
        onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <video ref={meVid} autoPlay playsInline muted className="pointer-events-none size-full -scale-x-100 object-cover" style={{ filter: blurred ? "blur(4px)" : "none" }} />
        <span data-testid="self-badge" className={`absolute inset-x-1 bottom-1 rounded-full py-0.5 text-center text-[9px] font-bold ${blurred ? "bg-black/70" : "bg-[#A1E3C3] text-night"}`}>{blurred ? "Flouté · toucher" : "Visible"}</span>
        
      </div>
      {!broadcasting && <div ref={bottomBar} data-testid="bar" className="absolute inset-x-0 bottom-0 z-[11] bg-gradient-to-t from-black/60 to-transparent px-4 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-4">
          <Round label="Retourner la caméra" on={false} onClick={() => void flip()}><SwitchCamera className="size-5" /></Round>
          <Round label={mic ? "Couper le micro" : "Activer le micro"} on={!mic} onClick={() => setMic(!mic)}>{mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}</Round>
          <Round label={p2pChat ? "Fermer le chat" : "Chat privé"} on={p2pChat} onClick={() => setP2pChat(!p2pChat)}><MessageCircle className="size-5" /></Round>
          <Round label="Envoyer un cœur" on={false} onClick={() => void sendHeart()}>
            <span className="text-lg">❤️</span>
            <span className="absolute -top-1 -right-1 rounded-full bg-[#FA6F6C] px-1 text-[9px] font-bold text-night">{hearts === Infinity ? "∞" : hearts ?? "·"}</span>
          </Round>
          <Round label="Plus d'options" on={more} onClick={() => setMore(true)}><MoreHorizontal className="size-5" /></Round>
        </div>
      </div>}
      {!broadcasting && peer && <NextChevron onClick={() => !demo && void next()} />}
      {!broadcasting && <SwipeHint />}
      {!broadcasting && p2pChat && peer && <Chat room={null} lines={p2pLines} pops={[]} show canReport={false} reserve={corner === "br" ? "r" : corner === "bl" ? "l" : undefined} onP2P={sendP2P} />}
      {broadcasting && <BroadcastOverlay room={bc.room ?? "demo"} cam={bc.cam} onCam={() => void bc.toggleCam()} mic={mic} onMic={() => setMic(!mic)}
        onStop={() => void bc.stop()} lk={bc.lk} reserve={corner === "br" ? "r" : corner === "bl" ? "l" : undefined} p2p={peer ? { lines: p2pLines, send: sendP2P } : undefined}
        co={coWith} onState={(n, names) => bc.room && p2pSend({ bc: { room: bc.room, n, names } })} />}
      {hostBc && !co.room && !broadcasting && coNo !== hostBc.room && peer && <CoInvite pseudo={peer.pseudo ?? "?"} n={hostBc.n} names={hostBc.names} busy={co.busy} onYes={() => void coJoin()} onNo={() => setCoNo(hostBc.room)} />}
      {hostBc && co.room && (
        <div data-testid="co-badge" className="absolute top-[8.75rem] left-3 z-20 flex items-center gap-2" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <span className="rounded-full bg-[#FA6F6C] px-3 py-1 text-xs font-bold text-night shadow-[0_0_16px_#FA6F6C]">● Tu diffuses avec {peer?.pseudo} · 👁 {hostBc.n}</span>
          <button type="button" data-testid="co-stop" onClick={coLeave} className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold">Revenir en privé</button>
        </div>
      )}
      {hostBc && !co.room && !broadcasting && coNo === hostBc.room && <button type="button" data-testid="co-reopen" onClick={() => setCoNo(null)} className="absolute top-[8.75rem] left-3 z-20 rounded-full border border-[#FA6F6C] bg-black/60 px-3 py-1 text-xs font-bold text-[#FA6F6C]">📣 {peer?.pseudo} diffuse · 👁 {hostBc.n}</button>}
      {!demo && <CoachMark group={gOn} />}
      <FloatingHearts burst={burst} />
      {giftOpen && peer && proPlace && <ProGiftSheet places={[proPlace]} to={peer.id} pseudo={peer.pseudo} via="live" onClose={() => setGiftOpen(false)} />}
      {packsOpen && <HeartPacks empty={!hearts} onClose={() => setPacksOpen(false)} demo={demo ? [{ product: "hearts_10", kind: "hearts", label: "10 cœurs", price_cents: 199 }, { product: "hearts_50", kind: "hearts", label: "50 cœurs", price_cents: 699 }, { product: "hearts_150", kind: "hearts", label: "150 cœurs", price_cents: 1499 }] : undefined} />}
      {more && (
        <div data-testid="more-sheet" className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setMore(false)} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <div className="w-full space-y-2 rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink" onClick={(e) => e.stopPropagation()}>
            <MoreItem icon={<RotateCcw className="size-5" />} label="Revenir à la personne d'avant" crown={!premium} onClick={() => { setMore(false); if (!premium) return void nav({ to: "/premium" }); if (!prev) return toast("Personne avant"); void next(prev.id); }} />
            <MoreItem icon={<SlidersHorizontal className="size-5" />} label="Filtres Live" crown={!premium} onClick={() => { setMore(false); if (premium) setFilterOpen(true); else void nav({ to: "/premium" }); }} />
            {pro && <MoreItem icon={<span className="text-lg">🎁</span>} label="Cadeau pro" onClick={() => { setMore(false); if (peer && proPlace) setGiftOpen(true); }} />}
            <MoreItem icon={<Flag className="size-5" />} label={`Signaler ${peer?.pseudo ?? ""}`} danger onClick={() => { setMore(false); if (peer) setReporting(true); }} />
          </div>
        </div>
      )}
      {confirmBc && <ConfirmBroadcast onOk={() => { setConfirmBc(false); if (!demo || e2e) void bc.start(); }} onCancel={() => setConfirmBc(false)} />}
      {reporting && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={() => setReporting(false)}>
          <div className="w-full space-y-2 rounded-t-3xl bg-surface p-4 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display font-bold">Signaler {peer?.pseudo} — il sera bloqué tout de suite</p>
            {["Exhibition non désirée", ...REPORT_REASONS].map((r) => <button key={r} type="button" onClick={() => void report(r)} className="block w-full rounded-xl bg-night px-4 py-3 text-left text-sm">{r}</button>)}
          </div>
        </div>
      )}
      {filterOpen && (
        <div className="absolute inset-0 flex items-end bg-black/60" onClick={() => setFilterOpen(false)}>
          <div className="w-full space-y-4 rounded-t-3xl bg-surface p-5 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-bold">Filtres Live 👑+</p>
            <div className="flex gap-2">{["H", "F", "X"].map((g) => { const on = filters.iam.includes(g); return <button key={g} type="button" onClick={() => setFilters({ ...filters, iam: on ? filters.iam.filter((x) => x !== g) : [...filters.iam, g] })} className={`flex-1 rounded-full py-2 font-bold ${on ? "bg-[#FA6F6C] text-night" : "bg-night"}`}>{g}</button>; })}</div>
            <div className="flex items-center gap-2 text-sm">Âge
              <input type="number" min={18} max={99} placeholder="18" value={filters.minAge ?? ""} onChange={(e) => setFilters({ ...filters, minAge: e.target.value ? Number(e.target.value) : null })} className="w-20 rounded-xl bg-night px-3 py-2" /> à
              <input type="number" min={18} max={99} placeholder="99" value={filters.maxAge ?? ""} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value ? Number(e.target.value) : null })} className="w-20 rounded-xl bg-night px-3 py-2" /></div>
            <p className="text-xs text-ink/60">Avec hdar+, tu tombes aussi en priorité sur ceux qui cherchent ce que tu es.</p>
            <button type="button" onClick={() => { setFilterOpen(false); if (running.current) void next(); }} className="w-full rounded-full bg-[#FA6F6C] py-3 font-bold text-night">Appliquer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Round({ children, label: l, on, onClick }: { children: React.ReactNode; label: string; on: boolean; onClick: () => void }) {
  return <button type="button" aria-label={l} title={l} onClick={onClick} className={`relative flex size-11 items-center justify-center rounded-full backdrop-blur ${on ? "bg-white text-night" : "bg-black/35"}`}>{children}</button>;
}
function MoreItem({ icon, label: l, crown, danger, onClick }: { icon: React.ReactNode; label: string; crown?: boolean; danger?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold ${danger ? "bg-red-500/15 text-red-400" : "bg-night text-white"}`}>{icon}<span className="flex-1">{l}</span>{crown && <Crown className="size-4 text-[#fbbf24]" />}</button>;
}


function PeerPhoto({ id }: { id: string }) {
  const src = usePhoto(id === "demo" ? null : id);
  return <span className="size-12 shrink-0 overflow-hidden rounded-full border-2 border-[#FA6F6C] bg-[#c9a58c]/60">{src && <img src={src} alt="" className="size-full object-cover" />}</span>;
}

function PeerRegion({ id, demo }: { id: string; demo: boolean }) {
  const r = useRegion(demo ? null : id);
  const txt = demo ? "Hérault, France" : r;
  return txt ? <p className="text-xs text-white/70">📍 {txt}</p> : null;
}
