import { BadgeCheck, Bus, MapPin, Megaphone, Plane, Toilet, TrainFront, TramFront, Trees, Waves, type LucideIcon } from "lucide-react";
import type { LayerKey } from "@/lib/hdar/map-layers";

/** Une case du menu des calques : icône au trait (jamais d'emoji), libellé, précision éventuelle. */
const ROWS: Record<LayerKey, { icon: LucideIcon; label: string; hint?: string; color: string }> = {
  partners: { icon: BadgeCheck, label: "Lieux partenaires", hint: "bars, clubs, saunas", color: "text-pink-400" },
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
        {r.label}
        {r.hint && <span className="block text-[11px] text-muted">{r.hint}</span>}
      </span>
      <input type="checkbox" className="size-4 shrink-0 accent-[#FA6F6C]" checked={on} onChange={(e) => set(k, e.target.checked)} />
    </label>
  );
}
