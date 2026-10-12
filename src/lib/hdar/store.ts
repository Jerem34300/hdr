import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import {
  CITIES,
  LENGTHS,
  PEOPLE,
  spotsFor,
  type Desire,
  type PlaceKind,
  type SignalKind,
  type TonightLen,
} from "./data";
import { deviceId } from "./device";
import { closeSpot, createSpot as createLiveSpot, hideConversation, type Conversation, type SpotRow } from "./live";
import { playPop, uid } from "./media";
import { conversationExpiry, isExpired } from "./rules";

export type MeTonight = {
  desires: Desire[];
  place: PlaceKind;
  note: string;
  len: TonightLen;
  expiresAt: number;
};

export type Me = {
  pseudo: string;
  age: number | null;
  adult: boolean;
  tags: Desire[];
  bio: string;
  photo: string;
  /** Album, up to 5 photos; the first one is the main photo (mirrored in `photo`). */
  photos?: string[];
  /** 10 s voice intro as a data URL, shared with the public profile. */
  voice?: string;
  voiceSec: number;
  visibility: "zone" | "ghost";
  homeZone: boolean;
  onboarded: boolean;
  email: string;
  tonight: MeTonight | null;
};

export type ChatMsg = {
  id: string;
  from: "me" | "them";
  at: number;
  text?: string;
  photo?: string;
  viewOnce?: boolean;
  viewed?: boolean;
  voiceSec?: number;
};

export type Match = {
  personId: string;
  createdAt: number;
  preciseMe: boolean;
  preciseThem: boolean;
  pinnedMe: boolean;
  pinnedThem: boolean;
  expiresAt: number | null;
  messages: ChatMsg[];
  replyCursor: number;
  unread: number;
};

export type SpotMsg = { id: string; from: string; mine: boolean; text: string; at: number };

export type CustomSpot = {
  id: string;
  title: string;
  east: number;
  north: number;
  lat?: number;
  lng?: number;
  radiusM: number;
  closesAt: number;
  messages: SpotMsg[];
};

export type Clock = { people: Record<string, number>; spots: Record<string, number> };

export type Intent =
  | null
  | "tonight"
  | "create-spot"
  | { type: "signal"; id: string; kind: SignalKind }
  | { type: "line"; id: string }
  | { type: "join"; id: string };

export type Sheet =
  | null
  | "gate"
  | "tonight"
  | "create-spot"
  | "city"
  | "share"
  | { type: "person"; id: string };

export type View =
  | { name: "tabs" }
  | { name: "chat"; personId: string }
  | { name: "spot"; id: string }
  | { name: "pocket" }
  | { name: "live"; userId: string; pseudo: string }
  | { name: "profile"; userId: string; pseudo: string };

export type PocketMsg = { id: string; from: "me" | "Anonyme"; text: string; at: number };

export type Tab = "around" | "spots" | "inbox" | "me";
export type Mode = "grid" | "map";
export type Discreet = "notes" | "meteo";
export type Filter = "tous" | "dispo" | "online";

const emptyMe = (): Me => ({
  pseudo: "",
  age: null,
  adult: false,
  tags: [],
  bio: "",
  photo: "",
  voiceSec: 0,
  visibility: "zone",
  homeZone: false,
  onboarded: false,
  email: "",
  tonight: null,
});

/** Album of the local user, including profiles saved before albums existed. */
export function myPhotos(me: Me): string[] {
  if (me.photos) return me.photos;
  return me.photo ? [me.photo] : [];
}

export function ensureClock(clock: Clock | undefined, now: number): Clock {
  const people = { ...(clock?.people ?? {}) };
  for (const p of PEOPLE) {
    if (p.tonight && people[p.id] == null) people[p.id] = now + p.tonight.hours * 3_600_000;
  }
  const spots = { ...(clock?.spots ?? {}) };
  for (const city of CITIES) {
    for (const spot of spotsFor(city.slug)) {
      if (spots[spot.id] == null) spots[spot.id] = now + spot.hours * 3_600_000;
    }
  }
  return { people, spots };
}

type Signal = { toId: string; kind: SignalKind; at: number };

