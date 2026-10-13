import { adminPartners, type AdminPartner } from "@/lib/hdar/live";
import { ProDashboard } from "./pro-dashboard";
import { adminCodes, adminCodeCreate, adminNewsSend, type GiftCode } from "@/lib/hdar/live";
import { mail as mailHtml, type Tpl } from "@/lib/hdar/mail-template";
import { toast } from "sonner";
import { adminProGifts, adminProThreads } from "@/lib/hdar/live";
import { AdultGate } from "./adult-gate";
import { MediaView } from "./media-composer";
import { authUserId, ensureSession } from "@/lib/hdar/session";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, LogOut, RefreshCw } from "lucide-react";
import {
  admin,
  pgTime,
  type AdminAreaRow,
  type AdminBanRow,
  type AdminPhotoRow,
  type AdminContactRow, type AdminPlaceRow, adminPlaces,
  type AdminReportRow,
  type AdminStats,
  type AdminUser,
} from "@/lib/hdar/live";
import { Avatar } from "./avatar";
import { Heat, Influencers, Monetization, Overview, TopPlaces, Week } from "./admin-analytics";
import { CommentsTab, GrowthTab, PricingTab, RoiTab } from "./admin-business";
import type { Influencer } from "@/lib/hdar/live";

const KEY_STORE = "hdar-admin-key";
type Tab = "growth" | "roi" | "comments" | "pricing" | "overview" | "heat" | "week" | "top" | "influencers" | "money" | "stats" | "photos" | "reports" | "area" | "bans" | "contacts" | "places" | "support" | "users" | "emails" | "progifts" | "codes" | "partners";

function readKey() {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

function when(v: string) {
  const ms = v.includes("T") ? Date.parse(v) : pgTime(v);
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminApp() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    void ensureSession()
      .then(() => authUserId())
      .then(setUid)
      .catch(() => undefined);
  }, []);
  return (
    <AdultGate>
      <AdminInner />
      <p className="fixed bottom-1 left-2 text-[10px] text-muted">auth.uid : {uid ?? "…"}</p>
    </AdultGate>
  );
}

function AdminInner() {
  const [key, setKey] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setKey(readKey());
    setReady(true);
  }, []);
  if (!ready) return <div className="h-dvh bg-night" />;
  if (!key) return <Login onKey={setKey} />;
  return (
    <Dashboard
      adminKey={key}
      onLogout={() => {
        try {
          localStorage.removeItem(KEY_STORE);
        } catch {
          /* private mode */
        }
        setKey("");
      }}
    />
  );
}

function Login({ onKey }: { onKey: (k: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-night px-6 text-ink">
      <form
        className="w-full max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          admin
            .stats(value.trim())
            .then(() => {
              try {
                localStorage.setItem(KEY_STORE, value.trim());
              } catch {
                /* private mode */
              }
              onKey(value.trim());
            })
            .catch(() => setError("Mot de passe incorrect"))
            .finally(() => setBusy(false));
        }}
      >
        <p className="font-display text-3xl font-extrabold">
          hdar<span className="text-signal">.</span> admin
        </p>
        <label className="mt-6 block text-sm text-muted">
          Mot de passe administrateur
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1 h-12 w-full rounded-full border border-line bg-surface px-4 text-base text-ink outline-none focus-visible:border-signal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && <p className="mt-2 text-sm text-signal">{error}</p>}
        <button
          type="submit"
          disabled={busy || !value}
          className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-40"
        >
          {busy ? "Vérification…" : "Entrer"}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ adminKey, onLogout }: { adminKey: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [userId, setUserId] = useState<string | null>(null);
  const [openReports, setOpenReports] = useState(0);
  const [boostFor, setBoostFor] = useState<Influencer | null>(null);
  useEffect(() => {
    admin.stats(adminKey).then((s) => setOpenReports(s.reports_open)).catch(() => undefined);
  }, [adminKey]);

  if (userId) return <UserDetail adminKey={adminKey} id={userId} onBack={() => setUserId(null)} />;

  return (
    <main className="h-dvh overflow-y-auto bg-night text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-night/95 px-4 pt-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <p className="font-display text-2xl font-extrabold">
            hdar<span className="text-signal">.</span> admin
          </p>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted"
            onClick={onLogout}
          >
            <LogOut className="size-4" /> Quitter
          </button>
        </div>
        <nav className="mx-auto mt-3 flex max-w-5xl gap-1 overflow-x-auto">
          {(
            [
              ["overview", "Vue d'ensemble"],
              ["users", "Utilisateurs"],
              ["emails", "Emails"],
              ["progifts", "Cadeaux pro"],
              ["codes", "Codes cadeaux"],
              ["partners", "Partenaires"],
              ["heat", "Carte de chaleur"],
              ["week", "Horaires"],
              ["top", "Top lieux"],
              ["roi", "ROI lieux"],
              ["growth", "Croissance & revenus"],
              ["influencers", "Influenceurs"],
              ["money", "Boosts & partenaires"],
              ["pricing", "Tarifs"],
              ["comments", "Avis"],
              ["stats", "Temps réel"],
              ["reports", `Signalements${openReports ? ` (${openReports})` : ""}`],
              ["area", "Chat du quartier"],
              ["support", "Support · rattacher"],
              ["photos", "Photos"],
              ["contacts", "Messages"],
              ["places", "Lieux proposés"],
              ["bans", "Bannis"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                "shrink-0 border-b-2 px-3 pb-2 text-sm " +
                (tab === id ? "border-signal text-ink" : "border-transparent text-muted")
              }
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-5">
        {tab === "overview" && <Overview adminKey={adminKey} />}
        {tab === "heat" && <Heat adminKey={adminKey} />}
        {tab === "week" && <Week adminKey={adminKey} />}
        {tab === "top" && <TopPlaces adminKey={adminKey} />}
        {tab === "roi" && <RoiTab adminKey={adminKey} />}
        {tab === "growth" && <GrowthTab adminKey={adminKey} />}
        {tab === "pricing" && <PricingTab adminKey={adminKey} />}
        {tab === "comments" && <CommentsTab adminKey={adminKey} />}
        {tab === "influencers" && (
          <Influencers
            adminKey={adminKey}
            onOpen={setUserId}
            onBoost={(u) => {
              setBoostFor(u);
              setTab("money");
            }}
          />
        )}
        {tab === "money" && <Monetization key={boostFor?.user_id ?? ""} adminKey={adminKey} prefill={boostFor} onOpen={setUserId} />}
        {tab === "stats" && <Stats adminKey={adminKey} onReports={setOpenReports} />}
        {tab === "reports" && <Reports adminKey={adminKey} onOpen={setUserId} />}
        {tab === "area" && <Area adminKey={adminKey} onOpen={setUserId} />}
        {tab === "support" && <SupportTab adminKey={adminKey} />}
        {tab === "emails" && <EmailsTab adminKey={adminKey} />}
        {tab === "progifts" && <ProGiftsTab adminKey={adminKey} />}
        {tab === "codes" && <CodesTab adminKey={adminKey} />}
        {tab === "partners" && <PartnersTab adminKey={adminKey} />}
        {tab === "users" && <UsersTab adminKey={adminKey} onOpen={setUserId} />}
        {tab === "photos" && <Photos adminKey={adminKey} />}
        {tab === "contacts" && <Contacts adminKey={adminKey} onOpen={setUserId} />}
        {tab === "places" && <ProposedPlaces adminKey={adminKey} onOpen={setUserId} />}
        {tab === "bans" && <Bans adminKey={adminKey} onOpen={setUserId} />}
      </div>
    </main>
  );
}

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

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          "font-display text-3xl font-extrabold tabular-nums " + (accent ? "text-signal" : "")
        }
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-2 font-display text-lg font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </section>
  );
}

