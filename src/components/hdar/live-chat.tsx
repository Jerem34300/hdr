import { isBot } from "@/lib/hdar/live";
import { scrollListEnd } from "@/lib/hdar/scroll-end";
import { locale, tBot, useLang } from "@/lib/hdar/i18n";
import { BotAvatar, BotBadge, BotComposer } from "./bot";
import { typingText, useTyping } from "@/lib/hdar/typing";
import { TypingBar } from "./rich-text";
import { MentionList, RichText, useMentions } from "./rich-text";
import { mentionNotify } from "@/lib/hdar/live";
import type { CSSProperties } from "react";
import { authorBubble } from "@/lib/hdar/appearance";
import { parseAdQuote } from "@/lib/hdar/ads";
import { useFavorites } from "@/lib/hdar/favorites";
import { showOnMap, useMapFocus, useRegion } from "@/lib/hdar/map-focus";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  MoreVertical,
  Send,
  Copy,
  CornerUpLeft,
  Pencil,
  Smile,
  Square,
  Video,
  Check,
  CheckCheck,
  Forward,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { startCall } from "@/lib/hdar/call";
import {
  blockLive,
  getMedia,
  markRead,
  pgTime,
  getProfile,
  readThread,
  sendLive,
  sendLocation,
  sendMedia,
  type LiveMsg,
  type Reaction,
  canEditMsg,
  editMessage,
  dmRemove,
} from "@/lib/hdar/live";
import { LongPress, ReactionBar, ReactionChips, ReplyDraft, ReplyQuote, sendReaction } from "./reactions";
import { Row } from "./group-chat";
import { ForwardSheet, FwdHeader } from "./forward";
import { deviceId } from "@/lib/hdar/device";
import { readImage } from "@/lib/hdar/media";
import { askConfirm } from "@/lib/hdar/confirm";
import { reportUser } from "@/lib/hdar/report";
import { useHdar } from "@/lib/hdar/store";
import { Avatar } from "./avatar";
import { CameraSheet } from "./camera";
import { AttachButton, BlurredPhoto, MediaView } from "./media-composer";
import { GoButton } from "./go-sheet";
import { uploadChatMedia } from "@/lib/hdar/chat-media";

const MAX_VOICE_SEC = 60;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("audio"));
    reader.readAsDataURL(blob);
  });
}

const msgPreview = (m: LiveMsg) =>
  m.kind === "image" ? "📷 Photo" : m.kind === "video" ? "🎥 Vidéo" : m.kind === "audio" ? "🎤 Vocal" : m.kind === "location" ? "📍 Position" : m.body;

