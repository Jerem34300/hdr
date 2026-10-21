import { FounderCard } from "./launch-offer";
import { AmbNudge, ProfileAmb } from "./profile-card";
import { InviteCard, PremiumCard, RedeemCode } from "./growth";
import { openIntro } from "./intro-video";
import { ProSettings, ProSpaceCard } from "./pro-tools";
import { MapPrivacyToggle, NotifySettings } from "./notify-settings";
import { ProtectProfileCard } from "./recover";
import { HeartsCount } from "./hearts";
import { getSensitiveConsent, setSensitiveConsent } from "@/lib/hdar/consent";
import { deleteMyData } from "@/lib/hdar/live";
import { wipeLocalSession } from "@/lib/hdar/session";
import { track } from "@/lib/hdar/track";
import { useFavorites } from "@/lib/hdar/favorites";
import { useEffect, useRef, useState } from "react";
import { Eye, Mic, Plus, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/lib/hdar/confirm";
import { DESIRES, type Desire } from "@/lib/hdar/data";
import { deviceId } from "@/lib/hdar/device";
import { goDark, saveProfile, setProfileNote } from "@/lib/hdar/live";
import { readImage } from "@/lib/hdar/media";
import { myPhotos, useHdar } from "@/lib/hdar/store";
import { DESIRE_ICON } from "./icons";
import { ChevronLeft, Settings, Sparkles } from "lucide-react";
import { fmtLeft, useActiveBoost, useNow } from "./boost";
import { GENDERS, getProfile, identityLine, setIdentity } from "@/lib/hdar/live";
import { usePremium } from "@/lib/hdar/premium";
import { Link } from "@tanstack/react-router";
import { PremiumBadge } from "./premium";

const MAX_VOICE_SEC = 10;

export function Me() {
  const me = useHdar((s) => s.me);
  const patchMe = useHdar((s) => s.patchMe);
  const openProfile = useHdar((s) => s.openProfile);
  const reset = useHdar((s) => s.reset);
  const photos = myPhotos(me);
  const [pseudo, setPseudo] = useState(me.pseudo);
  const [age, setAge] = useState(me.age ? String(me.age) : "");
  const [bio, setBio] = useState(me.bio);
  const [note, setNote] = useState(me.note ?? "");
  const [settings, setSettings] = useState(false);
  const MAX_PHOTOS = usePremium((s) => s.photoLimit);
  const isPrem = usePremium((s) => s.premium);
  const [iam, setIam] = useState("");
  const [seeking, setSeeking] = useState<string[]>([]);
  useEffect(() => {
    void usePremium.getState().refresh();
    if (me.onboarded) void getProfile(deviceId(), deviceId()).then((p) => { if (p) { setIam(p.iam); setSeeking(p.seeking); setSaved({ iam: p.iam, seeking: p.seeking }); } }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [consent, setConsent] = useState(false);
  useEffect(() => { if (me.onboarded) void getSensitiveConsent().then(setConsent).catch(() => undefined); }, [me.onboarded]);
  const [saved, setSaved] = useState({ iam: "", seeking: [] as string[] });
  const dirty = iam !== saved.iam || [...seeking].sort().join() !== [...saved.seeking].sort().join();
  const picked = !!iam || seeking.length > 0;
  const saveIdentity = async () => {
    if (!me.onboarded) { toast("Crée d'abord ton profil"); return; }
    if (picked && !consent) { toast("Coche la case pour enregistrer ces infos"); return; }
    try {
      if (picked) await setSensitiveConsent(true);
      await setIdentity(iam, seeking);
      if (!picked && consent) { await setSensitiveConsent(false); setConsent(false); }
      setSaved({ iam, seeking });
      toast("Profil enregistré");
    } catch (e) { toast((e as Error).message.includes("profil") ? "Crée d'abord ton profil" : (e as Error).message); }
  };
  const [savingAll, setSavingAll] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => { if (!savedAt) return; const t = setTimeout(() => setSavedAt(0), 2500); return () => clearTimeout(t); }, [savedAt]);
  const saveAll = async () => {
    const ps = pseudo.trim().slice(0, 24); const n = Number(age);
    if (ps.length < 2) return toast("Pseudo : 2 lettres minimum");
    if (!(n >= 18 && n <= 99)) return toast("Âge entre 18 et 99 ans");
    if ((iam || seeking.length) && !consent && dirty) return toast("Coche la case pour enregistrer Je suis / Je cherche");
    setSavingAll(true);
    try {
      const cleanNote = note.trim().slice(0, 60);
      patchMe({ pseudo: ps, age: n, bio: bio.slice(0, 300), note: cleanNote });
      const m = useHdar.getState().me;
      await saveProfile({ self: deviceId(), pseudo: ps, age: n, bio: m.bio, tags: m.tags, photos: myPhotos(m), voice: m.voice ?? "", voiceSec: m.voiceSec });
      await setProfileNote(cleanNote);
      if (dirty) await saveIdentity();
      setSavedAt(Date.now());
      track("profile_saved");
      toast("Profil enregistré ✓");
    } catch (e) { toast(`Échec de l'enregistrement : ${(e as Error).message}`); }
    finally { setSavingAll(false); }
  };
  if (settings) return <SettingsScreen onBack={() => setSettings(false)} />;

  async function addPhotos(files: FileList) {
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) toast(`${MAX_PHOTOS} photos maximum`);
    const added: string[] = [];
    for (const file of picked) {
      try {
        added.push(await readImage(file, 900));
      } catch {
        toast("Une photo est illisible");
      }
    }
    if (added.length)
      patchMe({ photos: [...myPhotos(useHdar.getState().me), ...added].slice(0, MAX_PHOTOS) });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-28">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Mon profil</h1>
        <button type="button" aria-label="Paramètres" title="Paramètres" onClick={() => setSettings(true)}
          className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink">
          <Settings className="size-5" />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-3xl border border-line bg-surface p-4">
        <span className="size-20 shrink-0 overflow-hidden rounded-full border-2 border-white bg-night">
          {photos[0] ? <img src={photos[0]} alt="" className="size-full object-cover" /> : (
            <span className="flex size-full items-center justify-center font-display text-2xl font-bold">{(me.pseudo || "?").slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-extrabold">{me.pseudo || "Sans pseudo"}{me.age ? <span className="font-normal text-muted"> · {me.age} ans</span> : null}{isPrem && <PremiumBadge className="ml-1.5 align-middle" />}</p>
          <HeartsCount id={deviceId()} className="mt-0.5" />
          {identityLine(iam, seeking) && <p className="text-xs font-bold text-ink/80">{identityLine(iam, seeking)}</p>}
          <p className={"mt-0.5 text-sm break-words " + (me.note ? "italic" : "text-muted")}>{me.note ? `💬 « ${me.note} »` : "Ajoute ta phrase du moment ci-dessous"}</p>
          <button type="button" disabled={!me.onboarded} onClick={() => openProfile(deviceId(), me.pseudo || "Moi")}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-bold text-night disabled:opacity-40">
            <Eye className="size-3.5" /> Voir mon profil
          </button>
        </div>
      </div>
      <BoostButton />
      <ProSpaceCard />
      <ProfileAmb where="top" />
      <AmbNudge />
      <FounderCard />
      <PremiumCard />
      <InviteCard />
      <RedeemCode />
      <button type="button" onClick={openIntro} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-surface font-display font-bold text-ink active:scale-[.98]">🎬 Comment ça marche</button>

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Je suis</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <button key={g.id} type="button" onClick={() => setIam(iam === g.id ? "" : g.id)}
              className={"h-9 rounded-full border px-3 text-sm disabled:opacity-40 " + (iam === g.id ? "border-transparent bg-ink font-bold text-night" : "border-line")}>{g.label}</button>
          ))}
        </div>
        <h2 className="mt-4 font-display text-lg font-bold">Je cherche</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <button key={g.id} type="button" onClick={() => setSeeking(seeking.includes(g.id) ? seeking.filter((x) => x !== g.id) : [...seeking, g.id])}
              className={"h-9 rounded-full border px-3 text-sm disabled:opacity-40 " + (seeking.includes(g.id) ? "border-transparent bg-ink font-bold text-night" : "border-line")}>{g.label}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Facultatif, affiché sur ta fiche (ex. « H · cherche H, X »).</p>
        {picked && (
          <label className="mt-3 flex items-start gap-2 rounded-2xl border border-line p-3 text-xs text-muted">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>J'accepte que hdar. enregistre et affiche sur ma fiche mon genre et ce que je cherche, qui peuvent révéler mon orientation sexuelle (donnée sensible, art. 9 RGPD). Facultatif ; tout désélectionner efface ces infos. <a href="/confidentialite" className="underline">En savoir plus</a></span>
          </label>
        )}
        {dirty && (
          <button type="button" disabled={picked && !consent} onClick={() => void saveIdentity()}
            className="mt-3 h-12 w-full rounded-full bg-signal font-display font-bold text-night disabled:opacity-40">Enregistrer mon profil</button>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Photos</h2>
        <p className="mt-1 text-xs text-muted">
          Photo facultative. La première (celle du profil) passe un contrôle automatique. Les
          suivantes forment ton album.
        </p>
        <p className="text-xs text-muted">
          Jusqu'à {MAX_PHOTOS}, facultatif. Touche une photo pour la mettre en premier.
          {!isPrem && <> <Link to="/premium" className="underline">20 avec hdar+</Link></>}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <div
              key={`${i}-${src.length}`}
              className="relative aspect-square overflow-hidden rounded-2xl bg-surface"
            >
              <button
                type="button"
                className="block size-full"
                aria-label={i === 0 ? "Photo principale" : "Mettre en photo principale"}
                onClick={() =>
                  i > 0 && patchMe({ photos: [src, ...photos.filter((_, j) => j !== i)] })
                }
              >
                <img src={src} alt="" className="size-full object-cover" />
              </button>
              {i === 0 && (
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-signal px-2 py-0.5 text-[10px] font-bold text-night">
                  Principale
                </span>
              )}
              <button
                type="button"
                aria-label="Retirer cette photo"
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-night/85"
                onClick={() => patchMe({ photos: photos.filter((_, j) => j !== i) })}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-xs text-muted">
              <Plus className="size-6" />
              Ajouter
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) void addPhotos(files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Intro vocale</h2>
        <p className="text-xs text-muted">
          {MAX_VOICE_SEC} secondes pour te présenter, facultatif.
        </p>
        <VoiceIntro />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="font-display text-lg font-bold">Toi</h2>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <label className="block text-xs text-muted">
            Pseudo
            <input
              className="mt-1 h-11 w-full rounded-full border border-line bg-night px-4 text-base text-ink outline-none focus-visible:border-signal"
              value={pseudo}
              maxLength={24}
              onChange={(e) => setPseudo(e.target.value)}
              onBlur={() => {
                const clean = pseudo.trim().slice(0, 24);
                if (clean.length >= 2) patchMe({ pseudo: clean });
                else setPseudo(me.pseudo);
              }}
            />
          </label>
          <label className="block text-xs text-muted">
            Âge
            <input
              className="mt-1 h-11 w-full rounded-full border border-line bg-night px-4 text-base text-ink outline-none focus-visible:border-signal"
              inputMode="numeric"
              value={age}
              maxLength={2}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
              onBlur={() => {
                const n = Number(age);
                if (n >= 18 && n <= 99) patchMe({ age: n });
                else {
                  if (age) toast("Âge entre 18 et 99 ans");
                  setAge(me.age ? String(me.age) : "");
                }
              }}
            />
          </label>
        </div>
        <label className="block text-xs text-muted">
          Ta phrase du moment
          <input
            className="mt-1 h-11 w-full rounded-full border border-line bg-night px-4 text-base text-ink outline-none focus-visible:border-signal"
            maxLength={60}
            value={note}
            placeholder="Ex. Nouveau dans le quartier, partant pour un verre"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              const clean = note.trim().slice(0, 60);
              if (clean === (me.note ?? "")) return;
              patchMe({ note: clean });
              void setProfileNote(clean).catch(() => toast("Phrase non enregistrée, réessaie"));
            }}
          />
          <span className="mt-1 block">Affichée en haut de ton profil, visible par tous · {note.length}/60</span>
        </label>
        <label className="block text-xs text-muted">
          À propos
          <textarea
            className="mt-1 h-24 w-full rounded-2xl border border-line bg-night px-4 py-3 text-base text-ink outline-none focus-visible:border-signal"
            maxLength={300}
            value={bio}
            placeholder="Quelques mots sur toi, ce que tu cherches…"
            onChange={(e) => setBio(e.target.value)}
            onBlur={() => patchMe({ bio: bio.slice(0, 300) })}
          />
        </label>
      </section>
      {!me.onboarded && (
        <button type="button" onClick={() => {
          const n = Number(age); const ps = pseudo.trim().slice(0, 24);
          if (ps.length < 2) return toast("Choisis un pseudo (2 lettres min.)");
          if (!(n >= 18 && n <= 99)) return toast("Âge entre 18 et 99 ans");
          useHdar.getState().completeGate({ pseudo: ps, age: n, adult: true, tags: me.tags, photo: me.photo });
          toast("Profil créé 🎉");
        }} className="boost-cta mt-4 h-12 w-full rounded-full font-display font-extrabold text-night">Enregistrer mon profil</button>
      )}

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Envies</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {DESIRES.map((d) => {
            const on = me.tags.includes(d.id);
            const Icon = DESIRE_ICON[d.id];
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const tags: Desire[] = on
                    ? me.tags.filter((t) => t !== d.id)
                    : [...me.tags, d.id];
                  patchMe({ tags });
                }}
                className={
                  "flex h-11 items-center gap-2 rounded-full px-3 text-sm " +
                  (on ? "bg-signal text-night" : "border border-line")
                }
              >
                <Icon className="size-4" />
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      <Favorites />
      <ProtectProfileCard />
      {me.onboarded && (
        <div className="mt-8 mb-6">
          <button type="button" disabled={savingAll} onClick={() => void saveAll()}
            className="boost-cta h-14 w-full rounded-full font-display text-lg font-extrabold text-night shadow-[0_8px_30px_rgba(0,0,0,.5)] disabled:opacity-60">
            {savingAll ? "Enregistrement…" : savedAt ? "✓ Profil enregistré" : "Enregistrer mon profil"}
          </button>
        </div>
      )}
      <ProfileAmb where="bottom" />
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("audio"));
    reader.readAsDataURL(blob);
  });
}

function VoiceIntro() {
  const voice = useHdar((s) => s.me.voice ?? "");
  const voiceSec = useHdar((s) => s.me.voiceSec);
  const patchMe = useHdar((s) => s.patchMe);
  const [sec, setSec] = useState<number | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timer = useRef(0);

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      const mr = recRef.current;
      if (mr && mr.state !== "inactive") {
        mr.onstop = null;
        mr.stop();
        mr.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  function stop() {
    window.clearInterval(timer.current);
    const mr = recRef.current;
    recRef.current = null;
    if (mr && mr.state !== "inactive") mr.stop();
  }

  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Ton navigateur ne gère pas l'enregistrement");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Micro refusé. Autorise-le dans ton navigateur.");
      return;
    }
    const mr = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
    const chunks: Blob[] = [];
    const t0 = Date.now();
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setSec(null);
      const length = Math.min(MAX_VOICE_SEC, Math.max(1, Math.round((Date.now() - t0) / 1000)));
      void blobToDataUrl(new Blob(chunks, { type: mr.mimeType || "audio/webm" }))
        .then((data) => patchMe({ voice: data, voiceSec: length }))
        .catch(() => toast("Enregistrement illisible"));
    };
    mr.start();
    recRef.current = mr;
    setSec(0);
    timer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      setSec(s);
      if (s >= MAX_VOICE_SEC) stop();
    }, 250);
  }

  if (sec !== null) {
    return (
      <button
        type="button"
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-signal font-bold text-night"
        onClick={stop}
      >
        <Square className="size-4" />
        Arrêter · {sec}s / {MAX_VOICE_SEC}
      </button>
    );
  }
  if (voice) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <audio controls src={voice} className="h-10 min-w-0 flex-1" />
        <button
          type="button"
          aria-label="Refaire l'intro vocale"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line"
          onClick={() => void start()}
        >
          <Mic className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Supprimer l'intro vocale"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line"
          onClick={() => patchMe({ voice: "", voiceSec: 0 })}
        >
          <Trash2 className="size-4" />
        </button>
        <span className="sr-only">{voiceSec} secondes</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line"
      onClick={() => void start()}
    >
      <Mic className="size-4" />
      Enregistrer
    </button>
  );
}

