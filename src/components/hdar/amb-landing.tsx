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
      <span className="absolute -top-16 -start-10 size-56 rounded-full opacity-40 blur-3xl" style={{ background: MINT }} />
      <span className="absolute top-24 -end-16 size-64 rounded-full opacity-25 blur-3xl" style={{ background: CORAL }} />
      <span className="absolute bottom-0 start-1/3 size-40 rounded-full opacity-20 blur-3xl" style={{ background: "#a78bfa" }} />
    </div>
  );
}

// Lancement : aucune récompense en argent. Récompenses en boosts et hdar+ (règles réelles : hdar.amb_settings, migration v109).
export const AMB_REWARDS = { boostPerSignup: 1, boostCap: 20, bonusAt: 10, bonusDays: 7, placeDays: 7, placeCap: 4 };
const EARN = [
  ["🚀", "1 boost par inscrit validé", "Quelqu'un s'inscrit avec ton lien ou ton QR et sa photo est validée : un boost gratuit pour toi (jusqu'à 20 par mois)."],
  ["⭐", "7 jours de hdar+ par lieu partenaire", "Tu fais réclamer sa fiche à un bar, un club ou un sauna : 7 jours de hdar+ offerts (jusqu'à 4 lieux par mois)."],
  ["🏆", "Bonus : 7 jours de hdar+", "Si tu atteins 10 inscrits validés dans le mois."],
  ["🎁", "Des cadeaux à offrir", "Codes hdar+, boosts ou cœurs à offrir autour de toi, chaque semaine."],
] as const;

function simulate(n: number, p: number) {
  const r = AMB_REWARDS;
  const boosts = Math.min(r.boostCap, n * r.boostPerSignup);
  const days = Math.min(r.placeCap, p) * r.placeDays + (n >= r.bonusAt ? r.bonusDays : 0);
  return { boosts, days };
}
function Simulator() {
  const [n, setN] = useState(10);
  const [p, setP] = useState(0);
  const r = simulate(n, p);
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: GOLD }}>Simulateur</p>
      <h2 className="mt-1 font-display text-2xl font-extrabold">Ce que tu débloques chaque mois</h2>
      <label className="mt-4 block text-sm font-bold">Inscrits validés par mois : <span style={{ color: MINT }}>{n}</span>
        <input type="range" min={0} max={50} step={1} value={n} onChange={(e) => setN(+e.target.value)} className="mt-2 w-full accent-[#3EE08F]" /></label>
      <label className="mt-3 block text-sm font-bold">Lieux partenaires réclamés par mois : <span style={{ color: MINT }}>{p}</span>
        <input type="range" min={0} max={5} step={1} value={p} onChange={(e) => setP(+e.target.value)} className="mt-2 w-full accent-[#3EE08F]" /></label>
      <div className="mt-4 space-y-1.5 rounded-2xl bg-night p-4 text-sm">
        <p className="flex justify-between"><span className="text-muted">Boosts gratuits</span><b style={{ color: MINT }}>{r.boosts}</b></p>
        <p className="flex justify-between"><span className="text-muted">Jours de hdar+{n >= AMB_REWARDS.bonusAt ? " (bonus inclus)" : ""}</span><b style={{ color: MINT }}>{r.days}</b></p>
      </div>
      <p className="mt-3 text-xs text-muted">Pendant le lancement, le programme ne verse aucune somme d'argent : les récompenses sont uniquement des boosts et du hdar+, crédités automatiquement sur ton compte.</p>
    </section>
  );
}

const STEPS = [
  ["Tu postules", "Un petit questionnaire de 2 minutes, depuis ton profil hdar."],
  ["On te répond", "On lit chaque candidature à la main. Si c'est oui, tu reçois un email de contact@hdar.chat avec ton lien personnel."],
  ["Tu acceptes la charte", "Tu lis la charte ambassadeur, tu coches « J'accepte » et tu tapes ton nom."],
  ["Tu fais connaître hdar", "Ton code, ton lien, ton QR à faire scanner, des codes cadeaux à offrir et le guide ambassadeur."],
] as const;

