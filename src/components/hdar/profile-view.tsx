import { useEffect, useState } from "react";
import { ChevronLeft, MessageCircle, Video } from "lucide-react";
import { toast } from "sonner";
import { startCall } from "@/lib/hdar/call";
import { DESIRES } from "@/lib/hdar/data";
import { deviceId } from "@/lib/hdar/device";
import { blockLive, getProfile, reportLive, type PublicProfile } from "@/lib/hdar/live";
import { bucketDistance, haversine } from "@/lib/hdar/rules";
import { useHdar } from "@/lib/hdar/store";
import { Avatar } from "./avatar";

const label = (id: string) => DESIRES.find((d) => d.id === id)?.label ?? id;

export function ProfileView({ userId, pseudo }: { userId: string; pseudo: string }) {
  const closeView = useHdar((s) => s.closeView);
  const openLive = useHdar((s) => s.openLive);
  const here = useHdar((s) => s.here);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone">("loading");

  useEffect(() => {
    let alive = true;
    getProfile(deviceId(), userId)
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setState(p ? "ok" : "gone");
      })
      .catch(() => alive && setState("gone"));
    return () => {
      alive = false;
    };
  }, [userId]);

  const name = profile?.pseudo || pseudo;
  const distance =
    here && profile?.lat != null && profile.lng != null
      ? bucketDistance(haversine(here, { lat: profile.lat, lng: profile.lng }))
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour" onClick={closeView}>
          <ChevronLeft />
        </button>
        <p className="min-w-0 flex-1 truncate font-display font-bold">Profil</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-6">
        <div className="flex flex-col items-center text-center">
          <Avatar src={profile?.photo} name={name} className="size-40 rounded-3xl" />
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
            {name}
            {profile?.age ? <span className="font-normal text-muted">, {profile.age}</span> : null}
          </h1>
          <p className="mt-1 text-sm">
            {profile?.online ? (
              <span className="text-online">● En ligne</span>
            ) : state === "ok" ? (
              <span className="text-muted">Hors ligne</span>
            ) : null}
            {distance && <span className="text-muted"> · {distance}</span>}
          </p>
        </div>
        {state === "loading" && <p className="mt-8 text-center text-sm text-muted">Chargement du profil…</p>}
        {state === "gone" && <p className="mt-8 text-center text-sm text-muted">Profil indisponible.</p>}
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
        <div className="mt-6 flex justify-center gap-4 text-xs text-muted">
          <button
            type="button"
            className="underline"
            onClick={() =>
              void reportLive({ data: { self: deviceId(), other: userId } })
                .then(() => {
                  toast("Signalé et bloqué");
                  closeView();
                })
                .catch(() => toast("Action impossible"))
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
      </div>
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
    </div>
  );
}
