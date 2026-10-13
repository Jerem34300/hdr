import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronUp, Crown, SwitchCamera, Eye, EyeOff, Flag, Mic, MicOff, RotateCcw, SlidersHorizontal, Video, VideoOff, X } from "lucide-react";
import { turnServers, rouletteLeave, rouletteNext, roulettePoll, roulettePollSignals, rouletteReport, rouletteSignal, type LiveCard } from "@/lib/hdar/live";
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
  const [seeThem, setSeeThem] = useState(!!demo?.unblurred);
  const showMe = true;
  const [mic, setMic] = useState(true);
  const [theyShow, setTheyShow] = useState(!!demo?.unblurred);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const dc = useRef<RTCDataChannel | null>(null);
  const showRef = useRef(true);
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

  const closePc = () => { dc.current = null; setTheyShow(false); pc.current?.close(); pc.current = null; if (themVid.current) themVid.current.srcObject = null; };

  const makePc = () => {
    closePc();
    const c = new RTCPeerConnection({ iceServers: ice() });
    localRef.current?.getTracks().forEach((t) => c.addTrack(t, localRef.current!));
    const wire = (ch: RTCDataChannel) => {
      dc.current = ch;
      ch.onopen = () => ch.send(JSON.stringify({ cam: showRef.current }));
      ch.onmessage = (ev) => { try { setTheyShow(!!JSON.parse(String(ev.data)).cam); } catch { /* */ } };
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
    peerRef.current = card; setPeer(card); setSeeThem(false); setPhase("connecting");
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
      if (m.includes("live_photo")) stop();
    }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") return toast("Ton navigateur ne gère pas la vidéo");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: { echoCancellation: true, noiseSuppression: true } });
            localRef.current = s;
      if (meVid.current) { meVid.current.srcObject = s; void meVid.current.play().catch(() => undefined); }
    } catch { return toast("Caméra ou micro refusé. Autorise-les dans ton navigateur."); }
    turnCache = await turnServers();
    running.current = true;
    try { const rows = await roulettePollSignals(0); after.current = rows.reduce((m, r) => Math.max(m, Number(r.id)), 0); } catch { /* */ }
    void loop();
    void next();
  }

  function stop() {
    running.current = false;
    closePc();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    void rouletteLeave(false).catch(() => undefined);
    void nav({ to: "/" });
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
  useEffect(() => {
    showRef.current = showMe;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = showMe));
    if (dc.current?.readyState === "open") dc.current.send(JSON.stringify({ cam: showMe }));
  }, [showMe]);
  const flip = async () => {
    const nextF = facing === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextF }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: nextF }, audio: false }));
      const track = fresh.getVideoTracks()[0];
      if (!track || !localRef.current) return;
      track.enabled = showRef.current;
      const sender = pc.current?.getSenders().find((x) => x.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      localRef.current.getVideoTracks().forEach((t) => { t.stop(); localRef.current!.removeTrack(t); });
      localRef.current.addTrack(track);
      if (meVid.current) meVid.current.srcObject = localRef.current;
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

  if (phase === "intro") {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-5 overflow-hidden bg-night px-6 text-center text-ink">
        <span aria-hidden className="pointer-events-none absolute -top-10 -left-10 size-56 rounded-full bg-[#FA6F6C] opacity-40 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute right-0 bottom-20 size-64 rounded-full bg-[#A1E3C3] opacity-25 blur-3xl" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] shadow-[0_0_40px_#FA6F6C]"><Video className="size-9 text-night" /></span>
        <h1 className="relative font-display text-3xl font-bold">Live</h1>
        <p className="relative max-w-xs text-sm text-ink/80">Des mecs au hasard, en vidéo. Glisse vers le haut pour passer au suivant.</p>
        <ul className="relative max-w-xs space-y-1.5 text-left text-sm text-ink/80">
          <li>🛡️ Jamais quelqu'un de ton quartier : personne à moins de 2 km.</li>
          <li>📍 Aucune position ni distance n'est montrée.</li>
          <li>🙈 Tout le monde arrive flouté : chacun choisit de déflouter l'autre.</li>
          <li>🚩 Un geste pour signaler : la personne est bloquée tout de suite.</li>
        </ul>
        <button type="button" onClick={() => void start()} className="relative w-full max-w-xs rounded-full bg-gradient-to-r from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] py-3.5 font-display font-bold text-night shadow-[0_0_30px_#FA6F6C]">Entrer dans le Live</button>
        <button type="button" onClick={() => void nav({ to: "/" })} className="relative text-sm text-ink/60">Retour à la carte</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black text-white"
      onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => { const y0 = touchY.current; touchY.current = null; if (y0 != null && y0 - e.changedTouches[0].clientY > 70 && !demo) void next(); }}
      onWheel={(e) => { if (e.deltaY > 60 && !demo && phase !== "searching") void next(); }}>
      <video ref={themVid} autoPlay playsInline className="absolute inset-0 size-full object-cover transition-[filter] duration-300" style={{ filter: seeThem ? "none" : "blur(28px)" }} />
      {demo && <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#3b2a3a,#0b0b10)]" style={{ filter: seeThem ? "none" : "blur(28px)" }}><div className="absolute top-[22%] left-1/2 size-48 -translate-x-1/2 rounded-full bg-[#c9a58c]/70" /><div className="absolute top-[52%] left-1/2 h-80 w-80 -translate-x-1/2 rounded-t-full bg-[#2b3a55]" /></div>}
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
                    {peer?.note && <p className="mt-1 max-w-[16rem] truncate text-xs text-white/70">💬 {peer.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#FA6F6C] px-2 py-0.5 text-[11px] font-bold">● LIVE {online > 0 ? online : ""}</span>
          <button type="button" aria-label="Quitter" onClick={stop} className="flex size-10 items-center justify-center rounded-full bg-black/50"><X className="size-5" /></button>
        </div>
      </div>
      {peer && !seeThem && (
        <button type="button" onClick={() => setSeeThem(true)} className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-3xl bg-white/15 px-6 py-4 text-center backdrop-blur">
          <span className="flex items-center gap-2 text-base font-bold"><Eye className="size-5" /> Il est flouté</span>
          <span className="text-xs text-white/80">appuie pour voir</span>
        </button>
      )}
      <div className="absolute right-3 bottom-40 h-40 w-28 overflow-hidden rounded-2xl border border-white/20 bg-night">
        <video ref={meVid} autoPlay playsInline muted className="size-full -scale-x-100 object-cover"  />
        {<button type="button" aria-label="Retourner la caméra" onClick={() => void flip()} className="absolute right-1 bottom-1 flex size-8 items-center justify-center rounded-full bg-black/60"><SwitchCamera className="size-4" /></button>}
        <span className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 text-[9px]">Toi · flouté pour lui</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-center gap-2.5">
          <Round label="Retourner la caméra" on={false} onClick={() => void flip()}><SwitchCamera className="size-5" /></Round>
          <Round label={mic ? "Couper le micro" : "Activer le micro"} on={mic} onClick={() => setMic(!mic)}>{mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}</Round>
          <Round label="Revenir en arrière (hdar+)" on={false} onClick={() => { if (!premium) return void nav({ to: "/premium" }); if (!prev) return toast("Personne avant"); void next(prev.id); }}>
            <RotateCcw className="size-5" />{!premium && <Crown className="absolute -top-1 -right-1 size-4 text-[#fbbf24]" />}
          </Round>
          <Round label="Filtres Live (hdar+)" on={!!(filters.iam.length || filters.minAge || filters.maxAge)} onClick={() => (premium ? setFilterOpen(true) : void nav({ to: "/premium" }))}>
            <SlidersHorizontal className="size-5" />{!premium && <Crown className="absolute -top-1 -right-1 size-4 text-[#fbbf24]" />}
          </Round>
          <Round label="Signaler" on={false} danger onClick={() => peer && setReporting(true)}><Flag className="size-5" /></Round>
        </div>
        <button type="button" onClick={() => !demo && void next()} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FA6F6C] via-[#f472b6] to-[#fbbf24] py-3 font-display font-bold text-night">
          <ChevronUp className="size-5" /> Suivant <span className="text-xs font-normal opacity-70">· ou glisse vers le haut</span>
        </button>
      </div>
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
