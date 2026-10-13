import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminAmbInvite, adminAmbPayout, adminAmbPromo, adminAmbs, adminAmbSearch, adminAmbSet, type AdminAmb } from "@/lib/hdar/live";

const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const PERIODS = [["month", "Ce mois"], ["last", "Mois dernier"], ["30d", "30 j"], ["all", "Tout"]] as const;
const range = (p: string): [string | null, string | null] => {
  const n = new Date(), m0 = new Date(n.getFullYear(), n.getMonth(), 1);
  if (p === "month") return [m0.toISOString(), null];
  if (p === "last") return [new Date(n.getFullYear(), n.getMonth() - 1, 1).toISOString(), m0.toISOString()];
  if (p === "30d") return [new Date(Date.now() - 30 * 864e5).toISOString(), null];
  return [null, null];
};
const RULES: [keyof AdminAmb, string, "eur" | "n"][] = [
  ["per_signup_cents", "€ / inscrit validé", "eur"], ["user_pct", "% net des inscrits", "n"], ["user_months", "… pendant (mois)", "n"],
  ["partner_pct", "% abonnement partenaire", "n"], ["partner_months", "… pendant (mois)", "n"], ["bonus_cents", "Bonus (€)", "eur"],
  ["bonus_at", "… à N validés / mois", "n"], ["min_payout_cents", "Versement dès (€)", "eur"], ["codes_per_week", "Codes / semaine", "n"],
  ["max_days", "Max jours hdar+ / code", "n"], ["max_boost_h", "Max heures boost / code", "n"], ["max_hearts", "Max cœurs / code", "n"],
];

export function AmbassadorsTab({ adminKey, preview }: { adminKey: string; preview?: AdminAmb[] }) {
  const [period, setPeriod] = useState("month");
  const [rows, setRows] = useState<AdminAmb[] | null>(preview ?? null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ user_id: string; pseudo: string; amb: boolean }[]>([]);
  const [open, setOpen] = useState<string | null>(preview?.[0]?.user_id ?? null);
  const [invite, setInvite] = useState<string | null>(null);
  const load = () => { if (preview) return; const [f, t] = range(period); void adminAmbs(adminKey, f, t).then(setRows).catch((e: Error) => toast(e.message)); };
  useEffect(load, [adminKey, period, preview]);
  const csv = () => {
    const head = ["pseudo", "code", "actif", "inscrits", "valides", "codes_crees", "codes_utilises", "lieux_signes", "lieux_actifs", "ca_inscrits_net_eur", "ca_partenaires_net_eur", "commission_eur", "verse_total_eur", "du_eur"];
    const lines = (rows ?? []).map((r) => [r.pseudo, r.code, r.active, r.stats.signups, r.stats.validated, r.stats.codes_created, r.stats.codes_redeemed, r.stats.places, r.stats.places_active,
      r.stats.revenue_users / 100, r.stats.revenue_partners / 100, r.stats.commission / 100, r.paid_total / 100, r.due_total / 100].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + [head.join(";"), ...lines].join("\n")], { type: "text/csv" }));
    a.download = `ambassadeurs-${period}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line p-3">
        <p className="text-sm font-bold">Inviter un ambassadeur</p>
        <button type="button" onClick={() => void (preview ? Promise.resolve("demo") : adminAmbInvite(adminKey)).then((t) => setInvite(`https://hdar.chat/ambassadeur?i=${t}`)).catch((e: Error) => toast(e.message))}
          className="mt-2 rounded-full bg-[#3EE08F] px-4 py-2 text-sm font-bold text-night">Créer un lien d'invitation (1 usage, 7 j)</button>
        {invite && <button type="button" onClick={() => void navigator.clipboard?.writeText(invite).then(() => toast("Lien copié"))} className="mt-2 block w-full truncate rounded-xl bg-night px-3 py-2 text-left font-mono text-xs">{invite} 📋</button>}
        <p className="mt-3 text-sm font-bold">… ou donner le rôle à un profil existant</p>
        <div className="mt-2 flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pseudo" className="flex-1 rounded-xl border border-line bg-night px-3 py-2 text-sm" />
          <button type="button" className="rounded-xl border border-line px-3 text-sm" onClick={() => void adminAmbSearch(adminKey, q).then(setHits).catch((e: Error) => toast(e.message))}>Chercher</button></div>
        {hits.map((h) => (
          <div key={h.user_id} className="mt-1 flex items-center justify-between text-sm"><span>{h.pseudo}</span>
            <button type="button" className="text-xs underline" onClick={() => void adminAmbSet(adminKey, h.user_id, !h.amb).then(() => { toast(h.amb ? "Rôle retiré" : "Rôle donné (il devra accepter la charte)"); setHits([]); load(); }).catch((e: Error) => toast(e.message))}>{h.amb ? "Retirer" : "Nommer ambassadeur"}</button></div>))}
      </section>
      <div className="flex flex-wrap items-center gap-2">{PERIODS.map(([k, l]) => (
        <button key={k} type="button" onClick={() => setPeriod(k)} className={"rounded-full px-3 py-1 text-sm " + (period === k ? "bg-[#3EE08F] font-bold text-night" : "border border-line")}>{l}</button>))}
        <button type="button" onClick={csv} className="ml-auto rounded-full border border-line px-3 py-1 text-sm">⬇︎ CSV</button></div>
      {!rows ? <p className="text-sm text-muted">Chargement…</p> : rows.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">Aucun ambassadeur pour l'instant.</p> : rows.map((r) => (
        <section key={r.user_id} className="rounded-2xl border border-line p-3">
          <button type="button" onClick={() => setOpen(open === r.user_id ? null : r.user_id)} className="flex w-full items-center justify-between text-left">
            <span><b>{r.pseudo}</b> <span className="font-mono text-xs text-muted">{r.code}</span> {!r.active && <span className="text-xs text-signal">retiré</span>}{r.active && !r.terms_at && <span className="text-xs text-[#fbbf24]">charte non acceptée</span>}</span>
            <span className="text-right text-xs">{r.stats.validated} validés · <b className="text-sm">{eur(r.stats.commission)}</b><br /><span className={r.due_total >= r.min_payout_cents ? "text-[#3EE08F]" : "text-muted"}>dû {eur(r.due_total)}</span></span>
          </button>
          {open === r.user_id && <Detail r={r} adminKey={adminKey} onDone={load} demo={!!preview} />}
        </section>))}
    </div>
  );
}

