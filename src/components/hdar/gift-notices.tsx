import { useEffect, useState } from "react";
import { myNotices } from "@/lib/hdar/live";
import { usePremium } from "@/lib/hdar/premium";

/** Affiche une fois les notifications in-app (« Cadeau de hdar 🎁 »). */
export function GiftNotices() {
  const [list, setList] = useState<{ id: number; title: string; body: string | null }[]>([]);
  useEffect(() => {
    const t = setTimeout(() => void myNotices().then((r) => { if (r?.length) { setList(r); void usePremium.getState().refresh(); } }).catch(() => undefined), 2500);
    return () => clearTimeout(t);
  }, []);
  const n = list[0];
  if (!n) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6" onClick={() => setList(list.slice(1))}>
      <div className="boost-nudge w-full max-w-sm rounded-3xl border border-[#fbbf24]/60 bg-surface p-6 text-center shadow-[0_0_40px_#fbbf24]" onClick={(e) => e.stopPropagation()}>
        <p className="text-5xl">🎁</p>
        <p className="mt-2 font-display text-2xl font-extrabold">{n.title}</p>
        {n.body && <p className="mt-2 text-sm text-muted">{n.body}</p>}
        <button type="button" onClick={() => setList(list.slice(1))} className="boost-cta mt-5 h-12 w-full rounded-full font-display font-extrabold text-night">Merci !</button>
      </div>
    </div>
  );
}
