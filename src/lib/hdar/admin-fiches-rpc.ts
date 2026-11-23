import { rpcCall } from "./live";
import type { FicheClaim, FicheDetail, FicheEdit, FicheFilters, FichesList } from "./admin-fiches";

export const adminFiches = {
  list: (key: string, filters: FicheFilters = {}, page: { offset?: number; limit?: number } = {}) =>
    rpcCall<FichesList>("hdar_admin_fiches", {
      p_key: key,
      p_city: filters.city || null,
      p_country: filters.country || null,
      p_kind: filters.kind || null,
      p_status: filters.status || null,
      p_q: filters.q || null,
      p_offset: page.offset ?? 0,
      p_limit: page.limit ?? 80,
    }),
  get: (key: string, id: string) => rpcCall<FicheDetail>("hdar_admin_fiche", { p_key: key, p_id: id }),
  claims: (key: string, status: "pending" | "approved" | "rejected" | "all" = "pending") =>
    rpcCall<FicheClaim[]>("hdar_admin_fiche_claims", { p_key: key, p_status: status }),
  review: (key: string, id: string, ok: boolean, note?: string) =>
    rpcCall("hdar_admin_fiche_claim_review", { p_key: key, p_id: id, p_ok: ok, p_note: note ?? null }),
  edits: (key: string) => rpcCall<FicheEdit[]>("hdar_admin_fiche_edits", { p_key: key, p_limit: 80 }),
  hideAvis: (key: string, id: string, hide = true) =>
    rpcCall("hdar_admin_fiche_hide_avis", { p_key: key, p_id: id, p_hide: hide }),
  hideMessage: (key: string, id: string, hide = true) =>
    rpcCall("hdar_admin_fiche_hide_message", { p_key: key, p_id: id, p_hide: hide }),
  removePhoto: (key: string, id: string, reason?: string) =>
    rpcCall("hdar_admin_fiche_remove_photo", { p_key: key, p_id: id, p_reason: reason ?? null }),
};
