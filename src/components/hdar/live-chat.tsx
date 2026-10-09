import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { blockLive, readThread, reportLive, sendLive, type LiveMsg } from "@/lib/hdar/live";
import { deviceId } from "@/lib/hdar/device";
import { useHdar } from "@/lib/hdar/store";

export function LiveChat({ userId, pseudo }: { userId: string; pseudo: string }) {
  const closeView = useHdar((s) => s.closeView);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<LiveMsg[]>([]);

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
    };
  }, [userId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour" onClick={closeView}>
          <ChevronLeft />
        </button>
        <p className="min-w-0 flex-1 truncate font-display font-bold">{pseudo}</p>
        <button
          type="button"
          className="h-9 rounded-full border border-line px-3 text-xs"
          onClick={() => {
            void reportLive({ data: { self: deviceId(), other: userId } }).then(() => closeView());
          }}
        >
          Signaler
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-line px-3 text-xs"
          onClick={() => {
            void blockLive({ data: { self: deviceId(), other: userId } }).then(() => closeView());
          }}
        >
          Bloquer
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && <p className="text-center text-sm text-muted">Aucun message. Écris le premier.</p>}
        {msgs.map((m) => (
          <p key={m.id} className={"max-w-[80%] rounded-2xl px-3 py-2 text-sm " + (m.mine ? "ml-auto bg-signal text-night" : "bg-surface")}>
            {m.body}
          </p>
        ))}
      </div>
      <form
        className="dock flex gap-2 border-t border-line px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText("");
          void sendLive({ data: { self: deviceId(), to: userId, body } }).then(() =>
            readThread({ data: { self: deviceId(), withId: userId } }).then(setMsgs),
          );
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none"
          value={text}
          placeholder="Message"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="h-11 rounded-full bg-signal px-4 text-night">
          Envoyer
        </button>
      </form>
    </div>
  );
}
