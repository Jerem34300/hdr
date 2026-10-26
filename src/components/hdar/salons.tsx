import { mentionNotify, salonReportNote } from "@/lib/hdar/live";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/lib/hdar/confirm";
import {
  createSalon,
  getSalon,
  pgTime,
  salonClose,
  salonHide,
  salonMessages,
  salonSend,
  salonSendMedia,
  type GroupLine,
  type InboxSalon,
  type Salon,
} from "@/lib/hdar/live";
import { refreshSalonInbox, useSalonInbox } from "@/lib/hdar/salon-inbox";
import { regionAt } from "@/lib/hdar/regions";
import { resolvePlace } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { useActivity } from "@/lib/hdar/activity";
import { useAmAdmin } from "@/lib/hdar/admin-mode";
import { useRoomPresence, useRoomsOnline } from "@/lib/hdar/presence";
import { GroupChat } from "./group-chat";
import { OnlineButton, OnlineCount } from "./room-people";
import { bindTap } from "./tap";

function useMyPos() {
  const here = useHdar((s) => s.here);
  const cityId = useHdar((s) => s.cityId);
  const customCenter = useHdar((s) => s.customCenter);
  if (here) return here;
  const p = resolvePlace(cityId, customCenter);
  return { lat: p.lat, lng: p.lng };
}

function useMyRegion() {
  const at = useMyPos();
  return regionAt(at.lat, at.lng);
}

/** Nombre de personnes dans chaque salon et dans le chat du quartier (hors moi). */
function useOnline() {
  const at = useMyPos();
  return useRoomsOnline(at.lat, at.lng);
}

/** Découvrir : chat du quartier, ta région, salons thématiques et régions (onglet Messages). */
export function SalonDiscover() {
  const openPocket = useHdar((s) => s.openPocket);
  const openSalon = useHdar((s) => s.openSalon);
  const setTab = useHdar((s) => s.setTab);
  const onboarded = useHdar((s) => s.me.onboarded);
  const followed = useHdar((s) => s.followedSalons);
  const myRegion = useMyRegion();
  const { salons } = useSalonInbox();
  const online = useOnline();
  const [creating, setCreating] = useState(false);
  const [allRegions, setAllRegions] = useState(false);

  const regions = (salons ?? []).filter((s) => s.region);
  const mine = regions.find((s) => s.region === myRegion);
  const others = regions.filter((s) => s !== mine).sort((x, y) => y.recent - x.recent || x.name.localeCompare(y.name, "fr"));
  // Salons à découvrir : ceux qu'on ne suit pas encore (les suivis sont dans la liste des discussions).
  const topics = (salons ?? []).filter((s) => !s.region && !followed.includes(s.id));

  const chip = "flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm whitespace-nowrap";
  // Pastille verte = en ligne maintenant, sinon grise = messages des dernières 24 h.
  const count = (s: Salon) =>
    online?.salons[s.id] ? (
      <OnlineCount n={online.salons[s.id]} />
    ) : s.recent > 0 ? (
      <span className={"rounded-full px-1.5 text-[11px] " + (Date.now() - pgTime(s.last_at) < 15 * 60_000 ? "bg-online/20 font-bold text-online" : "bg-white/10 text-muted")}>
        {s.recent > 99 ? "99+" : s.recent}
      </span>
    ) : null;
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">Salons</h2>
        <p className="text-xs text-muted">Ouverts à tous · effacés après 24 h</p>
      </div>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" data-act="pocket" {...bindTap(openPocket)} className={chip + " border-signal/60"}>
          📍 Quartier <OnlineCount n={online?.area} />
        </button>
        {mine && !followed.includes(mine.id) && (
          <button type="button" data-act="salon" data-id={mine.id} {...bindTap(() => openSalon(mine.id, mine.name))} className={chip + " border-signal/60"}>
            {mine.emoji} {mine.name} {count(mine)}
          </button>
        )}
        {salons === null && [0, 1, 2].map((i) => <span key={i} className={chip + " w-24 animate-pulse opacity-50"} />)}
        {topics.map((s) => (
          <button key={s.id} type="button" data-act="salon" data-id={s.id} {...bindTap(() => openSalon(s.id, s.name))} className={chip}>
            {s.emoji || "💬"} {s.name} {count(s)}
          </button>
        ))}
        <button type="button" aria-expanded={allRegions} onClick={() => setAllRegions((v) => !v)} className={chip}>
          🗺️ Régions {allRegions ? "▴" : "▾"}
        </button>
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
          className={chip + " border-dashed text-muted"}
        >
          <Plus className="size-4" /> Créer
        </button>
      </div>
      {allRegions && (
        <div className="mt-2 flex flex-wrap gap-2">
          {[...(mine ? [mine] : []), ...others].map((s) => (
            <button key={s.id} type="button" data-act="salon" data-id={s.id} {...bindTap(() => openSalon(s.id, s.name))} className={chip}>
              {s.emoji || "🗺️"} {s.name} {count(s)}
            </button>
          ))}
        </div>
      )}
      {creating && (
        <CreateSalon
          onClose={() => setCreating(false)}
          onCreated={(id, name) => {
            setCreating(false);
            refreshSalonInbox();
            openSalon(id, name);
          }}
        />
      )}
    </section>
  );
}

