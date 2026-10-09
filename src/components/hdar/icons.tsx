import { Footprints, MessageCircle, Moon, Music, Wine, type LucideIcon } from "lucide-react";
import type { Desire } from "@/lib/hdar/data";

export const DESIRE_ICON: Record<Desire, LucideIcon> = {
  verre: Wine,
  discuter: MessageCircle,
  plan: Moon,
  balade: Footprints,
  sortir: Music,
};
