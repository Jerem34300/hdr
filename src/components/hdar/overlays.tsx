import { RichText } from "./rich-text";
import { useOpenAtTop } from "@/lib/hdar/scroll-end";
import { tf } from "@/lib/hdar/i18n";
import { setProfileNote } from "@/lib/hdar/live";
import { flyTo } from "@/lib/hdar/map-focus";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CITIES, DESIRES, LENGTHS, PLACES, type Desire, type PlaceKind, type TonightLen } from "@/lib/hdar/data";
import { readImage } from "@/lib/hdar/media";
import { isExpired, remainingLabel } from "@/lib/hdar/rules";
import { cn } from "@/lib/cn";
import { useScene } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { Avatar } from "./avatar";
import { DESIRE_ICON } from "./icons";
import { bindTap } from "./tap";

export function Sheets() {
  const sheet = useHdar((s) => s.sheet);
  if (!sheet) return null;
  const person = typeof sheet === "object";
  return <SheetPanel sheet={sheet} person={person} />;
}
function SheetPanel({ sheet, person }: { sheet: NonNullable<ReturnType<typeof useHdar.getState>["sheet"]>; person: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useOpenAtTop(panel, typeof sheet === "object" ? JSON.stringify(sheet) : sheet);
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-night/70" aria-label="Fermer" data-act="close" {...bindTap(() => useHdar.getState().closeSheet())} />
      <div
        ref={panel}
        className={cn(
          "sheet-panel relative z-10 flex flex-col overflow-hidden border border-line bg-surface",
          person ? "sheet-person" : "overflow-y-auto",
        )}
      >
        {!person && <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-line" />}
        {sheet === "gate" && <Gate />}
        {sheet === "tonight" && <Tonight />}
        {sheet === "city" && <Cities />}
        {sheet === "share" && <Share />}
        {sheet === "create-spot" && <CreateSpot />}
        {typeof sheet === "object" && <Person id={sheet.id} />}
      </div>
    </div>
  );
}

function Close() {
  return (
    <button
      type="button"
      className="absolute top-3 end-3 z-20 flex size-11 items-center justify-center rounded-full border border-line bg-night text-ink"
      aria-label="Fermer"
      data-act="close"
      {...bindTap(() => useHdar.getState().closeSheet())}
    >
      <X className="size-5" />
    </button>
  );
}

function Gate() {
  const complete = useHdar((s) => s.completeGate);
  const [pseudo, setPseudo] = useState("");
  const [age, setAge] = useState("");
  const [tags, setTags] = useState<Desire[]>([]);
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  const years = Number(age);
  const ready = pseudo.trim().length >= 2 && years >= 18;

  return (
    <form
      className="space-y-4 px-4 pt-6 pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (years > 0 && years < 18) {
          setError("Hdar est réservé aux 18 ans et plus.");
          return;
        }
        if (!ready) {
          setError("Pseudo et âge requis.");
          return;
        }
        complete({ pseudo: pseudo.trim().slice(0, 16), age: years, adult: true, tags, photo });
      }}
    >
      <Close />
      <h2 className="font-display text-2xl font-extrabold tracking-tight">Inscris-toi</h2>
      <p className="text-sm text-muted">Quinze secondes pour créer ton profil. Pas de photo obligatoire.</p>
      <label className="block text-sm">
        Pseudo
        <input
          className="mt-1 h-12 w-full rounded-2xl border border-line bg-night px-4 text-ink outline-none focus-visible:border-signal"
          value={pseudo}
          maxLength={16}
          onChange={(e) => setPseudo(e.target.value)}
          autoComplete="nickname"
        />
      </label>
      <label className="block text-sm">
        Âge
        <input
          className="mt-1 h-12 w-full rounded-2xl border border-line bg-night px-4 text-ink outline-none focus-visible:border-signal"
          inputMode="numeric"
          value={age}
          onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {DESIRES.map((d) => {
          const on = tags.includes(d.id);
          const Icon = DESIRE_ICON[d.id];
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setTags((t) => (on ? t.filter((x) => x !== d.id) : [...t, d.id]))}
              className={
                "flex h-11 items-center gap-2 rounded-full px-3 text-sm " +
                (on ? "bg-signal text-night" : "border border-line text-ink")
              }
            >
              <Icon className="size-4" />
              {d.label}
            </button>
          );
        })}
      </div>
      <label className="flex h-12 items-center justify-center rounded-full border border-line text-sm">
        {photo ? "Photo ajoutée" : "Photo facultative"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void readImage(file).then(setPhoto).catch(() => toast("Photo illisible"));
          }}
        />
      </label>
      {error && <p className="text-sm text-signal">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={!ready}>
        Créer mon profil
      </Button>
    </form>
  );
}

