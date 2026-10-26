import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminAmbApps, adminAmbContracts, adminAmbDecide, type AdminAmbApp, type AdminAmbContract, adminAmbBudget, adminAmbCap, type AmbBudget, adminAmbContractPdf, adminAmbFlags, adminAmbInvite, adminAmbPayout, adminAmbPromo, adminAmbs, adminAmbSearch, adminAmbSet, type AdminAmb } from "@/lib/hdar/live";

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
      <Applications adminKey={adminKey} demo={!!preview} onChange={load} />
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
      <BudgetBox adminKey={adminKey} demo={!!preview} />
      <SignedContracts adminKey={adminKey} demo={!!preview} />
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
        <p className="mb-1 font-bold">Contrat</p>
        {r.contract ? <p>✍️ Signé par {r.contract.name} le {new Date(r.contract.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} · {r.contract.version} <button type="button" className="ml-1 underline" onClick={() => demo ? toast("Aperçu") : void adminAmbContractPdf(adminKey, r.user_id).catch((e: Error) => toast(e.message))}>⬇︎ PDF</button></p> : <p className="text-muted">Non signé</p>}
        <p className="mt-2 mb-1 font-bold">Versements Stripe Connect</p>
        <p>{!r.stripe_account ? "⚪ Compte Stripe non créé" : r.payouts_enabled ? `✅ Compte prêt (${r.stripe_account})` : `🟡 Inscription Stripe incomplète (${r.stripe_account})`}{r.paused ? " · ⏸️ en pause" : ""}{r.hold_next ? " · prochain versement suspendu" : ""}</p>
        <p className="mt-1 text-muted">Virement automatique le 1er du mois si dû ≥ seuil. Identité, IBAN et SIRET : chez Stripe uniquement.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="rounded-full border border-line px-3 py-1" onClick={() => ro(adminAmbFlags(adminKey, r.user_id, !r.paused, null), r.paused ? "Versements réactivés" : "Versements en pause")}>{r.paused ? "▶︎ Reprendre les versements" : "⏸️ Mettre en pause"}</button>
          <button type="button" className="rounded-full border border-line px-3 py-1" onClick={() => ro(adminAmbFlags(adminKey, r.user_id, null, !r.hold_next), r.hold_next ? "Versement rétabli" : "Prochain versement suspendu")}>{r.hold_next ? "Rétablir le prochain versement" : "Suspendre le prochain versement"}</button>
        </div>
      </div>
      <CapRow r={r} adminKey={adminKey} demo={demo} onDone={onDone} />
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
            title="Versement fait hors Stripe" onClick={() => ro(adminAmbPayout(adminKey, r.user_id, Math.round(Number(pay) * 100), null, new Date().toISOString().slice(0, 10), "Versement sur facture"), "Versement enregistré")}>Marquer payé (manuel)</button></div>
        {r.due_total < r.min_payout_cents && <p className="mt-1 text-xs text-muted">Seuil de versement : {eur(r.min_payout_cents)}.</p>}
        {r.payouts.map((p, i) => <p key={i} className="text-xs text-muted">{new Date(p.at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} · {eur(p.amount)} · {p.status === "failed" ? "❌" : p.status === "held" ? "⏸️" : "✅"} {p.note}{p.error ? ` (${p.error})` : ""}</p>)}
      </div>
    </div>
  );
}

export function demoAdminAmbs(): AdminAmb[] {
  const st = { signups: 23, validated: 17, codes_created: 9, codes_redeemed: 7, places: 2, places_claimed: 2, places_active: 1, revenue_users: 4590, revenue_partners: 7900, commission: 3743, paid: 0, bonuses: 0 };
  const base = { signup_cap_cents: null, user_pct: 20, user_months: 6, bonus_cents: 2000, bonus_at: 50, min_payout_cents: 2000, codes_per_week: 10, max_days: 3, max_boost_h: 24, max_hearts: 20, per_signup_cents: 50, partner_pct: 25, partner_months: 3, note: null, promos: [] };
  return [
    { ...base, user_id: "1", pseudo: "Lucas (exemple)", code: "LUCAS7", active: true, terms_at: "x", stats: st, paid_total: 5000, due_total: 2310, contract: { version: "v1", at: "2026-10-13T12:00:00Z", name: "Lucas Martin" }, stripe_account: "acct_1Exemple", payouts_enabled: true, paused: false, hold_next: false,
      payouts: [{ amount: 5000, from: null, to: "2026-09-30", note: "Virement Stripe automatique", at: "2026-10-01", status: "paid" }], promos: [{ id: "p", name: "Le Néon", promo: "1er mois -50 %", status: "pending" }] },
    { ...base, user_id: "2", pseudo: "Nico (exemple)", code: "NICO42", active: true, terms_at: null, stats: { ...st, signups: 4, validated: 2, commission: 100, revenue_users: 0, revenue_partners: 0, places: 0, places_active: 0 }, paid_total: 0, due_total: 100, stripe_account: null, payouts_enabled: false, paused: false, hold_next: false, payouts: [] },
  ];
}

