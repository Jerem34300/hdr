import { ChatProBadge } from "./pro-tools";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Flag, Image as ImageIcon, Mic, MoreHorizontal, Send, ShieldBan } from "lucide-react";
import { toast } from "sonner";
import { PEOPLE, PLACES } from "@/lib/hdar/data";
import { mediaUrl, readImage, rememberMedia } from "@/lib/hdar/media";
import { isExpired, remainingLabel } from "@/lib/hdar/rules";
import { useHdar, type ChatMsg } from "@/lib/hdar/store";

export function Chat() {
  const view = useHdar((s) => s.view);
  const personId = view.name === "chat" ? view.personId : "";
  const matches = useHdar((s) => s.matches);
  const now = useHdar((s) => s.now);
  const closeView = useHdar((s) => s.closeView);
  const sendChat = useHdar((s) => s.sendChat);
  const openOnce = useHdar((s) => s.openOnce);
  const togglePrecise = useHdar((s) => s.togglePrecise);
  const block = useHdar((s) => s.block);
  const report = useHdar((s) => s.report);
  const [menu, setMenu] = useState(false);
  const match = matches.find((m) => m.personId === personId);
  const person = PEOPLE.find((p) => p.id === personId);
  const [text, setText] = useState("");
  const [once, setOnce] = useState(true);
  const [rec, setRec] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const started = useRef(0);
  const recRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [match?.messages.length]);

  if (!match || !person || isExpired(match.expiresAt, now)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p>Cette conversation a expiré.</p>
        <button type="button" className="h-11 rounded-full bg-signal px-4 text-night" onClick={closeView}>
          Retour
        </button>
      </div>
    );
  }

  function stopRec() {
    window.clearInterval(timer.current);
    setRec(0);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        const id = `voice-${Date.now()}`;
        rememberMedia(id, url);
        const sec = Math.min(60, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
        sendChat(personId, { voiceSec: sec, text: id });
      };
      mr.start();
      recRef.current = mr;
      started.current = Date.now();
      setRec(0);
      timer.current = window.setInterval(() => {
        const s = Math.round((Date.now() - started.current) / 1000);
        setRec(s);
        if (s >= 60) stopRec();
      }, 250);
    } catch {
      toast("Micro indisponible");
    }
  }

  const phrases = ["Ce soir", "Dehors", "Pas de photo", "J'arrive"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour" onClick={closeView}>
          <ChevronLeft />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold">Privé · {person.pseudo}</p>
          <p className="text-xs text-muted">S'efface dans {remainingLabel(match.expiresAt, now)}</p>
          <ChatProBadge other={personId} />
        </div>
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Plus" onClick={() => setMenu((v) => !v)}>
          <MoreHorizontal />
        </button>
      </header>
      {menu && (
        <div className="grid grid-cols-2 gap-2 border-b border-line px-3 py-2">
          <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-full border border-line text-sm" onClick={() => togglePrecise(personId)}>
            {match.preciseMe ? "Précise on" : "Position précise"}
          </button>
          <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-full border border-line text-sm" onClick={() => block(personId)}>
            <ShieldBan className="size-4" />
            Bloquer
          </button>
          <button type="button" className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-full bg-signal text-sm text-night" onClick={() => report(personId)}>
            <Flag className="size-4" />
            Signaler et bloquer
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {match.messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} mine={msg.from === "me"} onOpen={() => openOnce(personId, msg.id)} />
        ))}
        <div ref={end} />
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        {phrases.map((phrase) => (
          <button
            key={phrase}
            type="button"
            className="h-9 shrink-0 rounded-full border border-line px-3 text-xs"
            onClick={() => sendChat(personId, { text: phrase })}
          >
            {phrase}
          </button>
        ))}
      </div>
      <form
        className="dock flex items-center gap-2 border-t border-line px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          sendChat(personId, { text: value });
          setText("");
        }}
      >
        <label className="flex size-11 items-center justify-center rounded-full border border-line" aria-label="Photo">
          <ImageIcon className="size-5" />
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void readImage(file)
                .then((photo) => sendChat(personId, { photo, viewOnce: once, text: once ? "Photo · vue unique" : "Photo" }))
                .catch(() => toast("Photo illisible"));
            }}
          />
        </label>
        <button
          type="button"
          className={"flex size-11 items-center justify-center rounded-full border " + (rec ? "border-signal text-signal" : "border-line")}
          aria-label={rec ? `Vocal ${rec} secondes, relâcher pour envoyer` : "Maintenir pour un vocal"}
          onPointerDown={() => void startRec()}
          onPointerUp={stopRec}
          onPointerLeave={() => rec && stopRec()}
        >
          <Mic className="size-5" />
        </button>
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none focus-visible:border-signal"
          value={text}
          placeholder={once ? "Message · photos en vue unique" : "Message"}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="text-xs text-muted" onClick={() => setOnce((v) => !v)}>
          {once ? "1 vue" : "photo"}
        </button>
        <button type="submit" className="flex size-11 items-center justify-center rounded-full bg-signal text-night" aria-label="Envoyer">
          <Send className="size-5" />
        </button>
      </form>
      {rec > 0 && <p className="px-4 pb-2 text-xs text-signal">Vocal · {rec}s / 60</p>}
    </div>
  );
}

function Bubble({ msg, mine, onOpen }: { msg: ChatMsg; mine: boolean; onOpen: () => void }) {
  const voice = msg.voiceSec ? mediaUrl(msg.text || "") : "";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div className={"max-w-[80%] rounded-2xl px-3 py-2 text-sm " + (mine ? "bg-signal text-night" : "bg-surface text-ink")}>
        {msg.photo && msg.viewOnce && !msg.viewed && (
          <button type="button" className="underline" onClick={onOpen}>
            Ouvrir la photo · elle disparaît
          </button>
        )}
        {msg.photo && msg.viewOnce && msg.viewed && <p>Photo ouverte</p>}
        {msg.photo && !msg.viewOnce && <img src={msg.photo} alt="" className="mb-1 max-h-64 rounded-xl" />}
        {msg.voiceSec && (
          voice ? (
            <audio controls src={voice} className="h-9 max-w-full" />
          ) : (
            <p>Vocal · {msg.voiceSec}s</p>
          )
        )}
        {!msg.voiceSec && msg.text && !(msg.viewOnce && msg.photo) && <p>{msg.text}</p>}
      </div>
    </div>
  );
}

export function placeName(id: string) {
  return PLACES.find((p) => p.id === id)?.label ?? "";
}