function when(ms: number) {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}

/** Une ligne « salon » dans la liste des discussions (même gabarit que les discussions privées). */
export function SalonInboxRow({ s, editing }: { s: InboxSalon; editing: boolean }) {
  const openSalon = useHdar((st) => st.openSalon);
  const unfollow = useHdar((st) => st.unfollowSalon);
  const online = useOnline();
  const unread = s.unread ?? 0;
  const at = s.last ? pgTime(s.last.at) : null;
  return (
    <li className="flex items-stretch gap-2">
      <button
        type="button"
        data-act="salon"
        data-id={s.id}
        {...bindTap(() => openSalon(s.id, s.name))}
        className="flex h-20 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left"
      >
        <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-2xl">
          {s.emoji || "💬"}
          <ActiveDot at={at ?? 0} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className={"truncate font-display " + (unread ? "font-extrabold" : "font-bold")}>{s.name}</span>
              <OnlineCount n={online?.salons[s.id]} />
            </span>
            <span className="shrink-0 text-xs text-muted">{at ? when(at) : ""}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={"min-w-0 flex-1 truncate text-sm " + (unread ? "text-ink" : "text-muted")}>
              {s.last ? `${s.last.mine ? "Toi" : s.last.pseudo} : ${s.last.body}` : "Pas de message ces dernières 24 h"}
            </span>
            {(s.replies ?? 0) > 0 && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-night" aria-label="On t'a répondu">
                ↩
              </span>
            )}
            {unread > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-night" aria-label={`${unread} non lus`}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
        </span>
      </button>
      {editing && (
        <button
          type="button"
          aria-label={`Quitter ${s.name}`}
          className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-signal text-xs text-night"
          onClick={() => {
            unfollow(s.id);
            refreshSalonInbox();
          }}
        >
          <X className="size-5" />
          Quitter
        </button>
      )}
    </li>
  );
}

/** Chat du quartier dans la liste : visible si on l'utilise ou s'il y a du monde / du nouveau. `at` = dernier message. */
export function useAreaInbox() {
  const { area } = useActivity();
  const online = useOnline();
  let seen = 0;
  try {
    seen = Date.parse(localStorage.getItem("hdar-area-seen") || "") || 0;
  } catch {
    /* rien */
  }
  const last = online?.area_last ? pgTime(online.area_last) : 0;
  const show = area > 0 || (online?.area ?? 0) > 0 || last > 0 || Date.now() - seen < 24 * 3600 * 1000;
  return { show, at: last || seen, unread: area, online: online?.area ?? 0, hasLast: last > 0 };
}

export function AreaInboxRow({ a }: { a: ReturnType<typeof useAreaInbox> }) {
  const openPocket = useHdar((s) => s.openPocket);
  const area = a.unread;
  return (
    <li>
      <button
        type="button"
        data-act="pocket"
        {...bindTap(openPocket)}
        className="flex h-20 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left"
      >
        <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-2xl">
          📍
          <ActiveDot at={a.hasLast ? a.at : 0} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className={"truncate font-display " + (area ? "font-extrabold" : "font-bold")}>Chat du quartier</span>
              <OnlineCount n={a.online} />
            </span>
            <span className="shrink-0 text-xs text-muted">{a.at ? when(a.at) : ""}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={"min-w-0 flex-1 truncate text-sm " + (area ? "text-ink" : "text-muted")}>
              {area ? "Nouveaux messages autour de toi" : "Les gens à ~3 km"}
            </span>
            {area > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-night">
                {area > 9 ? "9+" : area}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Point vert qui pulse sur l'icône quand ça parle (dernier message il y a moins de 15 min). */
function ActiveDot({ at }: { at: number }) {
  if (!at || Date.now() - at > 15 * 60_000) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 flex size-3.5" aria-label="Ça parle en ce moment">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-online opacity-60" />
      <span className="relative inline-flex size-3.5 rounded-full border-2 border-surface bg-online" />
    </span>
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
  const pseudo = useHdar((s) => s.me.pseudo);
  const presence = useRoomPresence(`salon:${id}`, pseudo);
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
    // Ouvrir un salon le suit (il apparaît dans les discussions) et le marque lu, en entrant et en sortant.
    const st = useHdar.getState();
    st.followSalon(id);
    st.markSalonSeen(id);
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refresh();
      useHdar.getState().markSalonSeen(id);
    }, 3000);
    return () => {
      window.clearInterval(t);
      useHdar.getState().markSalonSeen(id);
      refreshSalonInbox();
    };
  }, [id, setTab, refresh]);

  const owner = info?.mine ?? false;
  const isAdmin = useAmAdmin();
  return (
    <GroupChat
      scope="salon"
      typingRef={id}
      onReported={() => void salonReportNote(id).catch(() => undefined)}
      myPseudo={useHdar.getState().me.pseudo || "Quelqu'un"}
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
      canHide={(m) => m.mine || owner || isAdmin}
      onHide={(m) => salonHide(m.id)}
      onSend={(text, replyTo) => salonSend(id, text, replyTo).then(() => mentionNotify("salon", id, text))}
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
          <OnlineButton presence={presence} />
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