function Detail({ r, adminKey, onDone, demo }: { r: AdminAmb; adminKey: string; onDone: () => void; demo: boolean }) {
  const [rules, setRules] = useState<Record<string, number>>(() => Object.fromEntries(RULES.map(([k]) => [k, Number(r[k])])));
  const [pay, setPay] = useState(String(Math.max(0, r.due_total) / 100));
  const s = r.stats;
  const ro = (p: Promise<unknown>, msg: string) => demo ? toast("Aperçu") : void p.then(() => { toast(msg); onDone(); }).catch((e: Error) => toast(e.message));
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {([["Inscrits", s.signups], ["Validés", s.validated], ["Codes créés/utilisés", `${s.codes_created}/${s.codes_redeemed}`], ["Lieux signés", s.places], ["Lieux actifs", s.places_active], ["Bonus", s.bonuses ?? 0],
          ["CA inscrits (net)", eur(s.revenue_users)], ["CA partenaires (net)", eur(s.revenue_partners)], ["Commission période", eur(s.commission)]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-night p-2"><b className="block">{v}</b><span className="text-muted">{l}</span></div>))}
      </div>
      <p className="text-xs text-muted">Validé = photo approuvée et profil encore actif 7 jours après l'inscription. CA net = après remboursements et frais Stripe estimés.</p>
      <div className="rounded-xl bg-night p-3 text-xs">
        <p className="mb-1 font-bold">Infos de paiement (admin uniquement)</p>
        {r.payout_info ? <p>{r.payout_info.name} · IBAN {r.payout_info.iban} · SIRET {r.payout_info.siret}</p> : <p className="text-muted">Non renseignées</p>}
      </div>
      <div>
        <p className="mb-1 font-bold">Règles</p>
        <div className="grid grid-cols-2 gap-2">{RULES.map(([k, l, t]) => (
          <label key={k} className="text-xs text-muted">{l}<input type="number" step="any" className="mt-0.5 w-full rounded-lg border border-line bg-night px-2 py-1 text-ink"
            value={t === "eur" ? rules[k] / 100 : rules[k]} onChange={(e) => setRules({ ...rules, [k]: t === "eur" ? Math.round(Number(e.target.value) * 100) : Number(e.target.value) })} /></label>))}</div>
        <div className="mt-2 flex gap-2">
          <button type="button" className="rounded-full bg-[#3EE08F] px-4 py-1.5 font-bold text-night" onClick={() => ro(adminAmbSet(adminKey, r.user_id, r.active, rules), "Règles enregistrées")}>Enregistrer</button>
          <button type="button" className="rounded-full border border-signal px-4 py-1.5 text-signal" onClick={() => ro(adminAmbSet(adminKey, r.user_id, !r.active), r.active ? "Rôle retiré" : "Rôle rendu")}>{r.active ? "Retirer le rôle" : "Réactiver"}</button>
        </div>
      </div>
      {r.promos.length > 0 && <div><p className="mb-1 font-bold">Promos de lancement proposées</p>{r.promos.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 py-1"><span>{p.name} : « {p.promo} » <span className="text-xs text-muted">({p.status ?? "—"})</span></span>
          {p.status === "pending" && <span className="flex gap-2 text-xs"><button type="button" className="underline" onClick={() => ro(adminAmbPromo(adminKey, p.id, "approved"), "Promo acceptée")}>Accepter</button><button type="button" className="text-signal underline" onClick={() => ro(adminAmbPromo(adminKey, p.id, "refused"), "Promo refusée")}>Refuser</button></span>}</div>))}
        <p className="text-xs text-muted">Une promo acceptée est affichée au gérant ; appliquez la remise via un coupon Stripe (ou remboursement partiel) au moment du paiement.</p></div>}
      <div>
        <p className="mb-1 font-bold">Versements · total {eur(r.paid_total)} · dû {eur(r.due_total)}</p>
        <div className="flex gap-2"><input value={pay} onChange={(e) => setPay(e.target.value)} type="number" step="0.01" className="w-28 rounded-lg border border-line bg-night px-2 py-1" />
          <button type="button" disabled={r.due_total < r.min_payout_cents} className="rounded-full bg-[#fbbf24] px-4 py-1.5 font-bold text-night disabled:opacity-40"
            onClick={() => ro(adminAmbPayout(adminKey, r.user_id, Math.round(Number(pay) * 100), null, new Date().toISOString().slice(0, 10), "Versement sur facture"), "Versement enregistré")}>Marquer payé</button></div>
        {r.due_total < r.min_payout_cents && <p className="mt-1 text-xs text-muted">Seuil de versement : {eur(r.min_payout_cents)}.</p>}
        {r.payouts.map((p, i) => <p key={i} className="text-xs text-muted">{new Date(p.at).toLocaleDateString("fr-FR")} · {eur(p.amount)} · {p.note}</p>)}
      </div>
    </div>
  );
}

