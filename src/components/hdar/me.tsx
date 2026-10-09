import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DESIRES, PEOPLE, type Desire } from "@/lib/hdar/data";
import { mediaUrl, readImage, rememberMedia } from "@/lib/hdar/media";
import { useHdar } from "@/lib/hdar/store";
import { Avatar } from "./avatar";
import { DESIRE_ICON } from "./icons";

export function Me() {
  const me = useHdar((s) => s.me);
  const patchMe = useHdar((s) => s.patchMe);
  const discreet = useHdar((s) => s.discreet);
  const setDiscreet = useHdar((s) => s.setDiscreet);
  const setCover = useHdar((s) => s.setCover);
  const openShare = useHdar((s) => s.openShare);
  const saveEmail = useHdar((s) => s.saveEmail);
  const reset = useHdar((s) => s.reset);
  const reports = useHdar((s) => s.reports);
  const [email, setEmail] = useState(me.email);
  const [bio, setBio] = useState(me.bio);
  const voice = mediaUrl("me-voice");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Réglages</h1>
      <div className="mt-4 flex items-center gap-4">
        <Avatar src={me.photo} name={me.pseudo || "?"} className="size-20 rounded-full" />
        <div>
          <p className="font-display text-xl font-bold">{me.pseudo || "Pas encore de pseudo"}</p>
          <p className="text-sm text-muted">{me.age ? `${me.age} ans` : "18+ à confirmer au premier geste"}</p>
        </div>
      </div>
      <label className="mt-4 flex h-11 items-center justify-center rounded-full border border-line text-sm">
        Changer la photo
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void readImage(file)
              .then((photo) => patchMe({ photo }))
              .catch(() => toast("Photo illisible"));
          }}
        />
      </label>
      <label className="mt-4 block text-sm">
        Intro
        <textarea
          className="mt-1 h-20 w-full rounded-2xl border border-line bg-night px-4 py-3 outline-none focus-visible:border-signal"
          maxLength={80}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          onBlur={() => patchMe({ bio: bio.slice(0, 80) })}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {DESIRES.map((d) => {
          const on = me.tags.includes(d.id);
          const Icon = DESIRE_ICON[d.id];
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                const tags: Desire[] = on ? me.tags.filter((t) => t !== d.id) : [...me.tags, d.id];
                patchMe({ tags });
              }}
              className={"flex h-11 items-center gap-2 rounded-full px-3 text-sm " + (on ? "bg-signal text-night" : "border border-line")}
            >
              <Icon className="size-4" />
              {d.label}
            </button>
          );
        })}
      </div>
      <section className="mt-6 space-y-3">
        <h2 className="font-display text-lg font-bold">Visibilité</h2>
        <Toggle
          on={me.visibility === "ghost"}
          label="Mode fantôme"
          hint="Retiré de la carte et de la grille. Tu restes dans les spots où tu écris."
          onClick={() => patchMe({ visibility: me.visibility === "ghost" ? "zone" : "ghost" })}
        />
        <Toggle
          on={me.homeZone}
          label="Zone domicile"
          hint="Dans ce cercle, tu n'apparais pas sur la carte."
          onClick={() => patchMe({ homeZone: !me.homeZone })}
        />
      </section>
      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Intro vocale · 10 s</h2>
        <VoiceIntro />
        {me.voiceSec > 0 && <p className="mt-2 text-xs text-muted">Enregistrée · {me.voiceSec}s</p>}
        {voice && <audio controls src={voice} className="mt-2 h-9 w-full" />}
      </section>
      <section className="mt-6 space-y-3">
        <h2 className="font-display text-lg font-bold">Sécurité</h2>
        <p className="text-sm text-muted">Sortie rapide : l'écran devient Notes ou Météo. Pour revenir, maintiens l'heure trois secondes.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDiscreet("notes")}
            className={"h-11 flex-1 rounded-full text-sm " + (discreet === "notes" ? "bg-ink text-night" : "border border-line")}
          >
            Notes
          </button>
          <button
            type="button"
            onClick={() => setDiscreet("meteo")}
            className={"h-11 flex-1 rounded-full text-sm " + (discreet === "meteo" ? "bg-ink text-night" : "border border-line")}
          >
            Météo
          </button>
        </div>
        <Button variant="line" className="w-full" onClick={() => setCover(true)}>
          Sortie rapide
        </Button>
        <Button variant="line" className="w-full" onClick={openShare}>
          Prévenir un proche
        </Button>
      </section>
      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Signalements</h2>
        <p className="mt-1 text-sm text-muted">Les personnes signalées sont bloquées des deux côtés et listées ici.</p>
        <ul className="mt-3 space-y-2">
          {reports.length === 0 && <li className="text-sm text-muted">Aucun signalement.</li>}
          {reports.map((id) => {
            const person = PEOPLE.find((p) => p.id === id);
            return (
              <li key={id} className="rounded-2xl border border-line px-4 py-3 text-sm">
                {person?.pseudo ?? id} · bloqué
              </li>
            );
          })}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="font-display text-lg font-bold">Garder mon profil</h2>
        <p className="mt-1 text-sm text-muted">Facultatif. Enregistré sur cet appareil pour le retrouver ici.</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveEmail(email);
          }}
        >
          <input
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none"
            value={email}
            type="email"
            placeholder="email"
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="line">
            Sauver
          </Button>
        </form>
      </section>
      <button type="button" className="mt-8 text-sm text-muted underline" onClick={reset}>
        Effacer cet appareil
      </button>
      <a href="/debug" className="mt-4 block text-sm text-muted underline">
        Diagnostic
      </a>
    </div>
  );
}

function Toggle({ on, label, hint, onClick }: { on: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-left">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span className={"h-7 w-12 shrink-0 rounded-full p-1 " + (on ? "bg-signal" : "bg-line")}>
        <span className={"block size-5 rounded-full bg-night transition-transform " + (on ? "translate-x-5" : "")} />
      </span>
    </button>
  );
}

function VoiceIntro() {
  const patchMe = useHdar((s) => s.patchMe);
  const [sec, setSec] = useState(0);
  const [rec, setRec] = useState<MediaRecorder | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const t0 = Date.now();
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        rememberMedia("me-voice", url);
        patchMe({ voiceSec: Math.min(10, Math.max(1, Math.round((Date.now() - t0) / 1000))) });
        setSec(0);
        setRec(null);
      };
      mr.start();
      setRec(mr);
      const id = window.setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        setSec(s);
        if (s >= 10) {
          window.clearInterval(id);
          mr.stop();
        }
      }, 250);
    } catch {
      toast("Micro indisponible");
    }
  }

  return (
    <Button variant="line" className="mt-2 w-full" onClick={() => (rec ? rec.stop() : void start())}>
      {rec ? `Stop · ${sec}s` : "Enregistrer 10 s"}
    </Button>
  );
}
