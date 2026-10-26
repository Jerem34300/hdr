import { useMyName } from "@/lib/hdar/discret";
import { mentionNotify } from "@/lib/hdar/live";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, LocateFixed } from "lucide-react";
import { deviceId } from "@/lib/hdar/device";
import { areaFeed2, areaHide, areaSend2, areaSendMedia, type GroupLine } from "@/lib/hdar/live";
import { bucketDistance, haversine } from "@/lib/hdar/rules";
import { resolvePlace } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { useAmAdmin } from "@/lib/hdar/admin-mode";
import { useRoomPresence } from "@/lib/hdar/presence";
import { GroupChat } from "./group-chat";
import { OnlineButton } from "./room-people";

/** Neighbourhood chat: messages from people within ~3 km, last 24 h. */
export function PocketChat() {
  const closeView = useHdar((s) => s.closeView);
  const locate = useHdar((s) => s.locate);
  const here = useHdar((s) => s.here);
  const cityId = useHdar((s) => s.cityId);
  const customCenter = useHdar((s) => s.customCenter);
  const pseudo = useMyName();
  const onboarded = useHdar((s) => s.me.onboarded);
  const fallback = resolvePlace(cityId, customCenter);
  const center = here ?? { lat: fallback.lat, lng: fallback.lng };
  const [lines, setLines] = useState<GroupLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Re-centre only when the position moves by ~100 m, not on every GPS tick.
  const lat = Number(center.lat.toFixed(3));
  const lng = Number(center.lng.toFixed(3));
  const presence = useRoomPresence("area", pseudo, lat, lng);
  const isAdmin = useAmAdmin();

  const refresh = useCallback(() => {
    void areaFeed2(lat, lng)
      .then((rows) => {
        setLines(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [lat, lng]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <GroupChat
      scope="area"
      typingRef={`${center.lat.toFixed(3)},${center.lng.toFixed(3)}`}
      myPseudo={pseudo}
      lines={lines}
      loaded={loaded}
      maxLength={300}
      placeholder="Écrire au quartier"
      empty={
        <>
          Personne n'a encore écrit dans le coin.
          <br />
          Lance la conversation.
        </>
      }
      meta={(m) => (!m.mine && here && m.lat != null && m.lng != null ? bucketDistance(haversine(here, { lat: m.lat, lng: m.lng })) : null)}
      canHide={(m) => m.mine || isAdmin}
      onHide={(m) => areaHide(deviceId(), m.id)}
      onSend={(text, replyTo) => areaSend2(center.lat, center.lng, pseudo, text, replyTo).then(() => mentionNotify("area", null, text))}
      onSendMedia={onboarded ? (k, path, d) => areaSendMedia(center.lat, center.lng, pseudo, k, path, d) : undefined}
      mediaLockedHint="Crée ton profil pour envoyer photos, vidéos et vocaux"
      onChanged={refresh}
      header={
        <header className="flex items-center gap-2 border-b border-line px-2 py-2">
          <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour à la carte" data-act="close-view" onClick={closeView}>
            <ChevronLeft />
          </button>
          <span className="text-2xl">📍</span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold">Chat du quartier</p>
            <p className="truncate text-xs text-muted">{here ? "Les gens à ~3 km de toi · 24 h" : `Autour de ${fallback.name} · active ta position`}</p>
          </div>
          <OnlineButton presence={presence} />
          {!here && (
            <button type="button" className="flex size-11 items-center justify-center" aria-label="Utiliser ma position" onClick={locate}>
              <LocateFixed className="size-5" />
            </button>
          )}
        </header>
      }
    />
  );
}
