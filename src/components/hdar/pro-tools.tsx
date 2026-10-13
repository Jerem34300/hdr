import { useEffect, useState } from "react";
import { toast } from "sonner";
import { myPro, myProGifts, proBadge, proChatBlock, proChatOpen, proGiftSend, proGiftsPref, type ProGift, type ProPlace } from "@/lib/hdar/live";

let proCache: Promise<ProPlace[]> | null = null;
/** Lieux partenaires actifs de l'utilisateur (vide si pas pro). */
export function useMyPro() {
  const [list, setList] = useState<ProPlace[]>([]);
  useEffect(() => {
    proCache ??= myPro().catch(() => { proCache = null; return []; });
    void proCache.then(setList);
  }, []);
  return list;
}

export function PartnerBadge({ name }: { name: string }) {
  return <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-gradient-to-r from-[#fbbf24] to-[#FA6F6C] px-2 py-0.5 text-[11px] font-bold text-night">🏷️ Partenaire · {name}</span>;
}

/** Feuille « Cadeau pro 🎁 » : le pro choisit le cadeau à envoyer. */
export function ProGiftSheet({ places, to, pseudo, via, onClose }: { places: ProPlace[]; to: string; pseudo: string; via: "live" | "profile"; onClose: () => void }) {
  const [place, setPlace] = useState(places[0]?.id ?? "");
  const [title, setTitle] = useState("Un verre offert");
  const [desc, setDesc] = useState("");
  const [code, setCode] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const r = await proGiftSend({ place, to, title, desc, code, days, via }); proCache = null; toast(`Cadeau envoyé 🎁 (${r.left} restants aujourd'hui)`); onClose(); }
    catch (e) { toast(e instanceof Error ? e.message : "Envoi impossible"); }
    setBusy(false);
  };
  const inp = "w-full rounded-xl bg-night px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full space-y-3 rounded-t-3xl bg-surface p-5 text-ink" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-bold">Cadeau pro 🎁 pour {pseudo}</p>
        {places.length > 1 && <select value={place} onChange={(e) => setPlace(e.target.value)} className={inp}>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (ex. Un verre offert)" className={inp} />
        <input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder="Détails (ex. -20 % sur l'entrée)" className={inp} />
        <div className="flex gap-2">
          <input value={code} maxLength={24} onChange={(e) => setCode(e.target.value)} placeholder="Code promo (optionnel)" className={inp} />
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl bg-night px-2 text-sm">{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} j</option>)}</select>
        </div>
        <p className="text-xs text-muted">20 cadeaux max par jour. La personne peut refuser les cadeaux pro ou vous bloquer.</p>
        <button type="button" disabled={busy || !title.trim() || !place} onClick={() => void send()} className="boost-cta h-12 w-full rounded-full font-display font-extrabold text-night disabled:opacity-50">Envoyer le cadeau</button>
      </div>
    </div>
  );
}

/** Ouvre une conversation privée en tant que partenaire. */
export async function openProChat(place: string, to: string) {
  try { await proChatOpen(place, to); return true; } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); return false; }
}

/** Badge Partenaire dans l'en-tête d'un chat + bloquer / signaler le pro. */
export function ChatProBadge({ other }: { other: string }) {
  const [b, setB] = useState<{ name: string } | null>(null);
  useEffect(() => void proBadge(other).then(setB).catch(() => undefined), [other]);
  if (!b) return null;
  const act = async (report: boolean) => { try { await proChatBlock(other, report); toast(report ? "Signalé et bloqué" : "Pro bloqué"); setB(null); } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); } };
  return (
    <div className="flex items-center gap-2 px-3 pb-1">
      <PartnerBadge name={b.name} />
      <button type="button" onClick={() => void act(false)} className="text-[11px] text-muted underline">Bloquer</button>
      <button type="button" onClick={() => void act(true)} className="text-[11px] text-signal underline">Signaler</button>
    </div>
  );
}

/** Paramètres : « Messages et cadeaux des pros » + mes cadeaux valides. */
export function ProSettings() {
  const [off, setOff] = useState<boolean | null>(null);
  const [gifts, setGifts] = useState<ProGift[]>([]);
  useEffect(() => { void proGiftsPref().then(setOff).catch(() => undefined); void myProGifts().then(setGifts).catch(() => undefined); }, []);
  if (off === null) return null;
  return (
    <section className="mt-6 rounded-3xl border border-line bg-surface p-4">
      <label className="flex items-center justify-between gap-3">
        <span><b className="block text-sm">Messages et cadeaux des pros</b><span className="text-xs text-muted">Les lieux partenaires peuvent t'écrire et t'offrir des cadeaux 🎁</span></span>
        <input type="checkbox" className="size-5 accent-[#FA6F6C]" checked={!off} onChange={(e) => void proGiftsPref(!e.target.checked).then(setOff).catch((er: Error) => toast(er.message))} />
      </label>
      {gifts.length > 0 && <div className="mt-3 space-y-2">{gifts.map((g) => <GiftCard key={g.id} g={g} />)}</div>}
    </section>
  );
}

export function GiftCard({ g }: { g: ProGift }) {
  return (
    <div className="rounded-2xl bg-night p-3 text-left text-sm">
      <p className="font-bold">🎁 {g.title} <span className="font-normal text-muted">· {g.place}</span></p>
      {g.description && <p className="text-xs text-muted">{g.description}</p>}
      {g.code && <p className="mt-1 font-mono text-lg font-extrabold tracking-widest text-[#A1E3C3]">{g.code}</p>}
      <p className="text-[11px] text-muted">À montrer sur place · valable jusqu'au {new Date(g.expires).toLocaleDateString("fr-FR")}</p>
    </div>
  );
}

let ownsCache: Promise<number> | null = null;
/** Grande carte « Mon espace pro » pour les propriétaires d'un lieu partenaire. */
export function ProSpaceCard({ demo }: { demo?: boolean }) {
  const [n, setN] = useState(demo ? 1 : 0);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (demo) return;
    ownsCache ??= import("@/lib/hdar/live").then((m) => m.myPlaces()).then((r) => r.length).catch(() => { ownsCache = null; return 0; });
    void ownsCache.then(setN);
    void import("@/lib/hdar/live").then((m) => m.myHearts()).then((h) => setAdmin(!!h.unlimited)).catch(() => undefined);
  }, [demo]);
  if (!n && admin) return (
    <a href="/pro?demo=1" className="mt-3 flex items-center gap-3 rounded-3xl border border-dashed border-[#fbbf24]/70 bg-surface p-4">
      <span className="text-2xl">👀</span>
      <span className="min-w-0 flex-1"><b className="block text-sm">Voir comme un pro (démo)</b><span className="text-xs text-muted">Admin : espace pro + tableau de bord avec données d'exemple</span></span>
      <span className="text-sm font-bold text-[#fbbf24]">Ouvrir ›</span>
    </a>
  );
  if (!n) return null;
  return (
    <a href="/pro" className="mt-3 block rounded-3xl bg-gradient-to-r from-[#fbbf24] via-[#FA6F6C] to-[#3EE08F] p-[2px] shadow-[0_0_24px_rgba(251,191,36,.3)]">
      <span className="flex items-center gap-3 rounded-[22px] bg-[#0b0b10]/90 p-4">
        <span className="text-3xl">🏷️</span>
        <span className="min-w-0 flex-1"><b className="block font-display text-lg">Mon espace pro</b><span className="text-xs text-white/75">Tableau de bord, avis, Live Pro, cadeaux, Boost Pro</span></span>
        <span className="text-sm font-bold text-[#fbbf24]">Ouvrir ›</span>
      </span>
    </a>
  );
}