function Tonight() {
  const me = useHdar((s) => s.me);
  const now = useHdar((s) => s.now);
  const setTonight = useHdar((s) => s.setTonight);
  const clearTonight = useHdar((s) => s.clearTonight);
  const patchMe = useHdar((s) => s.patchMe);
  const active = me.tonight && !isExpired(me.tonight.expiresAt, now) ? me.tonight : null;
  const [len, setLen] = useState<TonightLen>(active?.len ?? "3h");
  const [places, setPlaces] = useState<PlaceKind[]>(() => {
    const t = active as (typeof active & { place?: PlaceKind }) | null;
    if (t?.places?.length) return t.places;
    if (t?.place) return [t.place];
    return ["dehors"];
  });
  const [tags, setTags] = useState<Desire[]>(active?.desires ?? me.tags.slice(0, 3));
  const [note, setNote] = useState(active?.note || me.note || "");

  return (
    <form
      className="space-y-4 px-4 pt-6 pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (tags.length === 0) {
          toast("Choisis au moins une envie");
          return;
        }
        if (note.trim() !== (me.note ?? "")) {
          patchMe({ note: note.trim().slice(0, 60) });
          void setProfileNote(note).catch(() => undefined);
        }
        setTonight({ desires: tags, places, note, len });
      }}
    >
      <Close />
      <h2 className="font-display text-2xl font-extrabold tracking-tight">Se montrer</h2>
      <p className="text-sm text-muted">Tu apparais sur la carte pendant le temps choisi.</p>
      <div className="flex gap-2">
        {LENGTHS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLen(item.id)}
            className={"h-11 flex-1 rounded-full text-sm " + (len === item.id ? "bg-signal text-night" : "border border-line")}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {DESIRES.map((d) => {
          const on = tags.includes(d.id);
          const Icon = DESIRE_ICON[d.id];
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setTags((t) => (on ? t.filter((x) => x !== d.id) : [...t, d.id]))}
              className={"flex h-11 items-center gap-2 rounded-full px-3 text-sm " + (on ? "bg-signal text-night" : "border border-line")}
            >
              <Icon className="size-4" />
              {d.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        {PLACES.map((p) => {
          const on = places.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlaces((cur) => (on ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
              className={"h-11 flex-1 rounded-full text-sm " + (on ? "bg-ink text-night" : "border border-line")}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <label className="block text-sm">
        Ta phrase du moment <span className="text-xs text-muted">(facultatif)</span>
        <input
          className="mt-1 h-12 w-full rounded-2xl border border-line bg-night px-4 outline-none focus-visible:border-signal"
          maxLength={60}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex. Nouveau dans le quartier, partant pour un verre"
        />
        <span className="mt-1 block text-xs text-muted">Une phrase courte affichée sur ton profil, modifiable dans Profil · {note.length}/60</span>
      </label>
      <Button type="submit" size="lg" className="w-full">
        {`Se montrer ${(LENGTHS.find((l) => l.id === len)?.label ?? "").toLowerCase()}`}
      </Button>
      {active && (
        <Button type="button" variant="line" className="w-full" onClick={clearTonight}>
          Se cacher · encore {remainingLabel(active.expiresAt, now)}
        </Button>
      )}
    </form>
  );
}

function Cities() {
  const cityId = useHdar((s) => s.cityId);
  const setCity = useHdar((s) => s.setCity);
  return (
    <div className="px-4 pt-6 pb-8">
      <Close />
      <h2 className="font-display text-2xl font-extrabold">Quartier</h2>
      <ul className="mt-4 space-y-2">
        <li>
          <button type="button"
            onClick={() => { const h = useHdar.getState().here; useHdar.getState().locate(); useHdar.setState({ sheet: null }); if (h) flyTo(h.lat, h.lng, 15, true); else useHdar.getState().setTab("around"); }}
            className={"flex h-14 w-full items-center gap-3 rounded-2xl border px-4 text-start " + (cityId === "ici" ? "border-signal" : "border-line")}>
            <span className="text-xl">📍</span>
            <span><span className="block font-display font-bold">Autour de moi</span><span className="text-xs text-muted">Ma position (arrondie)</span></span>
          </button>
        </li>
        {CITIES.map((city) => (
          <li key={city.slug}>
            <button
              type="button"
              onClick={() => { setCity(city.slug); flyTo(city.lat, city.lng, 14); }}
              className={
                "flex h-14 w-full items-center justify-between rounded-2xl border px-4 text-start " +
                (cityId === city.slug ? "border-signal" : "border-line")
              }
            >
              <span>
                <span className="block font-display font-bold">{city.area}</span>
                <span className="text-xs text-muted">{city.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Share() {
  const code = useHdar((s) => s.safetyCode);
  const { place } = useScene();
  const text = tf("Hdar — je sors.\nZone : {n} (position approximative)\nCode : {n}\nSi je ne donne pas de nouvelles, écris-moi.\nÇa expire dans 12 h.", place.area, code);
  return (
    <div className="space-y-4 px-4 pt-6 pb-8">
      <Close />
      <h2 className="font-display text-2xl font-extrabold">Prévenir un proche</h2>
      <p className="text-sm text-muted">Pas ton adresse. Juste la zone et un code.</p>
      <pre className="rounded-2xl border border-line bg-night p-4 text-sm whitespace-pre-wrap text-ink">{text}</pre>
      <Button
        className="w-full"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(
            () => toast("Copié"),
            () => toast("Copie impossible"),
          );
        }}
      >
        Copier
      </Button>
    </div>
  );
}

function CreateSpot() {
  const arm = useHdar((s) => s.armSpot);
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState(3);
  return (
    <form
      className="space-y-4 px-4 pt-6 pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        arm(title || "On se pose", hours);
      }}
    >
      <Close />
      <h2 className="font-display text-2xl font-extrabold">Créer un lieu</h2>
      <p className="text-sm text-muted">Ensuite tu tapes la carte pour poser le pin.</p>
      <div className="flex flex-wrap gap-2">
        {["Un verre ici", "On se pose", "Dernière heure"].map((label) => (
          <button
            key={label}
            type="button"
            className="h-11 rounded-full border border-spot px-3 text-sm text-ink"
            onClick={() => arm(label, hours)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        className="h-12 w-full rounded-2xl border border-line bg-night px-4 outline-none focus-visible:border-spot"
        maxLength={40}
        value={title}
        placeholder="Ou un titre à toi"
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex gap-2">
        {[2, 6, 12].map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHours(h)}
            className={"h-11 flex-1 rounded-full text-sm " + (hours === h ? "bg-spot text-night" : "border border-line")}
          >
            {h} h
          </button>
        ))}
      </div>
      <Button type="submit" variant="spot" size="lg" className="w-full">
        Poser sur la carte
      </Button>
    </form>
  );
}

function Person({ id }: { id: string }) {
  const { people, place } = useScene();
  const person = people.find((p) => p.id === id);
  const signal = useHdar((s) => s.signal);
  const block = useHdar((s) => s.block);
  const report = useHdar((s) => s.report);
  const openChat = useHdar((s) => s.openChat);
  const matches = useHdar((s) => s.matches);
  const now = useHdar((s) => s.now);
  const [arm, setArm] = useState<"block" | "report" | null>(null);
  if (!person) return null;
  const matched = matches.some((m) => m.personId === id && !isExpired(m.expiresAt, now));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative h-56 shrink-0 sm:h-64">
        <Avatar src={person.avatar} name={person.pseudo} className="h-full w-full" />
        <Close />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/80 to-transparent px-4 pt-12 pb-3">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">
            {person.pseudo} <span className="text-muted">{person.age}</span>
          </h2>
          <p className="text-sm text-muted">
            {person.distanceLabel} · {person.online ? "en ligne" : "absent"}
            {person.voice ? " · intro vocale" : ""}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p><RichText text={person.bio} mentions={false} /></p>
        <div className="flex flex-wrap gap-2">
          {person.tags.map((tag) => {
            const Icon = DESIRE_ICON[tag];
            const meta = DESIRES.find((d) => d.id === tag);
            return (
              <span key={tag} className="flex h-9 items-center gap-2 rounded-full border border-line px-3 text-sm">
                <Icon className="size-4" />
                {meta?.label}
              </span>
            );
          })}
        </div>
        {person.tonightOn && person.tonight && (
          <p className="rounded-2xl border border-signal/40 bg-night px-4 py-3 text-sm">
            Ce soir · {person.tonight.note} · {(person.tonight.places ?? []).map((id) => PLACES.find((p) => p.id === id)?.label).filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="text-xs text-muted">
          {place.area}. La distance est arrondie. La position précise n'existe qu'après un match, des deux côtés.
        </p>
        <div className="flex gap-2">
          <Button variant="line" className="flex-1" onClick={() => (arm === "block" ? block(id) : setArm("block"))}>
            {arm === "block" ? "Confirmer le blocage" : "Bloquer"}
          </Button>
          <Button variant="line" className="flex-1" onClick={() => (arm === "report" ? report(id) : setArm("report"))}>
            {arm === "report" ? "Confirmer le signalement" : "Signaler"}
          </Button>
        </div>
      </div>
      <div className="sheet-actions shrink-0 border-t border-line bg-night px-3 pt-3">
        {matched ? (
          <Button className="w-full" size="lg" data-act="chat" data-id={id} onClick={() => openChat(id)}>
            Écrire
          </Button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(["verre", "discuter", "plan"] as const).map((kind) => {
              const Icon = DESIRE_ICON[kind];
              const label = DESIRES.find((d) => d.id === kind)?.label;
              return (
                <button
                  key={kind}
                  type="button"
                  data-act="signal"
                  data-id={id}
                  data-kind={kind}
                  {...bindTap(() => signal(id, kind))}
                  className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-signal text-xs text-night"
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function Celebrate() {
  const id = useHdar((s) => s.celebrate);
  const { people } = useScene();
  const me = useHdar((s) => s.me);
  const openChat = useHdar((s) => s.openChat);
  const dismiss = useHdar((s) => s.dismissCelebrate);
  if (!id) return null;
  const person = people.find((p) => p.id === id) ?? null;
  if (!person) return null;
  return (
    <div className="pop-in absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-night/95 px-6 text-center">
      <p className="font-display text-4xl font-extrabold tracking-tight">Match</p>
      <div className="flex items-center gap-4">
        <Avatar src={me.photo} name={me.pseudo || "Toi"} className="size-20 rounded-full" />
        <Avatar src={person.avatar} name={person.pseudo} className="size-20 rounded-full" />
      </div>
      <p className="text-sm text-muted">
        {person.pseudo} a répondu. Le fil s'efface dans 24 h, sauf si vous l'épingler tous les deux.
      </p>
      <Button size="lg" className="w-full max-w-xs" onClick={() => openChat(id)}>
        Écrire
      </Button>
      <Button variant="ghost" onClick={dismiss}>
        Plus tard
      </Button>
    </div>
  );
}
