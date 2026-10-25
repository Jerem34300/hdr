import { useRef, type ReactNode } from "react";
import { CornerUpLeft, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { REACTIONS, reactTo, toggleReaction, type ReactScope, type Reaction } from "@/lib/hdar/live";

/** Petite barre d'emojis (❤️ 😂 🔥 👍 😮 😢) ; les miennes sont surlignées. */
export function ReactionBar({ list, onPick }: { list?: Reaction[]; onPick: (emoji: string) => void }) {
  return (
    <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 shadow-lg" role="toolbar" aria-label="Réagir">
      {REACTIONS.map((e) => {
        const mine = list?.some((r) => r.e === e && r.mine);
        return (
          <button
            key={e}
            type="button"
            aria-label={`Réagir ${e}`}
            aria-pressed={!!mine}
            onClick={() => onPick(e)}
            className={"flex size-10 items-center justify-center rounded-full text-2xl transition-transform active:scale-125 " + (mine ? "bg-signal/25" : "hover:bg-white/10")}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
}

/** Compteurs sous la bulle ; toucher une pastille ajoute / retire ma réaction. */
export function ReactionChips({ list, mine, onToggle }: { list?: Reaction[]; mine: boolean; onToggle: (emoji: string) => void }) {
  if (!list?.length) return null;
  return (
    <div className={"-mt-1.5 flex flex-wrap gap-1 px-1 " + (mine ? "justify-end" : "")}>
      {list.map((r) => (
        <button
          key={r.e}
          type="button"
          onClick={() => onToggle(r.e)}
          aria-label={`${r.e} ${r.n}${r.mine ? ", retirer ma réaction" : ", réagir"}`}
          className={"relative z-[1] flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs " + (r.mine ? "border-signal bg-signal/20 text-ink" : "border-line bg-night text-muted")}
        >
          <span className="text-sm leading-none">{r.e}</span>
          {r.n > 1 && <span className="font-bold">{r.n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Réaction optimiste : affichage immédiat, puis valeurs du serveur (ou retour arrière si refus). */
export function sendReaction(scope: ReactScope, id: string, emoji: string, current: Reaction[] | undefined, apply: (list: Reaction[]) => void) {
  apply(toggleReaction(current, emoji));
  reactTo(scope, id, emoji)
    .then((list) => apply(list ?? []))
    .catch((e: unknown) => {
      apply(current ?? []);
      toast(e instanceof Error ? e.message : "Réaction impossible");
    });
}

/** Citation d'un message auquel on répond (même rendu que les salons). Toucher = aller au message. */
export function ReplyQuote({ reply, mine, onJump }: { reply: { pseudo: string; body: string }; mine: boolean; onJump: () => void }) {
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onJump();
      }}
      className={"my-1 block cursor-pointer rounded-lg border-l-[3px] px-2 py-1 text-left text-[13px] " + (mine ? "border-current/60 bg-black/10" : "border-signal bg-white/5")}
    >
      <span className="block truncate font-bold">{reply.pseudo}</span>
      <span className="line-clamp-2 opacity-80">{reply.body}</span>
    </span>
  );
}

/** Bandeau « Répondre à … » au-dessus de la zone de saisie. */
export function ReplyDraft({ title, color, text, onJump, onCancel, edit }: { title: string; color?: string; edit?: boolean; text: string; onJump: () => void; onCancel: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
      {edit ? <Pencil className="size-4 shrink-0 text-signal" /> : <CornerUpLeft className="size-4 shrink-0 text-signal" />}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onJump}>
        <span className="block truncate text-xs font-bold" style={color ? { color } : undefined}>
          {title}
        </span>
        <span className="block truncate text-muted">{text}</span>
      </button>
      <button type="button" aria-label="Annuler" className="flex size-8 items-center justify-center" onClick={onCancel}>
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Appui long (mobile) ou clic droit (ordinateur) → ouvre le menu du message. */
export function LongPress({ onLong, children, className }: { onLong: () => void; children: ReactNode; className?: string }) {
  const t = useRef(0);
  const fired = useRef(false);
  const cancel = () => window.clearTimeout(t.current);
  return (
    <div
      className={className}
      onTouchStart={() => {
        fired.current = false;
        cancel();
        t.current = window.setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(15);
          onLong();
        }, 450);
      }}
      onTouchMove={cancel}
      onTouchEnd={(e) => {
        cancel();
        if (fired.current) e.preventDefault();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onLong();
      }}
    >
      {children}
    </div>
  );
}
