import { useEffect, useRef, useState } from "react";
import { RefreshCw, Send, X, Zap, ZapOff, RotateCcw } from "lucide-react";

type Facing = "user" | "environment";

/** Full-screen in-chat camera: front/back, flash (torch or screen flash), big shutter, preview → retake/send. */
export function CameraSheet({ onClose, onSend }: { onClose: () => void; onSend: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [flash, setFlash] = useState(false);
  const [torch, setTorch] = useState(false);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        const caps = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(!!caps.torch);
      })
      .catch(() => setError("Caméra indisponible. Autorise l'accès à la caméra dans ton navigateur."));
    return () => {
      alive = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [facing]);

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const track = stream.current?.getVideoTracks()[0];
    if (flash && torch && track) {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 250));
    } else if (flash) {
      setFlashing(true);
      await new Promise((r) => setTimeout(r, 180));
    }
    const max = 1600;
    const k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    const g = c.getContext("2d")!;
    if (facing === "user") {
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(v, 0, 0, c.width, c.height);
    setFlashing(false);
    if (flash && torch && track) void track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => undefined);
    c.toBlob((blob) => blob && setShot({ url: URL.createObjectURL(blob), blob }), "image/jpeg", 0.88);
  }

  const close = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      {flashing && <div className="pointer-events-none absolute inset-0 z-[70] bg-white" />}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {shot ? (
          <img src={shot.url} alt="Aperçu" className="h-full w-full object-contain" />
        ) : (
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            className={"h-full w-full object-cover " + (facing === "user" ? "-scale-x-100" : "")}
          />
        )}
        {error && <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm">{error}</p>}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button type="button" aria-label="Fermer la caméra" className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur" onClick={close}>
            <X className="size-6" />
          </button>
          {!shot && (
            <button
              type="button"
              aria-label={flash ? "Flash activé" : "Flash désactivé"}
              aria-pressed={flash}
              className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur"
              onClick={() => setFlash((f) => !f)}
            >
              {flash ? <Zap className="size-5 fill-yellow-300 text-yellow-300" /> : <ZapOff className="size-5" />}
            </button>
          )}
        </div>
      </div>
      <div className="flex h-36 items-center justify-around bg-black pb-[env(safe-area-inset-bottom)]">
        {shot ? (
          <>
            <button
              type="button"
              className="flex h-14 items-center gap-2 rounded-full border border-white/40 px-6"
              onClick={() => {
                URL.revokeObjectURL(shot.url);
                setShot(null);
              }}
            >
              <RotateCcw className="size-5" /> Reprendre
            </button>
            <button
              type="button"
              className="flex h-14 items-center gap-2 rounded-full bg-signal px-7 font-bold text-night"
              onClick={() => {
                onSend(new File([shot.blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
                close();
              }}
            >
              <Send className="size-5" /> Envoyer
            </button>
          </>
        ) : (
          <>
            <span className="size-12" />
            <button
              type="button"
              aria-label="Prendre la photo"
              disabled={!!error}
              className="flex size-20 items-center justify-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40"
              onClick={() => void capture()}
            >
              <span className="block size-16 rounded-full bg-white" />
            </button>
            <button
              type="button"
              aria-label="Changer de caméra"
              className="flex size-12 items-center justify-center rounded-full bg-white/15"
              onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            >
              <RefreshCw className="size-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
