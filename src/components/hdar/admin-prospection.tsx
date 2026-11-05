import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download, Mail, MailCheck, MailX, Eye, UserPlus, BadgeCheck,
  Ban, UserMinus, Clock, RefreshCw, Search,
} from "lucide-react";
import {
  adminOutreachList, adminOutreachMarkSent, adminOutreachPrepare, adminOutreachStats, adminOutreachSuppress,
} from "@/lib/hdar/live";
import {
  KIND_LABEL, STATUS_LABEL, computeOutreachStats, displayStatus, filterOutreachRows, formatParis,
  outreachToCsv, type OutreachFilters, type OutreachRow, type OutreachStats,
} from "@/lib/hdar/prospection-admin";
import { prospectionDemoData } from "@/lib/hdar/prospection-demo-data";

const COUNTER_META: { key: keyof OutreachStats; label: string; Icon: typeof Mail; tone: string }[] = [
  { key: "envoyes", label: "Envoyés", Icon: Mail, tone: "text-ink" },
  { key: "delivres", label: "Délivrés / reçus", Icon: MailCheck, tone: "text-online" },
  { key: "bounces", label: "Bounces", Icon: MailX, tone: "text-signal" },
  { key: "fiches_ouvertes", label: "Fiches ouvertes", Icon: Eye, tone: "text-ink" },
  { key: "inscrits", label: "Inscrits (profil pro)", Icon: UserPlus, tone: "text-online" },
  { key: "publiees", label: "Fiches publiées", Icon: BadgeCheck, tone: "text-online" },
  { key: "refus", label: "Refus", Icon: Ban, tone: "text-signal" },
  { key: "desinscrits", label: "Désinscrits", Icon: UserMinus, tone: "text-muted" },
  { key: "en_attente", label: "En attente", Icon: Clock, tone: "text-ink" },
];

function Counter({ label, value, Icon, tone }: { label: string; value: number; Icon: typeof Mail; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className={"size-3.5 shrink-0 " + tone} strokeWidth={2} aria-hidden />
        <span>{label}</span>
      </div>
      <p className={"mt-1 font-display text-2xl font-extrabold tabular-nums " + tone}>{value}</p>
    </div>
  );
}

function statusTone(r: OutreachRow): string {
  const s = displayStatus(r);
  if (s === STATUS_LABEL.published || s === STATUS_LABEL.claimed || s === STATUS_LABEL.delivered) return "text-online";
  if (s === STATUS_LABEL.bounced || s === STATUS_LABEL.refused) return "text-signal";
  if (s === STATUS_LABEL.suppressed) return "text-muted";
  return "text-ink";
}