export function demoAdminAmbs(): AdminAmb[] {
  const st = { signups: 23, validated: 17, codes_created: 9, codes_redeemed: 7, places: 2, places_claimed: 2, places_active: 1, revenue_users: 4590, revenue_partners: 7900, commission: 3743, paid: 0, bonuses: 0 };
  const base = { user_pct: 20, user_months: 6, bonus_cents: 2000, bonus_at: 50, min_payout_cents: 2000, codes_per_week: 10, max_days: 3, max_boost_h: 24, max_hearts: 20, per_signup_cents: 50, partner_pct: 25, partner_months: 3, note: null, promos: [] };
  return [
    { ...base, user_id: "1", pseudo: "Lucas (exemple)", code: "LUCAS7", active: true, terms_at: "x", stats: st, paid_total: 5000, due_total: 2310, payout_info: { name: "Lucas Martin", iban: "FR76 •••• 1234", siret: "123 456 789 00012" },
      payouts: [{ amount: 5000, from: null, to: "2026-09-30", note: "Versement sur facture", at: "2026-10-02" }], promos: [{ id: "p", name: "Le Néon", promo: "1er mois -50 %", status: "pending" }] },
    { ...base, user_id: "2", pseudo: "Nico (exemple)", code: "NICO42", active: true, terms_at: null, stats: { ...st, signups: 4, validated: 2, commission: 100, revenue_users: 0, revenue_partners: 0, places: 0, places_active: 0 }, paid_total: 0, due_total: 100, payout_info: null, payouts: [] },
  ];
}