function BudgetBox({ adminKey, demo }: { adminKey: string; demo: boolean }) {
  const [b, setB] = useState<AmbBudget | null>(demo ? { signup_cap_cents: 5000, global_budget_cents: 35000, month_requested_cents: 12350, month_used_cents: 12350, factor: 1 } : null);
  const [cap, setCap] = useState(""); const [bud, setBud] = useState("");
  useEffect(() => { if (!demo) void adminAmbBudget(adminKey).then(setB).catch(() => undefined); }, [adminKey, demo]);
  if (!b) return null;
  const pct = Math.min(100, (b.month_requested_cents / Math.max(1, b.global_budget_cents)) * 100);
  const save = () => { if (demo) return void toast("Aperçu"); void adminAmbBudget(adminKey, cap ? Math.round(Number(cap) * 100) : null, bud ? Math.round(Number(bud) * 100) : null).then((x) => { setB(x); setCap(""); setBud(""); toast("Plafonds enregistrés"); }).catch((e: Error) => toast(e.message)); };
  return (
    <section className="rounded-2xl border border-line p-3 text-sm">
      <p className="font-bold">Budget des primes d'inscription · ce mois</p>
      <div className="mt-2 h-2 rounded-full bg-night"><div className={"h-full rounded-full " + (pct >= 100 ? "bg-signal" : pct >= 80 ? "bg-[#fbbf24]" : "bg-[#3EE08F]")} style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-xs text-muted">{eur(b.month_requested_cents)} demandés / {eur(b.global_budget_cents)} de budget global{b.factor < 1 ? ` · budget atteint : primes réduites à ${Math.round(b.factor * 100)} %` : ""}. Plafond par ambassadeur : {eur(b.signup_cap_cents)}/mois (bonus palier inclus). Les % sur encaissements ne sont pas plafonnés.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={cap} onChange={(e) => setCap(e.target.value)} type="number" placeholder={`Plafond/ambassadeur (${b.signup_cap_cents / 100} €)`} className="w-48 rounded-lg border border-line bg-night px-2 py-1" />
        <input value={bud} onChange={(e) => setBud(e.target.value)} type="number" placeholder={`Budget global (${b.global_budget_cents / 100} €)`} className="w-44 rounded-lg border border-line bg-night px-2 py-1" />
        <button type="button" onClick={save} className="rounded-full bg-[#3EE08F] px-4 py-1 font-bold text-night">Enregistrer</button>
      </div>
    </section>
  );
}

function CapRow({ r, adminKey, demo, onDone }: { r: AdminAmb; adminKey: string; demo: boolean; onDone: () => void }) {
  const [v, setV] = useState(r.signup_cap_cents == null ? "" : String(r.signup_cap_cents / 100));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold">Plafond primes d'inscription (€/mois)</span>
      <input value={v} onChange={(e) => setV(e.target.value)} type="number" placeholder="global" className="w-24 rounded-lg border border-line bg-night px-2 py-1" />
      <button type="button" className="rounded-full border border-line px-3 py-1" onClick={() => demo ? toast("Aperçu") : void adminAmbCap(adminKey, r.user_id, v === "" ? null : Math.round(Number(v) * 100)).then(() => { toast("Plafond enregistré"); onDone(); }).catch((e: Error) => toast(e.message))}>OK</button>
      <span className="text-muted">Primes d'inscription sur la période : {eur(r.stats.signup_bonus ?? 0)}</span>
    </div>
  );
}

export function demoApps(): AdminAmbApp[] {
  return [
    { id: 1, user_id: "1", pseudo: "Sami (exemple)", age: 27, photo_ok: true, motivation: "J'adore sortir 🪩, Je connais plein de monde 🤝 — Je sors tous les week-ends à Montpellier, je connais les barmans du quartier", city: "Montpellier", audience: "@mtp.nights ~2 000 abonnés", promote: "Soirées & bars 🍸, Instagram / TikTok 📱", status: "pending", note: null, at: new Date().toISOString(), decided_at: null, already_amb: false },
    { id: 2, user_id: "2", pseudo: "Léa (exemple)", age: 31, photo_ok: false, motivation: "Je veux un petit complément 💸 — j'organise des soirées dans une asso", city: "Lyon", audience: null, promote: "Asso / communauté 🏳️‍🌈", status: "pending", note: null, at: new Date(Date.now() - 864e5).toISOString(), decided_at: null, already_amb: false },
    { id: 3, user_id: "3", pseudo: "Tom (exemple)", age: 24, photo_ok: true, motivation: "J'aime l'appli ❤️", city: "Nice", audience: null, promote: "Bouche à oreille 🗣️", status: "accepted", note: "Bienvenue !", at: new Date(Date.now() - 3 * 864e5).toISOString(), decided_at: new Date(Date.now() - 2 * 864e5).toISOString(), already_amb: false },
  ];
}

