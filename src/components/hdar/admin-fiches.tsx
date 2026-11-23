import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { VENUE_ORDER } from "@/lib/hdar/venue";
import { adminFiches } from "@/lib/hdar/admin-fiches-rpc";
import {
  describeChanges,
  filterFicheRows,
  formatParis,
  formatStars,
  kindLabel,
  methodLabel,
  photoSourceHref,
  photoSourceLabel,
  statusLabel,
  visiblePhotos,
  CLAIM_STATUS_LABEL,
  FICHE_STATUSES,
  type FicheClaim,
  type FicheDetail,
  type FicheEdit,
  type FicheFilters,
  type FicheRow,
  type FicheStatus,
  type FichesList,
} from "@/lib/hdar/admin-fiches";
import {
  DEMO_CLAIMS,
  DEMO_EDITS,
  DEMO_FICHE_ROWS,
  DEMO_FICHES_LIST,
  demoFicheDetail,
} from "@/lib/hdar/admin-fiches-demo";

type Section = "lieux" | "reclamations" | "modifications" | "moderation";

function statusClass(status: string): string {
  if (status === "verified") return "bg-online/15 text-online";
  if (status === "claimed") return "bg-spot/15 text-spot";
  if (status === "partner") return "bg-signal/15 text-signal";
  return "bg-line text-ink";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={"inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold " + statusClass(status)}>
      {statusLabel(status)}
    </span>
  );
}

