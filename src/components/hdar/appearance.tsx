import { setBubble } from "@/lib/hdar/live";
import { Check, CheckCheck, ChevronLeft, Forward } from "lucide-react";
import type { CSSProperties } from "react";
import { appearanceVars, BUBBLES, FONTS, SIZES, useAppearance, WALLS } from "@/lib/hdar/appearance";

const label = "mb-2 text-xs font-bold tracking-[0.2em] text-muted uppercase";

/** Aperçu en direct d'une conversation avec les réglages choisis. */
function Preview() {
  const a = useAppearance();
  return (
    <div style={appearanceVars(a) as CSSProperties} className="chat-wall overflow-hidden rounded-3xl border border-line bg-night px-3 py-4">
      <p className="mx-auto mb-3 w-fit rounded-full bg-black/50 px-3 py-1 text-xs text-ink/80">Aujourd'hui</p>
      <div className="space-y-1.5">
        <div className="flex"><div className="bubble-other tail-other max-w-[78%] rounded-[18px] rounded-bl-[4px] px-3 pt-1.5 pb-1 shadow-sm"><span className="block text-[13px] font-bold text-[#60a5fa]">Lucas34</span><span className="msg-text">Salut ! Tu sors ce soir ? 🙂</span><span className="bubble-meta mt-0.5 block text-right text-[11px]">21:02</span></div></div>
        <div className="flex justify-end"><div className="bubble-mine max-w-[78%] rounded-[18px] px-3 pt-1.5 pb-1 shadow-sm"><span className="msg-text">Oui, vers 22 h à la Comédie</span><span className="bubble-meta mt-0.5 flex items-center justify-end gap-1 text-[11px]">21:03 <CheckCheck className="size-3.5" /></span></div></div>
        <div className="flex justify-end"><div className="bubble-mine tail-mine max-w-[78%] rounded-[18px] rounded-br-[4px] px-3 pt-1.5 pb-1 shadow-sm"><span className="bubble-meta mb-0.5 flex items-center gap-1 text-[12px] font-semibold italic"><Forward className="size-3.5" />Transféré de Nina</span><span className="msg-text">Le bar de la rue de l'Université est top</span><span className="bubble-meta mt-0.5 flex items-center justify-end gap-1 text-[11px]">21:04 <Check className="size-3.5" /></span></div></div>
      </div>
    </div>
  );
}

/** Paramètres → Apparence : couleur de mes bulles, police, taille du texte, fond. Seulement sur cet appareil. */
export function AppearanceScreen({ onBack }: { onBack: () => void }) {
  const a = useAppearance();
  const sizeIdx = Math.max(0, SIZES.findIndex((z) => z.id === a.size));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-10">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Retour aux paramètres" onClick={onBack} className="-ml-2 flex size-11 items-center justify-center"><ChevronLeft className="size-6" /></button>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Apparence</h1>
      </div>
      <div className="mt-4"><Preview /></div>

      <section className="mt-6">
        <p className={label}>Couleur de mes messages</p>
        <div className="grid grid-cols-4 gap-3">
          {BUBBLES.map((b) => (
            <button key={b.id} type="button" aria-label={b.name} aria-pressed={a.bubble === b.id} onClick={() => { a.set({ bubble: b.id }); void setBubble(b.id).catch(() => {}); }} className="flex flex-col items-center gap-1">
              <span className={"flex size-12 items-center justify-center rounded-full ring-offset-2 ring-offset-night " + (a.bubble === b.id ? "ring-2 ring-ink" : "")} style={{ background: b.bg, color: b.ink }}>{a.bubble === b.id && <Check className="size-5" />}</span>
              <span className="text-[11px] text-muted">{b.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <p className={label}>Police des messages</p>
        <div className="grid grid-cols-2 gap-2">
          {FONTS.map((f) => (
            <button key={f.id} type="button" aria-pressed={a.font === f.id} onClick={() => a.set({ font: f.id })} className={"rounded-2xl border px-3 py-3 text-left " + (a.font === f.id ? "border-signal bg-signal/10" : "border-line")}>
              <span className="block text-lg" style={{ fontFamily: f.css }}>Aa Bonsoir</span>
              <span className="text-xs text-muted">{f.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <p className={label}>Taille du texte</p>
        <div className="rounded-2xl border border-line px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xs">A</span>
            <input type="range" min={0} max={SIZES.length - 1} step={1} value={sizeIdx} aria-label="Taille du texte" onChange={(e) => a.set({ size: SIZES[Number(e.target.value)].id })} className="flex-1" />
            <span className="text-xl">A</span>
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">{SIZES.map((z) => <span key={z.id} className={z.id === a.size ? "font-bold text-ink" : ""}>{z.name}</span>)}</div>
        </div>
      </section>

      <section className="mt-6">
        <p className={label}>Fond des discussions</p>
        <div className="grid grid-cols-5 gap-2">
          {WALLS.map((w) => (
            <button key={w.id} type="button" aria-pressed={a.wall === w.id} onClick={() => a.set({ wall: w.id })} className="flex flex-col items-center gap-1">
              <span className={"block h-16 w-full rounded-xl border bg-night " + (a.wall === w.id ? "border-signal ring-1 ring-signal" : "border-line")} style={{ backgroundImage: w.css, backgroundSize: w.size }} />
              <span className="text-[11px] text-muted">{w.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <p className={label}>Confidentialité</p>
        <label className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Montrer quand j'écris</span>
            <span className="block text-xs text-muted">« … est en train d'écrire », « envoie une photo… ». Désactivé : personne ne le voit.</span>
          </span>
          <input type="checkbox" role="switch" checked={a.typing !== false} onChange={(e) => a.set({ typing: e.target.checked })} className="size-5 accent-[#FA6F6C]" />
        </label>
      </section>

      <button type="button" onClick={a.reset} className="mt-8 h-11 w-full rounded-full border border-line text-sm text-muted">Revenir aux réglages d'origine</button>
      <p className="mt-3 text-center text-xs text-muted">La couleur de tes bulles est visible par tous. Police, taille et fond ne changent que ton affichage, sur ce téléphone.</p>
    </div>
  );
}
