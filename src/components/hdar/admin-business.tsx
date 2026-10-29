import { useCallback, useState } from "react";
import { toast } from "sonner";
import { business, type AdminComment, type Growth, type PricingRow, type RoiRow } from "@/lib/hdar/live";
import { Card, HeatMapView, Kpi, Period, euros, fmt, nearestCity, pct, useAsync } from "./admin-analytics";
import { PLACE_KINDS } from "./places-layer";

const delta = (now: number, prev: number | null) => {
  if (!prev) return <span className="text-online">nouveau</span>;
  const d = Math.round(((now - prev) / prev) * 100);
  return <span className={d >= 0 ? "text-online" : "text-signal"}>{d >= 0 ? "+" : ""}{d} %</span>;
};

export function HourBars({ hours }: { hours: { hour: number; n: number }[] }) {
  const max = Math.max(1, ...hours.map((h) => h.n));
  const by = new Map(hours.map((h) => [h.hour, h.n]));
  return (
    <div className="flex h-24 items-end gap-[2px]">
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${h} h : ${by.get(h) ?? 0}`}>
          <div className="w-full rounded-t bg-signal" style={{ height: `${((by.get(h) ?? 0) / max) * 80}px` }} />
          {h % 3 === 0 && <span className="text-[9px] text-muted">{h}h</span>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- croissance & revenus
export function GrowthTab({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(30);
  const load = useCallback(() => business.growth(adminKey, days), [adminKey, days]);
  const { data: g, error } = useAsync<Growth>(load);
  const byCity = new Map<string, { cents: number; payers: number }>();
  for (const z of g?.revenue_zones ?? []) {
    const n = nearestCity(z.lat, z.lng);
    const c = byCity.get(n) ?? { cents: 0, payers: 0 };
    c.cents += z.cents;
    c.payers += z.payers;
    byCity.set(n, c);
  }
  return (
    <div>
      <Period value={days} onChange={setDays} />
      {error && <p className="mt-3 text-signal">{error}</p>}
      {g && (
        <>
          <Card title="Entonnoir (nouveaux visiteurs de la période)">
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Visite" value={fmt(g.funnel.visitors)} />
              <Kpi label="Profil créé" value={fmt(g.funnel.profiles)} hint={pct(g.funnel.profiles, g.funnel.visitors)} />
              <Kpi label="1er message" value={fmt(g.funnel.first_message)} hint={pct(g.funnel.first_message, g.funnel.visitors)} accent />
            </div>
          </Card>
          <Card title="Fidélité">
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Revient la 2e semaine (S1)" value={pct(g.retention.w1, g.retention.w1_cohort)} hint={`${g.retention.w1}/${g.retention.w1_cohort} visiteurs`} />
              <Kpi label="Revient après 1 mois (M1)" value={pct(g.retention.m1, g.retention.m1_cohort)} hint={`${g.retention.m1}/${g.retention.m1_cohort} visiteurs`} />
            </div>
          </Card>
          <Card title="Revenus">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Total" value={euros(g.revenue.total)} accent />
              <Kpi label="Lieux partenaires" value={euros(g.revenue.listings)} />
              <Kpi label="Boosts" value={euros(g.revenue.boosts)} />
              <Kpi label="hdar+" value={euros(g.revenue.premium ?? 0)} />
              <Kpi label="Cœurs du Live" value={euros(g.revenue.hearts ?? 0)} />
              <Kpi label="Paiements" value={fmt(g.revenue.count)} hint={`${g.revenue.payers} payeurs`} />
              <Kpi label="Revenu / payeur" value={g.revenue.payers ? euros(Math.round(g.revenue.total / g.revenue.payers)) : "—"} />
              <Kpi label="Revenu / utilisateur actif (30 j)" value={g.revenue.mau ? euros(Math.round(g.revenue.total / g.revenue.mau)) : "—"} />
            </div>
            {byCity.size > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {[...byCity].sort((a, b) => b[1].cents - a[1].cents).map(([n, c]) => (
                  <li key={n} className="flex justify-between rounded-xl bg-night px-3 py-2">
                    <span>{n}</span>
                    <span className="tabular-nums">{euros(c.cents)} · {c.payers} payeur(s) · {euros(Math.round(c.cents / Math.max(1, c.payers)))}/payeur</span>
                  </li>
                ))}
              </ul>
            )}
            {g.payments.length === 0 ? (
              <p className="mt-3 text-xs text-muted">Aucun paiement sur la période.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-xs">
                {g.payments.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-line py-1">
                    <span>{new Date(p.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} · {p.kind === "boost" ? "Boost" : p.kind === "pro_boost" ? "Boost Pro" : p.kind === "place_boost" ? "Boost de lieu" : p.kind === "premium" ? "hdar+" : p.kind === "hearts" ? "Cœurs" : `Lieu ${p.place ?? ""}`} · {p.product}</span>
                    <b>{euros(p.cents)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Zones en hausse (7 j vs 7 j précédents)">
            {g.trend_zones.length === 0 && <p className="text-xs text-muted">Pas encore assez d'historique.</p>}
            <ul className="space-y-1 text-sm">
              {g.trend_zones.map((z, i) => (
                <li key={i} className="flex justify-between rounded-xl bg-night px-3 py-2">
                  <span>{nearestCity(z.lat, z.lng)}</span>
                  <span className="tabular-nums">{fmt(z.now)} présences · {delta(z.now, z.prev)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Lieux en hausse (7 j vs 7 j précédents)">
            {g.trend_places.length === 0 && <p className="text-xs text-muted">Pas encore assez d'historique.</p>}
            <ul className="space-y-1 text-sm">
              {g.trend_places.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 rounded-xl bg-night px-3 py-2">
                  <span className="truncate">{PLACE_KINDS[p.kind as keyof typeof PLACE_KINDS]?.icon} {p.name} · <span className="text-muted">{nearestCity(p.lat, p.lng)}</span></span>
                  <span className="shrink-0 tabular-nums">score {fmt(p.now)} · {delta(p.now, p.prev)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ROI lieux
export function RoiTab({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => business.roi(adminKey, days), [adminKey, days]);
  const { data, error } = useAsync<RoiRow[]>(load);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Period value={days} onChange={setDays} />
        <p className="text-xs text-muted">Partenaires d'abord. Coût par visiteur et par clic = revenu de la période ÷ visiteurs / clics.</p>
      </div>
      {error && <p className="text-signal">{error}</p>}
      <ul className="space-y-2">
        {data?.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line bg-surface p-3 text-sm">
            <button type="button" className="flex w-full items-center gap-2 text-start" onClick={() => setOpen(open === p.id ? null : p.id)}>
              <span className="text-xl">{PLACE_KINDS[p.kind as keyof typeof PLACE_KINDS]?.icon ?? "📌"}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">
                  {p.name} {p.partner && <span className={"ms-1 rounded-full px-2 text-[10px] text-night " + (p.active ? "bg-[#f472b6]" : "bg-muted")}>{p.active ? "PARTENAIRE" : "INACTIF"}</span>}
                </b>
                <span className="text-xs text-muted">{nearestCity(p.lat, p.lng)} · {p.avg_stars ?? "—"}★ ({p.ratings}) · {p.comments} avis</span>
              </span>
            </button>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] text-muted sm:grid-cols-7">
              {([
                ["Vues", fmt(p.views)], ["Visiteurs", fmt(p.visitors)], ["Clics site", fmt(p.clicks)], ["Messages", fmt(p.messages)],
                ["Revenu", euros(p.revenue_cents)],
                ["€ / visiteur", p.revenue_cents && p.visitors ? euros(Math.round(p.revenue_cents / p.visitors)) : "—"],
                ["€ / clic", p.revenue_cents && p.clicks ? euros(Math.round(p.revenue_cents / p.clicks)) : "—"],
              ] as const).map(([l, v]) => (
                <span key={l} className="rounded-lg bg-night px-1 py-1"><b className="block text-sm text-ink tabular-nums">{v}</b>{l}</span>
              ))}
            </div>
            {open === p.id && <Origin adminKey={adminKey} place={p.id} days={days} />}
          </li>
        ))}
      </ul>
      {data?.length === 0 && <p className="py-10 text-center text-muted">Aucune donnée.</p>}
    </div>
  );
}

function Origin({ adminKey, place, days }: { adminKey: string; place: string; days: number }) {
  const load = useCallback(() => business.origin(adminKey, place, days), [adminKey, place, days]);
  const { data } = useAsync(load);
  if (!data) return <p className="mt-2 text-xs text-muted">Chargement…</p>;
  if (!data.zones.length) return <p className="mt-2 text-xs text-muted">Pas encore de zone d'origine (renseignée quand le visiteur a activé sa position).</p>;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-bold">D'où viennent les visiteurs (carreaux ~5 km)</p>
      <HeatMapView points={data.zones.map((z) => ({ lat: z.lat, lng: z.lng, w: z.n, label: `${z.n}` }))} height={220} />
      <p className="mt-2 mb-1 text-xs font-bold">À quelle heure</p>
      <HourBars hours={data.hours} />
    </div>
  );
}

// ---------------------------------------------------------------- avis
export function CommentsTab({ adminKey }: { adminKey: string }) {
  const [reported, setReported] = useState(true);
  const load = useCallback(() => business.comments(adminKey, reported), [adminKey, reported]);
  const { data, error, reload } = useAsync<AdminComment[]>(load);
  const act = (id: string, a: "hide" | "show" | "delete" | "ok") =>
    business.moderate(adminKey, id, a).then(reload).catch((e: Error) => toast(e.message));
  return (
    <div>
      <div className="mb-3 flex gap-2 text-sm">
        <button type="button" className={"h-9 rounded-full border px-3 " + (reported ? "border-signal bg-signal text-night" : "border-line")} onClick={() => setReported(true)}>Signalés</button>
        <button type="button" className={"h-9 rounded-full border px-3 " + (!reported ? "border-signal bg-signal text-night" : "border-line")} onClick={() => setReported(false)}>Tous</button>
      </div>
      {error && <p className="text-signal">{error}</p>}
      {data?.length === 0 && <p className="py-10 text-center text-muted">Rien à modérer.</p>}
      <ul className="space-y-2">
        {data?.map((c) => (
          <li key={c.id} className={"rounded-2xl border bg-surface p-3 text-sm " + (c.reports ? "border-signal" : "border-line")}>
            <p className="text-xs text-muted">
              {c.pseudo} sur <b className="text-ink">{c.place}</b> · {new Date(c.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
              {c.hidden && " · MASQUÉ"} {c.reports > 0 && <span className="text-signal">· {c.reports} signalement(s)</span>}
            </p>
            <p className="mt-1 break-words">{c.body}</p>
            {c.reasons?.length ? <p className="mt-1 text-xs text-muted">Motifs : {c.reasons.join(" · ")}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button type="button" className="h-8 rounded-full border border-line px-3" onClick={() => act(c.id, c.hidden ? "show" : "hide")}>{c.hidden ? "Réafficher" : "Masquer"}</button>
              <button type="button" className="h-8 rounded-full border border-signal px-3 text-signal" onClick={() => act(c.id, "delete")}>Supprimer</button>
              {c.reports > 0 && <button type="button" className="h-8 rounded-full border border-line px-3" onClick={() => act(c.id, "ok")}>Signalement non fondé</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- tarifs
export function PricingTab({ adminKey }: { adminKey: string }) {
  const load = useCallback(() => business.pricing(adminKey), [adminKey]);
  const { data, error, reload } = useAsync<PricingRow[]>(load);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Prix TTC en euros. Un changement s'applique aux nouveaux paiements ; les abonnements en cours gardent leur prix chez Stripe.
      </p>
      {error && <p className="text-signal">{error}</p>}
      <ul className="space-y-2">
        {data?.map((p) => <PriceEditor key={p.product + p.price_cents + p.active + p.label} p={p} onSave={(l, c, a) =>
          business.pricingSet(adminKey, p.product, l, c, a).then(() => { toast("Tarif enregistré"); reload(); }).catch((e: Error) => toast(e.message))} />)}
      </ul>
    </div>
  );
}

function PriceEditor({ p, onSave }: { p: PricingRow; onSave: (label: string, cents: number, active: boolean) => void }) {
  const [label, setLabel] = useState(p.label);
  const [price, setPrice] = useState((p.price_cents / 100).toFixed(2));
  const [active, setActive] = useState(p.active);
  const cents = Math.round(Number(price.replace(",", ".")) * 100);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
      <span className="w-32 text-xs text-muted">{p.kind === "boost" ? "✨ Boost" : p.kind === "pro_boost" ? "⭐ Boost Pro" : p.kind === "place_boost" ? "🌟 Boost de lieu" : p.kind === "premium" ? "👑 hdar+" : p.kind === "hearts" ? "❤️ Cœurs" : "📍 Lieu partenaire"}<br />{p.product}</span>
      <input className="h-10 w-32 rounded-xl border border-line bg-night px-3" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="h-10 w-24 rounded-xl border border-line bg-night px-3 text-end" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <span>€{p.kind === "listing" || p.kind === "premium" ? " / période (renouvelé)" : ""}</span>
      <label className="flex items-center gap-1"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> En vente</label>
      <button type="button" disabled={!Number.isFinite(cents) || cents < 0} className="ms-auto h-9 rounded-full bg-signal px-4 font-bold text-night disabled:opacity-50" onClick={() => onSave(label, cents, active)}>
        Enregistrer
      </button>
    </li>
  );
}
