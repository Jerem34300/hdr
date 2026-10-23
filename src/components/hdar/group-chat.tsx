import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Copy, CornerUpLeft, Flag, MessageCircle, Pencil, Send, Smile, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { MediaKind, MediaScope } from "@/lib/hdar/chat-media";
import { canEditMsg, editMessage, type GroupLine, type Reaction } from "@/lib/hdar/live";
import { ReactionBar, ReactionChips, ReplyDraft, ReplyQuote, sendReaction } from "./reactions";
import { reportUser } from "@/lib/hdar/report";
import { useHdar } from "@/lib/hdar/store";
import { UserAvatar } from "./avatar";
import { RoomAttach, RoomMedia } from "./media-composer";
import { OnlineButton } from "./room-people";

/** Couleur stable du pseudo (comme Telegram), lisible sur fond sombre. */
const NAME_COLORS = ["#FA6F6C", "#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f472b6", "#22d3ee", "#a3e635"];
function nameColor(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const preview = (m: GroupLine) =>
  m.kind === "image" ? "📷 Photo" : m.kind === "video" ? "🎥 Vidéo" : m.kind === "audio" ? "🎤 Vocal" : m.body;

type Props = {
  header: ReactNode;
  lines: GroupLine[];
  loaded: boolean;
  scope: Extract<MediaScope, "area" | "salon">;
  placeholder: string;
  empty: ReactNode;
  maxLength: number;
  /** Petite info après l'heure (ex. distance). */
  meta?: (m: GroupLine) => string | null;
  canHide: (m: GroupLine) => boolean;
  onHide: (m: GroupLine) => Promise<unknown>;
  onSend: (text: string, replyTo: string | null) => Promise<unknown>;
  /** Absent = pas de médias (ex. sans profil). */
  onSendMedia?: (kind: MediaKind, path: string, duration: number | null, replyTo: string | null) => Promise<unknown>;
  /** Raison pour laquelle les médias sont indisponibles (affichée au toucher du trombone). */
  mediaLockedHint?: string;
  onChanged: () => void;
};

/** Discussion de groupe façon messagerie : bulles, heures, jours, réponses citées, menu par message. */
export function GroupChat(p: Props) {
  const openProfile = useHdar((s) => s.openProfile);
  const openLive = useHdar((s) => s.openLive);
  const onboarded = useHdar((s) => s.me.onboarded);
  const setTab = useHdar((s) => s.setTab);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<GroupLine | null>(null);
  const [menu, setMenu] = useState<GroupLine | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef<string | undefined>(undefined);
  const first = useRef(true);
  // Réactions affichées tout de suite, avant le prochain rafraîchissement du fil.
  const [over, setOver] = useState<Record<string, Reaction[]>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<GroupLine | null>(null);
  useEffect(() => {
    setOver({});
    setEdits({});
  }, [p.lines]);
  const bodyOf = (m: GroupLine) => edits[m.id] ?? m.body;
  const startEdit = (m: GroupLine) => {
    setMenu(null);
    setReplyTo(null);
    setEditing(m);
    setText(bodyOf(m));
    window.setTimeout(() => input.current?.focus(), 50);
  };
  const reactionsOf = (m: GroupLine) => over[m.id] ?? m.reactions;
  const react = (m: GroupLine, emoji: string) => {
    setMenu(null);
    sendReaction(p.scope, m.id, emoji, reactionsOf(m), (l) => setOver((o) => ({ ...o, [m.id]: l })));
  };

  // Reste collé en bas sauf si l'utilisateur remonte lire ; sinon compte les nouveaux.
  useLayoutEffect(() => {
    const last = p.lines[p.lines.length - 1];
    if (!last || last.id === lastId.current) return;
    const prev = lastId.current;
    lastId.current = last.id;
    const el = box.current;
    if (!el) return;
    if (first.current || atBottom || last.mine) {
      first.current = false;
      el.scrollTop = el.scrollHeight;
      setUnseen(0);
    } else if (prev) {
      const i = p.lines.findIndex((m) => m.id === prev);
      setUnseen((n) => n + (i >= 0 ? p.lines.length - 1 - i : 1));
    }
  }, [p.lines, atBottom]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  const toBottom = () => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };
  const jumpTo = (id: string | null) => {
    if (!id) return;
    const el = document.getElementById(`gm-${id}`);
    if (!el) return toast("Ce message n'est plus disponible");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
  };
  const reply = (m: GroupLine) => {
    if (editing) {
      setEditing(null);
      setText("");
    }
    setReplyTo(m);
    setMenu(null);
    window.setTimeout(() => input.current?.focus(), 50);
  };
  const send = () => {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      const m = editing;
      setEditing(null);
      setText("");
      if (body === bodyOf(m)) return;
      setEdits((e) => ({ ...e, [m.id]: body }));
      editMessage(p.scope, m.id, body)
        .then(p.onChanged)
        .catch((err: unknown) => {
          setEdits((e) => {
            const { [m.id]: _drop, ...rest } = e;
            return rest;
          });
          toast(err instanceof Error ? err.message : "Modification impossible");
        });
      return;
    }
    const r = replyTo;
    setText("");
    setReplyTo(null);
    p.onSend(body, r?.id ?? null)
      .then(p.onChanged)
      .catch((err: unknown) => {
        setText((t) => t || body);
        setReplyTo(r);
        toast(err instanceof Error ? err.message : "Message non envoyé");
      });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {p.header}
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          className="h-full overflow-y-auto px-3 py-3"
          onScroll={(e) => {
            const el = e.currentTarget;
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            setAtBottom(bottom);
            if (bottom) setUnseen(0);
          }}
        >
          {p.loaded && p.lines.length === 0 && <div className="py-12 text-center text-sm text-muted">{p.empty}</div>}
          {p.lines.map((m, i) => {
            const prev = p.lines[i - 1];
            const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
            const head = newDay || !prev || prev.fromId !== m.fromId || m.at - prev.at > 5 * 60_000;
            const next = p.lines[i + 1];
            const tail = !next || next.fromId !== m.fromId || next.at - m.at > 5 * 60_000 || new Date(next.at).toDateString() !== new Date(m.at).toDateString();
            const extra = p.meta?.(m);
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <p className="sticky top-1 z-10 mx-auto my-3 w-fit rounded-full bg-black/50 px-3 py-1 text-xs text-ink/80 backdrop-blur first-letter:uppercase">
                    {dayLabel(m.at)}
                  </p>
                )}
                <Row m={m} onSwipe={() => reply(m)}>
                  <div id={`gm-${m.id}`} className={"group flex items-end gap-2 " + (m.mine ? "justify-end" : "") + (head ? " mt-3" : " mt-0.5")}>
                    {!m.mine && (
                      <span className="w-8 shrink-0">
                        {tail && (
                          <button type="button" aria-label={`Voir le profil de ${m.pseudo}`} onClick={() => openProfile(m.fromId, m.pseudo)}>
                            <UserAvatar id={m.fromId} name={m.pseudo} className="size-8 rounded-full" />
                          </button>
                        )}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setMenu(m)}
                      className={
                        "relative max-w-[80%] min-w-[72px] px-3 pt-1.5 pb-1 text-left text-[15px] leading-snug break-words whitespace-pre-wrap transition-colors " +
                        (m.mine ? "rounded-2xl bg-signal text-night" : "rounded-2xl bg-surface text-ink") +
                        (tail ? (m.mine ? " rounded-br-md" : " rounded-bl-md") : "") +
                        (flash === m.id ? " ring-2 ring-amber-300" : "")
                      }
                    >
                      {head && !m.mine && (
                        <span className="block truncate text-[13px] font-bold" style={{ color: nameColor(m.fromId) }}>
                          {m.pseudo}
                        </span>
                      )}
                      {m.reply && <ReplyQuote reply={m.reply} mine={m.mine} onJump={() => jumpTo(m.replyTo)} />}
                      {m.kind === "text" ? bodyOf(m) : <RoomMedia scope={p.scope} id={m.id} mine={m.mine} />}
                      <span className={"float-right mt-1.5 ml-2 translate-y-0.5 text-[11px] " + (m.mine ? "text-night/60" : "text-muted")}>
                        {extra ? `${extra} · ` : ""}
                        {(m.editedAt || edits[m.id] !== undefined) && "modifié · "}
                        {hhmm(m.at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Réagir"
                      onClick={() => setMenu(m)}
                      className={"hidden size-8 shrink-0 items-center justify-center self-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 md:flex " + (m.mine ? "order-first" : "")}
                    >
                      <Smile className="size-4" />
                    </button>
                  </div>
                  <div className={m.mine ? "" : "pl-10"}>
                    <ReactionChips list={reactionsOf(m)} mine={m.mine} onToggle={(e) => react(m, e)} />
                  </div>
                </Row>
              </Fragment>
            );
          })}
        </div>
        {!atBottom && (
          <button
            type="button"
            aria-label="Aller aux derniers messages"
            onClick={toBottom}
            className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full border border-line bg-night shadow-lg"
          >
            <ArrowDown className="size-5" />
            {unseen > 0 && (
              <span className="absolute -top-2 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-[11px] font-bold text-night">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </button>
        )}
      </div>

      <div className="dock border-t border-line px-3 pt-2">
        {editing && (
          <ReplyDraft
            edit
            title="Modifier le message"
            text={bodyOf(editing)}
            onJump={() => jumpTo(editing.id)}
            onCancel={() => {
              setEditing(null);
              setText("");
            }}
          />
        )}
        {replyTo && (
          <ReplyDraft
            title={`Répondre à ${replyTo.mine ? "toi" : replyTo.pseudo}`}
            color={nameColor(replyTo.fromId)}
            text={preview(replyTo)}
            onJump={() => jumpTo(replyTo.id)}
            onCancel={() => setReplyTo(null)}
          />
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {p.onSendMedia ? (
            <RoomAttach
              send={(k, path, d) => {
                const r = replyTo;
                setReplyTo(null);
                return p.onSendMedia!(k, path, d, r?.id ?? null).then(p.onChanged);
              }}
            />
          ) : (
            p.mediaLockedHint && (
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-muted"
                aria-label="Photos et vocaux"
                onClick={() =>
                  toast(p.mediaLockedHint, onboarded ? undefined : { action: { label: "Créer", onClick: () => setTab("me") } })
                }
              >
                +
              </button>
            )
          )}
          <textarea
            ref={input}
            rows={1}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-line bg-night px-4 py-2.5 leading-snug outline-none focus-visible:border-signal"
            value={text}
            maxLength={p.maxLength}
            placeholder={p.placeholder}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(128, e.target.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="submit" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-signal text-night" aria-label="Envoyer">
            <Send className="size-5" />
          </button>
        </form>
      </div>

      {menu && (
        <MessageMenu
          m={menu}
          canHide={p.canHide(menu)}
          reactions={reactionsOf(menu)}
          onReact={(e) => react(menu, e)}
          onClose={() => setMenu(null)}
          onReply={() => reply(menu)}
          onEdit={canEditMsg(menu.mine, menu.kind, menu.at) ? () => startEdit(menu) : undefined}
          onProfile={() => {
            setMenu(null);
            openProfile(menu.fromId, menu.pseudo);
          }}
          onPrivate={() => {
            setMenu(null);
            if (!onboarded) {
              toast("Crée ton profil pour écrire en privé", { action: { label: "Créer", onClick: () => setTab("me") } });
              return;
            }
            openLive(menu.fromId, menu.pseudo);
          }}
          onHide={() => {
            setMenu(null);
            void p.onHide(menu).then(p.onChanged).catch(() => toast("Impossible de retirer ce message"));
          }}
          onReport={() => {
            setMenu(null);
            void reportUser(menu.fromId, menu.pseudo, menu.body).then((sent) => sent && p.onChanged());
          }}
        />
      )}
    </div>
  );
}

/** Glisser une bulle vers la droite = répondre (comme Telegram / WhatsApp). */
export function Row({ m, onSwipe, children }: { m: { id: string }; onSwipe: () => void; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; dx: number } | null>(null);
  const set = (dx: number) => {
    if (el.current) el.current.style.transform = dx ? `translateX(${dx}px)` : "";
  };
  return (
    <div
      ref={el}
      className="transition-transform duration-150"
      data-msg={m.id}
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY, dx: 0 };
      }}
      onTouchMove={(e) => {
        const s = start.current;
        if (!s) return;
        const t = e.touches[0];
        const dx = t.clientX - s.x;
        if (Math.abs(t.clientY - s.y) > 24) {
          start.current = null;
          set(0);
          return;
        }
        if (dx > 0) {
          s.dx = Math.min(72, dx);
          set(s.dx);
        }
      }}
      onTouchEnd={() => {
        const s = start.current;
        start.current = null;
        set(0);
        if (s && s.dx > 56) onSwipe();
      }}
    >
      {children}
    </div>
  );
}

function MessageMenu({
  m,
  canHide,
  reactions,
  onReact,
  onEdit,
  onClose,
  onReply,
  onProfile,
  onPrivate,
  onHide,
  onReport,
}: {
  m: GroupLine;
  canHide: boolean;
  reactions?: Reaction[];
  onReact: (emoji: string) => void;
  onEdit?: () => void;
  onClose: () => void;
  onReply: () => void;
  onProfile: () => void;
  onPrivate: () => void;
  onHide: () => void;
  onReport: () => void;
}) {
  const item = "flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] active:bg-white/5";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="dock w-full max-w-md rounded-t-3xl border border-line bg-night pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-2">
          <ReactionBar list={reactions} onPick={onReact} />
        </div>
        <div className="mx-4 mb-2 rounded-2xl bg-surface px-3 py-2 text-sm">
          <span className="block text-xs font-bold" style={{ color: nameColor(m.fromId) }}>
            {m.mine ? "Toi" : m.pseudo} · {new Date(m.at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="line-clamp-3 text-muted">{preview(m)}</span>
        </div>
        <button type="button" className={item} onClick={onReply}>
          <CornerUpLeft className="size-5" /> Répondre
        </button>
        {onEdit && (
          <button type="button" className={item} onClick={onEdit}>
            <Pencil className="size-5" /> Modifier
          </button>
        )}
        {!m.mine && (
          <>
            <button type="button" className={item} onClick={onProfile}>
              <UserRound className="size-5" /> Voir le profil de {m.pseudo}
            </button>
            <button type="button" className={item} onClick={onPrivate}>
              <MessageCircle className="size-5" /> Écrire en privé
            </button>
          </>
        )}
        {m.kind === "text" && (
          <button
            type="button"
            className={item}
            onClick={() => {
              void navigator.clipboard?.writeText(m.body).then(() => toast("Copié"));
              onClose();
            }}
          >
            <Copy className="size-5" /> Copier
          </button>
        )}
        {canHide && (
          <button type="button" className={item + " text-signal"} onClick={onHide}>
            <Trash2 className="size-5" /> Retirer le message
          </button>
        )}
        {!m.mine && (
          <button type="button" className={item + " text-signal"} onClick={onReport}>
            <Flag className="size-5" /> Signaler
          </button>
        )}
        <button type="button" className={item + " justify-center text-muted"} onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/** Aperçu de dev uniquement (captures d'écran), avec des messages d'exemple. */
export function GroupChatDemo() {
  const now = Date.now();
  const mk = (i: number, fromId: string, pseudo: string, body: string, ago: number, extra: Partial<GroupLine> = {}): GroupLine => ({
    id: `d${i}`, fromId, pseudo, body, kind: "text", at: now - ago * 60_000, mine: fromId === "me", replyTo: null, reply: null, ...extra,
  });
  const lines = [
    mk(1, "7f3a", "Lucas34", "Quelqu'un sort ce soir vers Comédie ?", 1500),
    mk(2, "b21c", "Nina", "Moi peut-être, plutôt vers 22 h", 1490),
    mk(3, "me", "Toi", "Partant pour un verre 🔥", 14, { editedAt: new Date(now - 13 * 60_000).toISOString(), reactions: [{ e: "🔥", n: 3, mine: false }, { e: "❤️", n: 1, mine: false }] }),
    mk(4, "7f3a", "Lucas34", "Top ! On se retrouve où ?", 12, { replyTo: "d3", reply: { pseudo: "Toi", body: "Partant pour un verre 🔥" } }),
    mk(5, "7f3a", "Lucas34", "Je connais un bar sympa rue de l'Université", 11, { reactions: [{ e: "👍", n: 2, mine: true }] }),
    mk(6, "c90e", "Sam", "Je viens aussi si ça vous dérange pas 😊", 3),
  ];
  return (
    <div className="flex h-dvh flex-col bg-night text-ink">
      <GroupChat
        scope="salon"
        lines={lines}
        loaded
        maxLength={1000}
        placeholder="Message"
        empty={null}
        canHide={(m) => m.mine}
        onHide={async () => undefined}
        onSend={async () => undefined}
        mediaLockedHint="Crée ton profil pour envoyer photos, vidéos et vocaux"
        onChanged={() => undefined}
        header={
          <header className="flex items-center gap-2 border-b border-line px-2 py-2">
            <span className="px-3 text-2xl">☀️</span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold">Occitanie</p>
              <p className="text-xs text-muted">3 personnes aujourd'hui · Montpellier, Toulouse, Nîmes…</p>
            </div>
            <OnlineButton
              presence={{
                n: 4,
                people: [
                  { id: "me", pseudo: "Toi", profile: true, mine: true, photo: false },
                  { id: "7f3a", pseudo: "Lucas34", profile: true, mine: false, photo: false },
                  { id: "c90e", pseudo: "Sam", profile: true, mine: false, photo: false },
                  { id: "b21c", pseudo: "Anonyme", profile: false, mine: false, photo: false },
                ],
              }}
            />
          </header>
        }
      />
    </div>
  );
}
