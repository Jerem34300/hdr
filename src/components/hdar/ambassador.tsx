import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { ambContractPdf, ambSign, ambAttach, ambConnect, ambCodeCreate, ambInviteInfo, ambMe, ambPlaceCreate, type AmbMe } from "@/lib/hdar/live";

const SITE = "https://hdar.chat";
const AMB_KEY = "hdar-amb";
const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-signal";

/** ?a=CODE → mémorisé puis rattaché au profil dès qu'il existe. */
export function captureAmb() {
  if (typeof location === "undefined") return;
  const a = new URLSearchParams(location.search).get("a");
  if (a && /^[A-Za-z0-9]{4,12}$/.test(a) && !localStorage.getItem(AMB_KEY)) localStorage.setItem(AMB_KEY, a.toUpperCase());
}
export async function tryAmbAttach() {
  const c = typeof localStorage !== "undefined" ? localStorage.getItem(AMB_KEY) : null;
  if (!c) return;
  try { await ambAttach(c); localStorage.removeItem(AMB_KEY); } catch { /* profil pas encore créé : on réessaiera */ }
}

function Qr({ text, size = 240 }: { text: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => void QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: "#0b0b10", light: "#ffffff" } }).then(setSrc), [text, size]);
  return src ? <img src={src} alt="QR code" width={size} height={size} className="mx-auto rounded-2xl bg-white p-2" /> : <div style={{ width: size, height: size }} className="mx-auto rounded-2xl bg-white/10" />;
}

/** Carte « Gagne de l'argent » pour les non-ambassadeurs (Profil). */
export function BecomeAmbCard() {
  return (
    <a href="/ambassadeur" className="mt-3 flex items-center gap-3 rounded-3xl border border-[#3EE08F]/50 bg-surface p-4">
      <span className="text-3xl">💸</span>
      <span className="min-w-0 flex-1"><b className="block font-display">Gagne de l'argent avec hdar</b><span className="text-xs text-muted">Fais connaître l'appli autour de toi, touche une commission</span></span>
      <span className="text-sm font-bold whitespace-nowrap text-[#3EE08F]">Deviens ambassadeur ›</span>
    </a>
  );
}

/** Carte en haut du Profil (seulement pour les ambassadeurs). */
let ambCache: Promise<AmbMe | null> | null = null;
export function AmbassadorCard() {
  const [me, setMe] = useState<AmbMe | null | undefined>(undefined);
  useEffect(() => { ambCache ??= ambMe().catch(() => { ambCache = null; return null; }); void ambCache.then(setMe); }, []);
  if (me === undefined) return null;
  if (!me) return <BecomeAmbCard />;
  if (me.needs_terms) return <a href="/ambassadeur" className="mt-3 block rounded-3xl border border-dashed border-[#3EE08F] p-4 text-sm">🎯 <b>Devenir ambassadeur</b> : accepte la charte pour activer ton espace ›</a>;
  return (
    <a href="/ambassadeur" className="mt-3 block rounded-3xl bg-gradient-to-r from-[#3EE08F] via-[#22d3ee] to-[#a78bfa] p-[2px]">
      <span className="flex items-center gap-3 rounded-[22px] bg-[#0b0b10]/90 p-4">
        <span className="text-3xl">🎯</span>
        <span className="min-w-0 flex-1"><b className="block font-display text-lg">Espace ambassadeur</b><span className="text-xs text-white/75">QR d'inscription, codes cadeaux, fiches partenaires · {me.month.validated} inscrit(s) validé(s) ce mois</span></span>
        <span className="text-sm font-bold text-[#3EE08F]">Ouvrir ›</span>
      </span>
    </a>
  );
}

