import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import type { RoomPresence } from "@/lib/hdar/presence";
import { useHdar } from "@/lib/hdar/store";
import { UserAvatar } from "./avatar";

/** Pastille « ● 3 en ligne » à mettre dans l'en-tête d'un salon : ouvre la liste des présents. */
export function OnlineButton({ presence }: { presence: RoomPresence | null }) {
  const [open, setOpen] = useState(false);
  if (!presence) return null;
  return (
    <>
      <button
        type="button"
        data-act="room-people"
        aria-label={`${presence.n} en ligne, voir la liste`}
        title="Voir qui est là"
        onClick={() => setOpen(true)}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-bold"
      >
        <span className="size-2 rounded-full bg-online" />
        {presence.n > 99 ? "99+" : presence.n} en ligne
      </button>
      {open && <PeopleSheet presence={presence} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Petite pastille verte pour la liste des discussions (nombre de présents hors moi). */
export function OnlineCount({ n, className = "" }: { n: number | undefined; className?: string }) {
  if (!n) return null;
  return (
    <span className={"inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-online " + className} aria-label={`${n} en ligne`}>
      <span className="size-1.5 rounded-full bg-online" />
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** « là maintenant » ou « il y a 3 min » (présence gardée 5 min après être passé). */
const seen = (ago?: number) => (ago == null ? "" : ago < 60 ? "Là maintenant" : `Il y a ${Math.round(ago / 60)} min`);

function PeopleSheet({ presence, onClose }: { presence: RoomPresence; onClose: () => void }) {
  const openProfile = useHdar((s) => s.openProfile);
  const openLive = useHdar((s) => s.openLive);
  const onboarded = useHdar((s) => s.me.onboarded);
  const setTab = useHdar((s) => s.setTab);
  const write = (id: string, pseudo: string) => {
    if (!onboarded) {
      toast("Crée ton profil pour écrire en privé", { action: { label: "Créer", onClick: () => setTab("me") } });
      return;
    }
    onClose();
    openLive(id, pseudo);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Personnes en ligne"
        className="dock flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-night pt-2 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-2">
          <h2 className="font-display text-lg font-extrabold">
            <span className="me-2 inline-block size-2.5 rounded-full bg-online align-middle" />
            {presence.n} en ligne
          </h2>
          <button type="button" aria-label="Fermer" className="flex size-10 items-center justify-center" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {presence.people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
              <button
                type="button"
                disabled={p.mine || !p.profile}
                aria-label={p.mine ? undefined : `Voir le profil de ${p.pseudo}`}
                className="flex min-w-0 flex-1 items-center gap-3 text-start disabled:cursor-default"
                onClick={() => {
                  onClose();
                  openProfile(p.id, p.pseudo);
                }}
              >
                <span className="relative shrink-0">
                  <UserAvatar id={p.id} name={p.pseudo} className="size-11 rounded-full" />
                  <span className={"absolute end-0 bottom-0 size-3 rounded-full border-2 border-night " + ((p.ago ?? 0) < 60 || p.mine ? "bg-online" : "bg-amber-400")} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p.mine ? "Toi" : p.pseudo}</span>
                  <span className="block truncate text-xs text-muted">{p.mine ? "C'est toi" : [seen(p.ago), p.profile ? "Voir le profil" : "Sans profil"].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
              {!p.mine && p.profile && (
                <button
                  type="button"
                  aria-label={`Écrire en privé à ${p.pseudo}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line"
                  onClick={() => write(p.id, p.pseudo)}
                >
                  <MessageCircle className="size-5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
