import { useEffect, useState } from "react";
import { HeartsCount } from "./hearts";
import { showOnMap, useMapFocus, useRegion } from "@/lib/hdar/map-focus";
import { ChevronLeft, MessageCircle, Pencil, Star, Video } from "lucide-react";
import { toggleFav, useFavorites } from "@/lib/hdar/favorites";
import { toast } from "sonner";
import { startCall } from "@/lib/hdar/call";
import { DESIRES, PLACES } from "@/lib/hdar/data";
import { identityLine } from "@/lib/hdar/live";
import { PremiumBadge } from "./premium";
import { deviceId } from "@/lib/hdar/device";
import {
  blockLive,
  getProfile,
  getProfileExtras,
  type ProfileExtras,
  type PublicProfile,
} from "@/lib/hdar/live";
import { bucketDistance, haversine } from "@/lib/hdar/rules";
import { reportUser } from "@/lib/hdar/report";
import { useHdar } from "@/lib/hdar/store";
import { Avatar } from "./avatar";

const label = (id: string) => DESIRES.find((d) => d.id === id)?.label ?? PLACES.find((d) => d.id === id)?.label ?? id;

export function ProfileView({ userId, pseudo }: { userId: string; pseudo: string }) {
  const closeView = useHdar((s) => s.closeView);
  const openLive = useHdar((s) => s.openLive);
  const here = useHdar((s) => s.here);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone">("loading");
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const setTab = useHdar((s) => s.setTab);
  const self = userId === deviceId();
  const favs = useFavorites();
  const fav = favs.some((f) => f.id === userId);

  useEffect(() => {
    let alive = true;
    getProfile(deviceId(), userId)
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setState(p ? "ok" : "gone");
      })
      .catch(() => alive && setState("gone"));
    getProfileExtras(deviceId(), userId)
      .then((x) => alive && setExtras(x))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const name = profile?.pseudo || pseudo;
  const region = useRegion(self ? null : userId);
  const onMap = useMapFocus((s) => !!s.pins[userId]);
  const distance =
    here && profile?.lat != null && profile.lng != null
      ? bucketDistance(haversine(here, { lat: profile.lat, lng: profile.lng }))
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button
          type="button"
          className="flex size-11 items-center justify-center"
          aria-label="Retour"
          onClick={closeView}
        >
          <ChevronLeft />
        </button>
        <p className="min-w-0 flex-1 truncate font-display font-bold">
          {self ? "Mon profil, vu par les autres" : "Profil"}
        </p>
        {!self && (
          <button
            type="button"
            className="flex size-11 items-center justify-center"
            aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            aria-pressed={fav}
            onClick={() => void toggleFav(userId, profile?.pseudo || pseudo).catch((e: unknown) => toast(e instanceof Error ? e.message : "Impossible"))}
          >
            <Star className={fav ? "size-5 fill-current text-signal" : "size-5"} />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-6">
        <div className="flex flex-col items-center text-center">
          {extras && extras.album.length > 0 ? (
            <Album photos={extras.album} />
          ) : (
            <Avatar src={profile?.photo} name={name} className="size-40 rounded-3xl" />
          )}
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
            {name}
            {profile?.age ? <span className="font-normal text-muted">, {profile.age}</span> : null}
            {profile?.premium && <PremiumBadge className="ml-2 align-middle" />}
          </h1>
          {profile && identityLine(profile.iam, profile.seeking) && (
            <p className="mt-1 text-sm font-bold text-ink/90">{identityLine(profile.iam, profile.seeking)}</p>
          )}
          <p className="mt-1 text-sm">
            {profile?.online ? (
              <span className="text-online">● En ligne</span>
            ) : state === "ok" ? (
              <span className="text-muted">Hors ligne</span>
            ) : null}
            {distance && <span className="text-muted"> · {distance}</span>}
            {region && <span className="text-muted"> · 📍 {region}</span>}
          </p>
          <div className="mt-1"><HeartsCount id={userId} /></div>
          {onMap && !self && (
            <button type="button" onClick={() => showOnMap(userId)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold">🗺️ Voir sur la carte</button>
          )}
        </div>
        {extras?.voice && (
          <section className="mt-5">
            <h2 className="text-xs tracking-wide text-muted uppercase">Intro vocale</h2>
            <audio controls preload="metadata" src={extras.voice} className="mt-2 h-10 w-full" />
          </section>
        )}
        {state === "loading" && (
          <p className="mt-8 text-center text-sm text-muted">Chargement du profil…</p>
        )}
        {state === "gone" && (
          <p className="mt-8 text-center text-sm text-muted">Profil indisponible.</p>
        )}
        {profile?.note && (
          <p className="mt-5 rounded-2xl border border-line bg-night px-4 py-3 text-sm italic break-words">💬 « {profile.note} »</p>
        )}
        {profile && profile.desires.length > 0 && profile.online && (
          <section className="mt-6">
            <h2 className="text-xs tracking-wide text-muted uppercase">Ce soir</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.desires.map((d) => (
                <span key={d} className="rounded-full bg-signal/15 px-3 py-1 text-sm text-signal">
                  {label(d)}
                </span>
              ))}
            </div>
          </section>
        )}
        {profile && profile.tags.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs tracking-wide text-muted uppercase">Envies</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.tags.map((t) => (
                <span key={t} className="rounded-full border border-line px-3 py-1 text-sm">
                  {label(t)}
                </span>
              ))}
            </div>
          </section>
        )}
        {profile?.bio && (
          <section className="mt-5">
            <h2 className="text-xs tracking-wide text-muted uppercase">À propos</h2>
            <p className="mt-2 text-sm break-words whitespace-pre-wrap">{profile.bio}</p>
          </section>
        )}
        {!self && (
          <div className="mt-6 flex justify-center gap-4 text-xs text-muted">
            <button
              type="button"
              className="underline"
              onClick={() =>
                void reportUser(userId, name).then((sent) => sent && closeView())
              }
            >
              Signaler
            </button>
            <button
              type="button"
              className="underline"
              onClick={() =>
                void blockLive({ data: { self: deviceId(), other: userId } })
                  .then(() => {
                    toast("Bloqué");
                    closeView();
                  })
                  .catch(() => toast("Action impossible"))
              }
            >
              Bloquer
            </button>
          </div>
        )}
      </div>
      {self ? (
        <div className="dock border-t border-line px-4 pt-3">
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-signal font-bold text-night"
            onClick={() => {
              setTab("me");
              closeView();
            }}
          >
            <Pencil className="size-5" />
            Modifier mon profil
          </button>
        </div>
      ) : (
        <div className="dock grid grid-cols-2 gap-3 border-t border-line px-4 pt-3">
          <button
            type="button"
            disabled={state === "gone"}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-signal font-bold text-night disabled:opacity-40"
            onClick={() => openLive(userId, name)}
          >
            <MessageCircle className="size-5" />
            Écrire
          </button>
          <button
            type="button"
            disabled={state === "gone"}
            className="flex h-12 items-center justify-center gap-2 rounded-full border border-line font-bold disabled:opacity-40"
            onClick={() => void startCall(userId, name)}
          >
            <Video className="size-5" />
            Vidéo
          </button>
        </div>
      )}
    </div>
  );
}

/** Swipeable photo album with dots. */
function Album({ photos }: { photos: string[] }) {
  const [index, setIndex] = useState(0);
  return (
    <div className="w-full max-w-xs">
      <div
        className="flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto rounded-3xl bg-surface [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {photos.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`Photo ${i + 1}`}
            className="size-full shrink-0 snap-center object-cover"
            draggable={false}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
          {photos.map((_, i) => (
            <span
              key={i}
              className={"size-1.5 rounded-full " + (i === index ? "bg-ink" : "bg-line")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
