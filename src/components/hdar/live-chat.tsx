import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Mic, MoreVertical, Send, Square, Video } from "lucide-react";
import { toast } from "sonner";
import { startCall } from "@/lib/hdar/call";
import { blockLive, getMedia, getProfile, readThread, sendLive, sendLocation, sendMedia, type LiveMsg } from "@/lib/hdar/live";
import { deviceId } from "@/lib/hdar/device";
import { readImage } from "@/lib/hdar/media";
import { askConfirm } from "@/lib/hdar/confirm";
import { reportUser } from "@/lib/hdar/report";
import { useHdar } from "@/lib/hdar/store";
import { Avatar } from "./avatar";

const MAX_VOICE_SEC = 60;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("audio"));
    reader.readAsDataURL(blob);
  });
}

export function LiveChat({ userId, pseudo }: { userId: string; pseudo: string }) {
  const closeView = useHdar((s) => s.closeView);
  const openProfile = useHdar((s) => s.openProfile);
  const markSeen = useHdar((s) => s.markSeen);
  const deleteConversation = useHdar((s) => s.deleteConversation);
  const [menu, setMenu] = useState(false);
  const [photo, setPhoto] = useState("");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<LiveMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<number | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recTimer = useRef(0);
  const recStart = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  const refresh = () =>
    readThread({ data: { self: deviceId(), withId: userId } }).then(setMsgs);

  async function shareExactLocation() {
    const ok = await askConfirm({
      title: `Envoyer ta position exacte à ${pseudo} ?`,
      body: `Seul ${pseudo} la verra, dans cette conversation, pendant 1 h. Sur la carte, ta position reste arrondie.`,
      confirm: "Envoyer ma position",
    });
    if (!ok) return;
    if (!navigator.geolocation) return toast("Localisation indisponible sur cet appareil");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void sendLocation(deviceId(), userId, pos.coords.latitude, pos.coords.longitude, 60)
          .then(refresh)
          .then(() => toast("Position envoyée"))
          .catch((e: unknown) => toast(e instanceof Error ? e.message : "Envoi impossible"));
      },
      () => toast("Autorise la localisation pour partager ta position"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    let stop = false;
    const load = () => {
      void readThread({ data: { self: deviceId(), withId: userId } })
        .then((rows) => {
          if (!stop) setMsgs(rows);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 2500);
    return () => {
      stop = true;
      window.clearInterval(id);
      window.clearInterval(recTimer.current);
      const mr = recRef.current;
      if (mr && mr.state !== "inactive") {
        mr.onstop = null;
        mr.stop();
        mr.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [userId]);

  useEffect(() => {
    let alive = true;
    getProfile(deviceId(), userId)
      .then((p) => alive && p?.photo && setPhoto(p.photo))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const lastId = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    markSeen(userId);
  }, [lastId, markSeen, userId]);

  async function sendPhoto(file: File) {
    setBusy(true);
    try {
      const media = await readImage(file, 1280);
      await sendMedia({ data: { self: deviceId(), to: userId, kind: "image", media } });
      await refresh();
    } catch (err) {
      toast(err instanceof Error && err.message !== "image" ? err.message : "Photo illisible");
    } finally {
      setBusy(false);
    }
  }

  async function startRec() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Ton navigateur ne gère pas les vocaux");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Micro refusé. Autorise-le dans ton navigateur.");
      return;
    }
    const mr = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const sec = Math.min(MAX_VOICE_SEC, Math.max(1, Math.round((Date.now() - recStart.current) / 1000)));
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      setBusy(true);
      void blobToDataUrl(blob)
        .then((media) => sendMedia({ data: { self: deviceId(), to: userId, kind: "audio", media, duration: sec } }))
        .then(refresh)
        .catch((err) => toast(err instanceof Error ? err.message : "Vocal non envoyé"))
        .finally(() => setBusy(false));
    };
    mr.start();
    recRef.current = mr;
    recStart.current = Date.now();
    setRec(0);
    recTimer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - recStart.current) / 1000);
      setRec(s);
      if (s >= MAX_VOICE_SEC) stopRec();
    }, 250);
  }

  function stopRec() {
    window.clearInterval(recTimer.current);
    setRec(null);
    const mr = recRef.current;
    recRef.current = null;
    if (mr && mr.state !== "inactive") mr.stop();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="relative flex items-center gap-1 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 shrink-0 items-center justify-center" aria-label="Retour" onClick={closeView}>
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 text-left active:bg-surface"
          aria-label={`Voir le profil de ${pseudo}`}
          onClick={() => openProfile(userId, pseudo)}
        >
          <Avatar src={photo} name={pseudo} className="size-10 shrink-0 rounded-full" />
          <span className="min-w-0">
            <span className="block truncate font-display font-bold">{pseudo}</span>
            <span className="flex items-center text-xs text-muted">
              Voir le profil <ChevronRight className="size-3" />
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-signal text-night"
          aria-label="Appel vidéo"
          onClick={() => void startCall(userId, pseudo)}
        >
          <Video className="size-5" />
        </button>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center"
          aria-label="Plus d'options"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          <MoreVertical className="size-5" />
        </button>
        {menu && (
          <div className="absolute top-full right-2 z-30 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-surface text-sm shadow-2xl">
            <button type="button" className="block w-full px-4 py-3 text-left" onClick={() => openProfile(userId, pseudo)}>
              Voir le profil
            </button>
            <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-left"
              onClick={() => {
                setMenu(false);
                void shareExactLocation();
              }}
            >
              📍 Partager ma position exacte
            </button>
            <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-left"
              onClick={() => {
                setMenu(false);
                void askConfirm({
                  title: `Supprimer la conversation avec ${pseudo} ?`,
                  body: "Elle disparaît pour toi seulement.",
                  confirm: "Supprimer",
                  danger: true,
                }).then((ok) => ok && deleteConversation(userId));
              }}
            >
              Supprimer la conversation
            </button>
            <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-left text-signal"
              onClick={() => {
                setMenu(false);
                void reportUser(userId, pseudo).then((sent) => sent && closeView());
              }}
            >
              Signaler
            </button>
            <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-left text-signal"
              onClick={() => {
                void blockLive({ data: { self: deviceId(), other: userId } })
                  .then(() => {
                    toast("Bloqué");
                    closeView();
                  })
                  .catch(() => toast("Action impossible"));
              }}
            >
              Bloquer
            </button>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && <p className="text-center text-sm text-muted">Aucun message. Écris le premier.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={m.mine ? "flex justify-end" : "flex justify-start"}>
            <div className={"max-w-[80%] rounded-2xl px-3 py-2 text-sm " + (m.mine ? "bg-signal text-night" : "bg-surface")}>
              {m.kind === "text" ? (
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
              ) : m.kind === "location" ? (
                <LocationBubble msg={m} />
              ) : (
                <LiveMedia msg={m} />
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {rec !== null && (
        <p className="px-4 pb-2 text-xs text-signal">
          ● Enregistrement · {rec}s / {MAX_VOICE_SEC} — appuie sur ■ pour envoyer
        </p>
      )}
      {busy && rec === null && <p className="px-4 pb-2 text-xs text-muted">Envoi…</p>}
      <form
        className="dock flex items-center gap-2 border-t border-line px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText("");
          void sendLive({ data: { self: deviceId(), to: userId, body } })
            .then(refresh)
            // Keep the draft so a failed send (network, flood guard) isn't lost.
            .catch((err) => {
              setText((t) => t || body);
              toast(err instanceof Error ? err.message : "Message non envoyé");
            });
        }}
      >
        <label
          className={"flex size-11 shrink-0 items-center justify-center rounded-full border border-line " + (busy ? "opacity-40" : "")}
          aria-label="Envoyer une photo"
        >
          <ImageIcon className="size-5" />
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy || rec !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void sendPhoto(file);
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy && rec === null}
          className={
            "flex size-11 shrink-0 items-center justify-center rounded-full border " +
            (rec !== null ? "border-signal bg-signal text-night" : "border-line")
          }
          aria-label={rec !== null ? "Arrêter et envoyer le vocal" : "Enregistrer un vocal"}
          onClick={() => (rec !== null ? stopRec() : void startRec())}
        >
          {rec !== null ? <Square className="size-4" /> : <Mic className="size-5" />}
        </button>
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none"
          value={text}
          maxLength={500}
          placeholder="Message"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-signal text-night" aria-label="Envoyer">
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}

function LiveMedia({ msg }: { msg: LiveMsg }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let alive = true;
    getMedia(deviceId(), msg.id)
      .then((v) => {
        if (!alive) return;
        if (v) setSrc(v);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [msg.id]);

  if (failed) return <p>{msg.kind === "image" ? "Photo indisponible" : "Vocal indisponible"}</p>;
  if (!src) return <p className="opacity-70">{msg.kind === "image" ? "Photo…" : `Vocal · ${msg.duration ?? 1}s…`}</p>;
  if (msg.kind === "audio") return <audio controls preload="metadata" src={src} className="h-10 w-60 max-w-full" />;
  return (
    <>
      <button type="button" className="block" onClick={() => setZoom(true)} aria-label="Agrandir la photo">
        <img src={src} alt="Photo" className="max-h-64 rounded-xl" />
      </button>
      {zoom && (
        <button
          type="button"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(false)}
          aria-label="Fermer la photo"
        >
          <img src={src} alt="Photo" className="max-h-full max-w-full rounded-xl" />
        </button>
      )}
    </>
  );
}

function LocationBubble({ msg }: { msg: LiveMsg }) {
  const [lat, lng] = msg.body.split(",").map(Number);
  if (!msg.body || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <p className="opacity-70">📍 Position partagée (expirée)</p>;
  }
  const until = msg.duration ? new Date(Date.parse(msg.at.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")) + msg.duration * 60000) : null;
  return (
    <div className="space-y-1">
      <p className="font-bold">📍 {msg.mine ? "Tu as partagé ta position" : "Position exacte"}</p>
      <div className="flex flex-wrap gap-2">
        <a
          className="underline"
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir dans Maps
        </a>
        <a
          className="underline"
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>
      </div>
      {until && Number.isFinite(until.getTime()) && (
        <p className="text-xs opacity-70">
          Visible jusqu'à {until.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
