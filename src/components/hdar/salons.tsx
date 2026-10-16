import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/lib/hdar/confirm";
import {
  createSalon,
  getSalon,
  listSalons,
  pgTime,
  salonClose,
  salonHide,
  salonMessages,
  salonSend,
  type Salon,
  type SalonLine,
} from "@/lib/hdar/live";
import { reportUser } from "@/lib/hdar/report";
import { useHdar } from "@/lib/hdar/store";
import { useActivity } from "@/lib/hdar/activity";
import { UserAvatar } from "./avatar";
import { bindTap } from "./tap";

function ago(at: string) {
  const min = Math.max(0, Math.round((Date.now() - pgTime(at)) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/** Salons (partout en France) + chat du quartier, en tête de l'onglet Messages. */
export function SalonsStrip() {
  const openPocket = useHdar((s) => s.openPocket);
  const openSalon = useHdar((s) => s.openSalon);
  const setTab = useHdar((s) => s.setTab);
  const onboarded = useHdar((s) => s.me.onboarded);
  const { area } = useActivity();
  const [salons, setSalons] = useState<Salon[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    void listSalons()
      .then(setSalons)
      .catch(() => setSalons([]));
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const chip = "flex w-36 shrink-0 flex-col items-start gap-1 rounded-2xl border border-line bg-surface p-3 text-left";
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">Salons</h2>
        <p className="text-xs text-muted">Ouverts à tous, partout</p>
      </div>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" data-act="pocket" {...bindTap(openPocket)} className={chip + " relative border-signal/60"}>
          <span className="text-xl">📍</span>
          <span className="font-display text-sm font-bold">Chat du quartier</span>
          <span className="text-xs text-muted">Les gens à ~3 km</span>
          {area > 0 && (
            <span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-[11px] font-bold text-night">
              {area > 9 ? "9+" : area}
            </span>
          )}
        </button>
        {salons === null &&
          [0, 1, 2].map((i) => <span key={i} className={chip + " h-[88px] animate-pulse opacity-50"} />)}
        {salons?.map((s) => (
          <button key={s.id} type="button" data-act="salon" data-id={s.id} {...bindTap(() => openSalon(s.id, s.name))} className={chip}>
            <span className="text-xl">{s.emoji || "💬"}</span>
            <span className="w-full truncate font-display text-sm font-bold">{s.name}</span>
            <span className="text-xs text-muted">
              {s.recent > 0 ? `${s.people} pers. · ${s.recent} msg / 24 h` : s.official ? "Salon officiel" : "Calme en ce moment"}
            </span>
          </button>
        ))}
        <button
          type="button"
          data-act="salon-create"
          {...bindTap(() => {
            if (!onboarded) {
              toast("Crée ton profil pour ouvrir un salon", { action: { label: "Créer", onClick: () => setTab("me") } });
              return;
            }
            setCreating(true);
          })}
          className={chip + " items-center justify-center border-dashed text-muted"}
        >
          <Plus className="size-6" />
          <span className="text-sm">Créer un salon</span>
        </button>
      </div>
      {creating && (
        <CreateSalon
          onClose={() => setCreating(false)}
          onCreated={(id, name) => {
            setCreating(false);
            load();
            openSalon(id, name);
          }}
        />
      )}
    </section>
  );
}

const EMOJIS = ["💬", "🔥", "🌈", "🍻", "🎉", "🌙", "☀️", "🎮", "🎵", "🏋️", "🍿", "✈️"];

function CreateSalon({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("💬");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <form
        className="w-full max-w-md rounded-t-3xl border border-line bg-night p-5 pb-8 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (n.length < 3) return toast("Nom : 3 caractères minimum");
          setBusy(true);
          createSalon(n, description, emoji)
            .then((id) => onCreated(id, n))
            .catch((err: Error) => toast(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold">Nouveau salon</h2>
          <button type="button" aria-label="Fermer" className="flex size-10 items-center justify-center" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">Tout le monde peut le voir et y écrire, où qu'il soit en France.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={emoji === e}
              onClick={() => setEmoji(e)}
              className={"flex size-10 items-center justify-center rounded-xl border text-lg " + (emoji === e ? "border-signal bg-signal/15" : "border-line")}
            >
              {e}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm">
          Nom
          <input
            className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 outline-none focus-visible:border-signal"
            value={name}
            maxLength={40}
            placeholder="Ex. : Sorties Nîmes, Gamers, Rando…"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm">
          Description <span className="text-muted">(facultatif)</span>
          <input
            className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 outline-none focus-visible:border-signal"
            value={description}
            maxLength={120}
            placeholder="De quoi on parle ici ?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <p className="mt-3 text-xs text-muted">
          Respecte les règles d'hdar : pas de contenu sexuel explicite, pas de haine ni d'arnaque. Un salon sans message pendant 14 jours se ferme tout seul.
        </p>
        <button type="submit" disabled={busy} className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">
          {busy ? "Création…" : "Ouvrir le salon"}
        </button>
      </form>
    </div>
  );
}

/** Une discussion de salon : messages des 7 derniers jours, ouverte à tous. */
export function SalonRoom({ id, name }: { id: string; name: string }) {
  const openProfile = useHdar((s) => s.openProfile);
  const setTab = useHdar((s) => s.setTab);
  const [info, setInfo] = useState<Salon | null>(null);
  const [lines, setLines] = useState<SalonLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    () =>
      salonMessages(id).then((rows) => {
        setLines(rows);
        setLoaded(true);
      }),
    [id],
  );

  useEffect(() => {
    void getSalon(id)
      .then((s) => {
        if (!s) {
          toast("Ce salon est fermé");
          setTab("inbox");
        } else setInfo(s);
      })
      .catch(() => undefined);
    let stop = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void salonMessages(id)
        .then((rows) => {
          if (stop) return;
          setLines(rows);
          setLoaded(true);
        })
        .catch(() => !stop && setLoaded(true));
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [id, setTab]);

  const lastId = lines[lines.length - 1]?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  const mine = info?.mine ?? false;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour" data-act="close-view" onClick={() => setTab("inbox")}>
          <ChevronLeft />
        </button>
        <span className="text-2xl">{info?.emoji || "💬"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold">{info?.name ?? name}</p>
          <p className="truncate text-xs text-muted">{info?.description || "Salon ouvert à tous · partout en France"}</p>
        </div>
        {mine && (
          <button
            type="button"
            className="h-9 shrink-0 rounded-full border border-line px-3 text-xs text-muted"
            onClick={() =>
              void askConfirm({ title: "Fermer ce salon ?", body: "Il disparaît pour tout le monde.", confirm: "Fermer", danger: true }).then((ok) => {
                if (!ok) return;
                salonClose(id)
                  .then(() => {
                    toast("Salon fermé");
                    setTab("inbox");
                  })
                  .catch((e: Error) => toast(e.message));
              })
            }
          >
            Fermer
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loaded && lines.length === 0 && (
          <p className="py-12 text-center text-sm text-muted">
            Personne n'a encore écrit ici.
            <br />
            Lance la conversation.
          </p>
        )}
        {lines.map((m) => (
          <div key={m.id} className={m.mine ? "text-right" : "flex items-start gap-2 text-left"}>
            {!m.mine && (
              <button type="button" className="mt-4 shrink-0" aria-label={`Voir le profil de ${m.pseudo}`} onClick={() => openProfile(m.from_id, m.pseudo)}>
                <UserAvatar id={m.from_id} name={m.pseudo} className="size-9 rounded-full" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted">
                {m.mine ? (
                  "Toi"
                ) : (
                  <button type="button" className="font-bold text-ink underline-offset-2 hover:underline" onClick={() => openProfile(m.from_id, m.pseudo)}>
                    {m.pseudo}
                  </button>
                )}
                {" · "}
                {ago(m.at)}
              </p>
              <p
                className={
                  "mt-1 inline-block max-w-[85%] rounded-2xl px-3 py-2 text-left text-sm break-words whitespace-pre-wrap " +
                  (m.mine ? "bg-signal text-night" : "bg-surface")
                }
              >
                {m.body}
              </p>
              <div className={"mt-1 flex gap-3 text-xs text-muted " + (m.mine ? "justify-end" : "")}>
                {(m.mine || mine) && (
                  <button type="button" onClick={() => void salonHide(m.id).then(refresh).catch(() => toast("Impossible de retirer ce message"))}>
                    Retirer
                  </button>
                )}
                {!m.mine && (
                  <button type="button" onClick={() => void reportUser(m.from_id, m.pseudo, m.body).then((sent) => sent && void refresh())}>
                    Signaler
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="dock flex items-center gap-2 border-t border-line px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText("");
          salonSend(id, body)
            .then(refresh)
            .catch((err: unknown) => {
              setText((t) => t || body);
              toast(err instanceof Error ? err.message : "Message non envoyé");
            });
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none focus-visible:border-signal"
          value={text}
          maxLength={500}
          placeholder={`Écrire dans ${info?.name ?? name}`}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="flex size-11 items-center justify-center rounded-full bg-signal text-night" aria-label="Envoyer">
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}
