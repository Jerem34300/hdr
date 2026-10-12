import { useFavorites } from "@/lib/hdar/favorites";
import { useEffect, useRef, useState } from "react";
import { Eye, Mic, Plus, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/lib/hdar/confirm";
import { DESIRES, type Desire } from "@/lib/hdar/data";
import { deviceId } from "@/lib/hdar/device";
import { goDark, saveProfile } from "@/lib/hdar/live";
import { readImage } from "@/lib/hdar/media";
import { myPhotos, useHdar } from "@/lib/hdar/store";
import { DESIRE_ICON } from "./icons";

const MAX_PHOTOS = 5;
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
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Mon profil</h1>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-night disabled:opacity-40"
          disabled={!me.onboarded}
          onClick={() => openProfile(deviceId(), me.pseudo || "Moi")}
        >
          <Eye className="size-4" />
          Voir mon profil
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        C'est ce que les autres voient quand ils touchent ton pin.
      </p>

      <Favorites />

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Photos</h2>
        <p className="mt-1 text-xs text-muted">
          La première photo (celle du profil) est vérifiée avant d'être visible par les autres. Les suivantes forment ton album.
        </p>
        <p className="text-xs text-muted">
          Jusqu'à {MAX_PHOTOS}, facultatif. Touche une photo pour la mettre en premier.
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

      <section className="mt-10 border-t border-line pt-6">
        <button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-signal/60 text-sm text-signal"
          onClick={() =>
            void askConfirm({
              title: "Supprimer mon profil ?",
              body: "Ta photo, ton intro et tes infos sont effacées, tu disparais de la carte. Tes conversations restent chez les autres.",
              confirm: "Supprimer",
              danger: true,
            }).then(async (ok) => {
              if (!ok) return;
              const self = deviceId();
              await Promise.allSettled([
                goDark({ data: self }),
                saveProfile({
                  self,
                  pseudo: "Anonyme",
                  age: null,
                  bio: "",
                  tags: [],
                  photos: [],
                  voice: "",
                  voiceSec: 0,
                }),
              ]);
              reset();
            })
          }
        >
          <Trash2 className="size-4" />
          Supprimer mon profil
        </button>
      </section>
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
        <p className="mt-1 text-sm text-muted">Touche l'étoile sur un profil pour être prévenu quand il est sur la carte.</p>
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
