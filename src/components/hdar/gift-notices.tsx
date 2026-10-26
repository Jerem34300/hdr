import { GiftReveal } from "./gift-reveal";
import { useEffect, useState } from "react";
import { myNotices, proGiftBlock, type NoticeRef, type ProGift } from "@/lib/hdar/live";
import { useHdar } from "@/lib/hdar/store";
import { toast } from "sonner";
import { GiftCard } from "./pro-tools";
import { usePremium } from "@/lib/hdar/premium";

/** Affiche une fois les notifications in-app (« Cadeau de hdar 🎁 »). */
export function GiftNotices() {
  const [list, setList] = useState<{ id: number; title: string; body: string | null; gift?: ProGift | null }[]>([]);
  useEffect(() => {
    const pull = () => void myNotices().then((r) => {
      if (!r?.length) return;
      const mentions = r.filter((n) => n.kind === "mention");
      for (const n of mentions) showMention(n.title, n.body, n.ref ?? null);
      const rest = r.filter((n) => n.kind !== "mention");
      if (rest.length) { setList((l) => [...l, ...rest]); void usePremium.getState().refresh(); }
    }).catch(() => undefined);
    const t = setTimeout(pull, 2500);
    // Mentions : on revérifie régulièrement tant que l'app est visible.
    const iv = setInterval(() => { if (document.visibilityState === "visible") pull(); }, 45_000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, []);
  const n = list[0];
  if (!n) return null;
  if (!n.gift && n.title.includes("Cadeau de hdar")) return <GiftReveal key={n.id} title={n.title} body={n.body ?? ""} onClose={() => setList(list.slice(1))} />;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6" onClick={() => setList(list.slice(1))}>
      <div className="boost-nudge w-full max-w-sm rounded-3xl border border-[#fbbf24]/60 bg-surface p-6 text-center shadow-[0_0_40px_#fbbf24]" onClick={(e) => e.stopPropagation()}>
        <p className="text-5xl">🎁</p>
        <p className="mt-2 font-display text-2xl font-extrabold">{n.title}</p>
        {n.gift ? <div className="mt-3"><GiftCard g={n.gift} /></div> : n.body && <p className="mt-2 text-sm text-muted">{n.body}</p>}
        <button type="button" onClick={() => setList(list.slice(1))} className="boost-cta mt-5 h-12 w-full rounded-full font-display font-extrabold text-night">Merci !</button>
        {n.gift && <div className="mt-3 flex justify-center gap-4 text-xs text-muted">
          <button type="button" className="underline" onClick={() => { void proGiftBlock(n.gift!.id).then(() => toast("Ce lieu ne pourra plus t'envoyer de cadeaux")).catch(() => undefined); setList(list.slice(1)); }}>Bloquer ce lieu</button>
          <button type="button" className="text-signal underline" onClick={() => { void proGiftBlock(n.gift!.id, true).then(() => toast("Signalé, merci")).catch(() => undefined); setList(list.slice(1)); }}>Signaler</button>
        </div>}
      </div>
    </div>
  );
}

/** Notification de mention : « Nina t'a mentionné dans Occitanie » + extrait, bouton Voir. */
export function showMention(title: string, body: string | null, ref: NoticeRef | null) {
  const open = () => {
    const st = useHdar.getState();
    if (ref?.scope === "salon" && ref.salon) st.openSalon(ref.salon, ref.title ?? "Salon");
    else if (ref?.scope === "dm" && ref.from) st.openLive(ref.from, ref.pseudo ?? "");
    else if (ref?.scope === "area") st.openPocket();
  };
  toast("💬 " + title, { description: body ?? undefined, duration: 8000, action: { label: "Voir", onClick: open } });
  try { navigator.vibrate?.(30); } catch { /* rien */ }
}
