import { useEffect, useRef, useState } from "react";
import { ChevronLeft, LocateFixed, Send } from "lucide-react";
import { toast } from "sonner";
import { deviceId } from "@/lib/hdar/device";
import { areaFeed, areaHide, areaSend, pgTime, type AreaLine } from "@/lib/hdar/live";
import { bucketDistance, haversine } from "@/lib/hdar/rules";
import { resolvePlace } from "@/lib/hdar/scene";
import { reportUser } from "@/lib/hdar/report";
import { useHdar } from "@/lib/hdar/store";
import { UserAvatar } from "./avatar";

function ago(at: string) {
  const min = Math.max(0, Math.round((Date.now() - pgTime(at)) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.round(min / 60)} h`;
}

/** Neighbourhood chat: messages from people within ~3 km, last 24 h. */
export function PocketChat() {
  const closeView = useHdar((s) => s.closeView);
  const openProfile = useHdar((s) => s.openProfile);
  const locate = useHdar((s) => s.locate);
  const here = useHdar((s) => s.here);
  const cityId = useHdar((s) => s.cityId);
  const customCenter = useHdar((s) => s.customCenter);
  const pseudo = useHdar((s) => s.me.pseudo);
  const fallback = resolvePlace(cityId, customCenter);
  const center = here ?? { lat: fallback.lat, lng: fallback.lng };
  const [lines, setLines] = useState<AreaLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  // Re-centre only when the position moves by ~100 m, not on every GPS tick.
  const latKey = center.lat.toFixed(3);
  const lngKey = center.lng.toFixed(3);

  const refresh = () =>
    areaFeed(deviceId(), Number(latKey), Number(lngKey)).then((rows) => {
      setLines(rows);
      setLoaded(true);
    });

  useEffect(() => {
    let stop = false;
    const load = () => {
      void areaFeed(deviceId(), Number(latKey), Number(lngKey))
        .then((rows) => {
          if (stop) return;
          setLines(rows);
          setLoaded(true);
        })
        .catch(() => !stop && setLoaded(true));
    };
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [latKey, lngKey]);

  const lastId = lines[lines.length - 1]?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button
          type="button"
          className="flex size-11 items-center justify-center"
          aria-label="Retour à la carte"
          data-act="close-view"
          onClick={closeView}
        >
          <ChevronLeft />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold">Chat du quartier</p>
          <p className="truncate text-xs text-muted">
            {here
              ? "Les gens à ~3 km de toi · 24 h"
              : `Autour de ${fallback.name} · active ta position`}
          </p>
        </div>
        {!here && (
          <button
            type="button"
            className="flex size-11 items-center justify-center"
            aria-label="Utiliser ma position"
            onClick={locate}
          >
            <LocateFixed className="size-5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loaded && lines.length === 0 && (
          <p className="py-12 text-center text-sm text-muted">
            Personne n'a encore écrit dans le coin.
            <br />
            Lance la conversation.
          </p>
        )}
        {lines.map((m) => (
          <div key={m.id} className={m.mine ? "text-right" : "flex items-start gap-2 text-left"}>
            {!m.mine && (
              <button
                type="button"
                className="mt-4 shrink-0"
                aria-label={`Voir le profil de ${m.pseudo}`}
                onClick={() => openProfile(m.fromId, m.pseudo)}
              >
                <UserAvatar id={m.fromId} name={m.pseudo} className="size-9 rounded-full" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted">
                {m.mine ? (
                  "Toi"
                ) : (
                  <button
                    type="button"
                    className="font-bold text-ink underline-offset-2 hover:underline"
                    onClick={() => openProfile(m.fromId, m.pseudo)}
                  >
                    {m.pseudo}
                  </button>
                )}
                {" · "}
                {ago(m.at)}
                {!m.mine && here ? ` · ${bucketDistance(haversine(here, m))}` : ""}
              </p>
              <p
                className={
                  "mt-1 inline-block max-w-[85%] rounded-2xl px-3 py-2 text-left text-sm break-words whitespace-pre-wrap " +
                  (m.mine ? "bg-signal text-night" : "bg-surface")
                }
              >
                {m.body}
              </p>
              {m.mine && (
                <button
                  type="button"
                  className="mt-1 block w-full text-right text-xs text-muted"
                  onClick={() => {
                    void areaHide(deviceId(), m.id)
                      .then(refresh)
                      .catch(() => toast("Impossible de retirer ce message"));
                  }}
                >
                  Retirer
                </button>
              )}
              {!m.mine && (
                <button
                  type="button"
                  className="mt-1 block text-xs text-muted"
                  onClick={() =>
                    void reportUser(m.fromId, m.pseudo, m.body).then((sent) => {
                      if (sent) void refresh();
                    })
                  }
                >
                  Signaler
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="dock flex items-center gap-2 border-t border-line px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText("");
          void areaSend(deviceId(), center.lat, center.lng, pseudo || "Anonyme", body)
            .then(refresh)
            .catch((err) => {
              setText((t) => t || body);
              toast(err instanceof Error ? err.message : "Message non envoyé");
            });
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none focus-visible:border-signal"
          value={text}
          maxLength={300}
          placeholder="Écrire au quartier"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="flex size-11 items-center justify-center rounded-full bg-signal text-night"
          aria-label="Envoyer"
        >
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}
