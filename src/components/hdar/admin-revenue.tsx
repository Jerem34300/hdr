import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminRevenue, type Revenue } from "@/lib/hdar/live";

const PERIODS = [["today", "Aujourd'hui"], ["7d", "7 j"], ["30d", "30 j"], ["month", "Ce mois"], ["all", "Tout"]] as const;
const SOURCES: [string, string][] = [
  ["premium_week", "hdar+ hebdo"], ["premium_month", "hdar+ mensuel"],
  ["boost_1h", "Boost profil 1 h"], ["boost_24h", "Boost profil 24 h"], ["boost_7d", "Boost profil 7 j"],
  ["place_boost", "Boost de lieu"], ["hearts", "Packs de cœurs"], ["listing", "Abonnement partenaire"], ["pro_boost", "Boost Pro"],
];
const keyOf = (s: { kind: string; product: string }) => (s.kind === "premium" || s.kind === "boost" ? s.product : s.kind);
const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const EMPTY: Revenue = { gross: 0, refunds: 0, fees: 0, net: 0, count: 0, fees_estimated: true, series: [], sources: [], partners: [], spenders: [] };

export function RevenueTab({ adminKey, preview }: { adminKey: string; preview?: Revenue }) {
  const [period, setPeriod] = useState("30d");
  const [d, setD] = useState<Revenue | null>(preview ?? null);
  useEffect(() => {
    if (preview) return;
    setD(null);
    void adminRevenue(adminKey, period).then((r) => setD(r ?? EMPTY)).catch((e: Error) => { toast(e.message); setD(EMPTY); });
  }, [adminKey, period, preview]);
  const r = d ?? EMPTY;
  const by = new Map<string, { cents: number; n: number }>();
  for (const s of r.sources) { const k = keyOf(s); const o = by.get(k) ?? { cents: 0, n: 0 }; by.set(k, { cents: o.cents + s.cents, n: o.n + s.n }); }
  const base = r.gross - r.refunds;
  const rows = SOURCES.map(([k, l]) => ({ l, ...(by.get(k) ?? { cents: 0, n: 0 }) })).sort((a, b) => b.cents - a.cents);
  const max = Math.max(1, ...r.series.map((s) => s.cents));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{PERIODS.map(([k, l]) => (
        <button key={k} type="button" onClick={() => setPeriod(k)} className={"rounded-full px-3 py-1 text-sm " + (period === k ? "bg-[#3EE08F] font-bold text-night" : "border border-line")}>{l}</button>))}</div>
      {!d ? <p className="text-sm text-muted">Chargement…</p> : <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["Brut encaissé", r.gross], ["Remboursements", r.refunds ? -r.refunds : 0], [r.fees_estimated ? "Frais Stripe (estimés)" : "Frais Stripe", r.fees ? -r.fees : 0], ["Net", r.net]] as const).map(([l, v]) => (
            <div key={l} className={"rounded-2xl border p-3 " + (l === "Net" ? "border-[#3EE08F]" : "border-line")}><b className="block font-display text-xl">{eur(v)}</b><span className="text-xs text-muted">{l}</span></div>))}
        </div>
        <p className="text-xs text-muted">{r.count} paiement(s) Stripe enregistré(s) par le webhook.{r.fees_estimated && " Frais estimés à 1,5 % + 0,25 € par paiement (tarif carte UE), non issus de Stripe."}</p>
        {r.count === 0 && <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">💸 Aucun paiement sur cette période pour l'instant. Les revenus apparaîtront ici dès le premier achat.</div>}
        <section className="rounded-2xl border border-line p-3">
          <p className="mb-2 text-sm font-bold">Évolution (net de remboursements)</p>
          {r.series.length === 0 ? <p className="py-6 text-center text-xs text-muted">Pas encore de données</p> :
            <div className="flex h-32 items-end gap-1">{r.series.map((s) => (
              <div key={s.t} title={`${new Date(s.t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} · ${eur(s.cents)}`} className="flex-1 rounded-t bg-gradient-to-t from-[#FA6F6C] to-[#fbbf24]" style={{ height: `${Math.max(3, (s.cents / max) * 100)}%` }} />))}</div>}
        </section>
        <section className="rounded-2xl border border-line p-3">
          <p className="mb-2 text-sm font-bold">Sources de revenus</p>
          {rows.map((x) => { const pct = base > 0 ? (x.cents / base) * 100 : 0; return (
            <div key={x.l} className="py-1.5 text-sm">
              <div className="flex justify-between gap-2"><span>{x.l}</span><span className="text-right"><b>{eur(x.cents)}</b> <span className="text-xs text-muted">· {x.n} · {pct.toFixed(1)} %</span></span></div>
              <div className="mt-1 h-1.5 rounded-full bg-night"><div className="h-full rounded-full bg-[#3EE08F]" style={{ width: `${pct}%` }} /></div>
            </div>); })}
        </section>
        <Top title="Top partenaires" list={r.partners.map((p) => [p.name, p.cents, p.n])} />
        <Top title="Top acheteurs (admin uniquement)" list={r.spenders.map((p) => [p.pseudo, p.cents, p.n])} />
      </>}
    </div>
  );
}

function Top({ title, list }: { title: string; list: [string, number, number][] }) {
  return (
    <section className="rounded-2xl border border-line p-3">
      <p className="mb-2 text-sm font-bold">{title}</p>
      {list.length === 0 ? <p className="text-xs text-muted">Aucun pour l'instant</p> : list.map(([n, c, k], i) => (
        <div key={i} className="flex justify-between py-1 text-sm"><span className="truncate">{i + 1}. {n}</span><span><b>{eur(c)}</b> <span className="text-xs text-muted">· {k} achat(s)</span></span></div>))}
    </section>
  );
}