export function FichesLieuxTab({
  adminKey,
  demo,
}: {
  adminKey: string;
  demo?: { list: FichesList; claims: FicheClaim[]; edits: FicheEdit[] };
}) {
  const isDemo = !!demo;
  const [section, setSection] = useState<Section>("lieux");
  const [list, setList] = useState<FichesList | null>(demo?.list ?? null);
  const [claims, setClaims] = useState<FicheClaim[] | null>(demo?.claims ?? null);
  const [edits, setEdits] = useState<FicheEdit[] | null>(demo?.edits ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState<FicheStatus | "">("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FicheDetail | null>(null);

  const filters: FicheFilters = useMemo(
    () => ({ city: city || undefined, country: country || undefined, kind: kind || undefined, status: status || undefined, q: q || undefined }),
    [city, country, kind, status, q],
  );

  const load = useCallback(async () => {
    if (isDemo) {
      const base = demo?.list ?? DEMO_FICHES_LIST;
      setList({ ...base, rows: filterFicheRows(base.rows, filters), total: filterFicheRows(base.rows, filters).length });
      setClaims(demo?.claims ?? DEMO_CLAIMS);
      setEdits(demo?.edits ?? DEMO_EDITS);
      return;
    }
    setBusy(true);
    try {
      const next = await adminFiches.list(adminKey, filters);
      setList(next);
      setClaims(await adminFiches.claims(adminKey, "all"));
      setEdits(await adminFiches.edits(adminKey));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setBusy(false);
    }
  }, [adminKey, demo, filters, isDemo]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setOpenId(id);
    if (isDemo) {
      setDetail(demoFicheDetail(id));
      return;
    }
    try {
      setDetail(await adminFiches.get(adminKey, id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Fiche introuvable");
    }
  };

  const pending = (claims ?? []).filter((c) => c.status === "pending").length;

  return (
    <div data-fiche-admin="1">
      <div className="mb-4">
        <h2 className="font-display text-xl font-extrabold">Fiches lieux</h2>
        <p className="mt-1 text-sm text-muted">
          Pour voir et comprendre ce qui se passe sur chaque fiche : vues, avis, notes, chat, demandes « C'est votre lieu ? »,
          modifications des propriétaires et photos (avec leur source).
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-signal">{error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Counter label="Lieux" value={list?.total ?? "…"} />
        <Counter label="Demandes en attente" value={list?.pending_claims ?? pending} tone={pending ? "text-signal" : undefined} />
        <Counter label="Avis (cette liste)" value={list ? list.rows.reduce((n, r) => n + r.ratings, 0) : "…"} />
        <Counter label="Messages du chat (total)" value={list ? list.rows.reduce((n, r) => n + r.messages, 0) : "…"} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ["lieux", "Liste des lieux"],
            ["reclamations", pending ? `Réclamations (${pending})` : "Réclamations"],
            ["modifications", "Modifications"],
            ["moderation", "Modération"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-fiche-section={id}
            onClick={() => setSection(id)}
            className={"h-9 rounded-full border px-3 text-sm " + (section === id ? "border-signal bg-signal text-night" : "border-line")}
          >
            {label}
          </button>
        ))}
        <button type="button" className="ms-auto h-9 rounded-full border border-line px-3 text-sm text-muted" onClick={() => void load()} disabled={busy}>
          {busy ? "Chargement…" : "Actualiser"}
        </button>
      </div>

      {section === "lieux" && (
        <LieuxList
          list={list}
          city={city}
          setCity={setCity}
          country={country}
          setCountry={setCountry}
          kind={kind}
          setKind={setKind}
          status={status}
          setStatus={setStatus}
          q={q}
          setQ={setQ}
          onOpen={(id) => void open(id)}
        />
      )}
      {section === "reclamations" && (
        <ClaimsQueue
          claims={claims}
          demo={isDemo}
          onOpen={(id) => {
            setSection("lieux");
            void open(id);
          }}
          onReview={async (id, ok) => {
            if (isDemo) {
              setClaims((cur) => (cur ?? []).map((c) => (c.id === id ? { ...c, status: ok ? "approved" : "rejected", proof: null, reviewed_at: new Date().toISOString() } : c)));
              toast(ok ? "Demande acceptée (aperçu)" : "Demande refusée (aperçu)");
              return;
            }
            try {
              await adminFiches.review(adminKey, id, ok);
              toast(ok ? "Demande acceptée" : "Demande refusée");
              await load();
            } catch (e) {
              toast(e instanceof Error ? e.message : "Action impossible");
            }
          }}
        />
      )}
      {section === "modifications" && <EditsList edits={edits} onOpen={(id) => { setSection("lieux"); void open(id); }} />}
      {section === "moderation" && (
        <ModerationBoard
          list={list}
          claims={claims}
          onOpen={(id) => {
            setSection("lieux");
            void open(id);
          }}
        />
      )}

      {openId && detail && (
        <FicheDrawer
          detail={detail}
          demo={isDemo}
          onClose={() => {
            setOpenId(null);
            setDetail(null);
          }}
          onHideAvis={async (id, hide) => {
            if (isDemo) {
              setDetail((d) => (d ? { ...d, avis: d.avis.map((a) => (a.id === id ? { ...a, hidden: hide } : a)) } : d));
              return;
            }
            await adminFiches.hideAvis(adminKey, id, hide);
            setDetail(await adminFiches.get(adminKey, detail.id));
          }}
          onHideMessage={async (id, hide) => {
            if (isDemo) {
              setDetail((d) => (d ? { ...d, messages: d.messages.map((m) => (m.id === id ? { ...m, hidden: hide } : m)) } : d));
              return;
            }
            await adminFiches.hideMessage(adminKey, id, hide);
            setDetail(await adminFiches.get(adminKey, detail.id));
          }}
          onRemovePhoto={async (id) => {
            if (isDemo) {
              setDetail((d) => (d ? { ...d, photos: d.photos.map((p) => (p.id === id ? { ...p, hidden: true, hidden_reason: "Retrait demandé" } : p)) } : d));
              return;
            }
            await adminFiches.removePhoto(adminKey, id, "Retrait demandé");
            setDetail(await adminFiches.get(adminKey, detail.id));
          }}
        />
      )}
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={"mt-1 font-display text-2xl font-extrabold tabular-nums " + (tone ?? "text-ink")}>{value}</p>
    </div>
  );
}

function LieuxList({
  list, city, setCity, country, setCountry, kind, setKind, status, setStatus, q, setQ, onOpen,
}: {
  list: FichesList | null;
  city: string; setCity: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  kind: string; setKind: (v: string) => void;
  status: FicheStatus | ""; setStatus: (v: FicheStatus | "") => void;
  q: string; setQ: (v: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 grid gap-2 sm:grid-cols-5">
        <input
          className="h-10 rounded-full border border-line bg-surface px-3 text-sm outline-none focus-visible:border-signal"
          placeholder="Rechercher un lieu ou une ville"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="h-10 rounded-full border border-line bg-surface px-3 text-sm" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Toutes les villes</option>
          {(list?.cities ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className="h-10 rounded-full border border-line bg-surface px-3 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Tous les pays</option>
          {(list?.countries ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className="h-10 rounded-full border border-line bg-surface px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tous les types</option>
          {VENUE_ORDER.map((k) => (
            <option key={k} value={k}>{kindLabel(k)}</option>
          ))}
        </select>
        <select className="h-10 rounded-full border border-line bg-surface px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as FicheStatus | "")}>
          <option value="">Tous les statuts</option>
          {FICHE_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </div>
      <p className="mb-2 text-xs text-muted">{list ? `${list.rows.length} lieu${list.rows.length > 1 ? "x" : ""} affiché${list.rows.length > 1 ? "s" : ""} sur ${list.total}` : "Chargement…"}</p>
      <ul className="space-y-2">
        {list?.rows.length === 0 && <li className="rounded-2xl border border-line bg-night p-4 text-sm text-muted">Aucun lieu pour ce filtre.</li>}
        {list?.rows.map((r) => (
          <li key={r.id}>
            <button type="button" className="w-full rounded-2xl border border-line bg-night p-3 text-start" onClick={() => onOpen(r.id)} data-fiche-row={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{r.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {kindLabel(r.kind)}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.country ? ` · ${r.country}` : ""}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                <span>👀 {r.views} vues</span>
                <span>⭐ {formatStars(r.avg_stars, r.ratings)}</span>
                <span>💬 {r.messages} message{r.messages > 1 ? "s" : ""} de chat</span>
                <span>Dernière activité : {formatParis(r.last_activity)}</span>
                {r.pending_claims > 0 && <span className="text-signal">Demande en attente</span>}
              </p>
              <PhotoStrip photos={r.photos} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PhotoStrip({ photos }: { photos: FicheRow["photos"] }) {
  const shown = visiblePhotos(photos);
  const hidden = photos.filter((p) => p.hidden).length;
  if (!shown.length && !hidden) return <p className="mt-2 text-xs text-muted">Pas encore de photo (aucune image générique ici).</p>;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {shown.slice(0, 4).map((ph) => {
        const href = photoSourceHref(ph);
        return (
          <span key={ph.id} className="flex items-center gap-1.5">
            <img src={ph.url} alt="" className="h-10 w-14 rounded-lg object-cover" />
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="text-[11px] text-muted underline" onClick={(e) => e.stopPropagation()}>
                Source : {photoSourceLabel(ph)}
              </a>
            ) : (
              <span className="text-[11px] text-muted">{photoSourceLabel(ph)}</span>
            )}
          </span>
        );
      })}
      {hidden > 0 && <span className="text-[11px] text-muted">{hidden} photo{hidden > 1 ? "s" : ""} retirée{hidden > 1 ? "s" : ""}</span>}
    </div>
  );
}

function ClaimsQueue({
  claims, demo, onReview, onOpen,
}: {
  claims: FicheClaim[] | null;
  demo: boolean;
  onReview: (id: string, ok: boolean) => Promise<void>;
  onOpen: (placeId: string) => void;
}) {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const rows = (claims ?? []).filter((c) => filter === "all" || c.status === "pending");
  return (
    <section data-fiche-claims="1">
      <p className="mb-2 text-sm text-muted">
        Demandes « C'est votre lieu ? ». On voit qui demande, comment la preuve a été faite, et le document s'il y en a un.
        {demo ? " Aperçu local, aucune action réelle." : ""}
      </p>
      <div className="mb-3 flex gap-2 text-sm">
        <button type="button" className={"h-9 rounded-full border px-3 " + (filter === "pending" ? "border-signal bg-signal text-night" : "border-line")} onClick={() => setFilter("pending")}>En attente</button>
        <button type="button" className={"h-9 rounded-full border px-3 " + (filter === "all" ? "border-signal bg-signal text-night" : "border-line")} onClick={() => setFilter("all")}>Toutes</button>
      </div>
      {rows.length === 0 && <p className="rounded-2xl border border-line bg-night p-4 text-sm text-muted">Aucune demande {filter === "pending" ? "en attente" : ""} pour le moment.</p>}
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-night p-3 text-sm" data-claim-id={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" className="text-start font-bold text-ink underline-offset-2 hover:underline" onClick={() => onOpen(c.place_id)}>
                {c.name}{c.city ? ` · ${c.city}` : ""}
              </button>
              <span className={"text-xs font-semibold " + (c.status === "pending" ? "text-signal" : c.status === "approved" ? "text-online" : "text-muted")}>
                {CLAIM_STATUS_LABEL[c.status]}
              </span>
            </div>
            <p className="mt-1 text-muted">Demandé par {c.requester_pseudo}</p>
            <p className="mt-1 text-xs text-muted">Preuve : {methodLabel(c.method)}</p>
            {c.email && <p className="mt-1 text-xs text-muted">E-mail indiqué : {c.email}</p>}
            <p className="mt-2">{c.justification}</p>
            {c.has_proof && c.proof && (
              <p className="mt-2">
                <img src={c.proof} alt="Justificatif envoyé" className="max-h-40 rounded-xl border border-line object-contain" />
              </p>
            )}
            {c.has_proof && !c.proof && <p className="mt-2 text-xs text-muted">Un document avait été envoyé, puis retiré après traitement.</p>}
            <p className="mt-1 text-xs text-muted">Reçue le {formatParis(c.created_at)}</p>
            {c.status === "pending" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="h-9 rounded-full bg-online px-4 text-xs font-bold text-night" onClick={() => void onReview(c.id, true)}>Valider</button>
                <button type="button" className="h-9 rounded-full border border-signal px-4 text-xs font-bold text-signal" onClick={() => void onReview(c.id, false)}>Refuser</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditsList({ edits, onOpen }: { edits: FicheEdit[] | null; onOpen: (placeId: string) => void }) {
  return (
    <section data-fiche-edits="1">
      <p className="mb-3 text-sm text-muted">Modifications faites par les propriétaires sur leur fiche (description, horaires, adresse, site, photos). Les données de contact ne sont pas affichées ici.</p>
      {(!edits || edits.length === 0) && <p className="rounded-2xl border border-line bg-night p-4 text-sm text-muted">Aucune modification de propriétaire pour le moment.</p>}
      <ul className="space-y-2">
        {edits?.map((e) => (
          <li key={e.id} className="rounded-2xl border border-line bg-night p-3 text-sm">
            <button type="button" className="font-bold text-ink underline-offset-2 hover:underline" onClick={() => e.place_id && onOpen(e.place_id)}>
              {e.name ?? "Lieu"}{e.city ? ` · ${e.city}` : ""}
            </button>
            <p className="mt-0.5 text-xs text-muted">{e.pseudo} · {formatParis(e.at)}</p>
            <ul className="mt-2 list-disc space-y-0.5 ps-4 text-muted">
              {describeChanges(e.changes).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModerationBoard({ list, claims, onOpen }: { list: FichesList | null; claims?: FicheClaim[] | null; onOpen: (id: string) => void }) {
  const flagged = (list?.rows ?? []).filter((r) => r.photos.some((p) => p.hidden) || r.pending_photos > 0 || r.pending_claims > 0);
  return (
    <section data-fiche-moderation="1">
      <p className="mb-3 text-sm text-muted">
        Pour masquer un avis ou un message du chat, ou retirer une photo (demande de retrait), ouvre la fiche du lieu puis utilise les boutons sur place. Ici, un rappel des fiches qui demandent un regard.
      </p>
      {flagged.length === 0 && <p className="rounded-2xl border border-line bg-night p-4 text-sm text-muted">Rien de particulier à modérer pour le moment.</p>}
      <ul className="space-y-2">
        {flagged.map((r) => (
          <li key={r.id}>
            <button type="button" className="w-full rounded-2xl border border-line bg-night p-3 text-start text-sm" onClick={() => onOpen(r.id)}>
              <span className="font-bold">{r.name}</span>
              <span className="text-muted">{r.city ? ` · ${r.city}` : ""}</span>
              <p className="mt-1 text-xs text-muted">
                {r.pending_claims > 0 ? "Demande de réclamation en attente. " : ""}
                {r.pending_photos > 0 ? `${r.pending_photos} photo(s) envoyée(s) par le propriétaire, à valider. ` : ""}
                {r.photos.some((p) => p.hidden) ? "Une ou plusieurs photos ont déjà été retirées." : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
      {claims && claims.some((c) => c.status === "pending") && (
        <p className="mt-3 text-xs text-muted">Les demandes en attente se traitent dans l'onglet Réclamations (Valider ou Refuser).</p>
      )}
    </section>
  );
}

function FicheDrawer({
  detail, demo, onClose, onHideAvis, onHideMessage, onRemovePhoto,
}: {
  detail: FicheDetail;
  demo: boolean;
  onClose: () => void;
  onHideAvis: (id: string, hide: boolean) => Promise<void>;
  onHideMessage: (id: string, hide: boolean) => Promise<void>;
  onRemovePhoto: (id: string) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" role="dialog" aria-labelledby="fiche-admin-title" data-fiche-drawer="1">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-night sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p id="fiche-admin-title" className="font-display text-lg font-extrabold">{detail.name}</p>
            <p className="text-sm text-muted">
              {kindLabel(detail.kind)}
              {detail.city ? ` · ${detail.city}` : ""}
              {detail.country ? ` · ${detail.country}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={detail.status} />
            <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={onClose}>Fermer</button>
          </div>
        </header>
        <div className="space-y-5 overflow-y-auto px-4 py-4 text-sm">
          <p className="text-muted">
            {formatStars(detail.notes.avg, detail.notes.count)}
            {detail.has_owner ? ` · Fiche tenue par ${detail.owner_pseudo ?? "le propriétaire"}` : " · Pas encore de propriétaire"}
            {detail.verify_method ? ` · Preuve : ${methodLabel(detail.verify_method)}` : ""}
          </p>
          {detail.description && <p>{detail.description}</p>}
          {detail.address && <p className="text-muted">Adresse : {detail.address}</p>}
          {detail.hours && <p className="text-muted">Horaires : {detail.hours}</p>}
          {detail.website && <p className="text-muted">Site : <a className="underline" href={detail.website} target="_blank" rel="noreferrer">{detail.website}</a></p>}

          <section>
            <h3 className="mb-2 font-bold">Photos</h3>
            {detail.photos.length === 0 && <p className="text-muted">Pas de photo pour le moment.</p>}
            <ul className="space-y-2">
              {detail.photos.map((ph) => {
                const href = photoSourceHref(ph);
                return (
                  <li key={ph.id} className="flex gap-3 rounded-2xl border border-line bg-surface p-2">
                    <img src={ph.url} alt="" className={"h-16 w-24 rounded-lg object-cover " + (ph.hidden ? "opacity-40" : "")} />
                    <div className="min-w-0 flex-1">
                      {href ? <a className="text-xs underline" href={href} target="_blank" rel="noreferrer">Source : {photoSourceLabel(ph)}</a> : <p className="text-xs text-muted">{photoSourceLabel(ph)}</p>}
                      {ph.hidden && <p className="text-xs text-muted">Retirée{ph.hidden_reason ? ` · ${ph.hidden_reason}` : ""}</p>}
                      {!ph.hidden && (
                        <button
                          type="button"
                          className="mt-1 h-8 rounded-full border border-signal px-3 text-xs text-signal"
                          onClick={() => void onRemovePhoto(ph.id).catch((e: Error) => toast(e.message))}
                        >
                          Retirer la photo
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-bold">Avis et notes</h3>
            {detail.avis.length === 0 && <p className="text-muted">Pas d'avis écrit pour le moment.</p>}
            <ul className="space-y-2">
              {detail.avis.map((a) => (
                <li key={a.id} className={"rounded-2xl border p-3 " + (a.hidden ? "border-line opacity-60" : "border-line bg-surface")}>
                  <p className="text-xs text-muted">{a.pseudo}{a.stars ? ` · ${a.stars} / 5` : ""} · {formatParis(a.at)}{a.hidden ? " · Masqué" : ""}</p>
                  <p className="mt-1">{a.body}</p>
                  <button
                    type="button"
                    className="mt-2 h-8 rounded-full border border-line px-3 text-xs"
                    onClick={() => void onHideAvis(a.id, !a.hidden).catch((e: Error) => toast(e.message))}
                  >
                    {a.hidden ? "Réafficher l'avis" : "Masquer l'avis"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-bold">Chat du lieu</h3>
            {detail.messages.length === 0 && <p className="text-muted">Pas de message récent dans le chat.</p>}
            <ul className="space-y-2">
              {detail.messages.map((m) => (
                <li key={m.id} className={"rounded-2xl border p-3 " + (m.hidden ? "border-line opacity-60" : "border-line bg-surface")}>
                  <p className="text-xs text-muted">{m.pseudo} · {formatParis(m.at)}{m.hidden ? " · Masqué" : ""}</p>
                  <p className="mt-1">{m.body}</p>
                  <button
                    type="button"
                    className="mt-2 h-8 rounded-full border border-line px-3 text-xs"
                    onClick={() => void onHideMessage(m.id, !m.hidden).catch((e: Error) => toast(e.message))}
                  >
                    {m.hidden ? "Réafficher le message" : "Masquer le message"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-bold">Modifications du propriétaire</h3>
            {detail.edits.filter((e) => e.actor === "owner").length === 0 && <p className="text-muted">Pas encore de modification de propriétaire.</p>}
            <ul className="space-y-2">
              {detail.edits.filter((e) => e.actor === "owner").map((e) => (
                <li key={e.id} className="rounded-2xl border border-line bg-surface p-3">
                  <p className="text-xs text-muted">{e.pseudo} · {formatParis(e.at)}</p>
                  <ul className="mt-1 list-disc ps-4 text-muted">
                    {describeChanges(e.changes).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          {demo && <p className="text-xs text-muted">Aperçu local — aucune modification n'est enregistrée en production.</p>}
        </div>
      </div>
    </div>
  );
}

/** Aperçu local avec données d'exemple, pour captures. Aucun appel réseau. */
export function FichesLieuxTabDemo() {
  return (
    <main className="h-dvh overflow-y-auto bg-night px-4 py-5 text-ink">
      <p className="mb-1 text-xs text-[#fbbf24]">Aperçu local — données d'exemple, pas la prod</p>
      <p className="mb-4 font-display text-xl font-extrabold">Admin · Fiches lieux</p>
      <FichesLieuxTab adminKey="demo" demo={{ list: DEMO_FICHES_LIST, claims: DEMO_CLAIMS, edits: DEMO_EDITS }} />
    </main>
  );
}
