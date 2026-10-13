import { useEffect, useRef, useState } from "react";
import { Camera, Film, Flag, Image as ImageIcon, Mic, Plus, Video } from "lucide-react";
import { toast } from "sonner";
import { MAX_VOICE_SEC, signedMediaUrl, uploadChatMedia, type MediaKind, type MediaScope } from "@/lib/hdar/chat-media";
import { mediaReport, roomMedia, type RoomMediaRow } from "@/lib/hdar/live";

/** Compact "+" button: photo / camera / video from gallery / record video. */
export function AttachButton({
  onPick,
  disabled,
  onCamera,
}: {
  onPick: (file: File, kind: MediaKind) => void;
  disabled?: boolean;
  /** Optional in-app camera for photos (DM); otherwise the OS camera via capture. */
  onCamera?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = "flex h-11 items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-white/5";
  const input = (accept: string, kind: MediaKind, capture?: boolean) => (
    <input
      type="file"
      accept={accept}
      {...(capture ? { capture: "environment" as const } : {})}
      className="sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        setOpen(false);
        if (f) onPick(f, f.type.startsWith("video/") ? "video" : kind);
      }}
    />
  );
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label="Joindre une photo, une vidéo"
        aria-expanded={open}
        className={
          "flex size-11 items-center justify-center rounded-full border border-line transition-transform disabled:opacity-40 " +
          (open ? "rotate-45 border-signal text-signal" : "")
        }
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="size-5" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fermer" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute bottom-14 left-0 z-50 grid w-56 gap-0.5 rounded-2xl border border-line bg-surface p-1.5 shadow-2xl">
            {onCamera ? (
              <button type="button" className={item} onClick={() => (setOpen(false), onCamera())}>
                <Camera className="size-5 text-signal" /> Prendre une photo
              </button>
            ) : (
              <label className={item}>
                <Camera className="size-5 text-signal" /> Prendre une photo
                {input("image/*", "image", true)}
              </label>
            )}
            <label className={item}>
              <Video className="size-5 text-signal" /> Filmer une vidéo
              {input("video/*", "video", true)}
            </label>
            <label className={item}>
              <ImageIcon className="size-5" /> Photo de la galerie
              {input("image/*", "image")}
            </label>
            <label className={item}>
              <Film className="size-5" /> Vidéo de la galerie
              {input("video/*", "video")}
            </label>
            <p className="px-3 pt-1 pb-1.5 text-[11px] text-muted">Vidéo : 60 s et 50 Mo max</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Hold to record a voice note, release to send (60 s max). */
export function HoldMic({ onDone, disabled }: { onDone: (blob: Blob, sec: number) => void; disabled?: boolean }) {
  const [sec, setSec] = useState<number | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const timer = useRef(0);
  const want = useRef(false);

  function stop() {
    want.current = false;
    window.clearInterval(timer.current);
    setSec(null);
    if (mr.current && mr.current.state !== "inactive") mr.current.stop();
  }
  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Vocal indisponible sur ce navigateur");
      return;
    }
    want.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Autorise le micro pour envoyer un vocal");
      return;
    }
    if (!want.current) return stream.getTracks().forEach((t) => t.stop());
    const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const s = (Date.now() - started.current) / 1000;
      if (s < 0.8) return toast("Maintiens le micro pour parler");
      onDone(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), Math.min(MAX_VOICE_SEC, Math.round(s)));
    };
    rec.start();
    mr.current = rec;
    started.current = Date.now();
    setSec(0);
    timer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSec(s);
      if (s >= MAX_VOICE_SEC) stop();
    }, 250);
  }
  useEffect(() => () => window.clearInterval(timer.current), []);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={sec !== null ? `Vocal ${sec} s, relâche pour envoyer` : "Maintiens pour un vocal"}
        className={
          "flex size-11 shrink-0 touch-none select-none items-center justify-center rounded-full border transition-transform disabled:opacity-40 " +
          (sec !== null ? "scale-125 border-signal bg-signal text-night shadow-[0_0_24px_rgba(250,111,108,.6)]" : "border-line")
        }
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          void start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <Mic className="size-5" />
      </button>
      {sec !== null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-surface px-4 py-2 text-sm text-signal shadow-xl">
          ● {sec}s / {MAX_VOICE_SEC} · relâche pour envoyer
        </div>
      )}
    </>
  );
}