export function AmbassadorSpace({ demo }: { demo?: AmbMe }) {
  const [me, setMe] = useState<AmbMe | null | undefined>(demo);
  const [view, setView] = useState<"home" | "code" | "place">("home");
  const [shown, setShown] = useState<string | null>(null);
  const load = () => { if (!demo) void ambMe().then(setMe).catch(() => setMe(null)); };
  useEffect(load, [demo]);
  useEffect(() => { const c = new URLSearchParams(location.search).get("connect"); if (c === "done") toast("Merci ! Stripe vérifie tes infos, les versements s'activeront automatiquement."); }, []);
  if (me === undefined) return <p className="p-6 text-center text-muted">Chargement…</p>;
  const invite = typeof location !== "undefined" ? new URLSearchParams(location.search).get("i") : null;
  if (me === null && invite) return <Onboard token={invite} onDone={load} />;
  if (me === null) return <p className="p-6 text-center text-muted">Cet espace est réservé aux ambassadeurs hdar (sur invitation).</p>;
  if (me.needs_terms) return <Onboard token={invite ?? ""} onDone={load} />;
  const link = `${SITE}/?a=${me.code}`;
  if (shown) return (
    <div className="text-center">
      <p className="text-sm text-muted">Fais scanner ce code 🎁</p>
      <div className="mt-4"><Qr text={`${SITE}/?code=${shown}`} size={260} /></div>
      <p className="mt-4 font-mono text-4xl font-extrabold tracking-[0.2em]">{shown}</p>
      <p className="mt-1 text-xs text-muted">Usage unique · valable 30 jours · à saisir dans Profil › Code cadeau</p>
      <button type="button" onClick={() => setShown(null)} className="mt-6 h-12 w-full rounded-full border border-line">Terminé</button>
    </div>
  );
  if (view === "code") return <CodeForm me={me} demo={!!demo} onBack={() => setView("home")} onCode={(c) => { setShown(c); setView("home"); load(); }} />;
  if (view === "place") return <PlaceDraft demo={!!demo} onBack={() => { setView("home"); load(); }} />;
  const m = me.month;
  return (
    <div>
      <section className="rounded-3xl border border-[#3EE08F]/60 bg-surface p-5 text-center">
        <p className="text-xs font-bold tracking-[0.25em] text-[#3EE08F] uppercase">Inscription sur place</p>
        <div className="mt-3"><Qr text={link} /></div>
        <p className="mt-3 font-mono text-sm break-all">{link.replace("https://", "")}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="h-11 flex-1 rounded-full border border-line text-sm" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Lien copié"))}>Copier</button>
          <button type="button" className="h-11 flex-1 rounded-full border border-line text-sm" onClick={() => void navigator.share?.({ url: link, title: "hdar." }).catch(() => undefined)}>Partager</button>
        </div>
      </section>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setView("code")} className="rounded-3xl bg-gradient-to-br from-[#fbbf24] to-[#FA6F6C] p-4 text-left text-night"><span className="text-2xl">🎁</span><b className="block font-display">Code cadeau</b><span className="text-xs">{me.codes_left}/{me.codes_per_week} restants cette semaine</span></button>
        <button type="button" onClick={() => setView("place")} className="rounded-3xl bg-gradient-to-br from-[#3EE08F] to-[#22d3ee] p-4 text-left text-night"><span className="text-2xl">🏷️</span><b className="block font-display">Fiche partenaire</b><span className="text-xs">Créer un lieu + lien à envoyer</span></button>
      </div>
      <section className="mt-4 rounded-3xl border border-line bg-surface p-4">
        <p className="text-sm font-bold">Ce mois-ci</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {([["Inscrits", m.signups], ["Validés 📸", m.validated], ["Codes utilisés", `${m.codes_redeemed}/${m.codes_created}`], ["Lieux signés", m.places], ["Lieux actifs", me.total.places_active], ["Commission", eur(m.commission)]] as const).map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-night p-2"><b className="block text-lg">{v}</b><span className="text-[11px] text-muted">{l}</span></div>))}
        </div>
        <div className="mt-3 rounded-2xl bg-night p-3 text-sm"><div className="flex justify-between"><span>Gagné depuis le début</span><b>{eur(me.total.commission)}</b></div><div className="flex justify-between"><span>Déjà versé</span><b>{eur(me.paid_total)}</b></div><div className="flex justify-between text-[#3EE08F]"><span>À recevoir</span><b>{eur(Math.max(0, me.total.commission - me.paid_total))}</b></div>
          <p className="mt-1 text-xs text-muted">Virement automatique le 1er du mois dès {eur(me.min_payout_cents)} dus, via Stripe. Seuls les paiements réellement encaissés comptent ; un remboursement annule la commission liée.{me.paused && " ⏸️ Versements en pause (contacte hdar)."}</p>
          <ConnectButton state={me.connect} demo={!!demo} />
          <div className="mt-2 flex gap-2 text-xs">
            <button type="button" className="h-9 flex-1 rounded-full border border-line" onClick={() => demo ? toast("Aperçu") : void ambContractPdf().catch((e: Error) => toast(e.message))}>📄 Mon contrat{me.contract ? ` (${me.contract.version})` : ""}</button>
            <a href="/ambassadeur/guide" className="flex h-9 flex-1 items-center justify-center rounded-full border border-line">📘 Guide ambassadeur</a>
          </div></div>
        <p className="mt-3 text-xs text-muted">Tes règles : {eur(me.per_signup_cents)} par inscrit validé (photo approuvée et toujours actif 7 jours après) · {me.user_pct} % du net dépensé par tes inscrits pendant {me.user_months} mois · {me.partner_pct} % de l'abonnement net des partenaires signés pendant {me.partner_months} mois · bonus {eur(me.bonus_cents)} à {me.bonus_at} validés dans le mois. Primes d'inscription (bonus inclus) plafonnées à 50 € par mois ; hdar peut fixer un budget global mensuel. Les % ne sont pas plafonnés. Tu ne vois que des compteurs, jamais l'identité des membres.</p>
      </section>
      {me.places.length > 0 && <section className="mt-4 rounded-3xl border border-line bg-surface p-4">
        <p className="text-sm font-bold">Mes fiches partenaires</p>
        {me.places.map((p) => (
          <div key={p.id} className="mt-2 rounded-2xl bg-night p-3 text-sm">
            <b>{p.name}</b> <span className="text-xs text-muted">· {p.active ? "✅ active" : p.claimed ? "🔑 réclamée, en attente de paiement" : "✉️ à réclamer"}{p.promo ? ` · promo ${p.promo_status === "approved" ? "acceptée" : p.promo_status === "refused" ? "refusée" : "en attente"}` : ""}</span>
            {p.token && <button type="button" className="mt-2 block text-xs text-[#3EE08F] underline" onClick={() => void navigator.clipboard?.writeText(`${SITE}/pro?claim=${p.token}`).then(() => toast("Lien du propriétaire copié"))}>Copier le lien pour le propriétaire</button>}
          </div>))}
      </section>}
      {me.codes.length > 0 && <section className="mt-4 rounded-3xl border border-line bg-surface p-4">
        <p className="text-sm font-bold">Derniers codes</p>
        {me.codes.map((c) => (
          <button key={c.code} type="button" disabled={c.used} onClick={() => setShown(c.code)} className="mt-1 flex w-full justify-between rounded-xl px-2 py-1.5 text-left text-sm disabled:opacity-40">
            <span className="font-mono">{c.code}</span><span className="text-xs text-muted">{label(c.kind, c.amount)} · {c.used ? "utilisé" : "dispo"}</span>
          </button>))}
      </section>}
    </div>
  );
}

