import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  adminProspectEdit, adminProspects, adminProspectSettings, prospectAction,
  type AdminProspect, type AdminProspects, type ProspectStatus,
} from "@/lib/hdar/live";

const STATUS: [ProspectStatus | "", string][] = [
  ["", "Tous"], ["new", "Sans email"], ["ready", "À contacter"], ["contacted", "Contactés"], ["clicked", "Ont cliqué"],
  ["claimed", "Fiche activée"], ["paid", "Payants"], ["done", "Séquence finie"], ["optout", "Désinscrits"], ["bounced", "Email invalide"], ["skip", "Écartés"],
];
const LABEL = Object.fromEntries(STATUS) as Record<string, string>;
const COLOR: Partial<Record<ProspectStatus, string>> = { ready: "text-[#fbbf24]", clicked: "text-[#f472b6]", claimed: "text-[#A1E3C3]", paid: "text-online", optout: "text-muted", bounced: "text-signal" };
const field = "h-10 rounded-xl border border-line bg-night px-3 text-sm";
const day = (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

/** CSV / tableur collé : nom;ville;email;site;type;segment;adresse (séparateur ; , ou tabulation, en-tête facultatif). */
function parseRows(txt: string) {
  return txt.split(/\r?\n/).map((l) => l.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => c[0] && !/^nom$/i.test(c[0]))
    .map(([name, city, email, website, kind, segment, address]) => ({
      name, city, email, website, address,
      kind: /club|bo[iî]te/i.test(kind ?? "") ? "club" : /sauna|hammam/i.test(kind ?? "") ? "sauna" : /bar|pub|caf/i.test(kind ?? "") || !kind ? "bar" : "other",
      segment: /libert|[ée]changis|swing/i.test(`${segment} ${kind}`) ? "libertin" : "gay",
    }));
}

export function ProspectsTab({ adminKey }: { adminKey: string }) {
  const [d, setD] = useState<AdminProspects | null>(null);
  const [status, setStatus] = useState<ProspectStatus | "">("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [out, setOut] = useState("");
  const [cap, setCap] = useState("");
  const [testTo, setTestTo] = useState("");
  const [pv, setPv] = useState<{ segment: "gay" | "libertin"; step: number; id?: string }>({ segment: "gay", step: 0 });
  const [html, setHtml] = useState("");
  const [csv, setCsv] = useState("");
  const load = useCallback(() => void adminProspects(adminKey, status || null, q || null).then((r) => { setD(r); setCap(String(r.settings.daily_cap)); }).catch((e: Error) => setOut(e.message)), [adminKey, status, q]);
  useEffect(load, [load]);
  useEffect(() => {
    void prospectAction<{ html: string }>({ action: "preview", ...pv }).then((r) => setHtml(r.html)).catch((e: Error) => setHtml(`<p style="color:#fff;font-family:sans-serif">${e.message}</p>`));
  }, [pv]);

  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label); setOut("");
    try { const r = await f(); setOut(`✅ ${label} : ${JSON.stringify(r)}`); load(); } catch (e) { setOut(`❌ ${label} : ${(e as Error).message}`); } finally { setBusy(""); }
  };
  const toggle = () => {
    if (!d) return;
    const on = !d.settings.enabled;
    if (on && !window.confirm(`Activer l'envoi automatique ?\n\nJusqu'à ${d.settings.daily_cap} emails par jour ouvré, étalés de 9 h à 17 h, aux établissements « À contacter ». Chaque email contient un lien de désinscription.\n\nAvez-vous envoyé un test et vérifié l'expéditeur ?`)) return;
    void run(on ? "Envoi activé" : "Envoi coupé", () => adminProspectSettings(adminKey, on, null));
  };
  const edit = (p: AdminProspect, o: Parameters<typeof adminProspectEdit>[2]) => void adminProspectEdit(adminKey, p.id, o).then(load).catch((e: Error) => toast(e.message));
  const f = d?.funnel;

  return (
    <section className="max-w-3xl space-y-5">
      <div className="rounded-3xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={toggle} disabled={!d || !!busy}
            className={"h-11 rounded-full px-5 font-bold disabled:opacity-40 " + (d?.settings.enabled ? "bg-[#3EE08F] text-night" : "border border-line")}>
            {d?.settings.enabled ? "🟢 Envoi automatique activé" : "⚪ Envoi automatique coupé"}
          </button>
          <label className="flex items-center gap-2 text-sm">Max / jour
            <input className={field + " w-20"} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="h-10 rounded-full border border-line px-3 text-xs" disabled={!cap || Number(cap) > 500}
              onClick={() => void run("Plafond", () => adminProspectSettings(adminKey, null, Number(cap)))}>OK</button>
          </label>
          <span className="text-sm text-muted">{d?.sent_today ?? 0} envoyé(s) aujourd'hui</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Chaque lundi, collecte automatique des bars, clubs et saunas gays et des clubs libertins de France (OpenStreetMap), puis recherche de l'email sur leur site.
          En semaine, de 9 h à 17 h : 3 emails par établissement (J0, J+4, J+10). La séquence s'arrête dès qu'il active sa fiche ou se désinscrit.
          Commencez petit (20 à 30 par jour) pour ne pas finir en spam.
        </p>
      </div>

      {f && (
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted sm:grid-cols-6">
          {([["Établissements", f.total], ["Avec email", f.with_email], ["Contactés", f.contacted], ["Ont cliqué", f.clicked], ["Fiche activée", f.claimed], ["Payants", f.paid]] as const).map(([l, v]) => (
            <span key={l} className="rounded-2xl border border-line px-2 py-2"><b className="block font-display text-xl text-ink">{v}</b>{l}</span>
          ))}
        </div>
      )}
      {d && <p className="text-xs text-muted">Gays : {d.segments.gay ?? 0} · Libertins : {d.segments.libertin ?? 0}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-40" onClick={() => void run("Collecte OSM", () => prospectAction({ action: "source" }))}>{busy === "Collecte OSM" ? "Collecte… (1-2 min)" : "🗺️ Collecter maintenant"}</button>
        <button type="button" disabled={!!busy} className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-40" onClick={() => void run("Recherche d'emails", () => prospectAction({ action: "enrich", n: 30 }))}>🔎 Chercher des emails</button>
        <button type="button" disabled={!!busy || !d?.settings.enabled} className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-40" onClick={() => void run("Passage d'envoi", () => prospectAction({ action: "tick" }))}>📨 Envoyer le prochain lot</button>
      </div>
      {out && <p className="text-sm break-words">{out}</p>}

      <details className="rounded-3xl border border-line p-4" open>
        <summary className="cursor-pointer font-bold">✉️ Aperçu et test des emails</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["gay", "libertin"] as const).map((s) => <button key={s} type="button" onClick={() => setPv({ ...pv, segment: s, id: undefined })} className={"h-9 rounded-full px-3 text-xs " + (pv.segment === s && !pv.id ? "bg-signal font-bold text-night" : "border border-line")}>{s === "gay" ? "Gay" : "Libertin"}</button>)}
          {[0, 1, 2].map((s) => <button key={s} type="button" onClick={() => setPv({ ...pv, step: s })} className={"h-9 rounded-full px-3 text-xs " + (pv.step === s ? "bg-signal font-bold text-night" : "border border-line")}>Email {s + 1}{s === 0 ? " (J0)" : s === 1 ? " (J+4)" : " (J+10)"}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={field + " flex-1"} type="email" placeholder="Votre email pour recevoir les 3 emails de test" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button type="button" disabled={!!busy || !/^\S+@\S+\.\S+$/.test(testTo)} className="h-10 rounded-full bg-signal px-4 text-sm font-bold text-night disabled:opacity-40"
            onClick={() => void run("Test", () => prospectAction({ action: "test", to: testTo, segment: pv.segment, id: pv.id }))}>Envoyer le test</button>
        </div>
        {pv.id && <p className="mt-2 text-xs text-muted">Aperçu et test avec un vrai établissement de la liste (sa fiche cachée est créée si besoin, rien n'est compté comme envoyé).</p>}
        <iframe title="Aperçu email pro" className="mt-3 h-[640px] w-full rounded-2xl border border-line bg-[#0b0b10]" srcDoc={html} />
        <a href="/pro/invitation/exemple" target="_blank" rel="noopener" className="mt-2 inline-block text-xs underline">Voir la page « Votre fiche est prête » (exemple) ↗</a>
      </details>

      <details className="rounded-3xl border border-line p-4">
        <summary className="cursor-pointer font-bold">📥 Importer une liste (annuaire, tableur)</summary>
        <p className="mt-2 text-xs text-muted">Une ligne par établissement : <b>nom ; ville ; email ; site ; type ; segment ; adresse</b>. Type : bar, club, sauna. Segment : gay ou libertin. L'adresse sert à placer le pin (géocodage automatique).</p>
        <textarea className="mt-2 h-32 w-full rounded-xl border border-line bg-night p-3 font-mono text-xs" placeholder={"Le Village;Montpellier;contact@levillage.fr;levillage.fr;bar;gay;3 rue X\nClub Eden;Lyon;;clubeden.fr;club;libertin;12 avenue Y"} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <button type="button" disabled={!!busy || !parseRows(csv).length} className="mt-2 h-10 rounded-full border border-line px-4 text-sm disabled:opacity-40"
          onClick={() => void run("Import", () => prospectAction({ action: "import", rows: parseRows(csv) })).then(() => setCsv(""))}>Importer {parseRows(csv).length || ""} ligne(s)</button>
      </details>

      <div className="flex flex-wrap gap-1">
        {STATUS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} className={"h-8 rounded-full px-3 text-xs " + (status === k ? "bg-signal font-bold text-night" : "border border-line")}>
            {l}{k && d?.counts[k] ? ` · ${d.counts[k]}` : ""}
          </button>
        ))}
      </div>
      <input className={field + " w-full"} placeholder="Rechercher (nom, ville, email)" value={q} onChange={(e) => setQ(e.target.value)} />

      <ul className="space-y-2">
        {d?.rows.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold break-words">{p.name} <span className="font-normal text-muted">· {p.kind} {p.segment} {p.city ? `· ${p.city}` : ""}</span></p>
                <p className="text-xs text-muted break-all">{p.email ?? "pas d'email"}{p.website ? ` · ${p.website}` : ""}{p.phone ? ` · ${p.phone}` : ""}</p>
                <p className="text-xs">
                  <b className={COLOR[p.status] ?? ""}>{LABEL[p.status]}</b>
                  <span className="text-muted"> · {p.step}/3 email(s){p.last_sent_at ? ` · dernier ${day(p.last_sent_at)}` : ""}{p.next_at && ["ready", "contacted", "clicked"].includes(p.status) && p.step < 3 ? ` · prochain ${day(p.next_at)}` : ""}{p.clicked_at ? ` · cliqué ${day(p.clicked_at)}` : ""}{p.priority ? ` · priorité ${p.priority}` : ""}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="h-8 rounded-full border border-line px-2 text-xs" onClick={() => { const e = window.prompt("Email de l'établissement", p.email ?? ""); if (e != null) edit(p, { email: e }); }}>✏️ Email</button>
                <button type="button" className="h-8 rounded-full border border-line px-2 text-xs" title="Contacter en premier" onClick={() => edit(p, { priority: p.priority + 10 })}>⬆️</button>
                <button type="button" className="h-8 rounded-full border border-line px-2 text-xs" onClick={() => setPv({ ...pv, id: p.id, segment: p.segment })}>👁️ Email</button>
                <a className="flex h-8 items-center rounded-full border border-line px-2 text-xs" href={`/pro/invitation/${p.token}?apercu`} target="_blank" rel="noopener" title="Voir sa page (sans compter de clic)">↗</a>
                {p.status !== "skip" && p.status !== "optout" && <button type="button" className="h-8 rounded-full border border-line px-2 text-xs" onClick={() => edit(p, { status: "skip" })}>Écarter</button>}
                {p.status === "skip" && <button type="button" className="h-8 rounded-full border border-line px-2 text-xs" onClick={() => edit(p, { status: p.email ? "ready" : "new" })}>Rétablir</button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {d && d.rows.length >= 300 && <p className="text-xs text-muted">300 premiers résultats : affinez avec la recherche.</p>}
    </section>
  );
}