export function LiveChat({ userId, pseudo, demo }: { userId: string; pseudo: string; /** Aperçu de dev : messages fixes, pas de serveur. */ demo?: LiveMsg[] }) {
  const region = useRegion(userId);
  const onMap = useMapFocus((s) => !!s.pins[userId]);
  const favs = useFavorites();
  const onboarded = useHdar((s) => s.me.onboarded) && !(import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("asdiscret"));
  const [camera, setCamera] = useState(false);
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const openGate = useHdar((s) => s.openGate);
  const closeView = useHdar((s) => s.closeView);
  const openProfile = useHdar((s) => s.openProfile);
  const markSeen = useHdar((s) => s.markSeen);
  const deleteConversation = useHdar((s) => s.deleteConversation);
  const [menu, setMenu] = useState(false);
  const [photo, setPhoto] = useState("");
  const [text, setText] = useState("");
  const ment = useMentions(text, setText, [{ pseudo }]);
  const myPseudo = useHdar((s) => s.me.pseudo);
  const onboardedMe = useHdar((s) => s.me.onboarded);
  const ty = useTyping("dm", demo || !onboardedMe ? null : userId, myPseudo, demo ? (typeof location !== "undefined" && location.search.includes("typing") ? [{ id: userId, pseudo, kind: location.search.includes("vocal") ? "audio" : "text", at: Date.now() }] : []) : undefined);
  const [msgs, setMsgs] = useState<LiveMsg[]>(demo ?? []);
  const [replyTo, setReplyTo] = useState<LiveMsg | null>(null);
  const [msgMenu, setMsgMenu] = useState<LiveMsg | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [fwd, setFwd] = useState<LiveMsg | null>(null);
  const removeMine = (m: LiveMsg) => {
    setMsgMenu(null);
    void askConfirm({ title: "Retirer ce message ?", body: "Il disparaît pour toi et pour l'autre personne.", confirm: "Retirer", danger: true }).then((ok) => {
      if (!ok) return;
      const drop = () => setMsgs((list) => list.filter((x) => x.id !== m.id));
      if (demo) return drop();
      void dmRemove(m.id).then(drop).catch((e: Error) => toast(e.message));
    });
  };
  const input = useRef<HTMLInputElement>(null);
  // Réactions affichées tout de suite, avant le prochain rafraîchissement du fil.
  const [over, setOver] = useState<Record<string, Reaction[]>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<LiveMsg | null>(null);
  useEffect(() => {
    setOver({});
    setEdits({});
  }, [msgs]);
  const bodyOf = (m: LiveMsg) => edits[m.id] ?? (isBot(userId) && !m.mine ? tBot(m.body) : m.body);
  useLang((s) => s.lang + ":" + s.ready);
  const startEdit = (m: LiveMsg) => {
    setMsgMenu(null);
    setReplyTo(null);
    setEditing(m);
    setText(bodyOf(m));
    window.setTimeout(() => input.current?.focus(), 50);
  };
  const reactionsOf = (m: LiveMsg) => over[m.id] ?? m.reactions;
  const react = (m: LiveMsg, emoji: string) => {
    setMsgMenu(null);
    if (!onboarded) return openGate();
    sendReaction("dm", m.id, emoji, reactionsOf(m), (l) => setOver((o) => ({ ...o, [m.id]: l })));
  };
  const reply = (m: LiveMsg) => {
    setMsgMenu(null);
    if (!onboarded) return openGate();
    if (editing) {
      setEditing(null);
      setText("");
    }
    setReplyTo(m);
    window.setTimeout(() => input.current?.focus(), 50);
  };
  const jumpTo = (id: string | null | undefined) => {
    if (!id) return;
    const el = document.getElementById(`dm-${id}`);
    if (!el) return toast("Ce message n'est plus disponible");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  };
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<number | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recTimer = useRef(0);
  const recStart = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  const refresh = () => readThread({ data: { self: deviceId(), withId: userId } }).then(setMsgs);

  async function shareExactLocation() {
    const ok = await askConfirm({
      title: `Envoyer ta position exacte à ${pseudo} ?`,
      body: `Seul ${pseudo} la verra, dans cette conversation, pendant 1 h. Sur la carte, ta position reste arrondie.`,
      confirm: "Envoyer ma position",
    });
    if (!ok) return;
    if (!navigator.geolocation) return toast("Localisation indisponible sur cet appareil");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void sendLocation(deviceId(), userId, pos.coords.latitude, pos.coords.longitude, 60)
          .then(refresh)
          .then(() => toast("Position envoyée"))
          .catch((e: unknown) => toast(e instanceof Error ? e.message : "Envoi impossible"));
      },
      () => toast("Autorise la localisation pour partager ta position"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    if (demo) return;
    let stop = false;
    let timer = 0;
    let lastKey = "";
    let lastChange = Date.now();
    // Adaptive polling: 1 s while the conversation is lively, slower when quiet or hidden.
    const delay = () => {
      if (document.hidden) return 15000;
      const quiet = Date.now() - lastChange;
      return quiet < 60_000 ? 1000 : quiet < 300_000 ? 2500 : 5000;
    };
    const load = () => {
      window.clearTimeout(timer);
      void readThread({ data: { self: deviceId(), withId: userId } })
        .then((rows) => {
          if (stop) return;
          const key = `${rows.length}:${rows[rows.length - 1]?.id ?? ""}`;
          if (key !== lastKey) {
            lastKey = key;
            lastChange = Date.now();
          }
          setMsgs(rows);
          if (!document.hidden)
            void markRead(deviceId(), userId)
              .then((t) => !stop && setSeenAt(t))
              .catch(() => undefined);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!stop) timer = window.setTimeout(load, delay());
        });
    };
    const onVisible = () => {
      if (!document.hidden) load();
    };
    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(recTimer.current);
      const mr = recRef.current;
      if (mr && mr.state !== "inactive") {
        mr.onstop = null;
        mr.stop();
        mr.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [userId]);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    getProfile(deviceId(), userId)
      .then((p) => alive && p?.photo && setPhoto(p.photo))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const lastId = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    scrollListEnd(end.current);
    markSeen(userId);
  }, [lastId, markSeen, userId]);

  async function sendVideo(file: File) {
    ty.ping("video");
    setBusy(true);
    try {
      const { path, duration } = await uploadChatMedia(file, "video");
      await sendMedia({ data: { self: deviceId(), to: userId, kind: "video", media: `sb:${path}`, duration } });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Vidéo non envoyée");
    } finally {
      setBusy(false);
    }
  }

  async function sendPhoto(file: File) {
    ty.ping("photo");
    setBusy(true);
    try {
      const media = await readImage(file, 1280);
      await sendMedia({ data: { self: deviceId(), to: userId, kind: "image", media } });
      await refresh();
    } catch (err) {
      toast(err instanceof Error && err.message !== "image" ? err.message : "Photo illisible");
    } finally {
      setBusy(false);
    }
  }

  async function startRec() {
    ty.ping("audio");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Ton navigateur ne gère pas les vocaux");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Micro refusé. Autorise-le dans ton navigateur.");
      return;
    }
    const mr = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const sec = Math.min(
        MAX_VOICE_SEC,
        Math.max(1, Math.round((Date.now() - recStart.current) / 1000)),
      );
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      setBusy(true);
      void blobToDataUrl(blob)
        .then((media) =>
          sendMedia({
            data: { self: deviceId(), to: userId, kind: "audio", media, duration: sec },
          }),
        )
        .then(refresh)
        .catch((err) => toast(err instanceof Error ? err.message : "Vocal non envoyé"))
        .finally(() => setBusy(false));
    };
    mr.start();
    recRef.current = mr;
    recStart.current = Date.now();
    setRec(0);
    recTimer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - recStart.current) / 1000);
      setRec(s);
      ty.ping("audio");
      if (s >= MAX_VOICE_SEC) stopRec();
    }, 250);
  }

  function stopRec() {
    window.clearInterval(recTimer.current);
    setRec(null);
    const mr = recRef.current;
    recRef.current = null;
    if (mr && mr.state !== "inactive") mr.stop();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {camera && <CameraSheet onClose={() => setCamera(false)} onSend={(f) => void sendPhoto(f)} />}
      <header className="relative flex items-center gap-1 border-b border-line px-2 py-2">
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center"
          aria-label="Retour"
          onClick={closeView}
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 text-start active:bg-surface"
          aria-label={`Voir le profil de ${pseudo}`}
          onClick={() => openProfile(userId, pseudo)}
        >
          {isBot(userId) ? <BotAvatar className="size-10 shrink-0 rounded-full" /> : <Avatar src={photo} name={pseudo} className="size-10 shrink-0 rounded-full" />}
          <span className="min-w-0">
            <span className="block truncate font-display font-bold">
              {pseudo}
              {isBot(userId) && <BotBadge />}
              {favs.some((f) => f.id === userId) && (
                <span className="ms-1 text-amber-400" aria-label="Favori">★</span>
              )}
            </span>
            <span className="flex items-center text-xs text-muted">
              {region ? <>📍 {region} · </> : null}Voir le profil <ChevronRight className="size-3" />
            </span>
          </span>
        </button>
        {onMap && !isBot(userId) && (
          <button type="button" aria-label="Voir sur la carte" title="Voir sur la carte" onClick={() => showOnMap(userId)} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-lg">🗺️</button>
        )}
        {!isBot(userId) && <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-signal text-night"
          aria-label="Appel vidéo"
          onClick={() => (onboarded ? void startCall(userId, pseudo) : openGate())}
        >
          <Video className="size-5" />
        </button>}
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center"
          aria-label="Plus d'options"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          <MoreVertical className="size-5" />
        </button>
        {menu && (
          <div className="absolute top-full end-2 z-30 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-surface text-sm shadow-2xl">
            <button
              type="button"
              className="block w-full px-4 py-3 text-start"
              onClick={() => openProfile(userId, pseudo)}
            >
              Voir le profil
            </button>
            <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-start"
              onClick={() => {
                setMenu(false);
                if (!onboarded) return openGate();
                void shareExactLocation();
              }}
            >
              📍 Partager ma position exacte
            </button>
            <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-start"
              onClick={() => {
                setMenu(false);
                void askConfirm({
                  title: `Supprimer la conversation avec ${pseudo} ?`,
                  body: "Elle disparaît pour toi seulement.",
                  confirm: "Supprimer",
                  danger: true,
                }).then((ok) => ok && deleteConversation(userId));
              }}
            >
              Supprimer la conversation
            </button>
            {!isBot(userId) && <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-start text-signal"
              onClick={() => {
                setMenu(false);
                void reportUser(userId, pseudo).then((sent) => sent && closeView());
              }}
            >
              Signaler
            </button>}
            <button
              type="button"
              className="block w-full border-t border-line px-4 py-3 text-start text-signal"
              onClick={() => {
                void blockLive({ data: { self: deviceId(), other: userId } })
                  .then(() => {
                    toast("Bloqué");
                    closeView();
                  })
                  .catch(() => toast("Action impossible"));
              }}
            >
              Bloquer
            </button>
          </div>
        )}
      </header>
      <div className="chat-wall min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <p className="text-center text-sm text-muted">Aucun message. Écris le premier.</p>
        )}
        {msgs.map((m, i) => (
          <Row key={m.id} m={m} onSwipe={() => reply(m)}>
            <div id={`dm-${m.id}`} className={m.mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <div className={"group flex w-full items-center gap-1 " + (m.mine ? "flex-row-reverse" : "")}>
                <LongPress
                  onLong={() => setMsgMenu(m)}
                  onTap={() => setMsgMenu(m)}
                  style={m.mine ? undefined : (authorBubble(m.bubble) as CSSProperties | undefined)}
                  className={
                    "max-w-[80%] min-w-[4.5rem] rounded-[18px] px-3 pt-1.5 pb-1 shadow-sm select-none transition-shadow md:select-text " +
                    (m.mine ? "bubble-mine" : (m.bubble ? "bubble-other bubble-author" : "bubble-other")) +
                    ((msgs[i + 1]?.mine ?? !m.mine) !== m.mine ? (m.mine ? " tail-mine rounded-ee-[4px]" : " tail-other rounded-es-[4px]") : "") +
                    (flash === m.id ? " ring-2 ring-amber-300" : "")
                  }
                >
                  <FwdHeader fwd={m.fwd} />
                  {m.reply && <ReplyQuote reply={m.reply} mine={m.mine} onJump={() => jumpTo(m.replyTo)} />}
                  <div className="msg-text">
                    {m.kind === "text" ? (
                      <AdQuoteBody body={bodyOf(m)} mine={m.mine} />
                    ) : m.kind === "location" ? (
                      <LocationBubble msg={m} />
                    ) : demo ? (
                      <p>{msgPreview(m)}</p>
                    ) : (
                      <LiveMedia msg={m} />
                    )}
                  </div>
                  <span className="bubble-meta mt-0.5 flex items-center justify-end gap-1 text-[11px]">
                    {(m.editedAt || edits[m.id] !== undefined) && "modifié · "}
                    {new Date(pgTime(m.at)).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}
                    {m.mine && (seenAt !== null && seenAt >= pgTime(m.at)
                      ? <CheckCheck aria-label="Vu" className="size-3.5" />
                      : <Check aria-label="Envoyé" className="size-3.5" />)}
                  </span>
                </LongPress>
                <button
                  type="button"
                  aria-label="Réagir ou répondre"
                  onClick={() => setMsgMenu(m)}
                  className="hidden size-8 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 md:flex"
                >
                  <Smile className="size-4" />
                </button>
              </div>
              <div className="mt-0.5">
                <ReactionChips list={reactionsOf(m)} mine={m.mine} onToggle={(e) => react(m, e)} />
              </div>
            </div>
          </Row>
        ))}
        <div ref={end} />
      </div>
      {rec !== null && (
        <p className="px-4 pb-2 text-xs text-signal">
          ● Enregistrement · {rec}s / {MAX_VOICE_SEC} — appuie sur ■ pour envoyer
        </p>
      )}
      {busy && rec === null && <p className="px-4 pb-2 text-xs text-muted">Envoi…</p>}
      {fwd && <ForwardSheet src="dm" id={fwd.id} preview={msgPreview(fwd)} onClose={() => setFwd(null)} demo={demo ? [{ scope: "salon", id: "s1", name: "Général", emoji: "💬", hint: "Salon · 12 en ligne" }, { scope: "dm", id: "u2", name: "Nina", hint: "Message privé" }] : undefined} />}
      {msgMenu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setMsgMenu(null)}>
          <div className="dock w-full max-w-md rounded-t-3xl border border-line bg-night pt-2" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-2">
              <ReactionBar list={reactionsOf(msgMenu)} onPick={(e) => react(msgMenu, e)} />
            </div>
            <div className="mx-4 mb-2 rounded-2xl bg-surface px-3 py-2 text-sm">
              <span className="block text-xs font-bold text-muted">{msgMenu.mine ? "Toi" : pseudo}</span>
              <span className="block max-h-[5.75rem] overflow-y-auto break-words whitespace-pre-wrap text-muted">{msgPreview(msgMenu)}</span>
            </div>
            <button type="button" className="flex h-12 w-full items-center gap-3 px-5 text-start text-[15px] active:bg-white/5" onClick={() => reply(msgMenu)}>
              <CornerUpLeft className="size-5" /> Répondre
            </button>
            {msgMenu.kind !== "location" && (
              <button type="button" className="flex h-12 w-full items-center gap-3 px-5 text-start text-[15px] active:bg-white/5" onClick={() => { setFwd(msgMenu); setMsgMenu(null); }}>
                <Forward className="size-5" /> Transférer
              </button>
            )}
            {canEditMsg(msgMenu.mine, msgMenu.kind, pgTime(msgMenu.at)) && msgMenu.fwd == null && (
              <button type="button" className="flex h-12 w-full items-center gap-3 px-5 text-start text-[15px] active:bg-white/5" onClick={() => startEdit(msgMenu)}>
                <Pencil className="size-5" /> Modifier
              </button>
            )}
            {msgMenu.kind === "text" && (
              <button
                type="button"
                className="flex h-12 w-full items-center gap-3 px-5 text-start text-[15px] active:bg-white/5"
                onClick={() => {
                  void navigator.clipboard?.writeText(msgMenu.body).then(() => toast("Copié"));
                  setMsgMenu(null);
                }}
              >
                <Copy className="size-5" /> Copier
              </button>
            )}
            {msgMenu.mine && (
              <button type="button" className="flex h-12 w-full items-center gap-3 px-5 text-start text-[15px] text-signal active:bg-white/5" onClick={() => removeMine(msgMenu)}>
                <Trash2 className="size-5" /> Retirer le message
              </button>
            )}
            <button type="button" className="flex h-12 w-full items-center justify-center px-5 text-[15px] text-muted active:bg-white/5" onClick={() => setMsgMenu(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {editing && onboarded && (
        <div className="border-t border-line px-3 pt-2">
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
        </div>
      )}
      {replyTo && onboarded && (
        <div className="border-t border-line px-3 pt-2">
          <ReplyDraft
            title={`Répondre à ${replyTo.mine ? "toi" : pseudo}`}
            text={msgPreview(replyTo)}
            onJump={() => jumpTo(replyTo.id)}
            onCancel={() => setReplyTo(null)}
          />
        </div>
      )}
      {isBot(userId) ? (
        <BotComposer />
      ) : !onboarded ? (
        <div className="dock border-t border-line px-4 pt-3 text-center">
          {msgs.some((m) => !m.mine) ? (
            <>
              <p className="text-sm text-muted">Tu es en mode Discret : tu peux lire, mais pas répondre en privé. Ta conversation sera conservée.</p>
              <button type="button" className="boost-cta mt-2 h-12 w-full rounded-full font-display font-extrabold text-night" onClick={openGate}>
                Crée ton profil pour répondre
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Crée ton profil pour envoyer un message privé. La photo est facultative.
              </p>
              <button
                type="button"
                className="mt-2 h-11 w-full rounded-full bg-signal text-night"
                onClick={openGate}
              >
                Créer mon profil
              </button>
            </>
          )}
        </div>
      ) : (
        <>
        <TypingBar text={typingText(ty.typers)} />
        <MentionList list={ment.list} onPick={ment.pick} />
        <form
          className="dock flex items-center gap-2 border-t border-line px-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = text.trim();
            if (!body) return;
            setText("");
            if (editing) {
              const m = editing;
              setEditing(null);
              if (body === bodyOf(m) || demo) {
                if (demo) setEdits((e) => ({ ...e, [m.id]: body }));
                return;
              }
              setEdits((e) => ({ ...e, [m.id]: body }));
              void editMessage("dm", m.id, body)
                .then(refresh)
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
            setReplyTo(null);
            ty.stop();
            if (demo) return;
            void sendLive({ data: { self: deviceId(), to: userId, body, replyTo: r?.id ?? null } })
              .then(() => mentionNotify("dm", userId, body))
              .then(refresh)
              // Keep the draft so a failed send (network, flood guard) isn't lost.
              .catch((err) => {
                setText((t) => t || body);
                setReplyTo(r);
                toast(err instanceof Error ? err.message : "Message non envoyé");
              });
          }}
        >
          <AttachButton
            disabled={busy || rec !== null}
            onCamera={() => setCamera(true)}
            onPick={(f, kind) => void (kind === "video" ? sendVideo(f) : sendPhoto(f))}
          />
          <button
            type="button"
            disabled={busy && rec === null}
            className={
              "flex size-11 shrink-0 items-center justify-center rounded-full border " +
              (rec !== null ? "border-signal bg-signal text-night" : "border-line")
            }
            aria-label={rec !== null ? "Arrêter et envoyer le vocal" : "Enregistrer un vocal"}
            onClick={() => (rec !== null ? stopRec() : void startRec())}
          >
            {rec !== null ? <Square className="size-4" /> : <Mic className="size-5" />}
          </button>
          <input
            ref={input}
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 outline-none"
            value={text}
            maxLength={500}
            placeholder="Message"
            onSelect={(e) => ment.track(e.currentTarget)}
            onChange={(e) => { ment.track(e.target); setText(e.target.value); if (e.target.value.trim()) ty.ping("text"); else ty.stop(); }}
          />
          <button
            type="submit"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-signal text-night"
            aria-label="Envoyer"
          >
            <Send className="size-5" />
          </button>
        </form>
        </>
      )}
    </div>
  );
}

