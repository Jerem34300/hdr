import { useEffect, useRef, useState } from "react";
import { FloatingHearts, HeartPacks } from "./hearts";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronUp, Crown, SwitchCamera, Eye, EyeOff, Flag, Mic, MicOff, RotateCcw, SlidersHorizontal, Video, VideoOff, X } from "lucide-react";
import { heartSend, myHearts, LIVE_TERMS_VERSION, liveAccept, liveAsk, turnServers, rouletteLeave, rouletteNext, roulettePoll, roulettePollSignals, rouletteReport, rouletteSignal, type LiveCard } from "@/lib/hdar/live";
import { createBlurPipe, type BlurPipe } from "@/lib/hdar/blur-cam";
import { useRegion } from "@/lib/hdar/map-focus";
import { useHdar } from "@/lib/hdar/store";
import { usePhoto } from "@/lib/hdar/photos";
import { usePremium } from "@/lib/hdar/premium";
import { REPORT_REASONS } from "@/lib/hdar/report";

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
  return [...s, ...turnCache];
}
function gathered(c: RTCPeerConnection) {
  if (c.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((r) => { const t = setTimeout(r, 2500); c.addEventListener("icegatheringstatechange", () => { if (c.iceGatheringState === "complete") { clearTimeout(t); r(); } }); });
}
const label = (c: LiveCard) => [c.age ? `${c.age} ans` : null, c.iam || null, c.seeking ? `cherche ${c.seeking.split(",").join(", ")}` : null].filter(Boolean).join(" · ");

export function RouletteScreen({ demo }: { demo?: { peer: LiveCard; premium?: boolean; unblurred?: boolean; online?: number } }) {
  const nav = useNavigate();
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
  const [hearts, setHearts] = useState<number | null>(demo ? 12 : null);
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
  const [theyBlur, setTheyBlur] = useState(!demo?.unblurred);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const dc = useRef<RTCDataChannel | null>(null);
    const [filters, setFilters] = useState<Filters>({ iam: [], minAge: null, maxAge: null });
  const [filterOpen, setFilterOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const localRef = useRef<MediaStream | null>(null);
  const meVid = useRef<HTMLVideoElement>(null);
  const themVid = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const peerRef = useRef<LiveCard | null>(null);
  const after = useRef(0);
  const running = useRef(false);
  const touchY = useRef<number | null>(null);

  const closePc = () => { dc.current = null; setTheyBlur(true); pc.current?.close(); pc.current = null; if (themVid.current) themVid.current.srcObject = null; };

  useEffect(() => { if (phase !== "intro") showPreview(); });
  const [corner, setCorner] = useState<"tl" | "tr" | "bl" | "br">("br");
  const [big, setBig] = useState(false);
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
  };
  const askSentRef = useRef(false);
  useEffect(() => { askSentRef.current = askSent; }, [askSent]);
  const ask = async () => {
    if (!premium) return void nav({ to: "/premium" });
    if (askSent) return toast("Demande déjà envoyée");
    if (demo) return setAskSent(true);
    try { await liveAsk(); setAskSent(true); toast("Demande envoyée 👀"); } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); }
  };

  const makePc = () => {
    closePc();
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
      ch.onmessage = (ev) => { try { const b = JSON.parse(String(ev.data)).blur !== false; setTheyBlur((was) => { if (was && !b) toast(askSentRef.current ? "Il a accepté, il se montre 👀" : "Il se montre 👀"); return b; }); } catch { /* */ } };
    };
    c.ondatachannel = (e) => wire(e.channel);
    if (peerRef.current?.role === "offer") wire(c.createDataChannel("ctl"));
    c.ontrack = (e) => { if (themVid.current) { themVid.current.srcObject = e.streams[0] ?? new MediaStream([e.track]); void themVid.current.play().catch(() => undefined); } };
    c.onconnectionstatechange = () => {
      if (c !== pc.current) return;
      if (c.connectionState === "connected") setPhase("live");
      if (c.connectionState === "failed") { toast("Connexion impossible, on passe au suivant"); void next(); }
    };
    pc.current = c;
    return c;
  };

  const matched = async (card: LiveCard) => {
    peerRef.current = card; setPeer(card); setAsked(false); setAskSent(false); setPhase("connecting");
    if (card.role === "offer") {
      const c = makePc();
      await c.setLocalDescription(await c.createOffer());
      await gathered(c);
      if (pc.current === c) await rouletteSignal(card.id, "live-offer", JSON.stringify(c.localDescription)).catch(() => undefined);
    }
  };

  async function next(back?: string) {
    closePc();
    const old = peerRef.current;
    peerRef.current = null; setPeer(null); setPhase("searching");
    if (old && !back) setPrev(old);
    try {
      const r = await rouletteNext(premium ? { ...filters, back: back ?? null } : {});
      if (typeof r.online === "number") setOnline(r.online);
      if (r.back_gone) { toast("Il n'est plus disponible"); return void next(); }
      if (r.id) await matched(r as LiveCard);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast(m.includes("live_photo") ? "Le Live est réservé aux profils avec une photo validée" : m.includes("premium") ? "Réservé à hdar+" : m || "Live indisponible");
      if (m.includes("live_photo") || m.includes("live_age") || m.includes("profil")) { stop(false); setGate(m.includes("live_age") ? "Indique ton âge." : m.includes("live_photo") ? "Ta première photo doit être validée." : "Crée ton profil."); setPhase("intro"); }
      if (m.includes("live_terms")) { localStorage.removeItem(`hdar-live-terms-v${LIVE_TERMS_VERSION}`); stop(); }
    }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") return toast("Ton navigateur ne gère pas la vidéo");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: { echoCancellation: true, noiseSuppression: true } });
      localRef.current = s;
      pipe.current = createBlurPipe(s);
      blurRef.current = true; setBlurred(true);
      showPreview();
    } catch { return toast("Caméra ou micro refusé. Autorise-les dans ton navigateur."); }
    turnCache = await turnServers();
    running.current = true;
    try { const rows = await roulettePollSignals(0); after.current = rows.reduce((m, r) => Math.max(m, Number(r.id)), 0); } catch { /* */ }
    void loop();
    void next();
  }

  function stop(leave = true) {
    running.current = false;
    closePc();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pipe.current?.stop(); pipe.current = null;
    void rouletteLeave(false).catch(() => undefined);
    if (leave) void nav({ to: "/" });
  }

  async function loop() {
    while (running.current) {
      try {
        const st = await roulettePoll();
        if (typeof st.online === "number") setOnline(st.online);
        if (st.id && st.id !== peerRef.current?.id && st.role === "answer") await matched(st as LiveCard);
        const rows = await roulettePollSignals(after.current);
        for (const r of rows) {
          after.current = Math.max(after.current, Number(r.id));
          const k = r.kind as string;
          if (!k.startsWith("live-") || r.from_id !== peerRef.current?.id) continue;
          if (k === "live-bye") { void next(); break; }
          if (k === "live-heart") { setBurst(Date.now()); toast("Tu as reçu un ❤️"); continue; }
          if (k === "live-ask") { if (blurRef.current) { setAsked(true); navigator.vibrate?.(120); } continue; }
          if (k === "live-offer") {
            const c = makePc();
            await c.setRemoteDescription(JSON.parse(r.payload));
            await c.setLocalDescription(await c.createAnswer());
            await gathered(c);
            if (pc.current === c) await rouletteSignal(r.from_id, "live-answer", JSON.stringify(c.localDescription));
          } else if (k === "live-answer" && pc.current && pc.current.signalingState === "have-local-offer") {
            await pc.current.setRemoteDescription(JSON.parse(r.payload));
          }
        }
      } catch { /* réseau : on réessaie */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  useEffect(() => () => { if (running.current) { running.current = false; closePc(); localRef.current?.getTracks().forEach((t) => t.stop()); void rouletteLeave(false).catch(() => undefined); } }, []);
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
      if (!blurRef.current) {
        const sender = pc.current?.getSenders().find((x) => x.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
      showPreview();
      setFacing(nextF);
    } catch { toast("Impossible de changer de caméra"); }
  };
  useEffect(() => { localRef.current?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic]);

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
  const missing = !me.pseudo ? "un pseudo" : !me.age ? "ton âge" : !me.photo ? "une photo" : null;
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
        <p className="relative max-w-xs text-sm text-ink/80">Des mecs au hasard, en vidéo. Glisse vers le haut pour passer au suivant.</p>
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

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black text-white"
      onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => { const y0 = touchY.current; touchY.current = null; if (y0 != null && y0 - e.changedTouches[0].clientY > 70 && !demo) void next(); }}
      onWheel={(e) => { if (e.deltaY > 60 && !demo && phase !== "searching") void next(); }}>
      <video ref={themVid} autoPlay playsInline className="absolute inset-0 size-full object-cover" />
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
          {peer && <p className="text-xs text-white/80">{label(peer)}</p>}
          {peer && <PeerRegion id={peer.id} demo={!!demo} />}
                    {peer?.note && <p className="mt-1 max-w-[16rem] truncate text-xs text-white/70">💬 {peer.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[11px] font-bold">● LIVE {online > 0 ? online : ""}</span>
          <button type="button" aria-label="Quitter" onClick={() => stop()} className="flex size-10 items-center justify-center rounded-full bg-black/50"><X className="size-5" /></button>
        </div>
      </div>
      {peer && <button type="button" aria-label={blurred ? "Me montrer" : "Me flouter"} onClick={() => void setBlur(!blurred)} className="absolute inset-x-0 top-28 bottom-48" />}
      {peer && theyBlur && (
        <button type="button" onClick={() => void ask()} disabled={askSent} className="absolute top-[60%] left-1/2 z-[5] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] px-4 py-2 text-sm font-bold text-night shadow-[0_0_20px_#fbbf24] disabled:opacity-60">
          {askSent ? "Demande envoyée 👀" : <>Demande à se voir 👀{!premium && <Crown className="ml-1 inline size-4" />}</>}
        </button>
      )}
      {asked && (
        <div className="absolute inset-x-6 top-1/3 z-20 animate-[pulse_1.6s_ease-in-out_infinite] rounded-3xl border border-[#fbbf24]/60 bg-night/90 p-4 text-center shadow-[0_0_40px_#fbbf24] backdrop-blur">
          <p className="font-display text-lg font-bold">{peer?.pseudo} aimerait te voir 👀</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsked(false)} className="flex-1 rounded-full bg-white/10 py-2 text-sm">Non merci</button>
            <button type="button" onClick={() => { setAsked(false); void setBlur(false); }} className="flex-1 rounded-full bg-[#A1E3C3] py-2 text-sm font-bold text-night">Me montrer</button>
          </div>
        </div>
      )}
      {peer && (theyBlur || blurred) && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-3xl bg-black/50 px-5 py-3 text-center text-sm font-semibold backdrop-blur">
          {theyBlur && <span className="inline-flex items-center gap-2"><EyeOff className="size-4" /> Il est flouté</span>}
          {blurred && <span className="text-xs font-normal text-white/85">👆 Appuie au milieu pour te montrer</span>}
        </span>
      )}
      <div ref={prevBox}
        className={`absolute z-10 touch-none overflow-hidden rounded-2xl border border-white/20 bg-night shadow-xl ${drag ? "" : "transition-all duration-200"} ${big ? "h-60 w-44" : "h-36 w-24"} ${drag ? "" : corner === "tl" ? "top-28 left-3" : corner === "tr" ? "top-28 right-3" : corner === "bl" ? "bottom-44 left-3" : "bottom-44 right-3"}`}
        style={drag ? { left: drag.x, top: drag.y } : undefined}
        onPointerDown={(e) => { const r = prevBox.current!.getBoundingClientRect(); dragStart.current = { x: e.clientX, y: e.clientY, ox: r.left, oy: r.top, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); e.stopPropagation(); }}
        onPointerMove={(e) => { const d = dragStart.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (!d.moved && Math.hypot(dx, dy) < 8) return; d.moved = true; setDrag({ x: d.ox + dx, y: d.oy + dy }); }}
        onPointerUp={(e) => {
          const d = dragStart.current; dragStart.current = null; e.stopPropagation();
          if (!d?.moved) { setBig((b) => !b); return; }
          const r = prevBox.current!.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          setCorner(`${cy < window.innerHeight / 2 ? "t" : "b"}${cx < window.innerWidth / 2 ? "l" : "r"}` as "tl");
          setDrag(null);
        }}
        onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <video ref={meVid} autoPlay playsInline muted className="pointer-events-none size-full -scale-x-100 object-cover" style={{ filter: blurred ? "blur(4px)" : "none" }} />
        <span className={`absolute top-1 left-1 rounded-full px-1.5 text-[9px] font-bold ${blurred ? "bg-black/60" : "bg-[#A1E3C3] text-night"}`}>{blurred ? "Flouté" : "Visible"}</span>
        
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center"><button type="button" onClick={() => void setBlur(!blurred)} className={`rounded-full px-4 py-1.5 text-sm font-bold backdrop-blur ${blurred ? "border border-white/70 bg-white/10" : "bg-[#A1E3C3] text-night"}`}>
          {blurred ? <span className="inline-flex items-center gap-1.5"><Eye className="size-4" /> Tu es flouté · te montrer</span> : <span className="inline-flex items-center gap-1.5"><EyeOff className="size-4" /> Tu es visible · te flouter</span>}
        </button></div>
        <div className="flex items-center justify-center gap-2.5">
          <Round label="Retourner la caméra" on={false} onClick={() => void flip()}><SwitchCamera className="size-5" /></Round>
          <Round label={mic ? "Couper le micro" : "Activer le micro"} on={mic} onClick={() => setMic(!mic)}>{mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}</Round>
          <Round label="Revenir en arrière (hdar+)" on={false} onClick={() => { if (!premium) return void nav({ to: "/premium" }); if (!prev) return toast("Personne avant"); void next(prev.id); }}>
            <RotateCcw className="size-5" />{!premium && <Crown className="absolute -top-1 -right-1 size-4 text-[#fbbf24]" />}
          </Round>
          <Round label="Filtres Live (hdar+)" on={!!(filters.iam.length || filters.minAge || filters.maxAge)} onClick={() => (premium ? setFilterOpen(true) : void nav({ to: "/premium" }))}>
            <SlidersHorizontal className="size-5" />{!premium && <Crown className="absolute -top-1 -right-1 size-4 text-[#fbbf24]" />}
          </Round>
          <Round label="Envoyer un cœur" on={false} onClick={() => void sendHeart()}>
            <span className="text-lg">❤️</span>
            <span className="absolute -top-1 -right-1 rounded-full bg-[#FA6F6C] px-1 text-[9px] font-bold text-night">{hearts === Infinity ? "∞" : hearts ?? "·"}</span>
          </Round>
          <Round label="Signaler" on={false} danger onClick={() => peer && setReporting(true)}><Flag className="size-5" /></Round>
        </div>
        <button type="button" onClick={() => !demo && void next()} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] py-3 font-display font-bold text-night">
          <ChevronUp className="size-5" /> Suivant <span className="text-xs font-normal opacity-70">· ou glisse vers le haut</span>
        </button>
      </div>
      <FloatingHearts burst={burst} />
      {packsOpen && <HeartPacks onClose={() => setPacksOpen(false)} demo={demo ? [{ product: "hearts_10", kind: "hearts", label: "10 cœurs", price_cents: 199 }, { product: "hearts_50", kind: "hearts", label: "50 cœurs", price_cents: 699 }, { product: "hearts_150", kind: "hearts", label: "150 cœurs", price_cents: 1499 }] : undefined} />}
      {reporting && (
        <div className="absolute inset-0 flex items-end bg-black/60" onClick={() => setReporting(false)}>
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
            <button type="button" onClick={() => { setFilterOpen(false); void next(); }} className="w-full rounded-full bg-[#FA6F6C] py-3 font-bold text-night">Appliquer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Round({ children, label: l, on, danger, onClick }: { children: React.ReactNode; label: string; on: boolean; danger?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={l} title={l} onClick={onClick} className={`relative flex size-11 items-center justify-center rounded-full backdrop-blur ${danger ? "bg-red-500/80" : on ? "bg-white text-night" : "bg-white/15"}`}>{children}</button>;
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