function Stats({ adminKey, onReports }: { adminKey: string; onReports: (n: number) => void }) {
  const load = useCallback(() => admin.stats(adminKey), [adminKey]);
  const { data: s, error, reload } = useLoad<AdminStats>(load, 30_000);
  useEffect(() => {
    if (s) onReports(s.reports_open);
  }, [s, onReports]);
  if (error) return <p className="text-signal">{error}</p>;
  if (!s) return <p className="text-muted">Chargement…</p>;
  const max = Math.max(1, ...s.days.map((d) => Math.max(d.visitors, d.messages)));
  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span>Mis à jour toutes les 30 s</span>
        <button type="button" className="flex items-center gap-1" onClick={reload}>
          <RefreshCw className="size-3" /> Actualiser
        </button>
      </div>
      <Section title="En ce moment">
        <Stat label="Appli ouverte" value={s.active_now} hint="dans les 5 dernières min" accent />
        <Stat label="Visibles sur la carte" value={s.visible_now} hint="ont touché Connexion" />
        <Stat label="Signalements à traiter" value={s.reports_open} accent={s.reports_open > 0} />
        <Stat label="Lieux ouverts" value={s.spots_open} />
      </Section>
      <Section title="Aujourd'hui">
        <Stat label="Visiteurs" value={s.visitors_today} hint={`${s.sessions_today} visites`} />
        <Stat label="Nouveaux profils" value={s.profiles_new_today} />
        <Stat
          label="Messages privés"
          value={s.pm_today}
          hint={`${s.conversations_today} conversations`}
        />
        <Stat label="Ont écrit en privé" value={s.chatters_today} hint="personnes" />
        <Stat label="Photos / vocaux" value={`${s.photos_today} / ${s.voices_today}`} />
        <Stat label="Appels vidéo" value={s.calls_today} />
        <Stat
          label="Chat du quartier"
          value={s.area_today}
          hint={`${s.area_writers_today} personnes`}
        />
        <Stat label="Messages dans les lieux" value={s.spot_msgs_today} />
      </Section>
      <Section title="Au total">
        <Stat label="Visiteurs 7 jours" value={s.visitors_7d} />
        <Stat label="Visiteurs 30 jours" value={s.visitors_30d} />
        <Stat
          label="Profils créés"
          value={s.profiles_total}
          hint={`${s.profiles_with_photo} avec photo`}
        />
        <Stat label="Messages privés 7 j" value={s.pm_7d} />
        <Stat label="Appareils vus" value={s.devices_total} />
        <Stat label="Bannis" value={s.bans} />
      </Section>
      <section className="mt-6">
        <h2 className="mb-2 font-display text-lg font-bold">14 derniers jours</h2>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex h-40 items-end gap-1">
            {s.days.map((d) => (
              <div
                key={d.day}
                className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
                title={`${d.day} · ${d.visitors} visiteurs · ${d.messages} messages · ${d.new_profiles} nouveaux profils`}
              >
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <span
                    className="w-1/2 rounded-t bg-ink"
                    style={{ height: `${(d.visitors / max) * 100}%` }}
                  />
                  <span
                    className="w-1/2 rounded-t bg-signal"
                    style={{ height: `${(d.messages / max) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted">{d.day.slice(8, 10)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-ink" /> Visiteurs
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-signal" /> Messages (privés + quartier)
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Reports({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const load = useCallback(() => admin.reports(adminKey, all), [adminKey, all]);
  const { data, error } = useLoad<AdminReportRow[]>(load, 30_000);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">
          Personnes signalées. Touche une ligne pour voir le profil, les motifs et les messages.
        </p>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Déjà
          traités
        </label>
      </div>
      {error && <p className="text-signal">{error}</p>}
      {data && data.length === 0 && (
        <p className="py-12 text-center text-muted">Aucun signalement à traiter. 🎉</p>
      )}
      <ul className="space-y-2">
        {data?.map((r) => (
          <li key={r.target_id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left"
              onClick={() => onOpen(r.target_id)}
            >
              <Avatar
                src={r.photo ?? ""}
                name={r.pseudo}
                className="size-12 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-display font-bold">{r.pseudo}</span>
                  {r.banned && (
                    <span className="rounded-full bg-signal px-2 text-[10px] font-bold text-night">
                      BANNI
                    </span>
                  )}
                </span>
                <span className="block truncate text-sm text-muted">
                  {r.reasons || "Sans motif"}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-xl font-extrabold text-signal">
                  {r.reports}
                </span>
                <span className="text-[10px] text-muted">{when(r.last_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Area({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const load = useCallback(() => admin.area(adminKey), [adminKey]);
  const { data, error, reload } = useLoad<AdminAreaRow[]>(load, 20_000);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Les 100 derniers messages du chat du quartier, toutes villes confondues.
      </p>
      {error && <p className="text-signal">{error}</p>}
      {data && data.length === 0 && (
        <p className="py-12 text-center text-muted">Aucun message pour l'instant.</p>
      )}
      <ul className="space-y-2">
        {data?.map((m) => (
          <li
            key={m.id}
            className={
              "rounded-2xl border border-line bg-surface px-4 py-3 " +
              (m.removed ? "opacity-40" : "")
            }
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <button
                type="button"
                className="font-bold text-ink underline"
                onClick={() => onOpen(m.from_id)}
              >
                {m.pseudo}
              </button>
              <span>{when(m.at)}</span>
            </div>
            <p className="mt-1 text-sm break-words">{m.body}</p>
            {!m.removed ? (
              <button
                type="button"
                className="mt-2 text-xs text-signal"
                onClick={() => void admin.hideArea(adminKey, m.id).then(reload)}
              >
                Supprimer ce message
              </button>
            ) : (
              <p className="mt-2 text-xs">Supprimé</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bans({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const load = useCallback(() => admin.banned(adminKey), [adminKey]);
  const { data, error } = useLoad<AdminBanRow[]>(load);
  return (
    <div>
      {error && <p className="text-signal">{error}</p>}
      {data && data.length === 0 && (
        <p className="py-12 text-center text-muted">Personne n'est banni.</p>
      )}
      <ul className="space-y-2">
        {data?.map((b) => (
          <li key={b.user_id}>
            <button
              type="button"
              className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left"
              onClick={() => onOpen(b.user_id)}
            >
              <span className="font-display font-bold">{b.pseudo}</span>
              <span className="block text-sm text-muted">
                {b.reason || "Sans motif"} · {when(b.at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserDetail({
  adminKey,
  id,
  onBack,
}: {
  adminKey: string;
  id: string;
  onBack: () => void;
}) {
  const load = useCallback(() => admin.user(adminKey, id), [adminKey, id]);
  const { data: u, error, reload } = useLoad<AdminUser>(load);
  const [banReason, setBanReason] = useState("");
  const [busy, setBusy] = useState(false);
  const act = (p: Promise<unknown>) => {
    setBusy(true);
    void p.then(reload).finally(() => setBusy(false));
  };

  return (
    <main className="h-dvh overflow-y-auto bg-night text-ink">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-night/95 px-2 py-2 backdrop-blur">
        <button
          type="button"
          className="flex size-11 items-center justify-center"
          aria-label="Retour"
          onClick={onBack}
        >
          <ChevronLeft />
        </button>
        <p className="font-display font-bold">{u?.profile?.pseudo ?? "Utilisateur"}</p>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-5">
        {error && <p className="text-signal">{error}</p>}
        {!u && !error && <p className="text-muted">Chargement…</p>}
        {u && (
          <>
            {u.banned && (
              <p className="mb-4 rounded-2xl bg-signal px-4 py-3 text-sm font-bold text-night">
                Banni le {when(u.banned.at)} · {u.banned.reason || "sans motif"}
              </p>
            )}
            <UserExtra adminKey={adminKey} id={id} />
            <div className="flex gap-2 overflow-x-auto">
              {(u.profile?.album ?? []).map((src, i) => (
                <img key={i} src={src} alt="" className="h-40 shrink-0 rounded-2xl object-cover" />
              ))}
              {(u.profile?.album ?? []).length === 0 && (
                <p className="text-sm text-muted">Aucune photo.</p>
              )}
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold">
              {u.profile?.pseudo ?? "Sans profil"}
              {u.profile?.age ? (
                <span className="font-normal text-muted">, {u.profile.age}</span>
              ) : null}
            </h1>
            {u.profile?.bio && <p className="mt-1 text-sm whitespace-pre-wrap">{u.profile.bio}</p>}
            {u.profile?.voice && (
              <audio controls src={u.profile.voice} className="mt-2 h-10 w-full" />
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Messages privés envoyés" value={u.stats.pm_sent} />
              <Stat label="Personnes contactées" value={u.stats.people_contacted} />
              <Stat label="Bloqué par" value={u.stats.blocked_by} accent={u.stats.blocked_by > 2} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {u.profile?.created_at ? `Profil créé le ${when(u.profile.created_at)}` : ""}
              {u.device
                ? ` · vu pour la dernière fois le ${when(u.device.last_seen)} · ${u.device.sessions} visites`
                : ""}
              {u.profile?.online ? " · visible sur la carte" : ""}
            </p>

            <h2 className="mt-6 font-display text-lg font-bold">
              Signalements ({u.reports.length})
            </h2>
            <ul className="mt-2 space-y-2">
              {u.reports.length === 0 && <li className="text-sm text-muted">Aucun.</li>}
              {u.reports.map((r, i) => (
                <li
                  key={i}
                  className={
                    "rounded-2xl border border-line px-4 py-3 text-sm " +
                    (r.handled ? "opacity-50" : "")
                  }
                >
                  <p>
                    <span className="font-bold">{r.reason || "Sans motif"}</span>
                  </p>
                  <p className="text-xs text-muted">
                    par {r.reporter} · {when(r.at)}
                    {r.handled ? " · traité" : ""}
                  </p>
                </li>
              ))}
            </ul>

            <h2 className="mt-6 font-display text-lg font-bold">
              Messages envoyés à ceux qui l'ont signalé
            </h2>
            <ul className="mt-2 space-y-2">
              {u.sent_to_reporters.length === 0 && (
                <li className="text-sm text-muted">Aucun message privé à ces personnes.</li>
              )}
              {u.sent_to_reporters.map((m, i) => (
                <li key={i} className="rounded-2xl bg-surface px-4 py-3 text-sm">
                  <p className="text-xs text-muted">
                    à {m.to} · {when(m.at)}
                  </p>
                  {m.kind === "text" && <p className="mt-1 break-words">{m.body}</p>}
                  {m.media?.startsWith("sb:") ? (
                    <div className="mt-1"><MediaView kind={m.kind} path={m.media.slice(3)} /></div>
                  ) : m.kind === "image" && m.media ? (
                    <img src={m.media} alt="" className="mt-1 max-h-60 rounded-xl" />
                  ) : null}
                  {m.kind === "audio" && <p className="mt-1 text-muted">🎤 Vocal</p>}
                </li>
              ))}
            </ul>

            <h2 className="mt-6 font-display text-lg font-bold">
              Ses messages dans le chat du quartier
            </h2>
            <ul className="mt-2 space-y-2">
              {u.area_messages.length === 0 && <li className="text-sm text-muted">Aucun.</li>}
              {u.area_messages.map((m) => (
                <li
                  key={m.id}
                  className={
                    "rounded-2xl bg-surface px-4 py-3 text-sm " + (m.removed ? "opacity-40" : "")
                  }
                >
                  <p className="text-xs text-muted">{when(m.at)}</p>
                  <p className="mt-1 break-words">{m.body}</p>
                </li>
              ))}
            </ul>

            <div className="mt-8 space-y-3 border-t border-line pt-6">
              {u.banned ? (
                <button
                  type="button"
                  disabled={busy}
                  className="h-12 w-full rounded-full border border-line"
                  onClick={() => act(admin.ban(adminKey, id, "", false))}
                >
                  Lever le bannissement
                </button>
              ) : (
                <>
                  <input
                    className="h-11 w-full rounded-full border border-line bg-surface px-4 text-base outline-none focus-visible:border-signal"
                    placeholder="Motif du bannissement (facultatif)"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="h-12 w-full rounded-full bg-signal font-bold text-night"
                    onClick={() => act(admin.ban(adminKey, id, banReason, true))}
                  >
                    Bannir
                  </button>
                  <p className="text-xs text-muted">
                    Bannir : la personne disparaît de la carte, ses messages du quartier et ses
                    lieux sont retirés, et elle ne peut plus rien faire sur cet appareil.
                  </p>
                </>
              )}
              {u.reports.some((r) => !r.handled) && !u.banned && (
                <button
                  type="button"
                  disabled={busy}
                  className="h-12 w-full rounded-full border border-line"
                  onClick={() => act(admin.dismiss(adminKey, id))}
                >
                  Classer les signalements (rien à faire)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Photos({ adminKey }: { adminKey: string }) {
  const load = useCallback(() => admin.photos(adminKey), [adminKey]);
  const { data, error, reload } = useLoad<AdminPhotoRow[]>(load, 30000);
  const [busy, setBusy] = useState("");
  const review = (id: string, ok: boolean) => {
    setBusy(id);
    admin
      .reviewPhoto(adminKey, id, ok)
      .then(reload)
      .catch(() => undefined)
      .finally(() => setBusy(""));
  };
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Photos principales signalées automatiquement (contrôle NSFW ou 2 signalements). Tant
        qu'elles sont ici, seul leur auteur les voit. Refuser supprime la photo et bloque sa remise
        en ligne.
      </p>
      {error && <p className="text-signal">{error}</p>}
      {data && data.length === 0 && (
        <p className="py-12 text-center text-muted">Aucune photo en attente.</p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data?.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <img src={p.photo} alt={p.pseudo} className="aspect-square w-full object-cover" />
            <div className="p-2 text-sm">
              <p className="truncate font-bold">{p.pseudo}</p>
              <p className="text-xs text-muted">{when(p.at)}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy === p.id}
                  className="h-9 flex-1 rounded-full bg-online text-night disabled:opacity-40"
                  onClick={() => review(p.id, true)}
                >
                  Valider
                </button>
                <button
                  type="button"
                  disabled={busy === p.id}
                  className="h-9 flex-1 rounded-full border border-signal text-signal disabled:opacity-40"
                  onClick={() => review(p.id, false)}
                >
                  Refuser
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SUBJECTS: Record<string, string> = {
  rgpd: "RGPD / suppression",
  signalement: "Signalement",
  autre: "Autre",
};

function Contacts({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const load = useCallback(() => admin.contacts(adminKey, all), [adminKey, all]);
  const { data, error, reload } = useLoad<AdminContactRow[]>(load, 30000);
  const [busy, setBusy] = useState(0);
  const handle = (id: number) => {
    setBusy(id);
    admin
      .handleContact(adminKey, id)
      .then(reload)
      .catch(() => undefined)
      .finally(() => setBusy(0));
  };
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Afficher
        aussi les messages traités
      </label>
      {error && <p className="text-signal">{error}</p>}
      {data && data.length === 0 && <p className="py-12 text-center text-muted">Aucun message.</p>}
      <ul className="space-y-3">
        {data?.map((c) => (
          <li
            key={c.id}
            className={
              "rounded-2xl border border-line bg-surface p-3 text-sm " +
              (c.handled ? "opacity-50" : "")
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-night px-2 py-0.5 font-bold text-ink">
                {SUBJECTS[c.subject] ?? c.subject}
              </span>
              <span>{when(c.at)}</span>
              {c.user_id && (
                <button type="button" className="underline" onClick={() => onOpen(c.user_id!)}>
                  voir l'utilisateur
                </button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words">{c.body}</p>
            {c.reply_to && (
              <p className="mt-2 text-xs text-muted">
                Répondre à : <span className="select-all text-ink">{c.reply_to}</span>
              </p>
            )}
            {!c.handled && (
              <button
                type="button"
                disabled={busy === c.id}
                className="mt-3 h-9 rounded-full bg-online px-4 text-night disabled:opacity-40"
                onClick={() => handle(c.id)}
              >
                Marquer comme traité
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProposedPlaces({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const load = useCallback(() => adminPlaces.list(adminKey), [adminKey]);
  const { data, error, reload } = useLoad<AdminPlaceRow[]>(load, 30000);
  const [busy, setBusy] = useState("");
  const review = (id: string, ok: boolean) => {
    setBusy(id);
    adminPlaces.review(adminKey, id, ok).then(reload).catch(() => undefined).finally(() => setBusy(""));
  };
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Lieux gratuits proposés par les utilisateurs. Valider les publie sur la carte (couche « Lieux permanents »).</p>
      {error && <p className="text-signal">{error}</p>}
      {data && data.length === 0 && <p className="py-12 text-center text-muted">Aucun lieu en attente.</p>}
      <ul className="space-y-3">
        {data?.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line bg-surface p-3 text-sm">
            <p className="text-xs text-muted">
              {p.kind} · {when(p.at)}
              {p.submitted_by && (
                <button type="button" className="ml-2 underline" onClick={() => onOpen(p.submitted_by!)}>
                  auteur
                </button>
              )}
            </p>
            <p className="mt-1 font-bold">{p.name}</p>
            {p.description && <p className="mt-1 whitespace-pre-wrap">{p.description}</p>}
            <a className="mt-1 inline-block text-xs underline" target="_blank" rel="noopener" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`}>
              {p.lat.toFixed(5)}, {p.lng.toFixed(5)} — voir
            </a>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy === p.id} className="h-9 flex-1 rounded-full bg-online text-night disabled:opacity-40" onClick={() => review(p.id, true)}>
                Valider
              </button>
              <button type="button" disabled={busy === p.id} className="h-9 flex-1 rounded-full border border-signal text-signal disabled:opacity-40" onClick={() => review(p.id, false)}>
                Refuser
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Support : rattache un profil (par pseudo) à la nouvelle session d'un utilisateur (ID support affiché dans ses Paramètres). Journalisé. */
function SupportTab({ adminKey }: { adminKey: string }) {
  const [pseudo, setPseudo] = useState("");
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <section className="max-w-md space-y-3">
      <h2 className="font-display text-xl font-bold">Rattacher un profil perdu</h2>
      <p className="text-sm text-muted">Pseudo du profil d'origine + ID support de la nouvelle session (Paramètres → bas de page). L'ancienne session perd l'accès. Chaque action est journalisée.</p>
      <input className="h-11 w-full rounded-xl border border-line bg-night px-3" placeholder="Pseudo d'origine" value={pseudo} onChange={(e) => setPseudo(e.target.value)} />
      <input className="h-11 w-full rounded-xl border border-line bg-night px-3" placeholder="ID support (8 caractères)" value={target} onChange={(e) => setTarget(e.target.value)} />
      <button type="button" disabled={!pseudo.trim() || target.trim().length < 8} className="h-11 rounded-full bg-signal px-5 font-bold text-night disabled:opacity-40"
        onClick={() => { if (!window.confirm(`Rattacher « ${pseudo} » à la session ${target} ?`)) return; admin.reattach(adminKey, pseudo, target).then((r) => setMsg(`✅ Profil ${r.profile.slice(0, 8)} rattaché.`)).catch((e: Error) => setMsg(`❌ ${e.message}`)); }}>
        Rattacher
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </section>
  );
}

const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const ACT: Record<string, string> = { sessions_30d: "Sessions (30 j)", days_active_30d: "Jours actifs (30 j)", private_msgs: "Messages privés envoyés", area_msgs: "Messages quartier", place_msgs: "Messages lieux", spots_created: "Lieux créés", live_matches: "Rencontres Live", hearts_sent: "Cœurs envoyés" };

/** Liste de tous les profils (recherche + pagination). Aucune position précise, aucun contenu de message. */
function UsersTab({ adminKey, onOpen }: { adminKey: string; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [off, setOff] = useState(0);
  const [data, setData] = useState<{ total: number; rows: import("@/lib/hdar/live").AdminUserRow[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { const t = setTimeout(() => admin.users(adminKey, q.trim(), off).then(setData).catch((e: Error) => setErr(e.message)), 250); return () => clearTimeout(t); }, [adminKey, q, off]);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <input className="h-11 flex-1 rounded-xl border border-line bg-night px-3" placeholder="Rechercher un pseudo ou un ID…" value={q} onChange={(e) => { setQ(e.target.value); setOff(0); }} />
        <span className="text-sm text-muted">{data?.total ?? "…"} profils</span>
      </div>
      {err && <p className="text-signal">{err}</p>}
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface text-muted"><tr>{["Pseudo", "Âge", "Genre", "Inscrit", "Actif", "Région", "hdar+", "Boosts", "❤️ solde/reçus", "Dépensé", "Signal.", "Statut"].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => onOpen(r.id)}>
                <td className="flex items-center gap-2 px-2 py-2 font-bold"><span className="size-7 shrink-0 overflow-hidden rounded-full border border-line"><Avatar src="" name={r.pseudo} className="size-full" /></span>{r.pseudo}{!r.has_photo ? "" : r.photo_status === "approved" ? " 📷" : " ⏳"}</td>
                <td className="px-2">{r.age ?? "—"}</td><td className="px-2">{r.iam ?? "—"}</td>
                <td className="px-2">{r.created ? new Date(r.created).toLocaleDateString("fr-FR") : "—"}</td>
                <td className="px-2">{r.last ? new Date(r.last).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                <td className="px-2">{r.region ?? "—"}</td><td className="px-2">{r.premium ? "👑" : ""}</td><td className="px-2">{r.boosts || ""}</td>
                <td className="px-2">{r.hearts ? `${r.hearts.balance} / ${r.hearts.received}` : "—"}</td><td className="px-2">{r.spent ? eur(r.spent) : "—"}</td>
                <td className="px-2">{r.reports || ""}</td><td className="px-2">{r.banned ? "🚫 banni" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        <button type="button" disabled={off === 0} onClick={() => setOff(Math.max(0, off - 50))} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">← Précédents</button>
        <button type="button" disabled={!data || off + 50 >= data.total} onClick={() => setOff(off + 50)} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Suivants →</button>
      </div>
    </section>
  );
}

/** Détail étendu : activité (compteurs seulement), achats, cadeaux. */
function UserExtra({ adminKey, id }: { adminKey: string; id: string }) {
  const [x, setX] = useState<import("@/lib/hdar/live").AdminUserExtra | null>(null);
  const [kind, setKind] = useState<"premium" | "boost" | "hearts">("premium");
  const [amount, setAmount] = useState(30);
  const [msg, setMsg] = useState("");
  const [out, setOut] = useState("");
  const load = useCallback(() => void admin.userExtra(adminKey, id).then(setX).catch((e: Error) => setOut(e.message)), [adminKey, id]);
  useEffect(load, [load]);
  if (!x) return null;
  return (
    <section className="mb-5 space-y-4 rounded-2xl border border-line bg-surface p-4 text-sm">
      <p>{x.iam ?? "—"} · cherche {x.seeking ?? "—"} · 📍 {x.region ?? "région inconnue"} · inscrit le {x.created ? new Date(x.created).toLocaleDateString("fr-FR") : "—"}</p>
      {x.note && <p className="italic">💬 « {x.note} »</p>}
      {x.bio && <p className="text-muted">{x.bio}</p>}
      <p>👑 hdar+ : {x.premium_until ? `jusqu'au ${new Date(x.premium_until).toLocaleDateString("fr-FR")}` : "non"} · ❤️ solde {x.hearts?.balance ?? 0}, reçus {x.hearts?.received ?? 0}, achetés {x.hearts?.bought ?? 0}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(x.activity).map(([k, v]) => <div key={k} className="rounded-xl bg-night p-2"><b className="block text-lg">{v}</b><span className="text-xs text-muted">{ACT[k] ?? k}</span></div>)}</div>
      <div>
        <h3 className="font-bold">Achats</h3>
        {x.payments.length ? <ul className="mt-1 space-y-1">{x.payments.map((p) => <li key={p.ref} className="flex justify-between gap-2 text-xs"><span>{new Date(p.at).toLocaleString("fr-FR")} · {p.product}</span><b>{eur(p.cents)}</b></li>)}</ul> : <p className="text-xs text-muted">Aucun achat</p>}
      </div>
      <div className="space-y-2 rounded-xl border border-[#fbbf24]/50 p-3">
        <h3 className="font-bold">Offrir un cadeau 🎁</h3>
        <div className="flex flex-wrap gap-2">
          <select className="h-10 rounded-xl border border-line bg-night px-2" value={kind} onChange={(e) => { const k = e.target.value as typeof kind; setKind(k); setAmount(k === "premium" ? 30 : k === "boost" ? 24 : 50); }}>
            <option value="premium">hdar+ (jours)</option><option value="boost">Boost</option><option value="hearts">Cœurs</option>
          </select>
          {kind === "boost" ? (
            <select className="h-10 rounded-xl border border-line bg-night px-2" value={amount} onChange={(e) => setAmount(Number(e.target.value))}><option value={1}>1 h</option><option value={24}>24 h</option><option value={168}>7 jours</option></select>
          ) : <input type="number" min={1} className="h-10 w-24 rounded-xl border border-line bg-night px-2" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />}
        </div>
        <input className="h-10 w-full rounded-xl border border-line bg-night px-3" placeholder="Message (facultatif), affiché à l'utilisateur" value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} />
        <button type="button" className="h-10 rounded-full bg-[#fbbf24] px-4 font-bold text-night" onClick={() => { if (!window.confirm("Offrir ce cadeau ?")) return; admin.gift(adminKey, id, kind, amount, msg).then((r) => { setOut(`✅ Offert : ${r.label}`); setMsg(""); load(); }).catch((e: Error) => setOut(`❌ ${e.message}`)); }}>Offrir</button>
        {out && <p className="text-xs">{out}</p>}
        {x.gifts.length > 0 && <ul className="text-xs text-muted">{x.gifts.map((g, i) => <li key={i}>{new Date(g.at).toLocaleString("fr-FR")} · {g.detail.kind} {g.detail.amount}{g.detail.msg ? ` · « ${g.detail.msg} »` : ""}</li>)}</ul>}
      </div>
    </section>
  );
}

/** Nouveautés par email : uniquement aux utilisateurs avec email lié ET opt-in. Lien de désinscription ajouté automatiquement. */
function EmailsTab({ adminKey }: { adminKey: string }) {
  const [info, setInfo] = useState<{ optin: number; history: { at: string; subject: string; recipients: number }[] } | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [test, setTest] = useState("");
  const [tpl, setTpl] = useState<Tpl>("news");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => void import("@/lib/hdar/live").then((m) => m.adminNewsInfo(adminKey)).then(setInfo).catch((e: Error) => setOut(e.message)), [adminKey]);
  useEffect(load, [load]);
  const send = async (t?: string) => {
    if (!t && !window.confirm(`Envoyer à ${info?.optin ?? 0} abonné(s) ?`)) return;
    setBusy(true); setOut("");
    try { const m = await import("@/lib/hdar/live"); const r = await m.adminNewsSend(subject, body, t, { template: tpl, title, code: code || undefined }); setOut(`✅ Envoyé à ${r.sent}`); if (!t) load(); }
    catch (e) { setOut(`❌ ${(e as Error).message}`); } finally { setBusy(false); }
  };
  return (
    <section className="max-w-xl space-y-3">
      <p className="text-sm text-muted">Expéditeur : <b>hdar &lt;contact@hdar.chat&gt;</b> · {info?.optin ?? "…"} abonné(s) (email lié + « Recevoir les nouveautés »). Un lien « Se désinscrire » est ajouté à chaque email.</p>
      <div className="flex gap-2">{([["news", "✨ Nouveautés"], ["gift", "🎁 Cadeau / code"], ["invite", "💌 Invite tes amis"]] as const).map(([k, l]) => (
        <button key={k} type="button" onClick={() => setTpl(k)} className={"flex-1 rounded-full py-2 text-xs font-bold " + (tpl === k ? "bg-[#FA6F6C] text-night" : "border border-line")}>{l}</button>))}</div>
      <div className="flex gap-2">
        <input className="h-11 flex-1 rounded-xl border border-line bg-night px-3" placeholder="Titre du bandeau (optionnel)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="h-11 w-36 rounded-xl border border-line bg-night px-3 font-mono" placeholder="CODE (opt.)" maxLength={24} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </div>
      <input className="h-11 w-full rounded-xl border border-line bg-night px-3" placeholder="Sujet" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="h-48 w-full rounded-xl border border-line bg-night p-3" placeholder="Message (texte simple, les retours à la ligne sont gardés)" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <input className="h-10 flex-1 rounded-xl border border-line bg-night px-3" placeholder="Email de test" value={test} onChange={(e) => setTest(e.target.value)} />
        <button type="button" disabled={busy || !subject || !body || !/^\S+@\S+$/.test(test)} onClick={() => void send(test)} className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-40">Envoyer un test</button>
        <button type="button" disabled={busy || !subject || !body || !info?.optin} onClick={() => void send()} className="h-10 rounded-full bg-[#3EE08F] px-4 text-sm font-bold text-night disabled:opacity-40">Envoyer à tous</button>
      </div>
      {out && <p className="text-sm">{out}</p>}
      <p className="text-xs text-muted">Aperçu</p>
      <iframe title="Aperçu email" className="h-[640px] w-full rounded-2xl border border-line bg-[#0b0b10]" srcDoc={mailHtml(body || "Ton message ici…", "#", tpl, { code, title })} />
      {!!info?.history.length && <ul className="text-xs text-muted">{info.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("fr-FR")} · {h.subject} · {h.recipients} envoi(s)</li>)}</ul>}
    </section>
  );
}

function ProGiftsTab({ adminKey }: { adminKey: string }) {
  const [g, setG] = useState<Awaited<ReturnType<typeof adminProGifts>> | null>(null);
  const [t, setT] = useState<Awaited<ReturnType<typeof adminProThreads>>>([]);
  useEffect(() => { void adminProGifts(adminKey).then(setG).catch((e: Error) => toast(e.message)); void adminProThreads(adminKey).then(setT).catch(() => undefined); }, [adminKey]);
  if (!g) return <p className="text-sm text-muted">Chargement…</p>;
  return (
    <div className="space-y-4">
      <section>
        <h3 className="font-display font-bold">Cadeaux pro ({g.length})</h3>
        <div className="mt-2 space-y-2">{g.map((x) => (
          <div key={x.id} className={"rounded-2xl border p-3 text-sm " + (x.reported ? "border-signal" : "border-line")}>
            <p><b>{x.place}</b> → {x.to ?? "?"} · {x.via} · {new Date(x.at).toLocaleString("fr-FR")}</p>
            <p>🎁 {x.title}{x.description ? ` — ${x.description}` : ""}{x.code ? ` · code ${x.code}` : ""} · jusqu'au {new Date(x.expires).toLocaleDateString("fr-FR")}</p>
            {x.reported && <p className="text-xs text-signal">Signalé : {x.reason}</p>}
          </div>))}</div>
      </section>
      <section>
        <h3 className="font-display font-bold">Conversations pro ({t.length})</h3>
        <div className="mt-2 space-y-1 text-sm">{t.map((x, i) => <p key={i} className={x.reported ? "text-signal" : ""}>{new Date(x.at).toLocaleString("fr-FR")} · <b>{x.place}</b> → {x.to ?? "?"}{x.reported ? " · signalé" : ""}</p>)}</div>
      </section>
    </div>
  );
}

function CodesTab({ adminKey }: { adminKey: string }) {
  const [rows, setRows] = useState<GiftCode[] | null>(null);
  const [f, setF] = useState({ kind: "premium", amount: 7, maxUses: 100, days: 30, code: "", note: "" });
  const load = useCallback(() => void adminCodes(adminKey).then(setRows).catch((e: Error) => toast(e.message)), [adminKey]);
  useEffect(load, [load]);
  const create = async () => { try { const r = await adminCodeCreate(adminKey, f); toast(`Code ${r.code} créé`); setF({ ...f, code: "" }); load(); } catch (e) { toast((e as Error).message); } };
  const mail = async (c: GiftCode) => {
    const what = c.kind === "premium" ? `${c.amount} jours de hdar+` : c.kind === "boost" ? `un boost de ${c.amount} h` : `${c.amount} cœurs`;
    if (!window.confirm(`Envoyer le code ${c.code} (${what}) à tous les abonnés aux nouveautés ?`)) return;
    try { const r = await adminNewsSend(`🎁 ${what} offerts sur hdar`, `On a un petit cadeau pour toi : ${what}.\nEntre ce code dans Profil → Paramètres → « J'ai un code ».`, undefined, { template: "gift", code: c.code, title: `${what} offerts` }); toast(`Envoyé à ${r.sent}`); }
    catch (e) { toast((e as Error).message); }
  };
  const inp = "h-10 rounded-xl border border-line bg-night px-3 text-sm";
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-line p-4">
        <h3 className="font-display font-bold">Créer un code cadeau</h3>
        <div className="flex flex-wrap gap-2">
          <select className={inp} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="premium">hdar+ (jours)</option><option value="boost">Boost (heures)</option><option value="hearts">Cœurs</option></select>
          <label className="text-xs">Quantité <input type="number" className={inp + " w-20"} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></label>
          <label className="text-xs">Utilisations max <input type="number" className={inp + " w-24"} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: Number(e.target.value) })} /></label>
          <label className="text-xs">Expire dans (j, 0 = jamais) <input type="number" className={inp + " w-20"} value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /></label>
          <input className={inp + " font-mono"} placeholder="CODE (auto si vide)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <input className={inp + " flex-1"} placeholder="Note interne" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        <button type="button" onClick={() => void create()} className="h-10 rounded-full bg-[#3EE08F] px-5 text-sm font-bold text-night">Créer</button>
        <p className="text-xs text-muted">Une seule utilisation par profil. L'envoi par email ne part qu'aux abonnés « nouveautés » (RGPD).</p>
      </section>
      {rows?.map((c) => (
        <div key={c.code} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-sm">
          <b className="font-mono">{c.code}</b>
          <span className="flex-1 text-muted">{c.kind === "premium" ? `${c.amount} j hdar+` : c.kind === "boost" ? `boost ${c.amount} h` : `${c.amount} cœurs`} · {c.uses}/{c.max_uses}{c.expires_at ? ` · jusqu'au ${new Date(c.expires_at).toLocaleDateString("fr-FR")}` : ""}{c.note ? ` · ${c.note}` : ""}</span>
          <button type="button" onClick={() => void navigator.clipboard.writeText(c.code)} className="text-xs underline">Copier</button>
          <button type="button" onClick={() => void mail(c)} className="rounded-full border border-line px-3 py-1 text-xs">✉️ Envoyer</button>
        </div>))}
    </div>
  );
}

