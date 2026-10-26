import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { linkify, safeUrl } from "@/lib/hdar/linkify";
import { mentionLookup, mentionSearch, type MentionHit } from "@/lib/hdar/live";
import { useHdar } from "@/lib/hdar/store";

const REL = "noopener noreferrer nofollow";
const RETURN_KEY = "hdar-return";

/** Mémorise la conversation et la position avant de quitter l'onglet : la flèche Retour y ramène. */
export function saveReturn() {
  try {
    const s = useHdar.getState();
    const wall = document.querySelector<HTMLElement>(".chat-wall");
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ view: s.view, tab: s.tab, scroll: wall?.scrollTop ?? null, at: Date.now() }));
  } catch { /* stockage indisponible */ }
}

/** Au retour sur hdar.chat (Retour du navigateur / de l'appli), rouvre la même conversation à la même position. */
export function restoreReturn() {
  let r: { view?: unknown; tab?: unknown; scroll?: number | null; at?: number } | null = null;
  try { r = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null"); sessionStorage.removeItem(RETURN_KEY); } catch { r = null; }
  if (!r || !r.at || Date.now() - r.at > 6 * 3600_000) return;
  useHdar.setState({ ...(r.tab ? { tab: r.tab as never } : {}), ...(r.view ? { view: r.view as never } : {}) });
  if (typeof r.scroll !== "number") return;
  const target = r.scroll;
  let n = 0;
  const tick = () => {
    const w = document.querySelector<HTMLElement>(".chat-wall");
    if (w && w.scrollHeight - w.clientHeight >= target - 2) { w.scrollTop = target; if (++n < 10) setTimeout(tick, 300); return; }
    if (++n < 40) setTimeout(tick, 150);
  };
  setTimeout(tick, 300);
}

const useLeave = create<{ url: URL | null; open: (u: URL) => void; close: () => void }>((set) => ({
  url: null, open: (url) => set({ url }), close: () => set({ url: null }),
}));

/** Ouvre un lien : hdar.chat directement, l'extérieur après confirmation, toujours dans le même onglet. */
export function openLink(href: string) {
  const u = safeUrl(href);
  if (!u) return;
  if (u.hostname === location.hostname || /(^|\.)hdar\.chat$/i.test(u.hostname)) {
    saveReturn();
    if (u.origin === location.origin) location.assign(u.pathname + u.search + u.hash);
    else location.assign(u.href);
    return;
  }
  useLeave.getState().open(u);
}

/** Feuille « Tu quittes hdar.chat » (montée une fois dans l'app). */
export function LeaveConfirm() {
  const { url, close } = useLeave();
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={close}>
      <div role="dialog" aria-label="Tu quittes hdar.chat" className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <ExternalLink className="mx-auto size-7 text-signal" />
        <p className="mt-2 font-display text-xl font-extrabold">Tu quittes hdar.chat</p>
        <p className="mt-1 text-sm text-muted">Ce lien ouvre un site externe :</p>
        <p className="mt-2 rounded-xl bg-night px-3 py-2 font-mono text-sm break-all text-ink">{host}</p>
        <p className="mt-2 text-xs text-muted">La flèche Retour te ramène ici, au même endroit. Ne partage jamais tes codes.</p>
        <a
          href={url.href}
          rel={REL}
          referrerPolicy="no-referrer"
          onClick={() => { saveReturn(); close(); }}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-signal font-medium text-night"
        >
          Continuer vers {host}
        </a>
        <button type="button" onClick={close} className="mt-2 h-11 w-full rounded-full text-sm text-muted">Rester sur hdar.chat</button>
      </div>
    </div>
  );
}

function openMention(pseudo: string) {
  void mentionLookup(pseudo)
    .then((r) => (r ? useHdar.getState().openProfile(r.user_id, r.pseudo) : toast(`@${pseudo} introuvable`)))
    .catch(() => toast(`@${pseudo} introuvable`));
}

/** Texte avec liens cliquables et mentions colorées. `mentions=false` pour les annonces/bios. */
export function RichText({ text, mentions = true, className }: { text: string; mentions?: boolean; className?: string }) {
  const segs = linkify(text, mentions);
  const nodes: ReactNode[] = segs.map((s, i) => {
    if (s.t === "text") return s.v;
    if (s.t === "mention")
      return (
        <span key={i} role="button" tabIndex={0} className="mention cursor-pointer font-semibold" onClick={(e) => { e.stopPropagation(); openMention(s.pseudo); }} onKeyDown={(e) => e.key === "Enter" && openMention(s.pseudo)}>
          {s.v}
        </span>
      );
    return (
      <a
        key={i}
        href={s.href}
        rel={REL}
        referrerPolicy="no-referrer"
        className="chat-link break-words underline underline-offset-2"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openLink(s.href); }}
      >
        {s.v}
      </a>
    );
  });
  return <span className={className}>{nodes}</span>;
}

/** Suggestions @pseudo au-dessus d'un champ de saisie : membres du fil d'abord, puis recherche serveur. */
export function useMentions(value: string, setValue: (v: string) => void, local: { pseudo: string; userId?: string }[]) {
  const [caret, setCaret] = useState(0);
  const [remote, setRemote] = useState<MentionHit[]>([]);
  const before = value.slice(0, caret);
  const m = before.match(/(^|[^\w@])@([\w.-]{0,30})$/);
  const q = m ? m[2] : null;
  const seq = useRef(0);
  useEffect(() => {
    if (q === null || q.length < 1) { setRemote([]); return; }
    const n = ++seq.current;
    const t = setTimeout(() => void mentionSearch(q).then((r) => n === seq.current && setRemote(r ?? [])).catch(() => undefined), 200);
    return () => clearTimeout(t);
  }, [q]);
  const seen = new Set<string>();
  const list: { pseudo: string }[] = [];
  if (q !== null)
    for (const x of [...local, ...remote]) {
      const k = x.pseudo.toLowerCase();
      if (seen.has(k) || !k.startsWith(q.toLowerCase()) || /\s/.test(x.pseudo)) continue;
      seen.add(k);
      list.push({ pseudo: x.pseudo });
      if (list.length >= 6) break;
    }
  const pick = (pseudo: string) => {
    const start = caret - (q?.length ?? 0);
    const next = value.slice(0, start) + pseudo + " " + value.slice(caret);
    setValue(next);
    setCaret(start + pseudo.length + 1);
  };
  const track = (el: HTMLInputElement | HTMLTextAreaElement) => setCaret(el.selectionStart ?? el.value.length);
  return { list: q === null ? [] : list, pick, track };
}

export function MentionList({ list, onPick }: { list: { pseudo: string }[]; onPick: (p: string) => void }) {
  if (!list.length) return null;
  return (
    <div role="listbox" aria-label="Suggestions de pseudos" className="mx-3 mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
      {list.map((x) => (
        <button key={x.pseudo} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(x.pseudo)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-night">
          <span className="flex size-8 items-center justify-center rounded-full bg-night text-sm font-bold">{x.pseudo[0]?.toUpperCase()}</span>
          <span className="font-medium">@{x.pseudo}</span>
        </button>
      ))}
    </div>
  );
}

// Retour depuis un lien externe : rouvre la même conversation au même endroit.
if (typeof window !== "undefined") restoreReturn();
