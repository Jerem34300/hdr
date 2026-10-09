import { useState } from "react";
import { ChevronLeft, Map as MapIcon, Send } from "lucide-react";
import { DESIRES } from "@/lib/hdar/data";
import { useScene } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { Avatar } from "./avatar";
import { bindTap } from "./tap";

export function PocketChat() {
  const closeView = useHdar((s) => s.closeView);
  const enterLine = useHdar((s) => s.enterLine);
  const extra = useHdar((s) => s.pocket);
  const sendPocket = useHdar((s) => s.sendPocket);
  const { place, people } = useScene();
  const [text, setText] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour à la carte" data-act="close-view" onClick={closeView}>
          <ChevronLeft />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold">Annonces</p>
          <p className="truncate text-xs text-muted">{place.name} · {people.length} profils · tape pour le privé</p>
        </div>
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Carte" onClick={closeView}>
          <MapIcon className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        <p className="pb-1 text-xs text-muted">Messages des gens autour. Le pseudo ouvre la discussion privée. La carte aussi.</p>
        {people.map((person) => {
          const kind = person.tonight?.desires[0] ?? person.openTo[0] ?? person.tags[0];
          const label = DESIRES.find((d) => d.id === kind)?.label ?? "Dispo";
          return (
            <button
              key={person.id}
              type="button"
              data-act="line"
              data-id={person.id}
              {...bindTap(() => enterLine(person.id))}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 text-left active:opacity-80"
            >
              <Avatar src={person.avatar} name={person.pseudo} className="size-12 shrink-0 rounded-full" />
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display font-bold">{person.pseudo}</span>
                  <span className="text-xs text-muted">{person.distanceLabel}</span>
                </span>
                <span className="mt-0.5 block text-xs text-signal">{label}</span>
                <span className="mt-1 block text-sm">{person.tonight?.note || person.replies[0]}</span>
              </span>
            </button>
          );
        })}
        {extra.map((msg) => (
          <p key={msg.id} className={"max-w-[85%] rounded-2xl px-3 py-2 text-sm " + (msg.from === "me" ? "ml-auto bg-signal text-night" : "bg-surface")}>
            {msg.from === "me" ? "Toi · " : ""}
            {msg.text}
          </p>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t border-line px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendPocket(text);
          setText("");
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none focus-visible:border-signal"
          value={text}
          placeholder="Laisser une annonce"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="flex size-11 items-center justify-center rounded-full bg-signal text-night" aria-label="Publier">
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}
