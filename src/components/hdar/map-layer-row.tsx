import { BadgeCheck, Bus, MapPin, Megaphone, Plane, Toilet, TrainFront, TramFront, Trees, Waves, type LucideIcon } from "lucide-react";
import type { LayerKey } from "@/lib/hdar/map-layers";
import { VENUE, VENUE_ORDER } from "@/lib/hdar/venue";
import { t } from "@/lib/hdar/i18n";

/** Une case du menu des calques : icône au trait (jamais d'emoji), libellé, précision éventuelle. */
const ROWS: Record<LayerKey, { icon: LucideIcon; label: string; hint?: string; color: string }> = {
  partners: { icon: BadgeCheck, label: "Lieux à découvrir", hint: "même couleur selon le type, halo pour les partenaires", color: "text-ink" },
  station: { icon: TrainFront, label: "Gares", hint: "zoom proche", color: "text-sky-400" },
  metro: { icon: TramFront, label: "Métro et tram", hint: "zoom proche", color: "text-sky-300" },
  bus: { icon: Bus, label: "Bus", hint: "zoom proche", color: "text-sky-200" },
  airport: { icon: Plane, label: "Aéroports", color: "text-sky-400" },
  beach: { icon: Waves, label: "Plages", color: "text-cyan-300" },
  nature: { icon: Trees, label: "Parcs et nature", color: "text-emerald-400" },
  public: { icon: MapPin, label: "Autres lieux publics", color: "text-violet-300" },
  toilets: { icon: Toilet, label: "Toilettes", hint: "zoom proche", color: "text-slate-300" },
  ads: { icon: Megaphone, label: "Annonces", hint: "position approx.", color: "text-amber-300" },
};

export function LayerRow({ k, on, set }: { k: LayerKey; on: boolean; set: (k: LayerKey, on: boolean) => void }) {
  const r = ROWS[k];
  const Icon = r.icon;
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-2 py-1 hover:bg-surface" data-act={`layer-${k}`}>
      <Icon className={`size-4 shrink-0 ${r.color}`} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 leading-tight">
        {t(r.label)}
        {r.hint && <span className="block text-[11px] text-muted">{t(r.hint)}</span>}
      </span>
      <input type="checkbox" className="size-4 shrink-0 accent-[#FA6F6C]" checked={on} onChange={(e) => set(k, e.target.checked)} />
    </label>
  );
}

/** Petite légende des couleurs par type, dans le menu des calques. */
export function VenueLegend() {
  return (
    <div className="mx-1 mb-1 rounded-xl bg-night/80 px-2 py-1.5" data-testid="venue-legend">
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
        {VENUE_ORDER.map((k) => (
          <li key={k} className="flex items-center gap-1.5 text-[11px] text-ink">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: VENUE[k].color, boxShadow: `0 0 6px ${VENUE[k].color}` }} />
            {t(VENUE[k].label)}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex items-center gap-1 text-[10px] leading-snug text-muted">
        <span className="inline-flex size-3 items-center justify-center rounded-full border border-white/80 text-[8px] font-black leading-none text-ink" aria-hidden>✓</span>
        {t("Halo + pastille : partenaire")}
      </p>
    </div>
  );
}
