import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, LogOut, RefreshCw } from "lucide-react";
import {
  admin,
  pgTime,
  type AdminAreaRow,
  type AdminBanRow,
  type AdminReportRow,
  type AdminStats,
  type AdminUser,
} from "@/lib/hdar/live";
import { Avatar } from "./avatar";

const KEY_STORE = "hdar-admin-key";
type Tab = "stats" | "reports" | "area" | "bans";

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
  const [tab, setTab] = useState<Tab>("stats");
  const [userId, setUserId] = useState<string | null>(null);
  const [openReports, setOpenReports] = useState(0);

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
              ["stats", "Tableau de bord"],
              ["reports", `Signalements${openReports ? ` (${openReports})` : ""}`],
              ["area", "Chat du quartier"],
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
        {tab === "stats" && <Stats adminKey={adminKey} onReports={setOpenReports} />}
        {tab === "reports" && <Reports adminKey={adminKey} onOpen={setUserId} />}
        {tab === "area" && <Area adminKey={adminKey} onOpen={setUserId} />}
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
                  {m.kind === "image" && m.media && (
                    <img src={m.media} alt="" className="mt-1 max-h-60 rounded-xl" />
                  )}
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
