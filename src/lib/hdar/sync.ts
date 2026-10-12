import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deviceId } from "./device";
import { flagMyPhoto, hit, listConversations, saveProfile } from "./live";
import { explicitReason } from "./nsfw";

const CHECKED_KEY = "hdar-photo-checked";

/** Automatic check of the main photo only, once per photo. */
async function checkMainPhoto(photo: string | undefined) {
  if (!photo) return;
  const key = `${photo.length}:${photo.slice(-32)}`;
  if (localStorage.getItem(CHECKED_KEY) === key) return;
  const reason = await explicitReason(photo);
  if (reason) {
    await flagMyPhoto(deviceId(), reason);
    toast("Ta photo de profil sera vérifiée avant d'être visible par les autres.");
  }
  localStorage.setItem(CHECKED_KEY, key);
}
import { playMessageSound } from "./sounds";
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
      })
        .then(() => checkMainPhoto(myPhotos(useHdar.getState().me)[0]))
        .catch(() => undefined);
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
                playMessageSound();
              }
            }
          }
          first = false;
          useHdar.setState({ liveConvos: rows });
        })
        .catch(() => undefined);
    };
    load();
    // Faster inbox while the app is in front, slow in background.
    let id = 0;
    const tick = () => {
      load();
      id = window.setTimeout(tick, document.hidden ? 20000 : 4000);
    };
    id = window.setTimeout(tick, 4000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
}

/**
 * Tells the server the app is open (visits, people online now) every 2 minutes
 * while visible. Returns true when this device has been suspended by moderation.
 */
export function useHeartbeat() {
  const [banned, setBanned] = useState(false);
  useEffect(() => {
    let stop = false;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void hit(deviceId()).catch((err: unknown) => {
        if (!stop && err instanceof Error && err.message.includes("suspendu")) setBanned(true);
      });
    };
    beat();
    const id = window.setInterval(beat, 120_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return banned;
}
