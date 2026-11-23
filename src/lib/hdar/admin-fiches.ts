import { VENUE, venueOf, type VenueKind } from "./venue.ts";

export const FICHE_STATUSES = ["discover", "claimed", "verified", "partner"] as const;
export type FicheStatus = (typeof FICHE_STATUSES)[number];

export const FICHE_STATUS_LABEL: Record<FicheStatus, string> = {
  discover: "À découvrir",
  claimed: "Réclamé",
  verified: "Vérifié",
  partner: "Partenaire",
};

export const CLAIM_METHODS = ["email_official", "email_domain", "admin_manual"] as const;
export type ClaimMethod = (typeof CLAIM_METHODS)[number];

export const CLAIM_METHOD_LABEL: Record<ClaimMethod, string> = {
  email_official: "Code envoyé à l'e-mail officiel du lieu",
  email_domain: "E-mail sur le même domaine que le site du lieu",
  admin_manual: "Vérification par l'équipe, avec un document",
};

export const CLAIM_STATUS_LABEL = {
  pending: "En attente",
  approved: "Acceptée",
  rejected: "Refusée",
} as const;

export type FichePhoto = {
  id: string;
  url: string;
  source_url?: string | null;
  credit?: string | null;
  hidden?: boolean;
  hidden_reason?: string | null;
  hidden_at?: string | null;
  created_at?: string;
};

export type FicheRow = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  kind: string;
  status: FicheStatus;
  views: number;
  ratings: number;
  avg_stars: number | null;
  comments: number;
  messages: number;
  messages_now: number;
  pending_claims: number;
  pending_photos: number;
  has_owner: boolean;
  last_activity: string | null;
  photos: FichePhoto[];
};

export type FichesList = {
  total: number;
  pending_claims: number;
  offset: number;
  limit: number;
  rows: FicheRow[];
  cities: string[];
  countries: string[];
};

export type FicheFilters = {
  city?: string;
  country?: string;
  kind?: string;
  status?: FicheStatus | "";
  q?: string;
};

export type FicheAvis = {
  id: string;
  body: string;
  at: string;
  hidden: boolean;
  pseudo: string;
  stars: number | null;
};

export type FicheMessage = {
  id: string;
  body: string;
  at: string;
  hidden: boolean;
  pseudo: string;
};

export type FicheEditChange = {
  from?: unknown;
  to?: unknown;
  from_n?: number;
  to_n?: number;
};

export type FicheEdit = {
  id: string;
  place_id?: string;
  name?: string;
  city?: string | null;
  at: string;
  actor: "owner" | "admin" | "system";
  pseudo: string;
  changes: Record<string, FicheEditChange>;
};

export type FicheDetail = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  hours: string | null;
  website: string | null;
  kind: string;
  status: FicheStatus;
  verified: boolean;
  verify_method: ClaimMethod | null;
  has_owner: boolean;
  owner_pseudo: string | null;
  claimed_at: string | null;
  verified_at: string | null;
  description: string | null;
  photos: FichePhoto[];
  pending_photos_n: number;
  avis: FicheAvis[];
  notes: { count: number; avg: number | null };
  messages: FicheMessage[];
  edits: FicheEdit[];
};

export type FicheClaim = {
  id: string;
  place_id: string;
  name: string;
  city: string | null;
  kind: string;
  status: "pending" | "approved" | "rejected";
  method: ClaimMethod;
  email: string | null;
  justification: string;
  has_proof: boolean;
  proof: string | null;
  requester_pseudo: string;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export const FIELD_LABEL: Record<string, string> = {
  description: "Description",
  hours: "Horaires",
  address: "Adresse",
  website: "Site web",
  tags: "Mots-clés",
  photos: "Photos",
  pending_photos: "Photos en attente",
};

export function kindLabel(kind: string): string {
  const v = venueOf(kind) as VenueKind;
  if (kind === "shop" || v === "shop") return "Sex-shop";
  if (kind === "club" || v === "club") return "Discothèque";
  return VENUE[v]?.label ?? kind;
}

export function statusLabel(status: string): string {
  return FICHE_STATUS_LABEL[status as FicheStatus] ?? status;
}

export function methodLabel(method: string | null | undefined): string {
  if (!method) return CLAIM_METHOD_LABEL.admin_manual;
  return CLAIM_METHOD_LABEL[method as ClaimMethod] ?? method;
}

export function formatParis(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStars(avg: number | null | undefined, count: number): string {
  if (!count || avg == null) return "Pas encore de note";
  const n = Number(avg);
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5 · ${count} avis`;
}

export function visiblePhotos(photos: FichePhoto[] | undefined): FichePhoto[] {
  return (photos ?? []).filter((p) => !p.hidden);
}

export function photoSourceHref(photo: FichePhoto): string | null {
  const src = photo.source_url?.trim() || "";
  if (/^https?:\/\//i.test(src)) return src;
  return null;
}

export function photoSourceLabel(photo: FichePhoto): string {
  const href = photoSourceHref(photo);
  if (href) {
    try {
      return new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return "Source";
    }
  }
  return photo.credit?.trim() || "Source non indiquée";
}

export function describeChanges(changes: Record<string, FicheEditChange> | undefined): string[] {
  if (!changes) return [];
  const lines: string[] = [];
  for (const [key, val] of Object.entries(changes)) {
    const label = FIELD_LABEL[key] ?? key;
    if (typeof val?.from_n === "number" || typeof val?.to_n === "number") {
      lines.push(`${label} : ${val.from_n ?? 0} → ${val.to_n ?? 0}`);
      continue;
    }
    const from = stringifyChange(val?.from);
    const to = stringifyChange(val?.to);
    lines.push(`${label} : ${from} → ${to}`);
  }
  return lines;
}

function stringifyChange(v: unknown): string {
  if (v == null || v === "") return "(vide)";
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : "(vide)";
  return String(v);
}

export function filterFicheRows(rows: FicheRow[], filters: FicheFilters): FicheRow[] {
  const city = filters.city?.trim();
  const country = filters.country?.trim().toUpperCase();
  const kind = filters.kind?.trim();
  const status = filters.status?.trim();
  const q = filters.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (city && r.city !== city) return false;
    if (country && (r.country ?? "").toUpperCase() !== country) return false;
    if (kind && r.kind !== kind) return false;
    if (status && r.status !== status) return false;
    if (q) {
      const hay = `${r.name} ${r.city ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
