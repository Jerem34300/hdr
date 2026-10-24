import { Referrers, RefLinks } from "./admin-ref-links";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MediaView } from "./media-composer";
import {
  admin,
  admin58,
  adminLive,
  adminMedia,
  adminReports,
  type AdminIp,
  type AdminMediaRow,
  type AdminReportedThread,
  type AdminThreadMsg,
  pgTime,
  type AdminLive,
  type AdminAreaRow,
  type AdminPlaceMsg,
  type AdminRating,
  type AdminSalon,
  type AdminSalonMsg,
  type AdminVisitors,
  type Breakdown,
  type VisitorRow, adminRefs, type AdminRefs, type RefRow } from "@/lib/hdar/live";

function useLoad<T>(load: () => Promise<T>, everyMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const run = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [load]);
  useEffect(() => {
    run();
    if (!everyMs) return;
    const id = window.setInterval(run, everyMs);
    return () => window.clearInterval(id);
  }, [run, everyMs]);
  return { data, error, reload: run };
}

function when(v: string) {
  const ms = v.includes("T") ? Date.parse(v) : pgTime(v);
  return new Date(ms).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function duration(first: string, last: string) {
  const min = Math.round((Date.parse(last) - Date.parse(first)) / 60000);
  if (min < 2) return "< 2 min";
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} j`;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)} %` : "—");