function LiveMedia({ msg }: { msg: LiveMsg }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let alive = true;
    getMedia(deviceId(), msg.id)
      .then((v) => {
        if (!alive) return;
        if (v) setSrc(v);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [msg.id]);

  if (src.startsWith("sb:")) return <MediaView kind={msg.kind} path={src.slice(3)} duration={msg.duration} reportable={!msg.mine} forwarded={msg.fwd != null} />;
  if (failed) return <p>{msg.kind === "image" ? "Photo indisponible" : msg.kind === "video" ? "Vidéo indisponible" : "Vocal indisponible"}</p>;
  if (!src)
    return (
      <p className="opacity-70">
        {msg.kind === "image" ? "Photo…" : msg.kind === "video" ? "Vidéo…" : `Vocal · ${msg.duration ?? 1}s…`}
      </p>
    );
  if (msg.kind === "audio")
    return <audio controls preload="metadata" src={src} className="h-10 w-60 max-w-full" />;
  if (msg.fwd != null) return <BlurredPhoto src={src} blur />;
  return (
    <>
      <button
        type="button"
        className="block"
        onClick={() => setZoom(true)}
        aria-label="Agrandir la photo"
      >
        <img src={src} alt="Photo" className="max-h-64 rounded-xl" />
      </button>
      {zoom && (
        <button
          type="button"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(false)}
          aria-label="Fermer la photo"
        >
          <img src={src} alt="Photo" className="max-h-full max-w-full rounded-xl" />
        </button>
      )}
    </>
  );
}

