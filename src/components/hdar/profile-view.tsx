import { safeSrc } from "@/lib/hdar/media";
import { RichText } from "./rich-text";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HeartsCount } from "./hearts";
import { showOnMap, useMapFocus, useRegion } from "@/lib/hdar/map-focus";
import { ChevronLeft, MessageCircle, Pencil, Star, Video } from "lucide-react";
import { toggleFav, useFavorites } from "@/lib/hdar/favorites";
import { toast } from "sonner";
import { startCall } from "@/lib/hdar/call";
import { DESIRES, PLACES } from "@/lib/hdar/data";
import { GENDERS } from "@/lib/hdar/live";
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
import { openProChat, ProGiftSheet, useMyPro } from "./pro-tools";

const ICON: Record<string, string> = { verre: "🍸", discuter: "💬", plan: "🔥", balade: "🌆", sortir: "🎉", "chez-moi": "🏠", "chez-toi": "🚪", dehors: "🌳" };
const genderLabel = (id: string | null | undefined) => (id ? GENDERS.find((g) => g.id === id)?.label ?? "" : "");
const PALETTES = [["#FA6F6C", "#fbbf24"], ["#7c5cff", "#FA6F6C"], ["#14b8a6", "#A1E3C3"], ["#e8458b", "#7c5cff"], ["#2f7cf6", "#A1E3C3"], ["#fbbf24", "#e8458b"]];

function HeroPhoto({ src, name, online }: { src?: string; name: string; online: boolean }) {
  const [ok, setOk] = useState(true);
  const href = safeSrc(src);
  if (!href || !ok) return <GradientAvatar name={name} online={online} />;
  return (
    <div className="mx-auto aspect-[4/5] w-full max-w-xs overflow-hidden rounded-[28px] shadow-[0_0_40px_rgba(250,111,108,.35)] ring-1 ring-white/10">
      <img src={href} alt="" className="size-full object-cover" draggable={false} onError={() => setOk(false)} />
    </div>
  );
}

/** Pas de photo : grand avatar dégradé coloré (couleur stable par pseudo), jamais un carré gris. */
function GradientAvatar({ name, online }: { name: string; online: boolean }) {
  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [a, b] = PALETTES[h % PALETTES.length];
  return (
    <div className="relative mx-auto flex aspect-square w-48 items-center justify-center rounded-full p-[3px]" style={{ background: `conic-gradient(from 200deg, ${a}, ${b}, ${a})`, boxShadow: `0 0 50px ${a}66` }}>
      <div className="flex size-full items-center justify-center rounded-full" style={{ background: `radial-gradient(circle at 30% 25%, ${b}, ${a} 55%, #0b0b10 120%)` }}>
        <span className="font-display text-7xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.35)]">{name.slice(0, 1).toUpperCase()}</span>
      </div>
      {online && <span className="absolute right-5 bottom-5 size-6 rounded-full border-4 border-night bg-[#A1E3C3]" aria-label="En ligne" />}
    </div>
  );
}

const label = (id: string) => DESIRES.find((d) => d.id === id)?.label ?? PLACES.find((d) => d.id === id)?.label ?? id;

