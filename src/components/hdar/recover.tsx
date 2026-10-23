import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { newsSet, newsStatus } from "@/lib/hdar/live";
import { linkedEmail, linkEmailStart, linkEmailVerify, recoverStart, recoverVerify } from "@/lib/hdar/recover";

const input = "h-11 w-full rounded-full border border-line bg-night px-4 text-base text-ink outline-none focus-visible:border-signal";

/** Fin de la page profil : lier un email (facultatif) pour retrouver son profil. */
export function ProtectProfileCard() {
  const [state, setState] = useState<{ email: string | null; pending: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void linkedEmail().then((s) => { setState(s); if (s.pending) { setEmail(s.pending); setStep("code"); } }).catch(() => setState({ email: null, pending: null })); }, []);
  const [news, setNews] = useState(false);
  useEffect(() => { void newsStatus().then((r) => setNews(r.on)).catch(() => undefined); }, []);
  const newsBox = (apply: boolean) => (
    <label className="mt-3 flex items-start gap-2 text-xs text-muted">
      <input type="checkbox" className="mt-0.5" checked={news} onChange={(e) => { const v = e.target.checked; setNews(v); if (apply) void newsSet(v).then(() => toast(v ? "Inscrit aux nouveautés ✅" : "Désinscrit des nouveautés")).catch((err: Error) => { setNews(!v); toast(err.message); }); }} />
      <span>Recevoir les nouveautés hdar par email (facultatif, désinscription en un clic dans chaque email).</span>
    </label>
  );
  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(false); } };

  if (state?.email) {
    return (
      <section className="mt-8 rounded-3xl border border-[#A1E3C3]/50 bg-[#A1E3C3]/10 p-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6 shrink-0 text-[#A1E3C3]" />
          <p className="text-sm"><b>Profil protégé.</b> <span className="text-muted">Tu peux le retrouver avec {state.email}. Jamais visible par les autres.</span></p>
        </div>
        {newsBox(true)}
      </section>
    );
  }
  return (
    <section className="mt-8 rounded-3xl border-2 border-[#FA6F6C]/60 bg-gradient-to-br from-[#FA6F6C]/15 to-[#fbbf24]/10 p-5">
      <h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><ShieldCheck className="size-5 text-[#FA6F6C]" /> Protège ton profil</h2>
      <p className="mt-1 text-sm text-muted">Retrouve-le facilement si tu le supprimes ou si tu nettoies ton téléphone. Facultatif, jamais affiché.</p>
      {step === "email" ? (
        <div className="mt-3 flex gap-2">
          <input className={input} type="email" inputMode="email" autoComplete="email" placeholder="ton@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => void run(async () => { await linkEmailStart(email); setStep("code"); toast("Code envoyé par email"); })}
            className="h-11 shrink-0 rounded-full bg-[#FA6F6C] px-4 text-sm font-bold text-night disabled:opacity-40">{busy ? "…" : "Recevoir le code"}</button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">Code envoyé à <b className="text-ink">{email}</b></p>
          <div className="flex gap-2">
            <input className={input + " tracking-[0.4em]"} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="Code reçu" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            <button type="button" disabled={busy || code.length < 6 || code.length > 8} onClick={() => void run(async () => { await linkEmailVerify(email, code); if (news) await newsSet(true).catch(() => undefined); setState({ email, pending: null }); toast("Profil protégé ✅"); })}
              className="h-11 shrink-0 rounded-full bg-[#FA6F6C] px-4 text-sm font-bold text-night disabled:opacity-40">Vérifier</button>
          </div>
          <button type="button" className="text-xs text-muted underline" onClick={() => { setStep("email"); setCode(""); }}>Changer d'email</button>
        </div>
      )}
      {newsBox(false)}
    </section>
  );
}

const PENDING = "hdar-recover";
const PENDING_TTL = 60 * 60_000; // le code reçu par mail reste valable 1 h

/** Étape « code envoyé » gardée sur l'appareil : sur Android, aller lire son mail recharge souvent la page. */
function readPending(): { email: string; at: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING) || "null") as { email: string; at: number } | null;
    return v && v.email && Date.now() - v.at < PENDING_TTL ? v : null;
  } catch {
    return null;
  }
}

/** « Déjà un profil ? Le retrouver » — par email + code reçu par mail. */
export function RecoverLink({ captchaToken, onUsed }: { captchaToken?: string; onUsed?: () => void }) {
  const [pending] = useState(readPending);
  const [open, setOpen] = useState(!!pending);
  const [email, setEmail] = useState(pending?.email ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(!!pending);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(false); } };
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const toCode = () => {
    try { localStorage.setItem(PENDING, JSON.stringify({ email: email.trim().toLowerCase(), at: Date.now() })); } catch { /* stockage indisponible */ }
    setSent(true);
  };
  const send = () => void run(async () => {
    if (!captchaToken) throw new Error("Coche d'abord « Vérifiez que vous êtes humain » juste au-dessus, puis réessaie.");
    await recoverStart(email, captchaToken);
    onUsed?.();
    toCode();
  });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="w-full text-center text-sm text-muted">Déjà un profil ? <span className="font-bold text-ink underline">Le retrouver</span></button>;
  return (
    <div className="space-y-2 rounded-3xl border border-line bg-surface p-4">
      <p className="font-display font-bold">Retrouver mon profil</p>
      {!sent ? (
        <>
          <p className="text-xs text-muted">Avec l'email que tu as lié à ton profil (« Protège ton profil »).</p>
          <input className={input} type="email" inputMode="email" autoComplete="email" placeholder="ton@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" disabled={busy || !emailOk} onClick={send}
            className="h-11 w-full rounded-full bg-signal text-sm font-bold text-night disabled:opacity-40">{busy ? "…" : "Recevoir un code"}</button>
          <button type="button" disabled={!emailOk} onClick={toCode} className="w-full text-xs font-bold text-ink underline disabled:opacity-40">J'ai déjà reçu un code</button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">Entre le code à 8 chiffres reçu à <b className="text-ink">{email}</b> (pense aux spams). Tu peux aller lire ton mail et revenir ici : cette étape reste ouverte 1 h.</p>
          <input className={input + " tracking-[0.4em]"} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="Code reçu" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} />
          <button type="button" disabled={busy || code.length < 6 || code.length > 8} onClick={() => void run(async () => { await recoverVerify(email, code); try { localStorage.removeItem(PENDING); } catch { /* rien */ } })}
            className="h-11 w-full rounded-full bg-signal text-sm font-bold text-night disabled:opacity-40">{busy ? "…" : "Retrouver mon profil"}</button>
          <div className="flex justify-between text-xs">
            <button type="button" disabled={busy} onClick={send} className="text-muted underline">Renvoyer un code</button>
            <button type="button" onClick={() => { setSent(false); setCode(""); try { localStorage.removeItem(PENDING); } catch { /* rien */ } }} className="text-muted underline">Changer d'email</button>
          </div>
        </>
      )}
      <button type="button" onClick={() => { setOpen(false); try { localStorage.removeItem(PENDING); } catch { /* rien */ } }} className="w-full text-xs text-muted">Annuler</button>
    </div>
  );
}