function LocationBubble({ msg }: { msg: LiveMsg }) {
  const [lat, lng] = msg.body.split(",").map(Number);
  if (!msg.body || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <p className="opacity-70">📍 Position partagée (expirée)</p>;
  }
  const until = msg.duration
    ? new Date(
        Date.parse(msg.at.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")) +
          msg.duration * 60000,
      )
    : null;
  return (
    <div className="space-y-1">
      <p className="font-bold">📍 {msg.mine ? "Tu as partagé ta position" : "Position exacte"}</p>
      <div className="flex flex-wrap gap-2">
        <GoButton lat={lat} lng={lng} className="inline-flex items-center gap-1.5 font-semibold underline" />
      </div>
      {until && Number.isFinite(until.getTime()) && (
        <p className="text-xs opacity-70">
          Visible jusqu'à{" "}
          {until.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

/** Message privé : citation d'annonce (titre + lien) au-dessus du texte, sinon texte brut. */
function AdQuoteBody({ body, mine }: { body: string; mine: boolean }) {
  const q = parseAdQuote(body);
  if (!q) return <p className="break-words whitespace-pre-wrap"><RichText text={body} /></p>;
  return (
    <>
      <button type="button" onClick={() => useHdar.getState().openAnnonces(q.id)} className={"mb-1 block w-full rounded-xl border-s-4 px-2 py-1 text-start text-xs " + (mine ? "border-night/50 bg-night/10" : "border-signal bg-night/40")}>
        <span className="opacity-70">📌 Réponse à l'annonce</span>
        <span className="block font-bold break-words">{q.title || "Annonce"} ›</span>
      </button>
      <p className="break-words whitespace-pre-wrap"><RichText text={q.rest} /></p>
    </>
  );
}

/** Aperçu de dev uniquement (captures d'écran) : conversation privée d'exemple. */
export function LiveChatDemo() {
  const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const msgs: LiveMsg[] = [
    { id: "m1", mine: false, bubble: "violet", body: "Salut ! Tu sors ce soir ?", at: at(40), kind: "text", duration: null },
    { id: "m2", mine: true, body: "Oui, je pensais aller vers la Comédie 🍻", at: at(38), kind: "text", duration: null, reactions: [{ e: "🔥", n: 1, mine: false }] },
    { id: "m3", mine: false, bubble: "violet", body: "Top, je connais un bar sympa rue de l'Université, regarde https://www.lebarbu.fr/carte", at: at(35), kind: "text", duration: null },
    { id: "m4", mine: true, body: "Carrément, on dit 22 h ?", at: at(6), editedAt: at(5), kind: "text", duration: null, replyTo: "m3", reply: { pseudo: "Lucas34", body: "Top, je connais un bar sympa rue de l'Université" } },
    { id: "m5", mine: false, bubble: "violet", body: "Parfait 😄 à tout à l'heure", at: at(4), kind: "text", duration: null, reactions: [{ e: "❤️", n: 1, mine: true }, { e: "👍", n: 1, mine: true }] },
    { id: "m6", mine: true, body: "Le Live de ce soir commence à 21 h 🎥", at: at(2), kind: "text", duration: null, fwd: "Hdar admin" },
    ...(typeof location !== "undefined" && location.search.includes("fwdphoto") ? [{ id: "m7", mine: true, body: "", at: at(0), kind: "image" as const, duration: null }] : []),
  ];
  return (
    <div className="flex h-dvh flex-col bg-night text-ink">
      <LiveChat userId="7f3a0000-0000-4000-8000-000000000000" pseudo="Lucas34" demo={msgs} />
    </div>
  );
}