export function ProfileView({ userId, pseudo, demo }: { userId: string; pseudo: string; /** Aperçu de dev : profil fixe, pas de serveur. */ demo?: PublicProfile }) {
  const closeView = useHdar((s) => s.closeView);
  const openLive = useHdar((s) => s.openLive);
  const here = useHdar((s) => s.here);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone">("loading");
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const pros = useMyPro();
  const [giftOpen, setGiftOpen] = useState(false);
  const setTab = useHdar((s) => s.setTab);
  const self = userId === deviceId();
  const favs = useFavorites();
  const fav = favs.some((f) => f.id === userId);

  useEffect(() => {
    if (demo) { setProfile(demo); setState("ok"); return; }
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
  }, [userId, demo]);

  const name = profile?.pseudo || pseudo;
  const region = useRegion(self ? null : userId);
  const onMap = useMapFocus((s) => !!s.pins[userId]);
  const inLive = useMapFocus((s) => !!s.liveIds?.has(userId));
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
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {/* En-tête : photo plein cadre ou avatar dégradé, halos coral / vert comme sur la carte. */}
        <div className="relative overflow-hidden">
          <span aria-hidden className="pointer-events-none absolute -top-16 -left-16 size-56 rounded-full bg-[#FA6F6C]/35 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -top-10 -right-20 size-56 rounded-full bg-[#A1E3C3]/25 blur-3xl" />
          <div className="relative px-5 pt-5">
            {extras && extras.album.length > 0 ? (
              <Album photos={extras.album} />
            ) : (
              <HeroPhoto src={profile?.photo} name={name} online={!!profile?.online} />
            )}
          </div>
          <div className="relative mt-4 px-5 text-center">
            <h1 className="font-display text-[34px] leading-tight font-extrabold tracking-tight">
              {name}
              {profile?.age ? <span className="font-bold text-[#A1E3C3]">, {profile.age}</span> : null}
              {profile?.premium && <PremiumBadge className="ml-2 align-middle" />}
            </h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
              {profile?.online ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#A1E3C3]/15 px-3 py-1.5 text-[#A1E3C3] ring-1 ring-[#A1E3C3]/40"><span className="size-2 animate-pulse rounded-full bg-[#A1E3C3]" />En ligne</span>
              ) : state === "ok" ? (
                <span className="rounded-full bg-white/5 px-3 py-1.5 text-muted ring-1 ring-white/10">Hors ligne</span>
              ) : null}
              {distance && <span className="rounded-full bg-[#FA6F6C]/15 px-3 py-1.5 text-[#FA6F6C] ring-1 ring-[#FA6F6C]/40">📍 {distance}</span>}
              {region && <span className="rounded-full bg-white/5 px-3 py-1.5 text-ink/80 ring-1 ring-white/10">{region}</span>}
              <HeartsCount id={userId} />
            </div>
            {(!self || inLive) && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {!self && (
                  <button type="button" onClick={() => showOnMap(userId)} className={"inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ring-1 " + (onMap ? "bg-surface ring-white/15" : "bg-surface/60 text-muted ring-white/10")}>🗺️ Voir sur la carte</button>
                )}
                {inLive && !self && (
                  <Link to="/live" search={{ with: userId, name } as never} className="inline-flex items-center gap-1.5 rounded-full bg-signal px-3.5 py-2 text-xs font-bold text-white">🎥 Rejoindre son live</Link>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="px-5">
        {state === "loading" && <p className="mt-8 text-center text-sm text-muted">Chargement du profil…</p>}
        {state === "gone" && <p className="mt-8 text-center text-sm text-muted">Profil indisponible.</p>}
        {profile && (profile.iam || profile.seeking.length > 0) && (
          <section className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-[#FA6F6C]/20 to-transparent p-3 ring-1 ring-[#FA6F6C]/30">
              <p className="text-[11px] tracking-wide text-muted uppercase">Je suis</p>
              <p className="mt-0.5 font-display text-lg font-extrabold">{genderLabel(profile.iam) || "—"}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-[#A1E3C3]/20 to-transparent p-3 ring-1 ring-[#A1E3C3]/30">
              <p className="text-[11px] tracking-wide text-muted uppercase">Je cherche</p>
              <p className="mt-0.5 font-display text-lg leading-snug font-extrabold">{profile.seeking.map(genderLabel).filter(Boolean).join(", ") || "—"}</p>
            </div>
          </section>
        )}
        {profile?.note && (
          <p className="mt-5 rounded-2xl bg-surface px-4 py-3 text-sm break-words ring-1 ring-white/10">💬 <i>« {profile.note} »</i></p>
        )}
        {profile && profile.desires.length > 0 && profile.online && (
          <section className="mt-6">
            <h2 className="text-xs font-bold tracking-wide text-[#FA6F6C] uppercase">🌙 Ce soir</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.desires.map((d) => (
                <span key={d} className="rounded-full bg-gradient-to-r from-[#FA6F6C] to-[#ff9a7a] px-3.5 py-1.5 text-sm font-bold text-night shadow-[0_0_16px_rgba(250,111,108,.45)]">
                  {ICON[d] ?? "✨"} {label(d)}
                </span>
              ))}
            </div>
          </section>
        )}
        {profile && profile.tags.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-bold tracking-wide text-[#A1E3C3] uppercase">💫 Envies</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.tags.map((t) => (
                <span key={t} className="rounded-full bg-[#A1E3C3]/15 px-3.5 py-1.5 text-sm font-bold text-[#A1E3C3] ring-1 ring-[#A1E3C3]/40">
                  {ICON[t] ?? "✨"} {label(t)}
                </span>
              ))}
            </div>
          </section>
        )}
        {profile?.bio && (
          <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-white/10">
            <h2 className="text-xs font-bold tracking-wide text-muted uppercase">À propos</h2>
            <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap"><RichText text={profile.bio} mentions={false} /></p>
          </section>
        )}
        {extras?.voice && (
          <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-white/10">
            <h2 className="text-xs font-bold tracking-wide text-muted uppercase">🎙️ Intro vocale</h2>
            <audio controls preload="metadata" src={extras.voice} className="mt-2 h-10 w-full" />
          </section>
        )}
        {!self && (
          <div className="mt-8 flex justify-center gap-5 text-[11px] text-muted/70">
            <button type="button" className="hover:underline" onClick={() => void reportUser(userId, name).then((sent) => sent && closeView())}>Signaler</button>
            <button
              type="button"
              className="hover:underline"
              onClick={() =>
                void blockLive({ data: { self: deviceId(), other: userId } })
                  .then(() => { toast("Bloqué"); closeView(); })
                  .catch(() => toast("Action impossible"))
              }
            >
              Bloquer
            </button>
          </div>
        )}
        </div>
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
            className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FA6F6C] to-[#ff8f6b] py-3.5 font-display text-lg font-extrabold text-night shadow-[0_0_24px_rgba(250,111,108,.55)] active:scale-[.98] disabled:opacity-40"
            onClick={() => openLive(userId, name)}
          >
            <MessageCircle className="size-5" />
            Écrire
          </button>
          <button
            type="button"
            disabled={state === "gone"}
            className="flex items-center justify-center gap-2 rounded-full bg-[#A1E3C3] py-3.5 font-display text-lg font-extrabold text-night shadow-[0_0_24px_rgba(161,227,195,.45)] active:scale-[.98] disabled:opacity-40"
            onClick={() => void startCall(userId, name)}
          >
            <Video className="size-5" />
            Vidéo
          </button>
          {pros.length > 0 && <>
            <button type="button" disabled={state === "gone"} className="flex h-11 items-center justify-center gap-1 rounded-full border border-[#fbbf24]/60 text-sm font-bold text-[#fbbf24] disabled:opacity-40"
              onClick={() => void openProChat(pros[0].id, userId).then((ok) => ok && openLive(userId, name))}>💬 Écrire en pro</button>
            <button type="button" disabled={state === "gone"} className="flex h-11 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] text-sm font-bold text-night disabled:opacity-40"
              onClick={() => setGiftOpen(true)}>🎁 Cadeau pro</button>
          </>}
        </div>
      )}
      {giftOpen && <ProGiftSheet places={pros} to={userId} pseudo={name} via="profile" onClose={() => setGiftOpen(false)} />}
    </div>
  );
}

/** Swipeable photo album with dots. */
function Album({ photos }: { photos: string[] }) {
  const [index, setIndex] = useState(0);
  return (
    <div className="mx-auto w-full max-w-xs">
      <div
        className="flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto rounded-[28px] bg-surface shadow-[0_0_40px_rgba(250,111,108,.35)] ring-1 ring-white/10 [scrollbar-width:none]"
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
