import { useState } from "react";
import { Trash2 } from "lucide-react";
import { askConfirm } from "@/lib/hdar/confirm";
import { useHdar } from "@/lib/hdar/store";
import { UserAvatar } from "./avatar";
import { useFavorites } from "@/lib/hdar/favorites";
import { bindTap } from "./tap";
import { AreaInboxRow, SalonDiscover, SalonInboxRow } from "./salons";
import { useSalonInbox } from "@/lib/hdar/salon-inbox";
import { pgTime, type Conversation, type InboxSalon } from "@/lib/hdar/live";

function when(ms: number) {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}

export function Inbox() {
  const rawConvos = useHdar((s) => s.liveConvos);
  const favs = useFavorites();
  const favIds = new Set(favs.map((f) => f.id));
  // Favorites pinned on top, each group keeps its most-recent-first order.
  const convos = [...rawConvos.filter((c) => favIds.has(c.otherId)), ...rawConvos.filter((c) => !favIds.has(c.otherId))];
  const seenAt = useHdar((s) => s.seenAt);
  const openLive = useHdar((s) => s.openLive);
  const deleteConversation = useHdar((s) => s.deleteConversation);
  const [editing, setEditing] = useState(false);
  const followed = useHdar((s) => s.followedSalons);
  const { salons } = useSalonInbox();
  const mySalons = (salons ?? []).filter((s) => followed.includes(s.id));
  // Une seule liste, la plus récente en haut (favoris épinglés en tête), comme une messagerie.
  type Item = { kind: "pm"; c: Conversation; at: number } | { kind: "salon"; s: InboxSalon; at: number };
  const items: Item[] = [
    ...convos.filter((c) => !favIds.has(c.otherId)).map((c) => ({ kind: "pm" as const, c, at: c.lastAt })),
    ...mySalons.map((s) => ({ kind: "salon" as const, s, at: s.last ? pgTime(s.last.at) : 0 })),
  ].sort((a, b) => b.at - a.at);
  const pinned = convos.filter((c) => favIds.has(c.otherId));

  const pmRow = (c: Conversation) => {
    const unread = !c.lastMine && c.lastAt > (seenAt[c.otherId] ?? 0);
    const preview =
      c.lastKind === "image" ? "📷 Photo" : c.lastKind === "audio" ? "🎤 Vocal" : c.lastKind === "video" ? "🎥 Vidéo" : c.lastKind === "location" ? "📍 Position" : c.lastBody;
    return (
      <li key={c.otherId} className="flex items-stretch gap-2">
        <button
          type="button"
          data-act="live-chat"
          data-id={c.otherId}
          {...bindTap(() => openLive(c.otherId, c.pseudo))}
          className="flex h-20 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left"
        >
          <UserAvatar id={c.otherId} name={c.pseudo} className="size-12 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className={"truncate font-display " + (unread ? "font-extrabold" : "font-bold")}>
                {c.pseudo}
                {favIds.has(c.otherId) && (
                  <span className="ml-1 text-amber-400" aria-label="Favori">★</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted">{when(c.lastAt)}</span>
            </span>
            <span className={"block truncate text-sm " + (unread ? "text-ink" : "text-muted")}>
              {c.lastMine ? "Toi : " : ""}
              {preview}
            </span>
          </span>
          {unread && <span className="size-2.5 shrink-0 rounded-full bg-signal" aria-label="Non lu" />}
        </button>
        {editing && (
          <button
            type="button"
            aria-label={`Supprimer la conversation avec ${c.pseudo}`}
            className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-signal text-xs text-night"
            onClick={() => {
              void askConfirm({
                title: `Supprimer la conversation avec ${c.pseudo} ?`,
                body: "Elle disparaît pour toi seulement.",
                confirm: "Supprimer",
                danger: true,
              }).then((ok) => ok && deleteConversation(c.otherId));
            }}
          >
            <Trash2 className="size-5" />
            Suppr.
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Messages</h1>
        {(convos.length > 0 || mySalons.length > 0) && (
          <button type="button" className="h-9 rounded-full border border-line px-4 text-sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Terminé" : "Modifier"}
          </button>
        )}
      </div>
      <SalonDiscover />
      <h2 className="mt-6 font-display text-lg font-bold">Discussions</h2>
      {convos.length === 0 && mySalons.length === 0 && (
        <div className="py-10 text-center text-sm text-muted">
          <p>Aucune discussion pour l'instant.</p>
          <p className="mt-1">Touche un profil sur la carte, ou entre dans un salon : il apparaîtra ici.</p>
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {pinned.map(pmRow)}
        <AreaInboxRow />
        {items.map((it) => (it.kind === "pm" ? pmRow(it.c) : <SalonInboxRow key={it.s.id} s={it.s} editing={editing} />))}
      </ul>
    </div>
  );
}