/** Missing v58 functions: explain instead of a raw Postgres error. */
function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  const missing = /could not find the function|schema cache|does not exist/i.test(error);
  return (
    <p className="rounded-2xl border border-signal/50 bg-signal/10 p-3 text-sm">
      {missing ? "Cette vue a besoin de la mise à jour de la base v58 (supabase/hdar_v58_visitors_salons.sql), pas encore appliquée." : error}
    </p>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={"h-9 rounded-full border px-3 " + (value === v ? "border-signal bg-signal text-night" : "border-line")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Visiteurs
const STEP_LABELS: Record<string, string> = {
  app: "Ont vu l'appli (carte)",
  geo_ok: "Ont partagé leur position",
  geo_no: "Ont refusé la position",
  "tab:spots": "Ont ouvert Lieux",
  "tab:inbox": "Ont ouvert Messages / Salons",
  "view:pocket": "Ont ouvert le chat du quartier",
  "view:salon": "Ont ouvert un salon",
  "view:profile": "Ont regardé un profil",
  "sheet:person": "Ont touché quelqu'un sur la carte",
  "tab:me": "Ont ouvert l'onglet Profil",
  "sheet:gate": "Ont vu « crée ton profil »",
  profile_saved: "Ont enregistré un profil",
  msg_area: "Ont écrit au quartier",
  msg_salon: "Ont écrit dans un salon",
  msg_place: "Ont écrit dans un lieu",
  msg_pm: "Ont envoyé un message privé",
};
const FUNNEL = ["app", "geo_ok", "tab:spots", "tab:inbox", "view:pocket", "view:salon", "sheet:person", "view:profile", "tab:me", "sheet:gate", "profile_saved", "msg_area", "msg_salon", "msg_pm"];

function Bar({ label, n, max, hint }: { label: string; n: number; max: number; hint?: string }) {
  const w = max > 0 ? Math.max(2, (100 * n) / max) : 0;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm" title={`${label} : ${n}${hint ? ` (${hint})` : ""}`}>
      <span className="truncate">{label}</span>
      <span className="text-right font-display font-bold tabular-nums">
        {n} <span className="text-xs font-normal text-muted">{hint}</span>
      </span>
      <span className="col-span-2 h-2 overflow-hidden rounded-full bg-white/5">
        <span className="block h-full rounded-full bg-signal" style={{ width: `${w}%` }} />
      </span>
    </li>
  );
}

function BreakdownList({ title, rows }: { title: string; rows: Breakdown[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="font-display font-bold">{title}</h3>
      <p className="mb-3 text-xs text-muted">visiteurs · dont avec profil</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Rien encore.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <Bar key={r.k} label={r.k === "?" ? "inconnu (avant le suivi)" : r.k} n={r.n} max={max} hint={`· ${r.p} profil${r.p > 1 ? "s" : ""}`} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function VisitorsTab({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<"all" | "anon" | "profile">("anon");
  const load = useCallback(() => admin58.visitors(adminKey, days), [adminKey, days]);
  const { data, error } = useLoad<AdminVisitors>(load, 60_000);
  const rows = (data?.rows ?? []).filter((r) => (filter === "all" ? true : filter === "anon" ? !r.profile : r.profile));
  const gate = data?.gate ?? {};
  const max = Math.max(1, gate.gate_view ?? 0, data?.steps.app ?? 0, data?.total ?? 0);

  return (
    <div className="space-y-4">
      <Seg value={days} onChange={setDays} options={[[1, "24 h"], [7, "7 j"], [30, "30 j"], [90, "90 j"]]} />
      <ErrorNote error={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Appareils arrivés" value={data.total} />
            <Tile label="Avec profil" value={data.with_profile} hint={pct(data.with_profile, data.total)} />
            <Tile label="Partis en < 2 min" value={data.bounce} hint={`${pct(data.bounce, data.total)} · 1 seule visite`} />
            <Tile label="Revenus un autre jour" value={data.returning} hint={pct(data.returning, data.total)} />
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="font-display font-bold">Parcours : jusqu'où vont-ils ?</h3>
            <p className="mb-3 text-xs text-muted">
              Nombre d'appareils ayant atteint chaque étape au moins une fois.
              {data.tracked_since ? ` Suivi détaillé depuis le ${when(data.tracked_since)}` : " Le suivi détaillé démarre avec cette mise à jour"} : les visiteurs plus anciens n'ont pas d'étapes.
            </p>
            <ul className="space-y-2.5">
              <Bar label="Ont vu l'écran d'entrée 18+" n={gate.gate_view ?? 0} max={max} hint="(sans identifiant)" />
              <Bar label="Ont cliqué « Entrer »" n={gate.gate_enter ?? 0} max={max} hint={pct(gate.gate_enter ?? 0, gate.gate_view ?? 0)} />
              {(gate.gate_error ?? 0) > 0 && <Bar label="Erreur à l'entrée (captcha…)" n={gate.gate_error ?? 0} max={max} />}
              {FUNNEL.map((k) => (
                <Bar key={k} label={STEP_LABELS[k] ?? k} n={data.steps[k] ?? 0} max={max} hint={pct(data.steps[k] ?? 0, data.steps.app ?? 0)} />
              ))}
              {(data.steps.geo_no ?? 0) > 0 && <Bar label={STEP_LABELS.geo_no} n={data.steps.geo_no ?? 0} max={max} />}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <BreakdownList title="D'où ils viennent" rows={data.sources} />
            <BreakdownList title="Page d'arrivée" rows={data.landings} />
            <BreakdownList title="Appareil" rows={data.platforms} />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold">Visiteurs un par un</h3>
              <Seg value={filter} onChange={setFilter} options={[["anon", "Sans profil"], ["profile", "Avec profil"], ["all", "Tous"]]} />
            </div>
            <p className="mb-2 text-xs text-muted">Anonymes : aucun contenu, aucune position. Les étapes montrent ce que chaque appareil a ouvert.</p>
            <ul className="space-y-2">
              {rows.map((r) => (
                <VisitorItem key={r.id} r={r} />
              ))}
              {rows.length === 0 && <p className="py-8 text-center text-muted">Personne.</p>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function VisitorItem({ r }: { r: VisitorRow }) {
  const steps = r.steps.filter((s) => s !== "app");
  return (
    <li className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">
          {r.profile ? r.pseudo || "Profil" : "Visiteur"} <span className="font-mono text-xs font-normal text-muted">{r.id.slice(0, 8)}</span>
        </span>
        <span className="text-xs text-muted">
          arrivé {when(r.first)} · vu {when(r.last)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {[
          r.city,
          r.platform && `${r.platform}${r.pwa ? " (appli installée)" : ""}`,
          r.source && `via ${r.source}`,
          r.landing && `arrivé sur ${r.landing}`,
          `${r.sessions} session${r.sessions > 1 ? "s" : ""}`,
          `${r.days} jour${r.days > 1 ? "s" : ""}`,
          `présence ${duration(r.first, r.last)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {(r.pm > 0 || r.area > 0 || r.place > 0) && (
        <p className="mt-1 text-xs">
          ✉️ {r.pm} MP · 📍 {r.area} quartier · 🏠 {r.place} lieux
        </p>
      )}
      {steps.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {steps.map((s) => (
            <span key={s} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted">
              {STEP_LABELS[s]?.replace(/^Ont (ouvert |vu |regardé |écrit |envoyé |partagé |enregistré |touché |refusé )?/, "") ?? s}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted">Aucune étape enregistrée.</p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- Conversations
export function ConversationsTab({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const [kind, setKind] = useState<"area" | "places" | "salons">("salons");
  return (
    <div className="space-y-4">
      <Seg value={kind} onChange={setKind} options={[["salons", "Salons"], ["area", "Chat du quartier"], ["places", "Chats de lieux & spots"]]} />
      {kind === "area" && <AreaMsgs adminKey={adminKey} onOpen={onOpen} />}
      {kind === "places" && <PlaceMsgs adminKey={adminKey} onOpen={onOpen} />}
      {kind === "salons" && <Salons adminKey={adminKey} onOpen={onOpen} />}
    </div>
  );
}

function Msg({
  pseudo,
  at,
  body,
  removed,
  where,
  media,
  onOpen,
  onHide,
}: {
  pseudo: string;
  at: string;
  body: string;
  removed: boolean;
  where?: string;
  /** Pour afficher la photo / vidéo / le vocal d'un message sans texte. */
  media?: { adminKey: string; scope: "area" | "place" | "spot" | "salon"; id: string };
  onOpen: () => void;
  onHide: () => void;
}) {
  return (
    <li className={"rounded-2xl border border-line bg-surface px-4 py-3 " + (removed ? "opacity-40" : "")}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          <button type="button" className="font-bold text-ink underline" onClick={onOpen}>
            {pseudo}
          </button>
          {where && <> dans <b className="text-ink">{where}</b></>}
        </span>
        <span>{when(at)}</span>
      </div>
      {body ? <p className="mt-1 text-sm break-words">{body}</p> : media ? <AdminMedia {...media} /> : <p className="mt-1 text-sm">📎 média</p>}
      {removed ? (
        <p className="mt-2 text-xs">Supprimé</p>
      ) : (
        <button type="button" className="mt-2 text-xs text-signal" onClick={onHide}>
          Supprimer ce message
        </button>
      )}
    </li>
  );
}

/** Photo, vidéo ou vocal d'un message (visible par l'admin même après retrait). */
function AdminMedia({ adminKey, scope, id }: { adminKey: string; scope: "area" | "place" | "spot" | "salon"; id: string }) {
  const [row, setRow] = useState<AdminMediaRow | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    adminMedia(adminKey, scope, id)
      .then((r) => alive && setRow(r))
      .catch(() => alive && setRow(null));
    return () => {
      alive = false;
    };
  }, [adminKey, scope, id]);
  if (row === undefined) return <p className="mt-1 text-sm text-muted">Chargement du média…</p>;
  if (!row) return <p className="mt-1 text-sm text-muted">📎 Média indisponible (effacé ou base pas à jour)</p>;
  return (
    <div className="mt-2 max-w-xs">
      <MediaView kind={row.kind} path={row.media} duration={row.duration} />
      {row.removed && <p className="mt-1 text-xs text-muted">Retiré : visible seulement par l'admin</p>}
    </div>
  );
}

function AreaMsgs({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const load = useCallback(() => admin.area(adminKey), [adminKey]);
  const { data, error, reload } = useLoad<AdminAreaRow[]>(load, 20_000);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Les 100 derniers messages, toutes villes. Ils s'effacent au bout de 24 h (confidentialité).</p>
      <ErrorNote error={error} />
      {data?.length === 0 && <p className="py-10 text-center text-muted">Aucun message ces dernières 24 h.</p>}
      <ul className="space-y-2">
        {data?.map((m) => (
          <Msg key={m.id} pseudo={m.pseudo} at={m.at} body={m.body} removed={m.removed} media={{ adminKey, scope: "area", id: m.id }} onOpen={() => onOpen(m.from_id)} onHide={() => void admin.hideArea(adminKey, m.id).then(reload)} />
        ))}
      </ul>
    </div>
  );
}

function PlaceMsgs({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const load = useCallback(() => admin58.placeMsgs(adminKey), [adminKey]);
  const { data, error, reload } = useLoad<AdminPlaceMsg[]>(load, 20_000);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Messages écrits dans les chats des lieux et des spots (effacés après 24 h).</p>
      <ErrorNote error={error} />
      {data?.length === 0 && <p className="py-10 text-center text-muted">Aucun message ces dernières 24 h.</p>}
      <ul className="space-y-2">
        {data?.map((m) => (
          <Msg
            key={m.id}
            pseudo={m.pseudo}
            at={m.at}
            body={m.body}
            removed={m.removed}
            where={`${m.scope === "spot" ? "🎯 " : "📍 "}${m.where}`}
            media={{ adminKey, scope: m.scope, id: m.id }}
            onOpen={() => onOpen(m.from_id)}
            onHide={() => void admin58.hideMsg(adminKey, m.scope, m.id).then(reload)}
          />
        ))}
      </ul>
    </div>
  );
}

function Salons({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const load = useCallback(() => admin58.salons(adminKey), [adminKey]);
  const { data, error, reload } = useLoad<AdminSalon[]>(load, 30_000);
  const [open, setOpen] = useState<AdminSalon | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💬");
  const [desc, setDesc] = useState("");
  if (open) return <SalonMsgs adminKey={adminKey} salon={open} onBack={() => setOpen(null)} onOpen={onOpen} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Salons ouverts à tous, sans limite de distance. Les utilisateurs avec profil peuvent en créer 3. Messages gardés 7 jours.</p>
      <ErrorNote error={error} />
      <form
        className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          admin58
            .salonCreate(adminKey, name, desc, emoji)
            .then(() => {
              toast("Salon officiel créé");
              setName("");
              setDesc("");
              reload();
            })
            .catch((err: Error) => toast(err.message));
        }}
      >
        <input className="h-10 w-14 rounded-xl border border-line bg-night px-2 text-center" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
        <input className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-night px-3" value={name} maxLength={40} placeholder="Nouveau salon officiel" onChange={(e) => setName(e.target.value)} />
        <input className="h-10 w-full rounded-xl border border-line bg-night px-3" value={desc} maxLength={120} placeholder="Description" onChange={(e) => setDesc(e.target.value)} />
        <button type="submit" className="h-10 rounded-full bg-signal px-4 text-sm text-night">
          Créer
        </button>
      </form>
      <ul className="space-y-2">
        {data?.map((s) => (
          <li key={s.id} className={"rounded-2xl border border-line bg-surface p-3 text-sm " + (s.removed ? "opacity-50" : "")}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 text-left" onClick={() => setOpen(s)}>
                <p className="font-bold">
                  {s.emoji || "💬"} {s.name} {s.official && <span className="text-xs text-signal">officiel</span>} {s.removed && <span className="text-xs">· fermé</span>}
                </p>
                <p className="text-xs text-muted">
                  {s.messages} messages · {s.people} personnes · dernier {when(s.last_at)}
                  {s.creator ? ` · créé par ${s.creator}` : ""}
                </p>
              </button>
              <button
                type="button"
                className="h-8 shrink-0 rounded-full border border-line px-3 text-xs"
                onClick={() => void admin58.salonSet(adminKey, s.id, !s.removed).then(reload).catch((e: Error) => toast(e.message))}
              >
                {s.removed ? "Rouvrir" : "Fermer"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SalonMsgs({ adminKey, salon, onBack, onOpen }: { adminKey: string; salon: AdminSalon; onBack: () => void; onOpen: (id: string) => void }) {
  const load = useCallback(() => admin58.salonMessages(adminKey, salon.id), [adminKey, salon.id]);
  const { data, error, reload } = useLoad<AdminSalonMsg[]>(load, 15_000);
  return (
    <div className="space-y-3">
      <button type="button" className="text-sm text-muted underline" onClick={onBack}>
        ← Tous les salons
      </button>
      <h3 className="font-display text-xl font-bold">
        {salon.emoji || "💬"} {salon.name}
      </h3>
      <ErrorNote error={error} />
      {data?.length === 0 && <p className="py-10 text-center text-muted">Aucun message.</p>}
      <ul className="space-y-2">
        {data?.map((m) => (
          <Msg key={m.id} pseudo={m.pseudo} at={m.at} body={m.body} removed={m.removed} media={{ adminKey, scope: "salon", id: m.id }} onOpen={() => onOpen(m.from_id)} onHide={() => void admin58.hideMsg(adminKey, "salon", m.id).then(reload)} />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- Notes des lieux
export function RatingsSummary({ adminKey }: { adminKey: string }) {
  const load = useCallback(() => admin58.ratings(adminKey), [adminKey]);
  const { data, error } = useLoad<AdminRating[]>(load);
  return (
    <div className="mb-5">
      <h3 className="font-display text-lg font-bold">Notes des lieux</h3>
      <p className="mb-2 text-xs text-muted">Moyenne des étoiles, nombre de notes et d'avis écrits par lieu.</p>
      <ErrorNote error={error} />
      {data?.length === 0 && <p className="py-4 text-sm text-muted">Aucune note pour l'instant.</p>}
      <ul className="space-y-2">
        {data?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
            <span className="min-w-0">
              <b>{p.name}</b> <span className="text-xs text-muted">{p.kind}{p.partner ? " · partenaire" : ""}</span>
              <span className="block text-xs text-muted">
                {[5, 4, 3, 2, 1].map((s) => `${s}★ ${p.dist?.[s] ?? 0}`).join(" · ")}
                {p.last ? ` · dernier ${when(p.last)}` : ""}
              </span>
            </span>
            <span className="text-right">
              <span className="font-display text-lg font-extrabold text-amber-400">{p.avg != null ? `${Number(p.avg).toFixed(1)} ★` : "—"}</span>
              <span className="block text-xs text-muted">
                {p.n} note{p.n > 1 ? "s" : ""} · {p.comments} avis
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** En direct : qui a l'appli ouverte, où il est (salons, quartier), et qui écrit en privé à qui (24 h, sans le contenu). */
export function LiveNowTab({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const load = useCallback(() => adminLive(adminKey), [adminKey]);
  const { data, error } = useLoad<AdminLive>(load, 15_000);
  const [view, setView] = useState<"online" | "rooms" | "pm">("online");
  const [q, setQ] = useState("");
  const match = (...names: string[]) => !q || names.some((n) => n.toLowerCase().includes(q.toLowerCase()));
  const ago = (v: string) => {
    const s = Math.max(0, Math.round((Date.now() - (v.includes("T") ? Date.parse(v) : pgTime(v))) / 1000));
    return s < 60 ? "à l'instant" : s < 3600 ? `il y a ${Math.round(s / 60)} min` : `il y a ${Math.round(s / 3600)} h`;
  };
  const Name = ({ id, pseudo }: { id: string; pseudo: string }) => (
    <button type="button" className="font-bold text-ink underline" onClick={() => onOpen(id)}>
      {pseudo}
    </button>
  );
  const online = (data?.online ?? []).filter((u) => match(u.pseudo, u.city ?? ""));
  const pm = (data?.pm ?? []).filter((p) => match(p.a_pseudo, p.b_pseudo));
  return (
    <div className="space-y-4">
      <ErrorNote error={error} />
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Connectés" value={data?.online.length ?? 0} hint="appli ouverte (5 min)" />
        <Tile label="Dans les salons" value={(data?.rooms ?? []).reduce((n, r) => n + r.people.length, 0)} hint="5 dernières min" />
        <Tile label="Conversations privées" value={data?.pm.length ?? 0} hint="actives sur 24 h" />
      </div>
      <Seg value={view} onChange={setView} options={[["online", "Connectés"], ["rooms", "Salons"], ["pm", "Privés"]]} />
      {view !== "rooms" && (
        <input
          className="h-10 w-full rounded-full border border-line bg-surface px-4 text-sm outline-none focus-visible:border-signal"
          placeholder="Chercher un pseudo ou une ville"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      {view === "online" && (
        <ul className="space-y-2">
          {data && online.length === 0 && <p className="py-8 text-center text-sm text-muted">Personne en ce moment.</p>}
          {online.map((u) => (
            <li key={u.id} className={"rounded-2xl border border-line bg-surface px-4 py-3 text-sm " + (u.banned ? "opacity-50" : "")}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-online" />
                  <Name id={u.id} pseudo={u.pseudo} />
                  {!u.profile && <span className="ml-1 text-xs text-muted">(sans profil)</span>}
                  {u.banned && <span className="ml-1 text-xs text-signal">banni</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{ago(u.last)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {[u.city, u.platform, u.pwa ? "appli installée" : null, u.on_map ? "visible sur la carte" : null, `${u.sessions} visite${u.sessions > 1 ? "s" : ""}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {u.rooms.length > 0 && <p className="mt-1 text-xs">📍 Dans : <b>{u.rooms.join(", ")}</b></p>}
              {(u.pm_24h > 0 || u.salon_24h > 0 || u.area_24h > 0) && (
                <p className="mt-1 text-xs text-muted">
                  24 h : {u.pm_24h} msg privés · {u.salon_24h} en salons · {u.area_24h} au quartier
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {view === "rooms" && (
        <ul className="space-y-2">
          {data && data.rooms.length === 0 && <p className="py-8 text-center text-sm text-muted">Personne dans les salons ces 5 dernières minutes.</p>}
          {(data?.rooms ?? []).map((r) => (
            <li key={r.room} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <p className="font-bold">
                {r.emoji || "💬"} {r.name} <span className="font-normal text-muted">· {r.people.length}</span>
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {r.people.map((p) => (
                  <span key={p.id}>
                    <Name id={p.id} pseudo={p.pseudo} /> <span className="text-muted">{ago(p.at)}</span>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
      {view === "pm" && (
        <div>
          <p className="mb-3 text-sm text-muted">Qui écrit à qui ces dernières 24 h (nombre de messages, pas leur contenu).</p>
          <ul className="space-y-2">
            {data && pm.length === 0 && <p className="py-8 text-center text-sm text-muted">Aucun message privé.</p>}
            {pm.map((p) => (
              <li key={p.a + p.b} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <Name id={p.a} pseudo={p.a_pseudo} /> ↔ <Name id={p.b} pseudo={p.b_pseudo} />
                  </span>
                  <span className="shrink-0 text-xs text-muted">{ago(p.last)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {p.n} message{p.n > 1 ? "s" : ""} ({p.a_pseudo} : {p.a_n}, {p.b_pseudo} : {p.n - p.a_n}) · depuis {when(p.first)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Fiche utilisateur : conversations privées signalées (lisibles en entier) et adresses IP (1 an). */
export function UserReportsAndIps({ adminKey, id, pseudo }: { adminKey: string; id: string; pseudo: string }) {
  const loadThreads = useCallback(() => adminReports.threads(adminKey, id), [adminKey, id]);
  const loadIps = useCallback(() => adminReports.ips(adminKey, id), [adminKey, id]);
  const threads = useLoad<AdminReportedThread[]>(loadThreads);
  const ips = useLoad<AdminIp[]>(loadIps);
  const [open, setOpen] = useState<AdminReportedThread | null>(null);
  return (
    <>
      <h2 className="mt-6 font-display text-lg font-bold">Conversations privées signalées</h2>
      <p className="mt-1 text-xs text-muted">
        Lisibles seulement entre {pseudo} et une personne qu'il a signalée ou qui l'a signalé. Chaque lecture est enregistrée.
      </p>
      <ErrorNote error={threads.error} />
      <ul className="mt-2 space-y-2">
        {threads.data?.length === 0 && <li className="text-sm text-muted">Aucune conversation signalée.</li>}
        {threads.data?.map((t) => (
          <li key={t.other}>
            <button type="button" className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm" onClick={() => setOpen(open?.other === t.other ? null : t)}>
              <span className="font-bold">{t.pseudo}</span>
              <span className="text-muted">
                {" "}· {t.reported_by_other && t.reported_other ? "signalements croisés" : t.reported_by_other ? `a signalé ${pseudo}` : `signalé par ${pseudo}`} · {t.n} message{t.n > 1 ? "s" : ""}
                {t.last ? ` · dernier ${when(t.last)}` : ""}
              </span>
              <span className="float-right text-signal">{open?.other === t.other ? "Fermer" : "Lire"}</span>
            </button>
            {open?.other === t.other && <AdminThread adminKey={adminKey} a={id} b={t.other} />}
          </li>
        ))}
      </ul>

      <h2 className="mt-6 font-display text-lg font-bold">Connexions (adresses IP, 1 an)</h2>
      <p className="mt-1 text-xs text-muted">Conservées 1 an (obligation légale). À transmettre uniquement sur réquisition judiciaire.</p>
      <ErrorNote error={ips.error} />
      <ul className="mt-2 space-y-2">
        {ips.data?.length === 0 && <li className="text-sm text-muted">Aucune connexion enregistrée pour l'instant.</li>}
        {ips.data?.map((c) => (
          <li key={c.ip} className="rounded-2xl border border-line px-4 py-3 text-sm">
            <p className="font-mono font-bold">
              {c.ip}
              {c.others > 0 && <span className="ml-2 font-sans text-xs text-amber-400">partagée avec {c.others} autre{c.others > 1 ? "s" : ""} compte{c.others > 1 ? "s" : ""}</span>}
            </p>
            <p className="text-xs text-muted">
              du {when(c.first)} au {when(c.last)} · {c.hits} fois
            </p>
            {c.ua && <p className="mt-1 truncate text-xs text-muted">{c.ua}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function AdminThread({ adminKey, a, b }: { adminKey: string; a: string; b: string }) {
  const load = useCallback(() => adminReports.thread(adminKey, a, b), [adminKey, a, b]);
  const { data, error } = useLoad<AdminThreadMsg[]>(load);
  return (
    <div className="mt-2 space-y-1.5 rounded-2xl bg-night p-3">
      <ErrorNote error={error} />
      {data?.length === 0 && <p className="text-center text-xs text-muted">Aucun message (effacés après 30 jours ou par les deux personnes).</p>}
      {data?.map((m) => (
        <div key={m.id} className={"flex " + (m.from_id === a ? "justify-start" : "justify-end")}>
          <div className={"max-w-[85%] rounded-2xl px-3 py-2 text-sm " + (m.from_id === a ? "bg-surface" : "bg-signal/20")}>
            <p className="text-[11px] text-muted">
              <b className="text-ink">{m.pseudo}</b> · {when(m.at)}
            </p>
            {m.kind === "text" || m.kind === "location" ? (
              <p className="break-words whitespace-pre-wrap">{m.kind === "location" ? `📍 ${m.body || "Position"}` : m.body}</p>
            ) : m.media?.startsWith("sb:") ? (
              <div className="mt-1"><MediaView kind={m.kind} path={m.media.slice(3)} duration={m.duration} /></div>
            ) : m.media && m.kind === "image" ? (
              <img src={m.media} alt="" className="mt-1 max-h-60 rounded-xl" />
            ) : (
              <p className="text-muted">📎 {m.kind === "audio" ? "Vocal" : m.kind === "video" ? "Vidéo" : "Photo"} (effacé)</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Provenance : visites arrivées par un lien ?ref=, profils créés et conversion, au total et par jour. */
export function RefsTab({ adminKey, onOpen }: { adminKey: string; onOpen?: (id: string) => void }) {
  const [days, setDays] = useState(30);
  const load = useCallback(() => adminRefs(adminKey, days), [adminKey, days]);
  const { data, error } = useLoad<AdminRefs>(load, 60_000);
  const conv = (r: RefRow) => (r.conv == null ? "—" : `${r.conv} %`);
  const visits = (data?.total ?? []).reduce((n, r) => n + r.visits, 0);
  const profiles = (data?.total ?? []).reduce((n, r) => n + r.profiles, 0);
  return (
    <div className="space-y-4">
      <RefLinks adminKey={adminKey} onOpen={onOpen} />
      <Referrers adminKey={adminKey} onOpen={onOpen} />
      <h3 className="pt-2 font-display text-lg font-bold">Statistiques par période</h3>
      <Seg value={days} onChange={setDays} options={[[1, "Aujourd'hui"], [7, "7 j"], [30, "30 j"], [90, "90 j"]]} />
      <ErrorNote error={error} />
      <p className="text-xs text-muted">
        Liens du type hdar.chat/?ref=next1 (compatible avec &code=FIRST). 1 visite = 1 appareil arrivé par le lien, au plus 1 fois par jour.
        Aucune IP ni identifiant d'appareil n'est enregistré ; un profil est rattaché à la 1re ref vue dans les 30 jours.
      </p>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Visites" value={visits} />
            <Tile label="Profils créés" value={profiles} />
            <Tile label="Refs" value={data.total.length} hint={visits ? `${Math.round((1000 * profiles) / visits) / 10} % conversion` : undefined} />
          </div>
          <RefTable title="Total par ref" rows={data.total} conv={conv} />
          <RefTable title="Par jour" rows={data.daily} conv={conv} day />
        </>
      )}
    </div>
  );
}

function RefTable({ title, rows, conv, day }: { title: string; rows: (RefRow & { day?: string })[]; conv: (r: RefRow) => string; day?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="mb-2 font-display font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Aucune visite par lien ?ref= sur la période.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              {day && <th className="py-1">Jour</th>}
              <th className="py-1">Ref</th>
              <th className="py-1 text-right">Visites</th>
              <th className="py-1 text-right">Profils</th>
              <th className="py-1 text-right">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={(r.day ?? "") + r.ref} className="border-t border-line/60">
                {day && <td className="py-1.5 text-muted">{r.day ? new Date(`${r.day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</td>}
                <td className="py-1.5 font-bold">{r.ref}</td>
                <td className="py-1.5 text-right">{r.visits}</td>
                <td className="py-1.5 text-right">{r.profiles}</td>
                <td className="py-1.5 text-right">{conv(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