type State = {
  now: number;
  tab: Tab;
  mode: Mode;
  filter: Filter;
  cityId: string;
  customCenter: { lat: number; lng: number } | null;
  discreet: Discreet;
  cover: boolean;
  me: Me;
  signals: Signal[];
  matches: Match[];
  blocks: string[];
  reports: string[];
  clock: Clock;
  customSpots: CustomSpot[];
  /** Places shared through the database (everyone nearby sees them). Not persisted. */
  liveSpots: SpotRow[];
  /** Last real GPS fix (not persisted); the neighbourhood chat is centred on it. */
  here: { lat: number; lng: number } | null;
  /** Real private conversations (not persisted). */
  liveConvos: Conversation[];
  /** Last time each live conversation was opened, to show unread dots. */
  seenAt: Record<string, number>;
  pendingSpot: { title: string; hours: number } | null;
  spotExtras: Record<string, SpotMsg[]>;
  deletedMsgs: string[];
  joined: string[];
  safetyCode: string;
  sheet: Sheet;
  view: View;
  intent: Intent;
  celebrate: string | null;
  pocket: PocketMsg[];
  setTab: (tab: Tab) => void;
  setMode: (mode: Mode) => void;
  setFilter: (filter: Filter) => void;
  setCity: (cityId: string) => void;
  locate: () => void;
  openTonight: () => void;
  openCreate: () => void;
  openGate: () => void;
  openPerson: (id: string) => void;
  openShare: () => void;
  openCity: () => void;
  closeSheet: () => void;
  completeGate: (me: Pick<Me, "pseudo" | "age" | "adult" | "tags" | "photo">) => void;
  setTonight: (input: { desires: Desire[]; place: PlaceKind; note: string; len: TonightLen }) => void;
  clearTonight: () => void;
  signal: (id: string, kind: SignalKind) => void;
  enterLine: (id: string) => void;
  openPocket: () => void;
  sendPocket: (text: string) => void;
  openChat: (personId: string) => void;
  closeView: () => void;
  openLive: (userId: string, pseudo: string) => void;
  openProfile: (userId: string, pseudo: string) => void;
  markSeen: (userId: string) => void;
  deleteConversation: (userId: string) => void;
  sendChat: (personId: string, partial: Omit<ChatMsg, "id" | "from" | "at">) => void;
  openOnce: (personId: string, msgId: string) => void;
  togglePin: (personId: string) => void;
  togglePrecise: (personId: string) => void;
  joinSpot: (id: string) => void;
  createSpot: (title: string, hours: number) => void;
  armSpot: (title: string, hours: number) => void;
  dropSpot: (lat: number, lng: number) => void;
  cancelSpot: () => void;
  deleteSpot: (id: string) => void;
  sendSpot: (id: string, text: string) => void;
  removeSpotMsg: (spotId: string, msgId: string) => void;
  block: (id: string) => void;
  report: (id: string) => void;
  dismissCelebrate: () => void;
  setCover: (cover: boolean) => void;
  setDiscreet: (discreet: Discreet) => void;
  patchMe: (partial: Partial<Me>) => void;
  saveEmail: (email: string) => void;
  reset: () => void;
};

function chatOrTabs(view: View, id: string): View {
  if (view.name === "chat" && view.personId === id) return { name: "tabs" };
  return view;
}

function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "H-";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function makeMatch(personId: string, now: number): Match {
  const person = PEOPLE.find((p) => p.id === personId);
  return {
    personId,
    createdAt: now,
    preciseMe: false,
    preciseThem: person?.sharesPrecise ?? false,
    pinnedMe: false,
    pinnedThem: false,
    expiresAt: conversationExpiry(now, false),
    replyCursor: 1,
    unread: 1,
    messages: person?.replies[0]
      ? [{ id: uid("m"), from: "them", at: now, text: person.replies[0] }]
      : [],
  };
}

const base = () => {
  const now = Date.now();
  return {
    now,
    tab: "around" as Tab,
    mode: "grid" as Mode,
    filter: "tous" as Filter,
    cityId: "paris",
    customCenter: null as { lat: number; lng: number } | null,
    discreet: "notes" as Discreet,
    cover: false,
    me: emptyMe(),
    signals: [] as Signal[],
    matches: [] as Match[],
    blocks: [] as string[],
    reports: [] as string[],
    clock: ensureClock(undefined, now),
    customSpots: [] as CustomSpot[],
    liveSpots: [] as SpotRow[],
    here: null as { lat: number; lng: number } | null,
    liveConvos: [] as Conversation[],
    seenAt: {} as Record<string, number>,
    pendingSpot: null as { title: string; hours: number } | null,
    spotExtras: {} as Record<string, SpotMsg[]>,
    deletedMsgs: [] as string[],
    joined: [] as string[],
    safetyCode: code(),
    sheet: null as Sheet,
    view: { name: "tabs" } as View,
    intent: null as Intent,
    celebrate: null as string | null,
    pocket: [] as PocketMsg[],
  };
};