function Favorites() {
  const favs = useFavorites();
  const openProfile = useHdar((s) => s.openProfile);
  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-bold">Favoris</h2>
      {favs.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          Touche l'étoile sur un profil pour être prévenu quand il est sur la carte.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {favs.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-between text-left"
                onClick={() => openProfile(f.id, f.pseudo)}
              >
                <span className="truncate">★ {f.pseudo}</span>
                <span className={f.live ? "text-sm text-online" : "text-sm text-muted"}>
                  {f.live ? "● Sur la carte" : "Hors carte"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BoostButton() {
  const b = useActiveBoost();
  const now = useNow(b ? 1000 : 60000);
  return (
    <a
      href="/boost"
      className="boost-cta mt-4 mb-3 flex h-14 items-center justify-center gap-2 rounded-full font-display text-base font-extrabold text-night"
    >
      <Sparkles className="sparkle size-5" />
      {b ? <span className="tabular-nums">Boost actif · {fmtLeft(new Date(b.ends_at).getTime() - now)}</span> : "Booster mon profil"}
    </a>
  );
}

/** Paramètres : notifications, sons, confidentialité, compte. Ouvert par la roue ⚙️ du profil. */
function SettingsScreen({ onBack }: { onBack: () => void }) {
  const reset = useHdar((s) => s.reset);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-10">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Retour au profil" onClick={onBack} className="-ml-2 flex size-11 items-center justify-center">
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Paramètres</h1>
      </div>
      <RedeemCode />
      <NotifySettings />
      <section className="mt-6"><p className="mb-1 text-xs font-bold tracking-[0.2em] text-muted uppercase">Carte</p><MapPrivacyToggle /></section>
      <ProSettings />
      <p className="mt-6 text-center text-xs text-muted">ID support : <span className="font-mono">{deviceId().slice(0, 8)}</span> · à donner au support si tu as perdu ton profil</p>
      <section className="mt-8 border-t border-line pt-6">
        <button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-signal/60 text-sm text-signal"
          onClick={() =>
            void askConfirm({
              title: "Supprimer toutes mes données ?",
              body: "Profil, photos, vocal, messages envoyés et reçus, médias, favoris, position et compte anonyme sont effacés définitivement de nos serveurs. Irréversible.",
              confirm: "Tout supprimer",
              danger: true,
            }).then(async (ok) => {
              if (!ok) return;
              try {
                await deleteMyData();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Suppression impossible, réessaie");
                return;
              }
              reset();
              await wipeLocalSession();
              window.location.assign("/");
            })
          }
        >
          <Trash2 className="size-4" />
          Supprimer toutes mes données
        </button>
        <p className="mt-4 text-center text-xs text-muted">
          <a className="underline" href="/confidentialite">
            Confidentialité
          </a>{" "}
          ·{" "}
          <a className="underline" href="/cgu">
            Conditions d'utilisation
          </a>{" "}
          ·{" "}
          <a className="underline" href="/contact">
            Contact
          </a>
          <br />
          <a className="mt-2 inline-block text-[11px] opacity-70 hover:underline" href="/pro">
            Espace pro · lieux partenaires
          </a>{" "}
          <span className="text-[11px] opacity-70">·</span>{" "}
          <a className="mt-2 inline-block text-[11px] opacity-70 hover:underline" href="/ambassadeur">
            Deviens ambassadeur
          </a>
        </p>
      </section>
    </div>
  );
}
