import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/lib/hdar/confirm";
import {
  createSalon,
  getSalon,
  listSalons,
  salonClose,
  salonHide,
  salonMessages,
  salonSend,
  salonSendMedia,
  type GroupLine,
  type Salon,
} from "@/lib/hdar/live";
import { regionAt } from "@/lib/hdar/regions";
import { resolvePlace } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { useActivity } from "@/lib/hdar/activity";
import { GroupChat } from "./group-chat";
import { bindTap } from "./tap";

function useMyRegion() {
  const here = useHdar((s) => s.here);
  const cityId = useHdar((s) => s.cityId);
  const customCenter = useHdar((s) => s.customCenter);
  const at = here ?? (() => {
    const p = resolvePlace(cityId, customCenter);
    return { lat: p.lat, lng: p.lng };
  })();
  return regionAt(at.lat, at.lng);
}

function activity(s: Salon) {
  return s.recent > 0 ? `${s.people} pers. · ${s.recent} msg` : "Calme en ce moment";
}

/** Salons (partout en France, par région) + chat du quartier, en tête de l'onglet Messages. */
export function SalonsStrip() {
  const openPocket = useHdar((s) => s.openPocket);
  const openSalon = useHdar((s) => s.openSalon);
  const setTab = useHdar((s) => s.setTab);
  const onboarded = useHdar((s) => s.me.onboarded);
  const myRegion = useMyRegion();
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

  const regions = (salons ?? []).filter((s) => s.region);
  const mine = regions.find((s) => s.region === myRegion);
  const others = regions.filter((s) => s !== mine).sort((a, b) => b.recent - a.recent || a.name.localeCompare(b.name, "fr"));
  const topics = (salons ?? []).filter((s) => !s.region);

  const chip = "flex w-36 shrink-0 flex-col items-start gap-1 rounded-2xl border border-line bg-surface p-3 text-left";
  const small = "flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm";
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">Salons</h2>
        <p className="text-xs text-muted">Ouverts à tous · effacés après 24 h</p>
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
        {mine && (
          <button type="button" data-act="salon" data-id={mine.id} {...bindTap(() => openSalon(mine.id, mine.name))} className={chip + " border-signal/60"}>
            <span className="text-xl">{mine.emoji || "🗺️"}</span>
            <span className="w-full truncate font-display text-sm font-bold">{mine.name}</span>
            <span className="text-xs text-muted">Ta région · {activity(mine)}</span>
          </button>
        )}
        {salons === null && [0, 1, 2].map((i) => <span key={i} className={chip + " h-[88px] animate-pulse opacity-50"} />)}
        {topics.map((s) => (
          <button key={s.id} type="button" data-act="salon" data-id={s.id} {...bindTap(() => openSalon(s.id, s.name))} className={chip}>
            <span className="text-xl">{s.emoji || "💬"}</span>
            <span className="w-full truncate font-display text-sm font-bold">{s.name}</span>
            <span className="text-xs text-muted">{s.recent > 0 ? activity(s) : s.official ? "Salon officiel" : "Calme en ce moment"}</span>
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
      {others.length > 0 && (
        <>
          <p className="mt-3 text-xs tracking-wide text-muted uppercase">Régions</p>
          <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 pb-1">
            {others.map((s) => (
              <button key={s.id} type="button" data-act="salon" data-id={s.id} {...bindTap(() => openSalon(s.id, s.name))} className={small}>
                <span>{s.emoji || "🗺️"}</span>
                <span className="whitespace-nowrap">{s.name}</span>
                {s.recent > 0 && <span className="rounded-full bg-signal px-1.5 text-[11px] font-bold text-night">{s.recent > 99 ? "99+" : s.recent}</span>}
              </button>
            ))}
          </div>
        </>
      )}
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
          Respecte les règles d'hdar : pas de contenu sexuel explicite, pas de haine ni d'arnaque. Les messages s'effacent après 24 h, et un salon sans message pendant 48 h se ferme tout seul.
        </p>
        <button type="submit" disabled={busy} className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">
          {busy ? "Création…" : "Ouvrir le salon"}
        </button>
      </form>
    </div>
  );
}

/** Une discussion de salon : messages des dernières 24 h, ouverte à tous. */
export function SalonRoom({ id, name }: { id: string; name: string }) {
  const setTab = useHdar((s) => s.setTab);
  const onboarded = useHdar((s) => s.me.onboarded);
  const [info, setInfo] = useState<Salon | null>(null);
  const [lines, setLines] = useState<GroupLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    void salonMessages(id)
      .then((rows) => {
        setLines(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [id]);

  useEffect(() => {
    void getSalon(id)
      .then((s) => {
        if (!s) {
          toast("Ce salon est fermé");
          setTab("inbox");
        } else setInfo(s);
      })
      .catch(() => undefined);
    refresh();
    const t = window.setInterval(() => document.visibilityState === "visible" && refresh(), 3000);
    return () => window.clearInterval(t);
  }, [id, setTab, refresh]);

  const owner = info?.mine ?? false;
  return (
    <GroupChat
      scope="salon"
      lines={lines}
      loaded={loaded}
      maxLength={1000}
      placeholder="Message"
      empty={
        <>
          Personne n'a écrit ces dernières 24 h.
          <br />
          Lance la conversation.
        </>
      }
      canHide={(m) => m.mine || owner}
      onHide={(m) => salonHide(m.id)}
      onSend={(text, replyTo) => salonSend(id, text, replyTo)}
      onSendMedia={onboarded ? (k, path, d, replyTo) => salonSendMedia(id, k, path, d, replyTo) : undefined}
      mediaLockedHint="Crée ton profil pour envoyer photos, vidéos et vocaux"
      onChanged={refresh}
      header={
        <header className="flex items-center gap-2 border-b border-line px-2 py-2">
          <button type="button" className="flex size-11 items-center justify-center" aria-label="Retour" data-act="close-view" onClick={() => setTab("inbox")}>
            <ChevronLeft />
          </button>
          <span className="text-2xl">{info?.emoji || "💬"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold">{info?.name ?? name}</p>
            <p className="truncate text-xs text-muted">
              {info && info.people > 0 ? `${info.people} personne${info.people > 1 ? "s" : ""} aujourd'hui · ` : ""}
              {info?.description || "Ouvert à tous · messages effacés après 24 h"}
            </p>
          </div>
          {owner && (
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
      }
    />
  );
}
