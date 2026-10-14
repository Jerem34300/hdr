import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ambApply, ambApplyStatus, ambMe, type AmbApplyForm, type AmbApplyStatus } from "@/lib/hdar/live";
import { AmbassadorSpace, demoAmb } from "./ambassador";
import { Mark, Wordmark } from "./logo";

const CORAL = "#FA6F6C";
const MINT = "#3EE08F";
const GOLD = "#fbbf24";

function Bokeh() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute -top-16 -left-10 size-56 rounded-full opacity-40 blur-3xl" style={{ background: MINT }} />
      <span className="absolute top-24 -right-16 size-64 rounded-full opacity-25 blur-3xl" style={{ background: CORAL }} />
      <span className="absolute bottom-0 left-1/3 size-40 rounded-full opacity-20 blur-3xl" style={{ background: "#a78bfa" }} />
    </div>
  );
}

const EARN = [
  ["🙋", "0,50 € par inscrit validé", "Quelqu'un s'inscrit avec ton lien ou ton QR, sa photo est validée et son profil est toujours actif 7 jours après."],
  ["💳", "20 % de ce que tes inscrits dépensent", "Sur le net réellement encaissé (hdar+, cœurs, boosts), pendant 6 mois après leur inscription."],
  ["🍸", "25 % des abonnements des lieux", "Tu fais signer un bar, un club ou un sauna : 25 % de son abonnement net pendant 3 mois."],
  ["🏆", "+20 € de bonus", "Si tu atteins 50 inscrits validés dans le mois."],
] as const;


