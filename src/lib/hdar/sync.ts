import { useEffect } from "react";
import { toast } from "sonner";
import { deviceId } from "./device";
import { listConversations, saveProfile } from "./live";
import { playPop } from "./media";
import { myPhotos, useHdar } from "./store";

/** Publishes the local profile (pseudo, age, tags, bio, photo) so others can see it. */
export function useProfileSync() {
  const me = useHdar((s) => s.me);
  const { onboarded, pseudo, age, bio, voiceSec } = me;
  const voice = me.voice ?? "";
  const photos = myPhotos(me);
  const tags = me.tags.join(",");
  // Cheap change key for the album (data URLs are large).
  const photosKey = photos.map((p) => `${p.length}:${p.slice(-24)}`).join("|");
  useEffect(() => {
    if (!onboarded) return;
    const id = window.setTimeout(() => {
      void saveProfile({
        self: deviceId(),
        pseudo: pseudo || "Anonyme",
        age,
        bio,
        tags: tags ? tags.split(",") : [],
        photos: myPhotos(useHdar.getState().me),
        voice,
        voiceSec,
      }).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [onboarded, pseudo, age, bio, tags, photosKey, voice, voiceSec]);
}

/** Keeps the Messages tab fresh and announces new private messages. */
export function useConversationsSync() {
  useEffect(() => {
    let stop = false;
    let first = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void listConversations(deviceId())
        .then((rows) => {
          if (stop) return;
          const st = useHdar.getState();
          if (!first) {
            const before = new Map(st.liveConvos.map((c) => [c.otherId, c.lastAt]));
            const open = st.view.name === "live" ? st.view.userId : "";
            for (const c of rows) {
              const prev = before.get(c.otherId) ?? 0;
              if (!c.lastMine && c.lastAt > prev && c.otherId !== open) {
                toast(`Nouveau message de ${c.pseudo}`, {
                  action: { label: "Ouvrir", onClick: () => useHdar.getState().openLive(c.otherId, c.pseudo) },
                });
                playPop();
              }
            }
          }
          first = false;
          useHdar.setState({ liveConvos: rows });
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 8000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
}