/** Renders one stored media from its storage path (signed URL). */
export function MediaView({ kind, path, duration }: { kind: string; path: string; duration?: number | null }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let alive = true;
    signedMediaUrl(path)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);
  const label = kind === "video" ? "Vidéo" : kind === "audio" ? "Vocal" : "Photo";
  if (failed) return <p className="opacity-70">{label} indisponible</p>;
  if (!src) return <p className="opacity-70">{label}{duration ? ` · ${duration}s` : ""}…</p>;
  if (kind === "audio") return <audio controls preload="metadata" src={src} className="h-10 w-60 max-w-full" />;
  if (kind === "video")
    return <video controls playsInline preload="metadata" src={src} className="max-h-72 max-w-full rounded-xl bg-black" />;
  return (
    <>
      <button type="button" className="block" onClick={() => setZoom(true)} aria-label="Agrandir la photo">
        <img src={src} alt="Photo" className="max-h-64 rounded-xl" />
      </button>
      {zoom && (
        <button type="button" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(false)} aria-label="Fermer la photo">
          <img src={src} alt="Photo" className="max-h-full max-w-full rounded-xl" />
        </button>
      )}
    </>
  );
}

/** Media of a public-room message (body empty), with a report flag for others' media. */
export function RoomMedia({ scope, id, mine }: { scope: MediaScope; id: string; mine: boolean }) {
  const [row, setRow] = useState<RoomMediaRow | null | undefined>(undefined);
  const [reported, setReported] = useState(false);
  useEffect(() => {
    let alive = true;
    roomMedia(scope, id)
      .then((r) => alive && setRow(r))
      .catch(() => alive && setRow(null));
    return () => {
      alive = false;
    };
  }, [scope, id]);
  if (row === undefined) return <span className="opacity-70">…</span>;
  if (!row) return <span className="opacity-70">Média retiré</span>;
  return (
    <span className="relative inline-block align-top">
      <MediaView kind={row.kind} path={row.media} duration={row.duration} />
      {!mine && row.kind !== "audio" && (
        <button
          type="button"
          aria-label="Signaler ce média"
          disabled={reported}
          className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-50"
          onClick={() =>
            void mediaReport(scope, id)
              .then(() => (setReported(true), toast("Merci, média signalé")))
              .catch((e: Error) => toast(e.message))
          }
        >
          <Flag className="size-4" />
        </button>
      )}
      {!mine && row.kind === "audio" && (
        <button
          type="button"
          disabled={reported}
          className="ml-1 text-xs text-muted"
          onClick={() => void mediaReport(scope, id).then(() => (setReported(true), toast("Merci, vocal signalé")))}
        >
          <Flag className="inline size-3" />
        </button>
      )}
    </span>
  );
}

/** + attach and hold-mic for public rooms: uploads then calls `send`. */
export function RoomAttach({
  send,
  disabled,
}: {
  send: (kind: MediaKind, path: string, duration: number | null) => Promise<unknown>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const go = (blob: Blob, kind: MediaKind, sec?: number) => {
    setBusy(true);
    const t = toast.loading(kind === "video" ? "Envoi de la vidéo…" : kind === "audio" ? "Envoi du vocal…" : "Envoi de la photo…");
    void uploadChatMedia(blob, kind, sec)
      .then(({ path, duration }) => send(kind, path, duration))
      .then(() => toast.dismiss(t))
      .catch((e: Error) => toast.error(e.message || "Envoi impossible", { id: t }))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <AttachButton disabled={disabled || busy} onPick={(f, k) => go(f, k)} />
      <HoldMic disabled={disabled || busy} onDone={(b, s) => go(b, "audio", s)} />
    </>
  );
}