const label = (k: string, n: number) => (k === "premium" ? `${n} j hdar+` : k === "boost" ? `boost ${n} h` : `${n} cœurs`);

function CodeForm({ me, demo, onBack, onCode }: { me: AmbMe; demo: boolean; onBack: () => void; onCode: (c: string) => void }) {
  const opts: [string, string, number[]][] = [
    ["premium", "hdar+", [1, 3, 7].filter((x) => x <= me.max_days)],
    ["boost", "Boost", [1, 3, 24].filter((x) => x <= me.max_boost_h)],
    ["hearts", "Cœurs", [5, 10, 20, 50].filter((x) => x <= me.max_hearts)],
  ];
  const [busy, setBusy] = useState(false);
  const go = (k: string, n: number) => {
    if (demo) return onCode("A7K2Q9XZ");
    setBusy(true);
    void ambCodeCreate(k, n).then(onCode).catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
  };
  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-muted underline">← Retour</button>
      <h2 className="mt-3 font-display text-2xl font-extrabold">Créer un code cadeau</h2>
      <p className="text-sm text-muted">Usage unique, {me.codes_left} restant(s) cette semaine.</p>
      {opts.map(([k, l, vals]) => vals.length > 0 && (
        <section key={k} className="mt-4"><p className="text-sm font-bold">{l}</p>
          <div className="mt-2 flex flex-wrap gap-2">{vals.map((v) => (
            <button key={v} type="button" disabled={busy || me.codes_left <= 0} onClick={() => go(k, v)} className="rounded-full border border-[#fbbf24]/60 px-4 py-2 text-sm font-bold text-[#fbbf24] disabled:opacity-40">{label(k, v)}</button>))}</div>
        </section>))}
    </div>
  );
}

