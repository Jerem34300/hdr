import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { heartsReceived, pricing, type PriceRow } from "@/lib/hdar/live";
import { checkoutWithWaiver } from "@/lib/hdar/consent";
import { WaiverCheckbox } from "./waiver";

const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Gros bouton brillant (même style que « Booster mon profil » du profil). */
export function ShinyCta({ href, children, sub }: { href: string; children: React.ReactNode; sub?: string }) {
  return (
    <a href={href} className="boost-cta mx-auto mt-10 flex min-h-14 max-w-sm flex-col items-center justify-center rounded-full px-6 py-2 text-center font-display text-base font-extrabold text-night">
      <span className="inline-flex items-center gap-2"><Sparkles className="sparkle size-5" />{children}</span>
      {sub && <span className="text-[11px] font-semibold opacity-80">{sub}</span>}
    </a>
  );
}

/** Nombre de cœurs reçus d'un profil. */
export function HeartsCount({ id, className = "" }: { id: string; className?: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { let a = true; void heartsReceived(id).then((x) => a && setN(Number(x) || 0)).catch(() => undefined); return () => { a = false; }; }, [id]);
  if (!n) return null;
  return <span className={"inline-flex items-center gap-1 rounded-full bg-[#FA6F6C]/15 px-2 py-0.5 text-xs font-bold text-[#FA6F6C] " + className}>❤️ {n}</span>;
}

/** Cœurs qui s'envolent (les deux écrans). */
export function FloatingHearts({ burst }: { burst: number }) {
  const [items, setItems] = useState<{ k: number; x: number; d: number }[]>([]);
  useEffect(() => {
    if (!burst) return;
    const add = Array.from({ length: 8 }, (_, i) => ({ k: burst * 100 + i + Math.random(), x: 20 + Math.random() * 60, d: Math.random() * 400 }));
    setItems((v) => [...v, ...add]);
    const t = setTimeout(() => setItems((v) => v.filter((h) => !add.includes(h))), 2600);
    return () => clearTimeout(t);
  }, [burst]);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {items.map((h) => <span key={h.k} className="heart-float absolute bottom-24 text-3xl" style={{ left: `${h.x}%`, animationDelay: `${h.d}ms` }}>❤️</span>)}
    </div>
  );
}

/** Feuille d'achat de cœurs. */
export function HeartPacks({ onClose, demo, empty }: { onClose: () => void; demo?: PriceRow[]; empty?: boolean }) {
  const [packs, setPacks] = useState<PriceRow[]>(demo ?? []);
  const [busy, setBusy] = useState("");
  useEffect(() => { if (!demo) void pricing().then((r) => setPacks(r.filter((p) => p.kind === "hearts"))).catch(() => undefined); }, [demo]);
  const buy = async (p: string) => {
    setBusy(p);
    try { await checkoutWithWaiver(p, null); } catch (e) { toast(e instanceof Error ? e.message : "Paiement impossible"); } finally { setBusy(""); }
  };
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full space-y-3 rounded-t-3xl bg-surface p-5 text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-line" />
        <p className="font-display text-xl font-extrabold">{empty ? "Tu n'as plus de ❤️" : "Envoie des ❤️ dans le Live"}</p>
        <p className="text-sm text-muted">Les cœurs, c'est ce qui compte vraiment : ils s'envolent en grand sur son écran et restent sur son profil. Les 🔥 🥵 😛 restent gratuits.</p>
        <p className="text-xs text-muted">1 cœur = 1 envoi.</p>
        <div className="grid grid-cols-3 gap-2">
          {packs.map((p, i) => (
            <button key={p.product} type="button" disabled={!!busy} onClick={() => void buy(p.product)}
              className={`relative flex flex-col items-center gap-1 rounded-2xl border p-3 ${i === 1 ? "border-[#FA6F6C] bg-[#FA6F6C]/10" : "border-line bg-night"}`}>
              {i === 1 && <span className="absolute -top-2 rounded-full bg-[#FA6F6C] px-2 text-[9px] font-bold text-night">Le plus pris</span>}
              <span className="text-2xl">{i === 0 ? "❤️" : i === 1 ? "💞" : "💖"}</span>
              <b className="text-sm">{p.label}</b>
              <span className="text-xs font-bold text-[#FA6F6C]">{busy === p.product ? "…" : euros(p.price_cents)}</span>
            </button>
          ))}
        </div>
        <WaiverCheckbox />
        <p className="text-[10px] text-muted">Les cœurs n'ont aucune valeur monétaire, ne sont ni remboursables ni échangeables contre de l'argent.</p>
      </div>
    </div>
  );
}