function PartnersTab({ adminKey }: { adminKey: string }) {
  const [rows, setRows] = useState<AdminPartner[] | null>(null);
  const [sort, setSort] = useState<"revenue" | "views">("revenue");
  const [open, setOpen] = useState<AdminPartner | null>(null);
  useEffect(() => void adminPartners(adminKey).then(setRows).catch((e: Error) => toast(e.message)), [adminKey]);
  if (open) return <ProDashboard id={open.id} name={open.name} onBack={() => setOpen(null)} readOnly />;
  if (!rows) return <p className="text-sm text-muted">Chargement…</p>;
  const list = [...rows].sort((a, b) => b[sort] - a[sort]);
  const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const tot = rows.reduce((t, r) => ({ revenue: t.revenue + r.revenue, views: t.views + r.views, live: t.live + r.live, gifts: t.gifts + r.gifts, boosts: t.boosts + r.boosts, active: t.active + (r.active ? 1 : 0) }), { revenue: 0, views: 0, live: 0, gifts: 0, boosts: 0, active: 0 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
        {([["Partenaires actifs", `${tot.active}/${rows.length}`], ["CA total", eur(tot.revenue)], ["Vues (30 j)", tot.views], ["Spectateurs Live Pro", tot.live], ["Cadeaux pro", tot.gifts], ["Boosts Pro", tot.boosts]] as const).map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line p-2"><b className="block text-lg">{v}</b><span className="text-muted">{l}</span></div>))}
      </div>
      <div className="flex gap-2 text-xs">Trier : {(["revenue", "views"] as const).map((k) => <button key={k} type="button" onClick={() => setSort(k)} className={"rounded-full px-3 py-1 " + (sort === k ? "bg-[#3EE08F] font-bold text-night" : "border border-line")}>{k === "revenue" ? "CA" : "Vues"}</button>)}</div>
      {list.length === 0 && <p className="text-sm text-muted">Aucun partenaire pour l'instant.</p>}
      {list.map((r) => (
        <button key={r.id} type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left text-sm">
          <span className="min-w-0 flex-1"><b className="block truncate">{r.name}</b>
            <span className="text-xs text-muted">{r.active ? `✅ actif jusqu'au ${new Date(r.until!).toLocaleDateString("fr-FR")}` : "⏸️ inactif"}{r.sub ? ` · abo ${r.sub}` : ""}{r.pro_boost_until && new Date(r.pro_boost_until) > new Date() ? " · ⭐ boosté" : ""}</span></span>
          <span className="text-right text-xs"><b className="block text-sm">{eur(r.revenue)}</b>{r.views} vues · {r.boosts} boost(s)</span>
        </button>))}
    </div>
  );
}