function PlaceDraft({ demo, onBack }: { demo: boolean; onBack: () => void }) {
  const [f, setF] = useState({ kind: "bar", name: "", description: "", contact: "", promo: "" });
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast("Position indisponible"), { enableHighAccuracy: true });
  const save = () => {
    if (!f.name.trim() || !pos) return void toast("Nom et position requis");
    if (demo) return setLink(`${SITE}/pro?claim=demo`);
    setBusy(true);
    void ambPlaceCreate({ ...f, ...pos }).then((r) => setLink(`${SITE}/pro?claim=${r.token}`)).catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
  };
  if (link) return (
    <div className="text-center">
      <p className="font-display text-2xl font-extrabold">Fiche créée ✅</p>
      <p className="mt-1 text-sm text-muted">Fais scanner au gérant : il réclame la fiche puis choisit son abonnement.</p>
      <div className="mt-4"><Qr text={link} /></div>
      <button type="button" className="mt-4 h-11 w-full rounded-full border border-line text-sm" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Lien copié"))}>Copier le lien</button>
      <button type="button" onClick={onBack} className="mt-2 h-11 w-full rounded-full border border-line text-sm">Terminé</button>
    </div>
  );
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-muted underline">← Retour</button>
      <h2 className="font-display text-2xl font-extrabold">Nouvelle fiche partenaire</h2>
      <select className={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
        <option value="bar">Bar</option><option value="club">Club</option><option value="sauna">Sauna</option><option value="other">Autre</option></select>
      <input className={field} placeholder="Nom de l'établissement" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <textarea className={field} rows={3} placeholder="Description (le gérant pourra la modifier)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className={field} placeholder="Contact pro (site, téléphone de l'établissement)" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
      <button type="button" onClick={locate} className="h-11 w-full rounded-full border border-line text-sm">{pos ? `📍 ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : "📍 Utiliser ma position (je suis sur place)"}</button>
      <input className={field} placeholder="Promo de lancement proposée (ex. 1er mois -50 %)" value={f.promo} onChange={(e) => setF({ ...f, promo: e.target.value })} />
      <p className="text-xs text-muted">La promo est soumise à validation par hdar avant d'être proposée au gérant.</p>
      <button type="button" disabled={busy} onClick={save} className="boost-cta h-12 w-full rounded-full font-display font-extrabold text-night disabled:opacity-60">Créer la fiche</button>
    </div>
  );
}

export function demoAmb(): AmbMe {
  const s = { signups: 23, validated: 17, codes_created: 9, codes_redeemed: 7, places: 2, places_claimed: 2, places_active: 1, revenue_users: 4590, revenue_partners: 7900, commission: 1840, paid: 0, bonuses: 0 };
  return { user_pct: 20, user_months: 6, bonus_cents: 2000, bonus_at: 50, min_payout_cents: 2000, paid_total: 5000, code: "LUCAS7", codes_per_week: 10, codes_left: 6, max_days: 3, max_boost_h: 24, max_hearts: 20, per_signup_cents: 50, partner_pct: 25, partner_months: 3,
    month: s, total: { ...s, signups: 61, validated: 44, commission: 11380 },
    codes: [{ code: "A7K2Q9XZ", kind: "premium", amount: 3, used: false, expires_at: "" }, { code: "A1B4C8DE", kind: "boost", amount: 24, used: true, expires_at: "" }],
    connect: "ready", paused: false, contract: { version: "v1", at: "2026-10-13T12:00:00Z", name: "Lucas Martin" }, places: [{ id: "1", name: "Le Néon", kind: "bar", claimed: true, active: true, token: null, promo: "1er mois -50 %", promo_status: "approved" }, { id: "2", name: "Club Velvet", kind: "club", claimed: false, active: false, token: "x", promo: null, promo_status: null }] };
}

function ConnectButton({ state, demo }: { state: AmbMe["connect"]; demo: boolean }) {
  const [busy, setBusy] = useState(false);
  const go = (a: "onboard" | "dashboard") => { if (demo) return void toast("Aperçu"); setBusy(true); void ambConnect(a).then((u) => { location.href = u; }).catch((e: Error) => { toast(e.message); setBusy(false); }); };
  if (state === "ready") return <button type="button" disabled={busy} onClick={() => go("dashboard")} className="mt-2 h-10 w-full rounded-full border border-[#3EE08F] text-sm text-[#3EE08F]">✅ Compte de versement Stripe actif · voir mes virements</button>;
  return <button type="button" disabled={busy} onClick={() => go("onboard")} className="mt-2 h-10 w-full rounded-full bg-[#635bff] text-sm font-bold text-white">{state === "pending" ? "Terminer mon inscription Stripe" : "Configurer mes versements (Stripe)"}</button>;
}

const CHARTE = [
  "Je propose hdar uniquement à des adultes (18+) qui le souhaitent, sans insister.",
  "Pas de spam : ni messages en masse, ni affichage sauvage, ni publicité trompeuse.",
  "Pas de faux comptes ni d'inscriptions forcées : toute fraude annule les commissions et met fin au programme.",
  "Je ne demande jamais d'identité, de photo ou de données personnelles aux personnes inscrites.",
  "Pour être payé, je dois avoir un statut d'auto-entrepreneur (SIRET) et déclarer ces revenus : les commissions sont versées par virement Stripe.",
  "Les commissions ne portent que sur des paiements réellement encaissés ; un abonnement résilié ne rapporte plus rien, un remboursement annule la commission liée.",
  "hdar peut modifier les règles de commission, mettre en pause les versements ou retirer le rôle à tout moment.",
];
function Onboard({ token, onDone }: { token: string; onDone: () => void }) {
  const [info, setInfo] = useState<{ valid: boolean; photo_ok: boolean } | null>(null);
  const [html, setHtml] = useState("");
  const [ok, setOk] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => void ambInviteInfo(token).then(setInfo).catch(() => setInfo({ valid: false, photo_ok: false })), [token]);
  useEffect(() => void fetch("/ambassadeur/contrat-v2.html").then((r) => r.text()).then(setHtml).catch(() => undefined), []);
  if (!info) return <p className="p-6 text-center text-muted">Chargement…</p>;
  const nameOk = name.trim().length >= 4 && /\s/.test(name.trim());
  const submit = () => {
    setBusy(true);
    void ambSign(token, name.trim(), email.trim()).then(async (r) => {
      toast(r.mailed ? "Contrat signé ✅ Une copie PDF t'a été envoyée par email." : "Contrat signé ✅ Retrouve-le dans « 📄 Mon contrat ».");
      history.replaceState(null, "", "/ambassadeur");
      try { location.href = await ambConnect("onboard"); } catch (e) { toast((e as Error).message); onDone(); }
    }).catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Tu as été invité à devenir ambassadeur hdar. Lis la charte et le contrat, signe-le en tapant ton nom, puis configure tes versements avec Stripe (identité, IBAN et SIRET sont saisis chez Stripe, hdar ne les stocke pas).</p>
      {!info.photo_ok && <p className="rounded-2xl border border-[#fbbf24] px-4 py-3 text-sm text-[#fbbf24]">📸 Il faut d'abord un profil avec une photo validée. <a href="/" className="underline">Compléter mon profil</a></p>}
      {token && !info.valid && <p className="rounded-2xl border border-signal px-4 py-3 text-sm text-signal">Ce lien d'invitation est expiré ou déjà utilisé.</p>}
      <section className="rounded-3xl border border-line bg-surface p-4"><p className="font-bold">Charte ambassadeur</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{CHARTE.map((c) => <li key={c}>{c}</li>)}</ul></section>
      <section className="rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between"><p className="font-bold">📄 Contrat ambassadeur (v2)</p><a href="/ambassadeur/contrat-v2.pdf" target="_blank" rel="noreferrer" className="text-xs underline">PDF</a></div>
        <div className="amb-contract mt-2 max-h-[55vh] overflow-y-auto rounded-2xl bg-white p-4 text-[13px] leading-relaxed text-[#111]" dangerouslySetInnerHTML={{ __html: html || "Chargement du contrat…" }} />
      </section>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> J'ai lu et j'accepte le contrat (et la charte).</label>
      <input className={field} placeholder="Nom et prénom (signature électronique)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <input className={field} type="email" placeholder="Email pour recevoir ton contrat (facultatif si déjà lié)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="text-xs text-muted">En tapant ton nom, tu signes électroniquement (art. 1367 du Code civil). Nous enregistrons la date, la version du contrat et une empreinte non réversible de ton adresse IP.</p>
      <button type="button" disabled={!ok || !nameOk || busy || !info.photo_ok} onClick={submit} className="boost-cta h-12 w-full rounded-full font-display font-extrabold text-night disabled:opacity-50">Signer et configurer mes versements</button>
      <style>{`.amb-contract h1,.amb-contract h2{font-weight:800;margin:14px 0 6px}.amb-contract h2{font-size:14px}.amb-contract p{margin:6px 0}.amb-contract ul{list-style:disc;padding-left:20px}.amb-contract table{width:100%;border-collapse:collapse;margin:8px 0}.amb-contract th,.amb-contract td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}`}</style>
    </div>
  );
}

/** aperçu dev uniquement */
export function AmbOnboardPreview() { return <Onboard token="" onDone={() => undefined} />; }