function Applications({ adminKey, demo, onChange }: { adminKey: string; demo: boolean; onChange: () => void }) {
  const [rows, setRows] = useState<AdminAmbApp[] | null>(demo ? demoApps() : null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => { if (!demo) void adminAmbApps(adminKey).then(setRows).catch((e: Error) => toast(e.message)); };
  useEffect(load, [adminKey, demo]);
  const decide = (a: AdminAmbApp, ok: boolean) => {
    if (demo) return void toast("Aperçu");
    setBusy(a.id);
    void adminAmbDecide(adminKey, a.id, ok, notes[a.id] ?? "").then((mailed) => {
      toast(ok ? `Accepté ✅ ${mailed ? "Lien de signature envoyé par email." : "Email non envoyé (vérifie Resend)."}` : `Refusé. ${mailed ? "Réponse envoyée par email." : ""}`);
      load(); onChange();
    }).catch((e: Error) => toast(e.message)).finally(() => setBusy(null));
  };
  const pending = rows?.filter((r) => r.status === "pending") ?? [];
  const done = rows?.filter((r) => r.status !== "pending") ?? [];
  return (
    <section className="rounded-2xl border border-[#3EE08F]/60 p-3">
      <p className="text-sm font-bold">📝 Candidatures {pending.length > 0 && <span className="ml-1 rounded-full bg-[#3EE08F] px-2 text-xs text-night">{pending.length}</span>}</p>
      {!rows ? <p className="mt-2 text-sm text-muted">Chargement…</p> : pending.length === 0 ? <p className="mt-2 text-sm text-muted">Aucune candidature en attente.</p> : pending.map((a) => (
        <div key={a.id} className="mt-3 rounded-xl bg-night p-3 text-sm">
          <p><b>{a.pseudo}</b>{a.age ? ` · ${a.age} ans` : ""} · 📍 {a.city} <span className="text-xs text-muted">· {new Date(a.at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>{!a.photo_ok && <span className="ml-1 text-xs text-[#fbbf24]">📸 photo non validée</span>}{a.already_amb && <span className="ml-1 text-xs text-[#3EE08F]">déjà ambassadeur</span>}</p>
          <p className="mt-1"><span className="text-xs text-muted">Motivation :</span> {a.motivation}</p>
          <p className="mt-1"><span className="text-xs text-muted">Promotion :</span> {a.promote}</p>
          {a.audience && <p className="mt-1"><span className="text-xs text-muted">Audience :</span> {a.audience}</p>}
          <input value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} maxLength={300} placeholder="Note pour le candidat (facultatif, envoyée avec la réponse)" className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs" />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy === a.id} onClick={() => decide(a, true)} className="flex-1 rounded-full bg-[#3EE08F] py-1.5 font-bold text-night disabled:opacity-50">Accepter</button>
            <button type="button" disabled={busy === a.id} onClick={() => decide(a, false)} className="flex-1 rounded-full border border-signal py-1.5 text-signal disabled:opacity-50">Refuser</button>
          </div>
        </div>))}
      {done.length > 0 && <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted">Traitées (60 derniers jours) · {done.length}</summary>
        {done.map((a) => <p key={a.id} className="mt-1">{a.status === "accepted" ? "✅" : "❌"} <b>{a.pseudo}</b> · {a.city} · {a.decided_at ? new Date(a.decided_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : ""}{a.note ? ` · « ${a.note} »` : ""}</p>)}</details>}
      <p className="mt-2 text-[11px] text-muted">Accepter envoie un lien de signature personnel (usage unique, 7 jours) depuis contact@hdar.chat + une notification in-app. L'email du candidat n'est jamais affiché.</p>
    </section>
  );
}

function SignedContracts({ adminKey, demo }: { adminKey: string; demo: boolean }) {
  const [rows, setRows] = useState<AdminAmbContract[] | null>(demo ? [{ user_id: "1", pseudo: "Lucas (exemple)", name: "Lucas Martin", version: "v2", at: "2026-10-13T12:00:00Z", code: "LUCAS7" }] : null);
  useEffect(() => { if (!demo) void adminAmbContracts(adminKey).then(setRows).catch(() => undefined); }, [adminKey, demo]);
  if (!rows) return null;
  return (
    <details className="rounded-2xl border border-line p-3 text-sm">
      <summary className="cursor-pointer font-bold">✍️ Contrats signés · {rows.length}</summary>
      {rows.length === 0 ? <p className="mt-2 text-xs text-muted">Aucun contrat signé.</p> : rows.map((c, i) => (
        <div key={i} className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span><b>{c.pseudo}</b> · {c.name} · {c.version} · {new Date(c.at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} <span className="font-mono text-muted">{c.code}</span></span>
          <button type="button" className="underline" onClick={() => demo ? toast("Aperçu") : void adminAmbContractPdf(adminKey, c.user_id).catch((e: Error) => toast(e.message))}>⬇︎ PDF</button>
        </div>))}
    </details>
  );
}