// Simulateur — règles réelles du programme (0,50 €/validé, +20 € à 50/mois, plafond 50 €/mois (hdar.amb_settings),
// 20 % du net des inscrits pendant 6 mois, 25 % de l'abonnement lieu 1 mois = 49 € pendant 3 mois).
// Hypothèse affichée : 5 % des inscrits paient en moyenne 6,99 €/mois (pack 50 cœurs).
const SIM = { perSignup: 0.5, bonus: 20, bonusAt: 50, cap: 50, userPct: 0.2, userMonths: 6, payRate: 0.05, avgSpend: 6.99, partnerPct: 0.25, partnerPrice: 49, partnerMonths: 3 };
const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
function simulate(n: number, p: number) {
  const signup = Math.min(SIM.cap, n * SIM.perSignup + (n >= SIM.bonusAt ? SIM.bonus : 0));
  const users = n * SIM.userMonths * SIM.payRate * SIM.avgSpend * SIM.userPct;
  const partners = p * SIM.partnerMonths * SIM.partnerPrice * SIM.partnerPct;
  return { signup, users, partners, total: signup + users + partners };
}
function Simulator() {
  const [n, setN] = useState(30);
  const [p, setP] = useState(0);
  const r = simulate(n, p);
  const ex: [string, number, number][] = [["Le week-end, entre potes", 10, 0], ["Tu sors chaque semaine", 50, 0], ["Tu bosses ta ville", 100, 1]];
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: GOLD }}>Simulateur</p>
      <h2 className="mt-1 font-display text-2xl font-extrabold">Combien tu peux gagner ?</h2>
      <label className="mt-4 block text-sm font-bold">Inscrits validés par mois : <span style={{ color: MINT }}>{n}</span>
        <input type="range" min={0} max={200} step={5} value={n} onChange={(e) => setN(+e.target.value)} className="mt-2 w-full accent-[#3EE08F]" /></label>
      <label className="mt-3 block text-sm font-bold">Lieux signés par mois (facultatif) : <span style={{ color: MINT }}>{p}</span>
        <input type="range" min={0} max={5} step={1} value={p} onChange={(e) => setP(+e.target.value)} className="mt-2 w-full accent-[#3EE08F]" /></label>
      <div className="mt-4 space-y-1.5 rounded-2xl bg-night p-4 text-sm">
        <p className="flex justify-between"><span className="text-muted">Primes d'inscription{n >= SIM.bonusAt ? " (bonus inclus)" : ""}</span><b>{fmt(r.signup)}</b></p>
        <p className="flex justify-between"><span className="text-muted">20 % de ce que dépensent tes inscrits</span><b>≈ {fmt(r.users)}</b></p>
        <p className="flex justify-between"><span className="text-muted">25 % des abonnements des lieux</span><b>≈ {fmt(r.partners)}</b></p>
        <p className="flex justify-between border-t border-line pt-2 text-base"><span className="font-bold">Estimation par mois</span><b style={{ color: MINT }}>≈ {fmt(r.total)}</b></p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {ex.map(([t, en, ep]) => (
          <button type="button" key={t} onClick={() => { setN(en); setP(ep); }} className="rounded-2xl border border-line p-3 text-left text-sm">
            <b className="block">{t}</b><span className="text-muted">{en} inscrits{ep ? ` + ${ep} lieu` : ""}/mois</span><b className="mt-1 block" style={{ color: MINT }}>≈ {fmt(simulate(en, ep).total)}/mois</b>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Estimation, pas une promesse. Calculée une fois ton rythme installé (après 6 mois au même rythme, car tu touches 20 % de chaque inscrit pendant 6 mois, et 25 % de chaque lieu pendant 3 mois). Hypothèse : 5 % de tes inscrits dépensent en moyenne 6,99 € par mois ; lieu à l'abonnement mensuel de 49 €. Montants avant frais de paiement et cotisations. Primes d'inscription plafonnées à 50 € par mois.</p>
    </section>
  );
}

const STEPS = [
  ["Tu postules", "Un petit questionnaire de 2 minutes, depuis ton profil hdar."],
  ["On te répond", "On lit chaque candidature à la main. Si c'est oui, tu reçois un email de contact@hdar.chat avec ton lien personnel."],
  ["Tu signes ton contrat", "Tu lis le contrat, tu coches « J'accepte » et tu tapes ton nom. Le PDF signé arrive par email."],
  ["Tu fais connaître hdar", "Ton code, ton lien, ton QR à faire scanner, des codes cadeaux à offrir et le guide ambassadeur."],
] as const;

const FAQ = [
  ["Combien je vais gagner ?", "Ça dépend uniquement de toi et des gens que tu fais venir : on ne promet aucun revenu. Les commissions ne portent que sur l'argent réellement encaissé par hdar ; un remboursement annule la commission liée."],
  ["Il y a un plafond ?", "Les primes d'inscription (0,50 € + bonus) sont plafonnées à 50 € par mois et par ambassadeur, avec un budget global du programme de 350 € par mois. Les pourcentages sur les paiements encaissés ne sont pas plafonnés."],
  ["Comment je suis payé ?", "Par virement Stripe, automatiquement le 1er du mois dès 20 € dus. Il te faut un statut d'auto-entrepreneur (SIRET) et déclarer ces revenus."],
  ["Je vois qui s'inscrit avec mon lien ?", "Non. Tu ne vois que des compteurs (inscrits, validés, commissions), jamais l'identité ni la position des membres."],
  ["Qu'est-ce qui est interdit ?", "Le spam, l'affichage sauvage, les faux comptes, insister auprès des gens ou démarcher des mineurs. Toute fraude annule les commissions et met fin au programme."],
  ["Je peux arrêter quand je veux ?", "Oui, à tout moment. hdar peut aussi faire évoluer les règles ou retirer le rôle, comme prévu dans le contrat."],
] as const;

export function AmbLanding({ onApply, status }: { onApply: () => void; status: AmbApplyStatus | null }) {
  const app = status?.application;
  const cta = (label = "Je postule") => {
    if (app?.status === "pending") return <p className="rounded-full border px-5 py-3 text-center text-sm font-bold" style={{ borderColor: GOLD, color: GOLD }}>⏳ Candidature envoyée, on te répond vite</p>;
    if (app?.status === "accepted") return <p className="rounded-full border px-5 py-3 text-center text-sm font-bold" style={{ borderColor: MINT, color: MINT }}>✅ Acceptée ! Regarde tes emails pour signer ton contrat</p>;
    return (
      <button type="button" onClick={onApply} className="h-14 w-full rounded-full font-display text-lg font-extrabold text-night shadow-lg sm:w-auto sm:px-10" style={{ background: MINT, boxShadow: `0 10px 40px -8px ${MINT}` }}>
        {label} 💸
      </button>
    );
  };
  return (
    <div className="mt-5 space-y-14 pb-10">
      <section className="relative -mx-5 overflow-hidden px-5 pt-6 pb-8">
        <Bokeh />
        <div className="relative">
          <div className="flex items-center gap-2"><Mark className="size-8" /><Wordmark /><span className="rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: MINT, color: MINT }}>AMBASSADEUR</span></div>
          <h1 className="mt-5 font-display text-[2rem] leading-[1.1] font-extrabold sm:text-5xl">
            Fais connaître hdar autour de toi et <span style={{ color: MINT }}>gagne de l'argent</span> pour <span style={{ color: CORAL }}>chaque personne</span> qui nous rejoint.
          </h1>
          <p className="mt-4 text-base text-muted">Tu sors, tu as du monde autour de toi, tu connais les bars et les soirées de ta ville ? Deviens ambassadeur : ton lien, ton QR, des codes cadeaux à offrir, et une commission sur ce qui est réellement payé.</p>
          <div className="mt-6">{cta()}</div>
          <p className="mt-2 text-xs text-muted">Gratuit · sur sélection · 18+ · contrat clair signé en ligne</p>
          {app?.status === "refused" && <p className="mt-3 rounded-2xl border border-line p-3 text-xs text-muted">Ta dernière candidature n'a pas été retenue{app.note ? ` : « ${app.note} »` : ""}. Tu peux repostuler 30 jours après la réponse.</p>}
        </div>
      </section>

      <section>
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: MINT }}>Comment ça marche</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">En 4 étapes</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-4 rounded-3xl border border-line bg-surface p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-extrabold text-night" style={{ background: i % 2 ? CORAL : MINT }}>{i + 1}</span>
              <div><h3 className="font-display font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-3xl border p-5" style={{ borderColor: `${MINT}80` }}>
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: MINT }}>Ce que tu gagnes</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">Les vraies règles, sans baratin</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {EARN.map(([i, t, d]) => (
            <div key={t} className="flex gap-3 rounded-2xl bg-night p-4">
              <span className="text-3xl">{i}</span>
              <div><h3 className="font-display font-bold">{t}</h3><p className="text-sm text-muted">{d}</p></div>
            </div>
          ))}
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-muted">
          <li>• Les commissions portent <b className="text-ink">uniquement sur l'argent réellement encaissé</b> (après remboursements et frais).</li>
          <li>• Primes d'inscription (bonus inclus) plafonnées à <b className="text-ink">50 € par mois</b> ; budget global du programme : 350 € par mois.</li>
          <li>• Virement Stripe automatique le 1er du mois dès 20 € dus (statut auto-entrepreneur requis).</li>
          <li>• Aucun revenu n'est garanti : ça dépend de toi.</li>
        </ul>
      </section>

      <Simulator />

      <section>
        <h2 className="font-display text-2xl font-extrabold">Tes outils</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[["🔗", "Ton lien + QR", "À partager ou faire scanner en soirée"], ["🎁", "Codes cadeaux", "hdar+, boosts ou cœurs à offrir"], ["🏷️", "Fiches lieux", "Fais signer les bars et clubs"], ["📊", "Tes compteurs", "Inscrits, validés, commissions"]].map(([i, t, d]) => (
            <div key={t} className="rounded-3xl border border-line bg-surface p-4"><p className="text-2xl">{i}</p><h3 className="mt-1 font-display font-bold">{t}</h3><p className="text-xs text-muted">{d}</p></div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-extrabold">Questions fréquentes</h2>
        <div className="mt-4 space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer font-bold">{q}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-line p-6 text-center">
        <Bokeh />
        <div className="relative">
          <h2 className="font-display text-2xl font-extrabold">Ta ville, ton réseau, tes soirées.</h2>
          <p className="mt-2 text-sm text-muted">Et si ça te rapportait un peu ?</p>
          <div className="mt-5">{cta("Je postule maintenant")}</div>
        </div>
      </section>
    </div>
  );
}