/** Onglet Prospection partenaires — suivi des lots, sans jetons ni e-mails complets. */
export function ProspectionTab({ adminKey, demo }: { adminKey: string; demo?: { rows: OutreachRow[]; stats?: OutreachStats | null } }) {
  const [prepareCity, setPrepareCity] = useState("");
  const [city, setCity] = useState("");
  const [limit, setLimit] = useState(40);
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [kind, setKind] = useState("");
  const [lot, setLot] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<OutreachRow[] | null>(demo?.rows ?? null);
  const [stats, setStats] = useState<OutreachStats | null>(demo?.stats ?? null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [migrationHint, setMigrationHint] = useState(false);

  const load = useCallback(async () => {
    if (demo) {
      setRows(demo.rows);
      setStats(demo.stats ?? computeOutreachStats(demo.rows));
      return;
    }
    setBusy(true);
    try {
      const list = await adminOutreachList(adminKey, null, null, { limit: 2000 });
      setRows(list);
      const remote = await adminOutreachStats(adminKey);
      if (remote) {
        setStats(remote);
        setMigrationHint(false);
      } else {
        setStats(computeOutreachStats(list));
        setMigrationHint(true);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setBusy(false);
    }
  }, [adminKey, demo]);

  useEffect(() => { void load(); }, [load]);

  const filters: OutreachFilters = useMemo(
    () => ({ status: status || undefined, city: city || undefined, country: country || undefined, kind: kind || undefined, lot: lot || undefined, q: q || undefined }),
    [status, city, country, kind, lot, q],
  );

  const filtered = useMemo(() => (rows ? filterOutreachRows(rows, filters) : []), [rows, filters]);

  const lots = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) if (r.lot) s.add(r.lot);
    return [...s].sort();
  }, [rows]);
  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) if (r.country) s.add(r.country);
    return [...s].sort();
  }, [rows]);
  const cities = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) if (r.city) s.add(r.city);
    return [...s].sort((a, b) => a.localeCompare(b, "fr"));
  }, [rows]);
  const kinds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) if (r.kind) s.add(r.kind);
    return [...s].sort();
  }, [rows]);

  const prepare = async () => {
    if (demo) return toast("Mode aperçu : préparation désactivée.");
    setBusy(true);
    try {
      const r = await adminOutreachPrepare(adminKey, prepareCity || null, limit);
      toast(`${r.prepared} fiche(s) préparée(s) pour ${r.city || "toutes villes"} (bars, clubs, saunas).`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Préparation impossible — migration v130 peut-être non appliquée");
    } finally {
      setBusy(false);
    }
  };

  const markSent = async () => {
    if (demo) return toast("Mode aperçu : marquage désactivé.");
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
    if (demo) return toast("Mode aperçu : action désactivée.");
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

  const exportCsv = () => {
    const csv = outreachToCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hdar-prospection-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Export CSV : ${filtered.length} ligne(s), sans e-mail complet ni jeton.`);
  };

  const shownStats = stats ?? (rows ? computeOutreachStats(rows) : null);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl font-extrabold">Prospection partenaires</h2>
        <p className="mt-1 text-sm text-muted">
          Suivi des e-mails partenaires (bars, clubs, saunas, sex-shops, cruising). Les jetons et les adresses e-mail complètes restent masqués : seul le domaine s'affiche. Aucun envoi depuis cet écran.
        </p>
        {migrationHint && (
          <p className="mt-2 rounded-xl border border-line bg-night px-3 py-2 text-xs text-muted">
            Compteurs calculés localement. La migration v131 (lot, pays, statut Resend, stats SQL) est prête mais pas encore appliquée en production.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="h-10 rounded-full border border-line bg-night px-4 text-sm" placeholder="Ville pour préparer" value={prepareCity} onChange={(e) => setPrepareCity(e.target.value)} />
          <input type="number" min={1} max={500} className="h-10 w-24 rounded-full border border-line bg-night px-3 text-sm" value={limit} onChange={(e) => setLimit(Number(e.target.value) || 40)} />
          <button type="button" disabled={busy || Boolean(demo)} onClick={() => void prepare()} className="h-10 rounded-full bg-signal px-4 text-sm font-bold text-night disabled:opacity-50">
            Préparer les jetons
          </button>
          <button type="button" disabled={busy} onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm disabled:opacity-50">
            <RefreshCw className="size-3.5" strokeWidth={2} aria-hidden /> Actualiser
          </button>
          <button type="button" disabled={busy || selected.size === 0 || Boolean(demo)} onClick={() => void markSent()} className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50">
            Marquer sélection comme envoyée
          </button>
          <button type="button" disabled={!rows || filtered.length === 0} onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm disabled:opacity-50">
            <Download className="size-3.5" strokeWidth={2} aria-hidden /> Export CSV
          </button>
        </div>
      </section>

      {shownStats && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {COUNTER_META.map(({ key, label, Icon, tone }) => (
            <Counter key={key} label={label} value={Number(shownStats[key] ?? 0)} Icon={Icon} tone={tone} />
          ))}
        </section>
      )}

      <section className="rounded-3xl border border-line bg-surface p-4">
        <h3 className="font-display text-base font-bold">Filtres</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
            <input className="h-10 w-full rounded-full border border-line bg-night pe-4 ps-9 text-sm" placeholder="Rechercher un lieu" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="h-10 rounded-full border border-line bg-night px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="h-10 rounded-full border border-line bg-night px-3 text-sm" value={lot} onChange={(e) => setLot(e.target.value)}>
            <option value="">Tous les lots</option>
            {lots.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="h-10 rounded-full border border-line bg-night px-3 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Tous les pays</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="h-10 rounded-full border border-line bg-night px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Tous les types</option>
            {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}
          </select>
          <select className="h-10 rounded-full border border-line bg-night px-3 text-sm" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Toutes les villes</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <p className="mt-2 text-xs text-muted">{filtered.length} prospect(s) affiché(s){(rows && filtered.length !== rows.length) ? ` sur ${rows.length}` : ""}.</p>
      </section>

      {rows && (
        <ul className="space-y-2">
          {filtered.length === 0 && <li className="rounded-2xl border border-line bg-night p-4 text-sm text-muted">Aucun prospect pour ce filtre.</li>}
          {filtered.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-night p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex min-w-0 flex-1 items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={r.status !== "ready" || Boolean(demo)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{r.name}</span>
                    <span className="mt-0.5 block text-muted">
                      {KIND_LABEL[r.kind] || r.kind}
                      {r.city ? ` · ${r.city}` : ""}
                      {r.country ? ` · ${r.country}` : ""}
                      {r.lot ? ` · ${r.lot}` : ""}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={"font-semibold " + statusTone(r)}>{displayStatus(r)}</span>
                      <span className="text-muted">Domaine : {r.email_domain || "non renseigné"}</span>
                      <span className="text-muted">Envoi : {formatParis(r.sent_at)}</span>
                      <span className="text-muted">Activité : {formatParis(r.last_activity_at)}</span>
                      {r.resend_status && <span className="text-muted">Resend : {r.resend_status}</span>}
                    </span>
                  </span>
                </label>
                {r.status !== "suppressed" && r.status !== "claimed" && r.status !== "published" && (
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


/** Aperçu local avec données prod sanitizées (pas de jetons, pas d'e-mail complet). */
export function ProspectionTabDemo() {
  return (
    <main className="min-h-dvh bg-night px-4 py-5 text-ink">
      <p className="mb-3 font-display text-xl font-extrabold">Admin · Prospection</p>
      <p className="mb-4 text-xs text-muted">Aperçu local — données réelles sanitizées (domaines seulement). Migration v131 non appliquée.</p>
      <ProspectionTab adminKey="demo" demo={prospectionDemoData} />
    </main>
  );
}