export const useHdar = create<State>()(
  persist(
    (set, get) => ({
      ...base(),
      setTab: (tab) => set({ tab, view: { name: "tabs" } }),
      setMode: (mode) => set({ mode }),
      setFilter: (filter) => set({ filter }),
      setCity: (cityId) => set({ cityId, customCenter: null, sheet: null }),
      locate: () => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          toast("Position indisponible");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            set({
              cityId: "ici",
              customCenter: { lat: pos.coords.latitude, lng: pos.coords.longitude },
              here: { lat: pos.coords.latitude, lng: pos.coords.longitude },
              sheet: null,
            });
            toast("Autour de toi · position arrondie");
          },
          () => toast("Position refusée. On reste sur le quartier."),
          { enableHighAccuracy: false, maximumAge: 600_000, timeout: 8000 },
        );
      },
      openTonight: () => {
        if (!get().me.onboarded) set({ sheet: "gate", intent: "tonight" });
        else set({ sheet: "tonight" });
      },
      openGate: () => set({ sheet: "gate", intent: null }),
      openCreate: () => {
        set({ sheet: "create-spot" });
      },
      openPerson: (id) => set({ sheet: { type: "person", id } }),
      openShare: () => set({ sheet: "share" }),
      openCity: () => set({ sheet: "city" }),
      closeSheet: () => set({ sheet: null, intent: null }),
      completeGate: (partial) => {
        if (!partial.adult || (partial.age ?? 0) < 18) return;
        const intent = get().intent;
        set({
          me: {
            ...get().me,
            ...partial,
            photos: partial.photo ? [partial.photo, ...myPhotos(get().me).filter((p) => p !== partial.photo)].slice(0, 5) : myPhotos(get().me),
            adult: true,
            onboarded: true,
          },
          sheet: null,
          intent: null,
        });
        if (intent === "tonight") set({ sheet: "tonight" });
        else if (intent === "create-spot") set({ sheet: "create-spot" });
        else if (intent && intent.type === "signal") get().signal(intent.id, intent.kind);
        else if (intent && intent.type === "line") get().enterLine(intent.id);
        else if (intent && intent.type === "join") get().joinSpot(intent.id);
      },
      setTonight: ({ desires, place, note, len }) => {
        const hours = LENGTHS.find((l) => l.id === len)?.hours ?? 3;
        const tonight: MeTonight = {
          desires,
          place,
          note: note.slice(0, 60),
          len,
          expiresAt: Date.now() + hours * 3_600_000,
        };
        set({ me: { ...get().me, tonight }, sheet: null, now: Date.now() });
        toast(`Tu es visible sur la carte pendant ${hours} h`);
      },
      clearTonight: () => set({ me: { ...get().me, tonight: null }, sheet: null }),
      signal: (id, kind) => {
        const s = get();
        if (!s.me.onboarded) {
          set({ sheet: "gate", intent: { type: "signal", id, kind } });
          return;
        }
        if (s.blocks.includes(id) || s.reports.includes(id)) return;
        const existing = s.matches.find((m) => m.personId === id && !isExpired(m.expiresAt, s.now));
        if (existing) {
          set({
            view: { name: "chat", personId: id },
            sheet: null,
            tab: "inbox",
            matches: s.matches.map((m) => (m.personId === id ? { ...m, unread: 0 } : m)),
          });
          return;
        }
        if (s.signals.some((sig) => sig.toId === id && sig.kind === kind)) {
          toast("Signal déjà envoyé");
          return;
        }
        if (s.signals.length >= 40) {
          toast("Trop de signaux pour le moment");
          return;
        }
        const person = PEOPLE.find((p) => p.id === id);
        if (!person) return;
        const signals = [...s.signals, { toId: id, kind, at: Date.now() }];
        if (person.openTo.includes(kind)) {
          const match = makeMatch(id, Date.now());
          set({ signals, matches: [match, ...s.matches], celebrate: id, sheet: null });
          playPop();
        } else {
          set({ signals, sheet: null });
          toast("Signal envoyé. S'il répond, c'est un match.");
        }
      },
      enterLine: (id) => {
        const s = get();
        if (!s.me.onboarded) {
          set({ sheet: "gate", intent: { type: "line", id } });
          return;
        }
        if (s.blocks.includes(id) || s.reports.includes(id)) return;
        const existing = s.matches.find((m) => m.personId === id && !isExpired(m.expiresAt, s.now));
        if (existing) {
          set({
            view: { name: "chat", personId: id },
            sheet: null,
            matches: s.matches.map((m) => (m.personId === id ? { ...m, unread: 0 } : m)),
          });
          return;
        }
        if (!PEOPLE.some((p) => p.id === id)) return;
        set({
          matches: [makeMatch(id, Date.now()), ...s.matches],
          view: { name: "chat", personId: id },
          sheet: null,
          now: Date.now(),
        });
      },
      openPocket: () => set({ view: { name: "pocket" }, sheet: null }),
      sendPocket: (text) => {
        const value = text.trim();
        if (!value) return;
        const mine: PocketMsg = { id: uid("p"), from: "me", text: value, at: Date.now() };
        set({ pocket: [...get().pocket, mine] });
      },
      openChat: (personId) =>
        set({
          view: { name: "chat", personId },
          sheet: null,
          tab: "inbox",
          celebrate: null,
          matches: get().matches.map((m) => (m.personId === personId ? { ...m, unread: 0 } : m)),
        }),
      closeView: () => set({ view: { name: "tabs" } }),
      openLive: (userId, pseudo) => {
        get().markSeen(userId);
        set({ view: { name: "live", userId, pseudo }, sheet: null });
      },
      openProfile: (userId, pseudo) => set({ view: { name: "profile", userId, pseudo }, sheet: null }),
      markSeen: (userId) => set({ seenAt: { ...get().seenAt, [userId]: Date.now() } }),
      deleteConversation: (userId) => {
        const previous = get().liveConvos;
        set({ liveConvos: previous.filter((c) => c.otherId !== userId) });
        const view = get().view;
        if (view.name === "live" && view.userId === userId) set({ view: { name: "tabs" }, tab: "inbox" });
        void hideConversation(deviceId(), userId)
          .then(() => toast("Conversation supprimée"))
          .catch(() => {
            set({ liveConvos: previous });
            toast("Suppression impossible, réessaie");
          });
      },
      sendChat: (personId, partial) => {
        const text = partial.text?.trim();
        if (!text && !partial.photo && !partial.voiceSec) return;
        const now = Date.now();
        const msg: ChatMsg = { id: uid("m"), from: "me", at: now, ...partial, text };
        set({
          matches: get().matches.map((m) =>
            m.personId === personId ? { ...m, messages: [...m.messages, msg] } : m,
          ),
        });
      },
      openOnce: (personId, msgId) =>
        set({
          matches: get().matches.map((m) =>
            m.personId !== personId
              ? m
              : {
                  ...m,
                  messages: m.messages.map((msg) => (msg.id === msgId ? { ...msg, viewed: true } : msg)),
                },
          ),
        }),
      togglePin: (personId) =>
        set({
          matches: get().matches.map((m) => {
            if (m.personId !== personId) return m;
            const pinnedMe = !m.pinnedMe;
            return { ...m, pinnedMe, expiresAt: conversationExpiry(m.createdAt, pinnedMe && m.pinnedThem) };
          }),
        }),
      togglePrecise: (personId) =>
        set({
          matches: get().matches.map((m) =>
            m.personId === personId ? { ...m, preciseMe: !m.preciseMe } : m,
          ),
        }),
      joinSpot: (id) => {
        const joined = get().joined.includes(id) ? get().joined : [...get().joined, id];
        set({ joined, view: { name: "spot", id }, sheet: null, tab: "spots" });
      },
      createSpot: (title, hours) => {
        const clean = title.trim().slice(0, 40);
        if (clean.length < 2) return;
        const span = Math.min(12, Math.max(1, hours));
        if (get().customSpots.length >= 5) {
          toast("Tu as assez de spots ouverts");
          return;
        }
        const spot: CustomSpot = {
          id: uid("spot"),
          title: clean,
          east: 30,
          north: -20,
          radiusM: 300,
          closesAt: Date.now() + span * 3_600_000,
          messages: [
            {
              id: uid("sm"),
              from: get().me.pseudo || "Toi",
              mine: true,
              text: "Spot ouvert.",
              at: Date.now(),
            },
          ],
        };
        set({
          customSpots: [spot, ...get().customSpots],
          view: { name: "spot", id: spot.id },
          sheet: null,
          tab: "spots",
        });
        toast("Spot ouvert");
      },
      armSpot: (title, hours) => {
        const clean = title.trim().slice(0, 40);
        if (clean.length < 2) return;
        if (get().liveSpots.filter((s) => s.mine && s.closesAt > Date.now()).length >= 5) {
          toast("Tu as assez de lieux ouverts");
          return;
        }
        set({
          pendingSpot: { title: clean, hours: Math.min(12, Math.max(1, hours)) },
          sheet: null,
          tab: "around",
          view: { name: "tabs" },
        });
      },
      dropSpot: (lat, lng) => {
        const pending = get().pendingSpot;
        if (!pending) return;
        set({ pendingSpot: null, tab: "around", view: { name: "tabs" }, sheet: null });
        const pseudo = get().me.pseudo || "Anonyme";
        void createLiveSpot({ self: deviceId(), title: pending.title, hours: pending.hours, lat, lng, pseudo })
          .then((id) => {
            const row: SpotRow = {
              id,
              title: pending.title,
              lat,
              lng,
              closesAt: Date.now() + pending.hours * 3_600_000,
              mine: true,
              members: 1,
            };
            set({ liveSpots: [row, ...get().liveSpots.filter((s) => s.id !== id)] });
            toast("Lieu posé · visible par les gens autour");
          })
          .catch((err) => toast(err instanceof Error ? err.message : "Lieu non créé"));
      },
      cancelSpot: () => set({ pendingSpot: null }),
      deleteSpot: (id) => {
        const leave = () => {
          const view = get().view;
          if (view.name === "spot" && view.id === id) set({ view: { name: "tabs" }, tab: "spots" });
        };
        if (get().customSpots.some((s) => s.id === id)) {
          set({ customSpots: get().customSpots.filter((s) => s.id !== id) });
          leave();
          toast("Lieu supprimé");
          return;
        }
        void closeSpot(deviceId(), id)
          .then((ok) => {
            set({ liveSpots: get().liveSpots.filter((s) => s.id !== id) });
            leave();
            toast(ok ? "Lieu supprimé" : "Ce lieu était déjà fermé");
          })
          .catch((err) => toast(err instanceof Error ? err.message : "Suppression impossible"));
      },
      sendSpot: (id, text) => {
        const body = text.trim().slice(0, 240);
        if (!body) return;
        const msg: SpotMsg = { id: uid("sm"), from: get().me.pseudo || "Toi", mine: true, text: body, at: Date.now() };
        const custom = get().customSpots.find((s) => s.id === id);
        if (custom) {
          set({
            customSpots: get().customSpots.map((s) =>
              s.id === id ? { ...s, messages: [...s.messages, msg] } : s,
            ),
          });
        } else {
          const prev = get().spotExtras[id] ?? [];
          set({ spotExtras: { ...get().spotExtras, [id]: [...prev, msg] } });
        }
      },
      removeSpotMsg: (spotId, msgId) => {
        set({
          deletedMsgs: [...get().deletedMsgs, msgId],
          customSpots: get().customSpots.map((s) =>
            s.id === spotId ? { ...s, messages: s.messages.filter((m) => m.id !== msgId) } : s,
          ),
        });
        toast("Message retiré");
      },
      block: (id) => {
        set({
          blocks: get().blocks.includes(id) ? get().blocks : [...get().blocks, id],
          sheet: null,
          view: chatOrTabs(get().view, id),
        });
        toast("Bloqué des deux côtés. Il disparaît de ta carte.");
      },
      report: (id) => {
        const reports = get().reports.includes(id) ? get().reports : [...get().reports, id];
        const blocks = get().blocks.includes(id) ? get().blocks : [...get().blocks, id];
        set({
          reports,
          blocks,
          sheet: null,
          view: chatOrTabs(get().view, id),
        });
        toast("Signalé. Bloqué pour toi et pour lui. Visible dans Réglages.");
      },
      dismissCelebrate: () => set({ celebrate: null }),
      setCover: (cover) => set({ cover }),
      setDiscreet: (discreet) => set({ discreet }),
      patchMe: (partial) => {
        const next = { ...get().me, ...partial };
        // The main photo is always the first of the album.
        if (partial.photos) next.photo = partial.photos[0] ?? "";
        set({ me: next });
      },
      saveEmail: (email) => {
        const clean = email.trim().slice(0, 80);
        if (!clean.includes("@")) {
          toast("Email invalide");
          return;
        }
        set({ me: { ...get().me, email: clean } });
        toast("Enregistré sur cet appareil");
      },
      reset: () => {
        useHdar.persist.clearStorage();
        set({ ...base(), clock: ensureClock(undefined, Date.now()) });
        toast("Profil effacé de cet appareil");
      },
    }),
    {
      name: "hdar-v1",
      skipHydration: true,
      partialize: (s) => ({
        me: s.me,
        signals: s.signals,
        matches: s.matches,
        blocks: s.blocks,
        reports: s.reports,
        cityId: s.cityId,
        customCenter: s.customCenter,
        discreet: s.discreet,
        mode: s.mode,
        clock: s.clock,
        customSpots: s.customSpots,
        spotExtras: s.spotExtras,
        deletedMsgs: s.deletedMsgs,
        joined: s.joined,
        safetyCode: s.safetyCode,
        seenAt: s.seenAt,
      }),
    },
  ),
);
