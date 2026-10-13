import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deviceId } from "@/lib/hdar/device";
import { hideSpotMessage, listSpots, sendSpotMessage, spotSendMedia, spotMessages, type SpotLine } from "@/lib/hdar/live";
import { remainingLabel } from "@/lib/hdar/rules";
import { resolvePlace, useScene, type LiveSpot } from "@/lib/hdar/scene";
import { useHdar, type SpotMsg } from "@/lib/hdar/store";
import { RoomAttach, RoomMedia } from "./media-composer";
import { bindTap } from "./tap";
import { useActivity } from "@/lib/hdar/activity";
import { flyTo } from "@/lib/hdar/map-focus";
import { PLACE_KINDS, usePlaces } from "./places-layer";

export function Spots() {
  const { spots } = useScene();
  const joined = useHdar((s) => s.joined);
  const openCreate = useHdar((s) => s.openCreate);
  const joinSpot = useHdar((s) => s.joinSpot);
  const act = useActivity();
  const featured = usePlaces(true).filter((p) => p.pro_boost).slice(0, 8);

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
      <a href="/pro" className="mt-3 block overflow-hidden rounded-3xl bg-gradient-to-r from-[#fbbf24] via-[#FA6F6C] to-[#f472b6] p-[2px] shadow-[0_0_24px_rgba(251,191,36,.3)]">
        <div className="rounded-[22px] bg-[#0b0b10]/90 p-4">
          <p className="font-display text-lg font-extrabold">🏷️ Vous êtes un établissement ?</p>
          <p className="text-sm font-bold text-[#fbbf24]">Devenez partenaire hdar ›</p>
          <p className="mt-1 text-xs text-white/75">🎥 Live Pro dans toute la France · 🎁 Cadeaux pro · ⭐ Boost Pro · 📍 votre lieu sur la carte</p>
        </div>
      </a>
      {featured.length > 0 && (
        <section className="mt-4">
          <p className="text-xs font-bold tracking-[0.2em] text-[#fbbf24] uppercase">⭐ À la une</p>
          <ul className="mt-2 space-y-2">{featured.map((p) => (
            <li key={p.id}><button type="button" onClick={() => flyTo(p.lat, p.lng, 16)} className="partner-glow flex w-full items-center gap-3 rounded-2xl border border-[#fbbf24] bg-surface px-4 py-3 text-left">
              <span className="text-2xl">{PLACE_KINDS[p.kind]?.icon ?? "📍"}</span>
              <span className="min-w-0 flex-1"><b className="block truncate">{p.name}</b><span className="text-xs text-[#fbbf24]">🏷️ Partenaire · Voir sur la carte</span></span>
            </button></li>))}</ul>
        </section>
      )}
      {spots.length === 0 && <p className="mt-6 text-center text-sm text-muted">Aucun lieu ouvert autour de toi pour l'instant. Crée le premier ! 📍</p>}
      <ul className="mt-4 space-y-2">
        {spots.map((spot) => (
          <li key={spot.id} className="flex items-stretch gap-2">
            <button
              type="button"
              data-act="join"
              data-id={spot.id}
              {...bindTap(() => joinSpot(spot.id))}
              className={"min-w-0 flex-1 rounded-2xl border px-4 py-3 text-left " + ((spot.boostedUntil ?? 0) > Date.now() ? "partner-glow border-[#f472b6] bg-surface" : "border-line bg-surface")}
            >
              <span className="flex items-center gap-2">
                {(spot.boostedUntil ?? 0) > Date.now() && <span className="shrink-0 rounded-full bg-[#f472b6] px-2 text-xs font-bold text-night">✨ à la une</span>}
                <span className="truncate font-display text-lg font-bold">{spot.title}</span>
                {act.fresh.has(spot.id) && (
                  <span className="shrink-0 rounded-full bg-spot px-2 text-xs font-bold text-night">nouveau</span>
                )}
                {act.unread.has(spot.id) && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-bold text-signal">
                    <span className="size-2.5 rounded-full bg-signal" /> nouveaux messages
                  </span>
                )}
              </span>
              <span className="mt-1 block text-sm text-muted">
                {spot.creator ? "Ton lieu · " : ""}
                {spot.distanceLabel} ·{" "}
                {spot.live ? spot.members : spot.members + (joined.includes(spot.id) ? 1 : 0)} personnes · ferme dans{" "}
                {remainingLabel(spot.closesAt, Date.now())}
              </span>
            </button>
            {spot.creator && (
              <span className="flex shrink-0 flex-col items-center justify-center gap-1.5">
                {spot.live && (
                  <a href={`/boost?spot=${spot.id}#lieux`} aria-label="Booster ce lieu" title="Booster ce lieu" className="boost-cta flex size-9 items-center justify-center rounded-full text-sm">✨</a>
                )}
                <DeleteSpotButton spot={spot} compact />
              </span>
            )}
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
  if (spot.live) return <LiveSpotRoom spot={spot} />;
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
        {spot.creator && spot.live && (
          <a href={`/boost?spot=${spot.id}#lieux`} className="boost-cta mr-1 flex h-9 shrink-0 items-center rounded-full px-3 text-xs font-extrabold text-night">
            ✨ {(spot.boostedUntil ?? 0) > Date.now() ? "Boosté" : "Booster ce lieu"}
          </a>
        )}
        {spot.creator && <DeleteSpotButton spot={spot} />}
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
        className="dock flex items-center gap-2 border-t border-line px-3 pt-2"
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

function DeleteSpotButton({ spot, compact = false }: { spot: LiveSpot; compact?: boolean }) {
  const deleteSpot = useHdar((s) => s.deleteSpot);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      aria-label={confirm ? `Confirmer la suppression de ${spot.title}` : `Supprimer ${spot.title}`}
      className={
        (compact ? "flex size-9 shrink-0 items-center justify-center rounded-full border " : "flex shrink-0 items-center justify-center gap-1 rounded-2xl border px-3 text-xs ") +
        (confirm ? "border-signal bg-signal text-night" : "border-line text-muted")
      }
      onClick={() => {
        if (confirm) {
          window.clearTimeout(timer.current);
          setConfirm(false);
          deleteSpot(spot.id);
          return;
        }
        setConfirm(true);
        timer.current = window.setTimeout(() => setConfirm(false), 4000);
      }}
    >
      {compact && confirm ? <span className="text-[10px] font-bold">OK ?</span> : <Trash2 className="size-4" />}
      {!compact && (confirm ? "Confirmer" : "Supprimer")}
    </button>
  );
}

function LiveSpotRoom({ spot }: { spot: LiveSpot }) {
  const closeView = useHdar((s) => s.closeView);
  const report = useHdar((s) => s.report);
  const pseudo = useHdar((s) => s.me.pseudo);
  const [lines, setLines] = useState<SpotLine[]>([]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const refresh = () => spotMessages(deviceId(), spot.id).then(setLines);

  useEffect(() => {
    let stop = false;
    const load = () => {
      void spotMessages(deviceId(), spot.id)
        .then((rows) => {
          if (!stop) setLines(rows);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [spot.id]);

  const lastId = lines[lines.length - 1]?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour" onClick={closeView}>
          <ChevronLeft />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold">{spot.title}</p>
          <p className="text-xs text-spot">
            {spot.creator ? "Ton lieu · " : ""}Ferme dans {remainingLabel(spot.closesAt, Date.now())}
          </p>
        </div>
        {spot.creator ? (
          <DeleteSpotButton spot={spot} />
        ) : (
          <button type="button" className="px-2 text-xs text-muted" onClick={() => report(spot.id)}>
            Signaler
          </button>
        )}
      </header>
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {lines.map((msg) => (
          <li key={msg.id} className={msg.mine ? "text-right" : "text-left"}>
            <p className="text-xs text-muted">{msg.mine ? "Toi" : msg.pseudo}</p>
            <p
              className={
                "inline-block max-w-[85%] rounded-2xl px-3 py-2 text-left text-sm break-words " +
                (msg.mine ? "bg-spot text-night" : "bg-surface")
              }
            >
              {msg.body ? msg.body : <RoomMedia scope="spot" id={msg.id} mine={msg.mine} />}
            </p>
            {(spot.creator || msg.mine) && (
              <button
                type="button"
                className="mt-1 block text-xs text-muted"
                style={{ marginLeft: msg.mine ? "auto" : undefined }}
                onClick={() => {
                  void hideSpotMessage(deviceId(), msg.id)
                    .then(refresh)
                    .then(() => toast("Message retiré"))
                    .catch(() => toast("Impossible de retirer ce message"));
                }}
              >
                Retirer
              </button>
            )}
          </li>
        ))}
        <div ref={end} />
      </ul>
      <form
        className="dock flex items-center gap-2 border-t border-line px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText("");
          void sendSpotMessage(deviceId(), spot.id, pseudo || "Anonyme", body)
            .then(refresh)
            .catch((err) => {
              setText((t) => t || body);
              toast(err instanceof Error ? err.message : "Message non envoyé");
            });
        }}
      >
        <RoomAttach send={(k, path, d) => spotSendMedia(spot.id, pseudo || "Anonyme", k, path, d).then(refresh)} />
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none focus-visible:border-spot"
          value={text}
          maxLength={240}
          placeholder="Écrire dans le lieu"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="h-11 rounded-full bg-spot px-4 text-night">
          Envoyer
        </button>
      </form>
    </div>
  );
}

/** Keeps the shared places around the current map area fresh. */
export function useLiveSpotsSync() {
  const cityId = useHdar((s) => s.cityId);
  const customCenter = useHdar((s) => s.customCenter);
  const place = resolvePlace(cityId, customCenter);
  const lat = place.lat.toFixed(2);
  const lng = place.lng.toFixed(2);

  useEffect(() => {
    let stop = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void listSpots(deviceId(), Number(lat), Number(lng))
        .then((rows) => {
          if (!stop) useHdar.setState({ liveSpots: rows });
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [lat, lng]);
}