const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-[#3EE08F]";
const chip = (on: boolean) => "rounded-full border px-3 py-1.5 text-sm " + (on ? "border-[#3EE08F] bg-[#3EE08F] font-bold text-night" : "border-line");
const WHY = ["J'adore sortir 🪩", "Je connais plein de monde 🤝", "Je veux un petit complément 💸", "J'aime l'appli ❤️"];
const HOW = ["Soirées & bars 🍸", "Instagram / TikTok 📱", "Bouche à oreille 🗣️", "Asso / communauté 🏳️‍🌈", "Événements 🎪"];

export function ApplyQuiz({ onBack, onDone, demo, start = 0 }: { onBack: () => void; onDone: () => void; demo?: boolean; start?: number }) {
  const [step, setStep] = useState(start);
  const [why, setWhy] = useState<string[]>(demo ? ["J'adore sortir 🪩"] : []);
  const [how, setHow] = useState<string[]>(demo ? ["Soirées & bars 🍸"] : []);
  const [f, setF] = useState<AmbApplyForm>({ motivation: demo ? "Je sors tous les week-ends à Montpellier" : "", city: demo ? "Montpellier" : "", audience: "", promote: "", email: "", consent: false });
  const [busy, setBusy] = useState(false);
  const tog = (l: string[], set: (x: string[]) => void, v: string) => set(l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const motivation = [why.join(", "), f.motivation.trim()].filter(Boolean).join(" — ");
  const promote = [how.join(", "), f.promote.trim()].filter(Boolean).join(" — ");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim());
  const can = [motivation.length >= 20, f.city.trim().length >= 2 && promote.length >= 10, true, emailOk && f.consent][step];
  const send = () => {
    if (demo) return void toast("Aperçu");
    setBusy(true);
    void ambApply({ ...f, motivation, promote }).then(() => { toast("Candidature envoyée 🎉 On te répond vite !"); onDone(); }).catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
  };
  const Q = [
    <div key="0">
      <p className="text-5xl">🎯</p>
      <h2 className="mt-3 font-display text-2xl font-extrabold">Pourquoi toi ?</h2>
      <p className="text-sm text-muted">Coche ce qui te ressemble, puis dis-le avec tes mots.</p>
      <div className="mt-4 flex flex-wrap gap-2">{WHY.map((w) => <button key={w} type="button" className={chip(why.includes(w))} onClick={() => tog(why, setWhy, w)}>{w}</button>)}</div>
      <textarea className={field + " mt-4"} rows={4} maxLength={600} placeholder="Ex. Je sors tous les week-ends, je connais les patrons de bars de mon quartier…" value={f.motivation} onChange={(e) => setF({ ...f, motivation: e.target.value })} />
    </div>,
    <div key="1">
      <p className="text-5xl">📍</p>
      <h2 className="mt-3 font-display text-2xl font-extrabold">Ton terrain de jeu</h2>
      <input className={field + " mt-4"} maxLength={80} placeholder="Ta ville (ex. Montpellier)" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      <p className="mt-4 text-sm font-bold">Comment tu ferais connaître hdar ?</p>
      <div className="mt-2 flex flex-wrap gap-2">{HOW.map((w) => <button key={w} type="button" className={chip(how.includes(w))} onClick={() => tog(how, setHow, w)}>{w}</button>)}</div>
      <textarea className={field + " mt-3"} rows={3} maxLength={500} placeholder="Un détail ? (facultatif si tu as coché)" value={f.promote} onChange={(e) => setF({ ...f, promote: e.target.value })} />
    </div>,
    <div key="2">
      <p className="text-5xl">📣</p>
      <h2 className="mt-3 font-display text-2xl font-extrabold">Ta communauté</h2>
      <p className="text-sm text-muted">Facultatif : un compte, une asso, une soirée que tu organises… et à peu près combien de personnes.</p>
      <textarea className={field + " mt-4"} rows={3} maxLength={300} placeholder="Ex. @montpellier.nights, ~2 000 abonnés" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} />
    </div>,
    <div key="3">
      <p className="text-5xl">✉️</p>
      <h2 className="mt-3 font-display text-2xl font-extrabold">Où t'envoyer la réponse ?</h2>
      <p className="text-sm text-muted">Si c'est oui, c'est par email que tu reçois ton lien pour signer ton contrat, puis ton contrat signé.</p>
      <input className={field + " mt-4"} type="email" autoComplete="email" maxLength={254} placeholder="ton@email.fr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <label className="mt-3 flex gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span>J'accepte que hdar utilise cet email uniquement pour répondre à ma candidature et m'envoyer mon contrat d'ambassadeur. Il n'est jamais affiché ni partagé. Si ma candidature est refusée, il est effacé dès l'envoi de la réponse ; mes réponses sont supprimées au plus tard 6 mois après la décision. Je peux demander l'accès ou la suppression à contact@hdar.chat (<a href="/confidentialite" className="underline">confidentialité</a>).</span></label>
    </div>,
  ];
  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={step ? () => setStep(step - 1) : onBack} className="text-sm text-muted underline">← Retour</button>
        <div className="flex flex-1 gap-1.5">{Q.map((_, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= step ? MINT : "var(--color-line)" }} />)}</div>
        <span className="text-xs text-muted">{step + 1}/4</span>
      </div>
      <div className="mt-6 rounded-3xl border border-line bg-surface p-5">{Q[step]}</div>
      {step < 3
        ? <button type="button" disabled={!can} onClick={() => setStep(step + 1)} className="mt-4 w-full rounded-full py-3.5 font-display text-lg font-extrabold text-night disabled:opacity-40" style={{ background: MINT }}>{step === 2 && !f.audience ? "Passer" : "Suivant"} →</button>
        : <button type="button" disabled={!can || busy} onClick={send} className="mt-4 w-full rounded-full py-3.5 font-display text-lg font-extrabold text-night disabled:opacity-40" style={{ background: MINT }}>Envoyer ma candidature 🚀</button>}
    </div>
  );
}

