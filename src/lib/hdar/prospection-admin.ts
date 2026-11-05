/** Helpers admin Prospection — masquage e-mails/jetons, compteurs, CSV. Aucun secret. */

export type OutreachRow = {
  id: string;
  place_id: string;
  kind: string;
  name: string;
  city: string | null;
  country?: string | null;
  lot?: string | null;
  /** Domaine seulement — jamais d'adresse complète dans l'UI. */
  email_domain?: string | null;
  /** Legacy v130 : présent côté API actuelle, à masquer immédiatement. */
  email?: string | null;
  claim_token?: string | null;
  claim_url?: string | null;
  status: string;
  resend_status?: string | null;
  sent_at: string | null;
  opened_at?: string | null;
  claimed_at: string | null;
  suppressed_at: string | null;
  delivered_at?: string | null;
  refused_at?: string | null;
  last_activity_at?: string | null;
  note: string | null;
  created_at: string;
  place_status?: string | null;
  place_claimed?: boolean | null;
  place_published?: boolean | null;
};

export type OutreachStats = {
  envoyes: number;
  delivres: number;
  bounces: number;
  fiches_ouvertes: number;
  inscrits: number;
  publiees: number;
  refus: number;
  desinscrits: number;
  en_attente: number;
  total?: number;
};

export const STATUS_LABEL: Record<string, string> = {
  ready: "À envoyer",
  sent: "Envoyé",
  delivered: "Délivré",
  opened: "Fiche ouverte",
  claimed: "Inscrit",
  published: "Publié",
  refused: "Refus",
  suppressed: "Désinscrit",
  bounced: "Bounce",
};

export const KIND_LABEL: Record<string, string> = {
  bar: "Bar",
  club: "Club",
  sauna: "Sauna",
  other: "Autre",
  "sex-shop": "Sex-shop",
  "cruising-bar": "Cruising bar",
  boite: "Boîte",
  "club-echange": "Club échangiste",
};

export function emailDomain(emailOrDomain: string | null | undefined): string | null {
  if (!emailOrDomain) return null;
  const s = emailOrDomain.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@")) {
    const d = s.split("@").pop() || "";
    return d || null;
  }
  // déjà un domaine
  if (s.includes(".") && !s.includes(" ")) return s;
  return null;
}

/** Normalise une ligne API (v130 ou v131) : domaine seulement, jetons retirés. */
export function sanitizeOutreachRow(raw: OutreachRow): OutreachRow {
  const domain = raw.email_domain || emailDomain(raw.email);
  const last =
    raw.last_activity_at ||
    maxIso([raw.refused_at, raw.claimed_at, raw.suppressed_at, raw.delivered_at, raw.opened_at, raw.sent_at, raw.created_at]);
  return {
    id: raw.id,
    place_id: raw.place_id,
    kind: raw.kind,
    name: raw.name,
    city: raw.city,
    country: raw.country ?? null,
    lot: raw.lot ?? null,
    email_domain: domain,
    status: raw.status,
    resend_status: raw.resend_status ?? null,
    sent_at: raw.sent_at,
    opened_at: raw.opened_at ?? null,
    claimed_at: raw.claimed_at,
    suppressed_at: raw.suppressed_at,
    delivered_at: raw.delivered_at ?? null,
    refused_at: raw.refused_at ?? null,
    last_activity_at: last,
    note: raw.note,
    created_at: raw.created_at,
    place_status: raw.place_status ?? null,
    place_claimed: Boolean(raw.place_claimed || raw.claimed_at || raw.status === "claimed" || raw.status === "published"),
    place_published: Boolean(raw.place_published || raw.status === "published"),
  };
}

function maxIso(vals: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of vals) {
    if (!v) continue;
    if (!best || v > best) best = v;
  }
  return best;
}

export function computeOutreachStats(rows: OutreachRow[]): OutreachStats {
  const s: OutreachStats = {
    envoyes: 0,
    delivres: 0,
    bounces: 0,
    fiches_ouvertes: 0,
    inscrits: 0,
    publiees: 0,
    refus: 0,
    desinscrits: 0,
    en_attente: 0,
    total: rows.length,
  };
  for (const r of rows) {
    const sent = Boolean(r.sent_at) || ["sent", "delivered", "opened", "claimed", "published", "bounced", "refused"].includes(r.status);
    if (sent) s.envoyes++;
    if (r.delivered_at || r.status === "delivered" || r.resend_status === "delivered" || r.resend_status === "opened") s.delivres++;
    if (r.status === "bounced" || r.resend_status === "bounced") s.bounces++;
    if (r.opened_at || r.status === "opened") s.fiches_ouvertes++;
    const inscrit = Boolean(r.place_claimed || r.claimed_at || r.status === "claimed" || r.status === "published");
    if (inscrit) s.inscrits++;
    if (r.place_published || r.status === "published") s.publiees++;
    if (r.status === "refused" || r.refused_at) s.refus++;
    if (r.status === "suppressed") s.desinscrits++;
    const terminal = inscrit || r.status === "suppressed" || r.status === "bounced" || r.status === "refused" || Boolean(r.refused_at);
    if (!terminal && (r.status === "ready" || r.status === "sent" || r.status === "delivered" || r.status === "opened")) s.en_attente++;
  }
  return s;
}

export type OutreachFilters = {
  status?: string;
  city?: string;
  country?: string;
  kind?: string;
  lot?: string;
  q?: string;
};

export function filterOutreachRows(rows: OutreachRow[], f: OutreachFilters): OutreachRow[] {
  const q = (f.q || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.city && (r.city || "").toLowerCase() !== f.city.toLowerCase()) return false;
    if (f.country && (r.country || "").toLowerCase() !== f.country.toLowerCase()) return false;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.lot && (r.lot || "") !== f.lot) return false;
    if (q) {
      const hay = `${r.name} ${r.city || ""} ${r.email_domain || ""} ${r.lot || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** CSV sans jetons, sans e-mail complet, sans liens claim. */
export function outreachToCsv(rows: OutreachRow[]): string {
  const headers = [
    "lot", "pays", "ville", "type", "nom", "domaine_email", "statut", "resend",
    "envoye_le", "derniere_activite", "inscrit", "publie", "note",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.lot || "",
      r.country || "",
      r.city || "",
      r.kind,
      r.name,
      r.email_domain || "",
      r.status,
      r.resend_status || "",
      r.sent_at || "",
      r.last_activity_at || "",
      r.place_claimed ? "oui" : "non",
      r.place_published ? "oui" : "non",
      (r.note || "").replace(/\s+/g, " ").trim(),
    ].map((x) => csvEscape(String(x))).join(","));
  }
  return lines.join("\n");
}

export function formatParis(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function displayStatus(r: OutreachRow): string {
  if (r.place_published || r.status === "published") return STATUS_LABEL.published;
  if (r.place_claimed || r.status === "claimed") return STATUS_LABEL.claimed;
  if (r.status === "refused" || r.refused_at) return STATUS_LABEL.refused;
  if (r.status === "suppressed") return STATUS_LABEL.suppressed;
  if (r.status === "bounced" || r.resend_status === "bounced") return STATUS_LABEL.bounced;
  if (r.opened_at || r.status === "opened") return STATUS_LABEL.opened;
  if (r.delivered_at || r.status === "delivered" || r.resend_status === "delivered") return STATUS_LABEL.delivered;
  return STATUS_LABEL[r.status] || r.status;
}
