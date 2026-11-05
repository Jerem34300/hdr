import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  adminOutreachList, adminOutreachMarkSent, adminOutreachPrepare, adminOutreachSuppress,
  type OutreachRow,
} from "@/lib/hdar/live";

const STATUS_LABEL: Record<string, string> = {
  ready: "Prêt",
  sent: "Marqué envoyé",
  opened: "Ouvert",
  claimed: "Réclamé",
  suppressed: "Supprimé",
  bounced: "Rebond",
};

/** Préparation locale de la prospection bars/clubs/saunas — aucun envoi automatique. */
export function ProspectionTab({ adminKey }: { adminKey: string }) {
  const [city, setCity] = useState("Montpellier");
  const [limit, setLimit] = useState(40);
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<OutreachRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await adminOutreachList(adminKey, status || null, city || null));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setBusy(false);
    }
  }, [adminKey, status, city]);

  const prepare = async () => {
    setBusy(true);
    try {
      const r = await adminOutreachPrepare(adminKey, city || null, limit);
      toast(`${r.prepared} fiche(s) préparée(s) pour ${r.city || "toutes villes"} (bars, clubs, saunas).`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Préparation impossible — migration v130 peut-être non appliquée");
    } finally {
      setBusy(false);
    }
  };

  const markSent = async () => {
    if (selected.size === 0) return toast("Sélectionnez au moins une ligne.");
    setBusy(true);
    try {
      const n = await adminOutreachMarkSent(adminKey, [...selected]);
      toast(`${n} ligne(s) marquées comme envoyées (aucun e-mail n'a été expédié depuis ici).`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setBusy(false);
    }
  };

  const suppress = async (id: string) => {
    setBusy(true);
    try {
      await adminOutreachSuppress(adminKey, id, "Désinscription / ne pas contacter");
      toast("Prospect retiré de la prospection.");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl font-extrabold">Prospection partenaires</h2>
        <p className="mt-1 text-sm text-muted">
          Cible : bars, clubs et saunas gay / LGBT+. Génère les jetons de revendication et les liens /pro?claim=… Aucun e-mail n'est envoyé depuis cet écran : vous validez chaque envoi vous-même.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="h-10 rounded-full border border-line bg-night px-4 text-sm" placeholder="Ville (ex. Montpellier)" value={city} onChange={(e) => setCity(e.target.value)} />
          <input type="number" min={1} max={500} className="h-10 w-24 rounded-full border border-line bg-night px-3 text-sm" value={limit} onChange={(e) => setLimit(Number(e.target.value) || 40)} />
          <button type="button" disabled={busy} onClick={() => void prepare()} className="h-10 rounded-full bg-signal px-4 text-sm font-bold text-night disabled:opacity-50">
            Préparer les jetons
          </button>
          <select className="h-10 rounded-full border border-line bg-night px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => void load()} className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50">
            Actualiser
          </button>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => void markSent()} className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50">
            Marquer sélection comme envoyée
          </button>
        </div>
      </section>

      {rows && (
        <ul className="space-y-2">
          {rows.length === 0 && <li className="text-sm text-muted">Aucun prospect pour ce filtre. Préparez d'abord un lot.</li>}
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-night p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={r.status !== "ready"} />
                  <span>
                    <b className="text-ink">{r.name}</b>
                    <span className="text-muted"> · {r.kind}{r.city ? ` · ${r.city}` : ""}</span>
                    <span className="mt-1 block text-xs text-muted">Statut : {STATUS_LABEL[r.status] || r.status}{r.email ? ` · ${r.email}` : " · e-mail à renseigner"}</span>
                    {r.claim_url && (
                      <a className="mt-1 block break-all text-xs text-signal underline" href={r.claim_url} target="_blank" rel="noreferrer">
                        {typeof location !== "undefined" ? location.origin : "https://hdar.chat"}{r.claim_url}
                      </a>
                    )}
                  </span>
                </label>
                {r.status !== "suppressed" && r.status !== "claimed" && (
                  <button type="button" className="text-xs text-muted underline" onClick={() => void suppress(r.id)}>Ne pas contacter</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
