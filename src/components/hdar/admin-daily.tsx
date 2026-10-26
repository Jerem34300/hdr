import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "./avatar";
import { adminDaily, type AdminDaily, type DailyRow } from "@/lib/hdar/live";

const today = () => new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
const dayLabel = (d: string, long = false) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", ...(long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "numeric" }) });
const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const hour = (t: string) => new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const KIND: Record<string, string> = { premium: "hdar+", boost: "Boost", hearts: "Cœurs", listing: "Fiche pro", spot: "Spot", ad: "Annonce" };

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Onglet « Jour par jour » : tableau des 30 derniers jours + détail du jour choisi. */
export function DailyTab({ adminKey, onOpen, demo, note }: { adminKey: string; onOpen?: (id: string) => void; demo?: AdminDaily; note?: string }) {
  const [day, setDay] = useState(demo?.day.day ?? today());
  const [data, setData] = useState<AdminDaily | null>(demo ?? null);
  useEffect(() => {
    if (demo) return;
    void adminDaily(adminKey, day).then(setData).catch((e: Error) => toast(e.message));
  }, [adminKey, day, demo]);
  const row: DailyRow | undefined = data?.days.find((r) => r.day === day);
  const d = data?.day;
  const sum = (k: keyof DailyRow) => (data?.days ?? []).reduce((n, r) => n + (r[k] as number), 0);
  return (
    <div className="space-y-4">
      {note && <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">{note}</p>}
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Jour précédent" onClick={() => setDay(new Date(new Date(`${day}T12:00:00`).getTime() - 864e5).toLocaleDateString("fr-CA"))} className="h-10 w-10 rounded-full border border-line">‹</button>
        <input type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-10 flex-1 rounded-full border border-line bg-night px-4 text-sm" />
        <button type="button" aria-label="Jour suivant" disabled={day >= today()} onClick={() => setDay(new Date(new Date(`${day}T12:00:00`).getTime() + 864e5).toLocaleDateString("fr-CA"))} className="h-10 w-10 rounded-full border border-line disabled:opacity-30">›</button>
      </div>
      <h3 className="font-display text-lg font-bold first-letter:uppercase">{dayLabel(day, true)}</h3>
      {!data ? <p className="text-sm text-muted">Chargement…</p> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Nouveaux inscrits" value={row?.signups ?? d?.profiles.length ?? 0} hint="profils créés ce jour" />
            <Tile label="Visites" value={row?.visits ?? 0} hint={`${row?.devices ?? 0} appareils · ${row?.new_devices ?? 0} nouveaux`} />
            <Tile label="Départs" value={row?.departures ?? 0} hint={d?.departures.visiteur ? `+ ${d.departures.visiteur} visiteurs sans profil` : "profils supprimés"} />
            <Tile label="Revenus" value={eur(row?.revenue_cents ?? 0)} hint={`${row?.payments ?? 0} paiement${(row?.payments ?? 0) > 1 ? "s" : ""}`} />
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="mb-2 font-display font-bold">Profils créés ({d?.profiles.length ?? 0})</h3>
            {!d?.profiles.length ? <p className="text-sm text-muted">Aucun profil créé ce jour-là.</p> : (
              <ul className="divide-y divide-line/50">
                {d.profiles.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpen?.(p.id)} className="flex w-full items-center gap-2 py-2 text-left">
                      <Avatar src={p.photo ?? ""} name={p.pseudo} className="size-9 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{p.pseudo}{p.age ? `, ${p.age} ans` : ""}</span>
                        <span className="block truncate text-xs text-muted">{p.city || "ville inconnue"}{p.ref ? ` · via ${p.ref}` : ""}</span>
                      </span>
                      <span className="text-xs text-muted">{hour(p.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="mb-2 font-display font-bold">D'où ils viennent</h3>
            {!d?.sources.length ? <p className="text-sm text-muted">Rien ce jour-là.</p> : (
              <table className="w-full whitespace-nowrap text-xs">
                <thead className="text-left text-muted"><tr><th className="py-1">Source</th><th className="text-right">Visites</th><th className="pl-1.5 text-right">App.</th><th className="pl-1.5 text-right">Profils</th><th className="pl-1.5 text-right">Revenus</th></tr></thead>
                <tbody>{d.sources.map((s) => (
                  <tr key={s.ref} className="border-t border-line/60"><td className="max-w-[8rem] truncate py-1.5 font-bold">{s.ref}</td><td className="text-right">{s.ref === "(sans lien)" ? "—" : s.visits}</td><td className="pl-1.5 text-right">{s.ref === "(sans lien)" ? "—" : s.devices}</td><td className="pl-1.5 text-right">{s.profiles}</td><td className="pl-1.5 text-right">{eur(s.revenue_cents)}</td></tr>
                ))}</tbody>
              </table>
            )}
            {d && Object.keys(d.platforms).length > 0 && <p className="mt-2 text-xs text-muted">Appareils : {Object.entries(d.platforms).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="mb-2 font-display font-bold">Ce que ça rapporte</h3>
            {!d?.revenue.length ? <p className="text-sm text-muted">Aucun paiement ce jour-là.</p> : (
              <ul className="space-y-1 text-sm">{d.revenue.map((r) => <li key={r.kind} className="flex justify-between"><span>{KIND[r.kind] ?? r.kind} × {r.cnt}</span><span className="font-bold">{eur(r.cents)}</span></li>)}</ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="mb-1 font-display font-bold">30 derniers jours</h3>
            <p className="mb-2 text-xs text-muted">Total : {sum("signups")} inscrits · {sum("visits")} visites · {sum("departures")} départs · {eur(sum("revenue_cents"))}. Touche une ligne pour voir le jour.</p>
            <table className="w-full whitespace-nowrap text-xs">
              <thead className="text-left text-muted"><tr><th className="py-1">Jour</th><th className="text-right">Inscrits</th><th className="pl-1.5 text-right">Visites</th><th className="pl-1.5 text-right">App.</th><th className="pl-1.5 text-right">Départs</th><th className="pl-1.5 text-right">€</th></tr></thead>
              <tbody>{data.days.map((r) => (
                <tr key={r.day} onClick={() => setDay(r.day)} className={"cursor-pointer border-t border-line/60 " + (r.day === day ? "bg-signal/15" : "")}>
                  <td className="py-1.5 text-muted">{dayLabel(r.day)}</td><td className="text-right font-bold">{r.signups}</td><td className="pl-1.5 text-right">{r.visits}</td><td className="pl-1.5 text-right">{r.devices}</td><td className="pl-1.5 text-right">{r.departures}</td><td className="pl-1.5 text-right">{r.revenue_cents ? eur(r.revenue_cents) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Heure de Paris. Agrégats seulement : pas d'IP, pas d'email, pas de position. Départs = compteur anonyme (suivi depuis la mise en ligne de cet onglet). Visites = ouvertures de l'appli par les appareils passés l'écran 18+.</p>
        </>
      )}
    </div>
  );
}

/** Aperçu de dev : tableau = chiffres réels prod (agrégats lus le 26/10), détail du jour = DÉMO (pseudos fictifs). */
export function DailyTabDemo() {
  const real: [string, number, number, number, number][] = [
    ["2026-10-26", 16, 64, 39, 33], ["2026-10-25", 15, 69, 43, 25], ["2026-10-24", 8, 55, 35, 22], ["2026-10-23", 6, 68, 30, 21], ["2026-10-22", 2, 26, 19, 9],
    ["2026-10-21", 4, 33, 16, 13], ["2026-10-20", 2, 46, 32, 22], ["2026-10-19", 2, 36, 15, 10], ["2026-10-18", 13, 66, 37, 32], ["2026-10-17", 3, 32, 18, 14],
    ["2026-10-16", 1, 23, 11, 7], ["2026-10-15", 2, 26, 10, 7], ["2026-10-14", 3, 22, 12, 14], ["2026-10-13", 8, 28, 20, 22],
  ];
  const days: DailyRow[] = real.map(([day, signups, visits, devices, new_devices]) => ({ day, signups, visits, devices, new_devices, departures: 0, revenue_cents: 0, payments: 0 }));
  const at = (h: string) => `2026-10-26T${h}:00+01:00`;
  const demo: AdminDaily = {
    days,
    day: {
      day: "2026-10-26",
      profiles: [
        { id: "d1", pseudo: "Démo_Lune", age: 27, city: "Montpellier", photo: null, at: at("21:40"), ref: "expose_twittos" },
        { id: "d2", pseudo: "Démo_Marco", age: 34, city: "Agde", photo: null, at: at("19:05"), ref: null },
        { id: "d3", pseudo: "Démo_Sam", age: 22, city: "Sète", photo: null, at: at("16:12"), ref: "next1" },
        { id: "d4", pseudo: "Démo_Alex", age: 41, city: null, photo: null, at: at("11:30"), ref: null },
      ],
      sources: [{ ref: "(sans lien)", visits: 0, devices: 0, profiles: 14, revenue_cents: 0 }, { ref: "expose_twittos", visits: 1, devices: 1, profiles: 1, revenue_cents: 0 }, { ref: "next1", visits: 2, devices: 2, profiles: 1, revenue_cents: 0 }],
      revenue: [],
      departures: {},
      platforms: { android: 21, ios: 12, ordinateur: 6 },
    },
  };
  return (
    <main className="min-h-dvh bg-night px-4 pt-6 pb-10 text-ink">
      <h1 className="mb-3 font-display text-2xl font-extrabold">Admin · Jour par jour</h1>
      <DailyTab adminKey="" demo={demo} note="Aperçu : tableau 30 jours et tuiles = chiffres réels de prod (lecture seule, 26/10). Profils du jour, sources et appareils = DÉMO (pseudos fictifs « Démo_… »). Départs et revenus = 0 réel (pas encore suivis / aucun paiement)." />
    </main>
  );
}
