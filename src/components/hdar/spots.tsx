import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { remainingLabel } from "@/lib/hdar/rules";
import { useScene } from "@/lib/hdar/scene";
import { useHdar, type SpotMsg } from "@/lib/hdar/store";
import { bindTap } from "./tap";

export function Spots() {
  const { spots } = useScene();
  const joined = useHdar((s) => s.joined);
  const openCreate = useHdar((s) => s.openCreate);
  const joinSpot = useHdar((s) => s.joinSpot);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Lieux</h1>
          <p className="mt-1 text-sm text-muted">Un endroit, ouvert quelques heures.</p>
        </div>
      </div>
      <button type="button" data-act="create" {...bindTap(openCreate)} className="mt-4 h-12 w-full rounded-full bg-spot text-night">
        Créer un lieu
      </button>
      <ul className="mt-4 space-y-2">
        {spots.map((spot) => (
          <li key={spot.id}>
            <button
              type="button"
              data-act="join"
              data-id={spot.id}
              {...bindTap(() => joinSpot(spot.id))}
              className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left"
            >
              <span className="block font-display text-lg font-bold">{spot.title}</span>
              <span className="mt-1 block text-sm text-muted">
                {spot.distanceLabel} · {spot.members + (joined.includes(spot.id) ? 1 : 0)} personnes · ferme dans{" "}
                {remainingLabel(spot.closesAt, Date.now())}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpotRoom() {
  const view = useHdar((s) => s.view);
  const id = view.name === "spot" ? view.id : "";
  const { spots } = useScene();
  const extras = useHdar((s) => s.spotExtras);
  const deleted = useHdar((s) => s.deletedMsgs);
  const closeView = useHdar((s) => s.closeView);
  const sendSpot = useHdar((s) => s.sendSpot);
  const removeSpotMsg = useHdar((s) => s.removeSpotMsg);
  const report = useHdar((s) => s.report);
  const [text, setText] = useState("");
  const spot = spots.find((s) => s.id === id);
  if (!spot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p>Ce spot est fermé.</p>
        <button type="button" className="h-11 rounded-full bg-spot px-4 text-night" onClick={closeView}>
          Retour
        </button>
      </div>
    );
  }
  const thread: SpotMsg[] = spot.creator
    ? (spot.messages ?? [])
    : [
        ...spot.thread.map((m, i) => ({
          id: `${spot.id}-t${i}`,
          from: m.from,
          mine: false,
          text: m.text,
          at: 0,
        })),
        ...(extras[spot.id] ?? []),
      ];
  const messages = thread.filter((m) => !deleted.includes(m.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour" onClick={closeView}>
          <ChevronLeft />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold">{spot.title}</p>
          <p className="text-xs text-spot">Ferme dans {remainingLabel(spot.closesAt, Date.now())}</p>
        </div>
        {!spot.creator && (
          <button type="button" className="px-2 text-xs text-muted" onClick={() => report(spot.id)}>
            Signaler
          </button>
        )}
      </header>
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <li key={msg.id} className={msg.mine ? "text-right" : "text-left"}>
            <p className="text-xs text-muted">{msg.mine ? "Toi" : msg.from}</p>
            <p className={"inline-block rounded-2xl px-3 py-2 text-sm " + (msg.mine ? "bg-spot text-night" : "bg-surface")}>
              {msg.text}
            </p>
            {spot.creator && !msg.mine && (
              <button type="button" className="mt-1 block text-xs text-muted" onClick={() => removeSpotMsg(spot.id, msg.id)}>
                Retirer
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="dock flex gap-2 border-t border-line px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendSpot(spot.id, text);
          setText("");
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none focus-visible:border-spot"
          value={text}
          maxLength={240}
          placeholder="Écrire dans le spot"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="h-11 rounded-full bg-spot px-4 text-night">
          Envoyer
        </button>
      </form>
    </div>
  );
}
