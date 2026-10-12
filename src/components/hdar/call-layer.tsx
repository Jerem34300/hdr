import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import { acceptCall, hangUp, switchCamera, toggleCam, toggleMic, useCall, watchSignals } from "@/lib/hdar/call";

function StreamVideo({ stream, muted, className }: { stream: MediaStream | null; muted?: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

export function CallLayer() {
  const { phase, peerPseudo, local, remote, micOn, camOn, facing, switching } = useCall();

  useEffect(() => watchSignals(), []);

  if (phase === "idle") return null;

  if (phase === "ringing") {
    return (
      <div className="fixed inset-x-3 top-3 z-[60] flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-2xl">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-signal text-night">
          <Video className="size-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <span className="block truncate font-display text-base font-bold">{peerPseudo}</span>
          t'appelle en vidéo
        </p>
        <button
          type="button"
          aria-label="Refuser"
          className="flex size-12 items-center justify-center rounded-full bg-night text-signal"
          onClick={hangUp}
        >
          <PhoneOff className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Accepter"
          className="flex size-12 items-center justify-center rounded-full bg-online text-night"
          onClick={() => void acceptCall()}
        >
          <Phone className="size-5" />
        </button>
      </div>
    );
  }

  const status =
    phase === "calling" ? "Appel en cours…" : phase === "connecting" ? "Connexion…" : "";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-ink">
      <StreamVideo stream={remote} className="absolute inset-0 size-full object-cover" />
      {phase !== "in-call" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-night/70">
          <p className="font-display text-2xl font-bold">{peerPseudo}</p>
          <p className="text-sm text-muted">{status}</p>
        </div>
      )}
      <StreamVideo
        stream={local}
        muted
        className={
          "absolute top-4 right-4 aspect-[3/4] w-28 rounded-2xl border border-line bg-surface object-cover " +
          (facing === "user" ? "-scale-x-100" : "")
        }
      />
      <div className="dock absolute inset-x-0 bottom-0 flex items-center justify-center gap-5 pt-4 pb-8">
        <button
          type="button"
          aria-label={micOn ? "Couper le micro" : "Activer le micro"}
          className="flex size-14 items-center justify-center rounded-full bg-surface/90"
          onClick={toggleMic}
        >
          {micOn ? <Mic className="size-6" /> : <MicOff className="size-6 text-signal" />}
        </button>
        <button
          type="button"
          aria-label="Raccrocher"
          className="flex size-16 items-center justify-center rounded-full bg-signal text-night"
          onClick={hangUp}
        >
          <PhoneOff className="size-7" />
        </button>
        <button
          type="button"
          aria-label={camOn ? "Couper la caméra" : "Activer la caméra"}
          className="flex size-14 items-center justify-center rounded-full bg-surface/90"
          onClick={toggleCam}
        >
          {camOn ? <Video className="size-6" /> : <VideoOff className="size-6 text-signal" />}
        </button>
        <button
          type="button"
          aria-label={facing === "user" ? "Passer à la caméra arrière" : "Passer à la caméra avant"}
          disabled={switching}
          className="flex size-14 items-center justify-center rounded-full bg-surface/90 disabled:opacity-40"
          onClick={() => void switchCamera()}
        >
          <SwitchCamera className="size-6" />
        </button>
      </div>
    </div>
  );
}