/** /ambassadeur : espace si ambassadeur ou lien de signature, sinon page de présentation + candidature. */
export function AmbassadorPage() {
  const [mode, setMode] = useState<"loading" | "space" | "demo" | "landing" | "apply">("loading");
  const [st, setSt] = useState<AmbApplyStatus | null>(null);
  const load = () => {
    const q = new URLSearchParams(location.search);
    if (import.meta.env.DEV && q.has("demo")) return setMode(q.get("demo") === "landing" ? "landing" : "demo");
    if (q.get("i") || q.get("connect")) return setMode("space");
    void Promise.all([ambMe().catch(() => null), ambApplyStatus().catch(() => null)]).then(([me, s]) => {
      setSt(s);
      setMode(me ? "space" : q.get("postuler") != null && s?.profile ? "apply" : "landing");
    });
  };
  useEffect(load, []);
  const apply = () => {
    if (!st?.profile) { toast("Crée d'abord ton profil hdar (pseudo + photo), puis reviens postuler."); location.href = "/"; return; }
    setMode("apply"); window.scrollTo(0, 0);
  };
  return (
    <main className="h-dvh overflow-y-auto bg-night px-5 py-6 pb-16 text-ink">
      <div className="mx-auto max-w-md sm:max-w-2xl">
        <a href="/" className="text-sm text-muted underline">← Retour</a>
        {mode === "loading" && <p className="p-6 text-center text-muted">Chargement…</p>}
        {mode === "space" && <><h1 className="mt-2 mb-4 font-display text-3xl font-extrabold">🎯 Espace ambassadeur</h1><AmbassadorSpace /></>}
        {mode === "demo" && <><h1 className="mt-2 mb-4 font-display text-3xl font-extrabold">🎯 Espace ambassadeur</h1><AmbassadorSpace demo={demoAmb()} /></>}
        {mode === "landing" && <AmbLanding status={st} onApply={apply} />}
        {mode === "apply" && <ApplyQuiz onBack={() => setMode("landing")} onDone={() => { setMode("loading"); load(); }} />}
      </div>
    </main>
  );
}