const FAQ = [
  ["Qu'est-ce que je gagne ?", "Pendant le lancement : 1 boost gratuit par inscrit validé (jusqu'à 20 par mois), 7 jours de hdar+ en bonus à 10 validés dans le mois, et 7 jours de hdar+ par lieu partenaire qui réclame sa fiche (jusqu'à 4 par mois). Aucune somme d'argent n'est versée."],
  ["Comment je reçois mes récompenses ?", "Automatiquement : les boosts arrivent dans Profil → Parrainage, le hdar+ s'ajoute directement à ton compte. Rien à déclarer, aucun statut à créer."],
  ["Je vois qui s'inscrit avec mon lien ?", "Non. Tu ne vois que des compteurs (inscrits, validés, récompenses), jamais l'identité ni la position des membres."],
  ["Qu'est-ce qui est interdit ?", "Le spam, l'affichage sauvage, les faux comptes, insister auprès des gens ou démarcher des mineurs. Toute fraude annule les récompenses et met fin au programme."],
  ["Je peux arrêter quand je veux ?", "Oui, à tout moment. hdar peut aussi faire évoluer les règles ou retirer le rôle, comme prévu dans la charte."],
] as const;

export function AmbLanding({ onApply, status }: { onApply: () => void; status: AmbApplyStatus | null }) {
  const app = status?.application;
  const cta = (label = "Je postule") => {
    if (app?.status === "pending") return <p className="rounded-full border px-5 py-3 text-center text-sm font-bold" style={{ borderColor: GOLD, color: GOLD }}>⏳ Candidature envoyée, on te répond vite</p>;
    if (app?.status === "accepted") return <p className="rounded-full border px-5 py-3 text-center text-sm font-bold" style={{ borderColor: MINT, color: MINT }}>✅ Acceptée ! Regarde tes emails pour activer ton espace</p>;
    return (
      <button type="button" onClick={onApply} className="h-14 w-full rounded-full font-display text-lg font-extrabold text-night shadow-lg sm:w-auto sm:px-10" style={{ background: MINT, boxShadow: `0 10px 40px -8px ${MINT}` }}>
        {label} 🚀
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
            Fais connaître hdar autour de toi et <span style={{ color: MINT }}>gagne des boosts et du hdar+</span> pour <span style={{ color: CORAL }}>chaque personne</span> qui nous rejoint.
          </h1>
          <p className="mt-4 text-base text-muted">Tu sors, tu as du monde autour de toi, tu connais les bars et les soirées de ta ville ? Deviens ambassadeur : ton lien, ton QR, des codes cadeaux à offrir, et des boosts et du hdar+ pour chaque inscrit et chaque lieu que tu fais venir.</p>
          <div className="mt-6">{cta()}</div>
          <p className="mt-2 text-xs text-muted">Gratuit · sur sélection · 18+ · charte claire acceptée en ligne</p>
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
          <li>• Pendant le lancement, <b className="text-ink">aucune récompense en argent</b> : uniquement des boosts et du hdar+.</li>
          <li>• Un inscrit est validé quand sa photo est approuvée ; un lieu compte quand son gérant réclame la fiche.</li>
          <li>• Récompenses créditées automatiquement, sans démarche ni statut à créer.</li>
        </ul>
      </section>

      <Simulator />

      <section>
        <h2 className="font-display text-2xl font-extrabold">Tes outils</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[["🔗", "Ton lien + QR", "À partager ou faire scanner en soirée"], ["🎁", "Codes cadeaux", "hdar+, boosts ou cœurs à offrir"], ["🏷️", "Fiches lieux", "Fais signer les bars et clubs"], ["📊", "Tes compteurs", "Inscrits, validés, récompenses"]].map(([i, t, d]) => (
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
          <p className="mt-2 text-sm text-muted">Et en plus, tu gagnes des boosts et du hdar+.</p>
          <div className="mt-5">{cta("Je postule maintenant")}</div>
        </div>
      </section>
    </div>
  );
}

const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-[#3EE08F]";
const chip = (on: boolean) => "rounded-full border px-3 py-1.5 text-sm " + (on ? "border-[#3EE08F] bg-[#3EE08F] font-bold text-night" : "border-line");
const WHY = ["J'adore sortir 🪩", "Je connais plein de monde 🤝", "Je veux des boosts et du hdar+ 🚀", "J'aime l'appli ❤️"];
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
      <p className="text-sm text-muted">Si c'est oui, c'est par email que tu reçois ton lien pour accepter la charte et activer ton espace.</p>
      <input className={field + " mt-4"} type="email" autoComplete="email" maxLength={254} placeholder="ton@email.fr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <label className="mt-3 flex gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span>J'accepte que hdar utilise cet email uniquement pour répondre à ma candidature et m'envoyer mon lien d'ambassadeur. Il n'est jamais affiché ni partagé. Si ma candidature est refusée, il est effacé dès l'envoi de la réponse ; mes réponses sont supprimées au plus tard 6 mois après la décision. Je peux demander l'accès ou la suppression à contact@hdar.chat (<a href="/confidentialite" className="underline">confidentialité</a>).</span></label>
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
