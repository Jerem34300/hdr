import { Lock, LogOut } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { askConfirm } from "@/lib/hdar/confirm";
import { clearPin, type LockDelay, logoutDevice, MAX_TRIES, markHidden, pinDelay, pinEnabled, pinFails, setPin, setPinDelay, shouldRelock, verifyPin } from "@/lib/hdar/lock";
import { linkedEmail } from "@/lib/hdar/recover";

const useEmail = (demo?: string | null) => {
  const [email, setEmail] = useState<string | null | undefined>(demo === undefined ? undefined : demo);
  useEffect(() => { if (demo !== undefined) return; void linkedEmail().then((s) => setEmail(s.email)).catch(() => setEmail(null)); }, [demo]);
  return email;
};

/** Clavier à 4 chiffres, neutre. */
function PinPad({ onDone, busy }: { onDone: (pin: string) => void; busy?: boolean }) {
  const [v, setV] = useState("");
  useEffect(() => { if (v.length === 4) { onDone(v); setV(""); } }, [v, onDone]);
  const key = (k: string) => setV((x) => (k === "⌫" ? x.slice(0, -1) : x.length < 4 ? x + k : x));
  return (
    <div className="mx-auto w-64">
      <div className="mb-6 flex justify-center gap-4">{[0, 1, 2, 3].map((i) => <span key={i} className={"size-3.5 rounded-full border border-current " + (i < v.length ? "bg-current" : "")} />)}</div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
          k ? <button key={i} type="button" disabled={busy} aria-label={k === "⌫" ? "Effacer" : k} onClick={() => key(k)} className="h-16 rounded-full bg-white/10 text-2xl font-medium active:bg-white/25">{k}</button> : <span key={i} />,
        )}
      </div>
    </div>
  );
}

/** Écran de verrouillage discret (aucun contenu, aucun nom d'app, aucune image). */
export function LockScreen({ onUnlock, demoEmail }: { onUnlock: () => void; demoEmail?: string | null }) {
  const [fails, setFails] = useState(pinFails);
  const [busy, setBusy] = useState(false);
  const email = useEmail(demoEmail);
  const out = fails >= MAX_TRIES;
  const [ask, setAsk] = useState(false);
  return (
    <main className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#1c1c1e] px-6 text-white">
      <Lock className="mb-3 size-7 opacity-80" />
      <p className="mb-1 text-lg font-medium">{out ? "Trop d'essais" : "Saisis ton code"}</p>
      <p className="mb-8 h-5 text-sm opacity-60">{out ? "Le déverrouillage est bloqué." : fails ? `Code incorrect · ${MAX_TRIES - fails} essai${MAX_TRIES - fails > 1 ? "s" : ""} restant${MAX_TRIES - fails > 1 ? "s" : ""}` : ""}</p>
      {!out && <PinPad busy={busy} onDone={(pin) => { setBusy(true); void verifyPin(pin).then((ok) => { setBusy(false); if (ok) onUnlock(); else setFails(pinFails()); }); }} />}
      {!ask ? (
        <button type="button" onClick={() => setAsk(true)} className={"mt-8 text-sm " + (out ? "rounded-full bg-white px-5 py-3 font-medium text-black" : "underline opacity-60")}>Code oublié ?</button>
      ) : (
        <div className="mt-8 w-full max-w-xs space-y-3 rounded-2xl bg-white/10 p-4 text-center">
          {email ? (
            <p className="text-sm">Tu vas être déconnecté de cet appareil. Pour revenir, utilise « Retrouver mon compte » avec ton email.</p>
          ) : (
            <p className="text-sm"><b className="text-red-300">Aucun email lié.</b> Après la déconnexion, ton profil ne pourra pas être retrouvé.</p>
          )}
          <button type="button" onClick={() => void logoutDevice()} className={"h-11 w-full rounded-full text-sm font-medium " + (email ? "bg-white text-black" : "bg-red-500 text-white")}>{email ? "Me déconnecter" : "Me déconnecter quand même"}</button>
          <button type="button" onClick={() => setAsk(false)} className="w-full text-xs opacity-60">Annuler</button>
        </div>
      )}
    </main>
  );
}

/** Enveloppe l'app : demande le code à l'ouverture et au retour après le délai choisi (marche aussi dans la TWA). */
export function PinGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(pinEnabled);
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === "hidden") markHidden();
      else if (shouldRelock()) setLocked(true);
    };
    document.addEventListener("visibilitychange", on);
    window.addEventListener("pagehide", markHidden);
    return () => { document.removeEventListener("visibilitychange", on); window.removeEventListener("pagehide", markHidden); };
  }, []);
  return <>{children}{locked && <LockScreen onUnlock={() => setLocked(false)} />}</>;
}

const DELAYS: [LockDelay, string][] = [[0, "Immédiat"], [60_000, "1 min"], [300_000, "5 min"]];

/** Paramètres → code de verrouillage : activer, changer, désactiver, délai. */
export function PinSettings() {
  const [on, setOn] = useState(pinEnabled);
  const [delay, setDelay] = useState<LockDelay>(pinDelay);
  const [step, setStep] = useState<null | "current-change" | "current-off" | "new" | "confirm">(null);
  const [first, setFirst] = useState("");
  const title = { "current-change": "Code actuel", "current-off": "Code actuel", new: "Nouveau code (4 chiffres)", confirm: "Confirme le code" } as const;
  const done = (pin: string) => {
    if (step === "current-change" || step === "current-off") {
      void verifyPin(pin).then((ok) => {
        if (!ok) return toast(pinFails() >= MAX_TRIES ? "Trop d'essais : utilise « Code oublié » à la prochaine ouverture" : "Code incorrect");
        if (step === "current-off") { clearPin(); setOn(false); setStep(null); toast("Code désactivé"); } else setStep("new");
      });
    } else if (step === "new") { setFirst(pin); setStep("confirm"); }
    else if (step === "confirm") {
      if (pin !== first) { toast("Les codes ne correspondent pas"); setStep("new"); return; }
      void setPin(pin, delay).then(() => { markHidden(); setOn(true); setStep(null); toast("Code activé 🔒"); });
    }
  };
  return (
    <section className="mt-6">
      <p className="mb-1 text-xs font-bold tracking-[0.2em] text-muted uppercase">Discrétion</p>
      <div className="rounded-2xl border border-line p-4">
        <div className="flex items-center gap-3">
          <Lock className="size-5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1"><p className="text-sm font-bold">Code de verrouillage</p><p className="text-xs text-muted">{on ? "Activé : demandé à l'ouverture de l'app." : "Empêche quelqu'un qui prend ton téléphone d'ouvrir ton compte."}</p></div>
          {!on && !step && <button type="button" onClick={() => setStep("new")} className="rounded-full bg-signal px-4 py-2 text-xs font-bold text-night">Activer</button>}
        </div>
        {on && !step && (
          <>
            <p className="mt-3 mb-1 text-xs text-muted">Redemander après une mise en arrière-plan de :</p>
            <div className="flex gap-2">{DELAYS.map(([d, l]) => <button key={d} type="button" onClick={() => { setDelay(d); setPinDelay(d); }} className={"flex-1 rounded-full border py-2 text-xs " + (delay === d ? "border-signal bg-signal/15 font-bold text-signal" : "border-line")}>{l}</button>)}</div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setStep("current-change")} className="flex-1 rounded-full border border-line py-2 text-xs">Changer le code</button>
              <button type="button" onClick={() => setStep("current-off")} className="flex-1 rounded-full border border-line py-2 text-xs text-muted">Désactiver</button>
            </div>
          </>
        )}
        {step && (
          <div className="mt-4">
            <p className="mb-4 text-center text-sm font-bold">{title[step]}</p>
            <PinPad onDone={done} />
            <button type="button" onClick={() => setStep(null)} className="mt-3 w-full text-xs text-muted">Annuler</button>
            <p className="mt-2 text-center text-[11px] text-muted">Le code n'est jamais envoyé : seule une empreinte chiffrée reste sur ce téléphone.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** Paramètres → « Se déconnecter » de cet appareil. */
export function LogoutButton({ onProtect, demoEmail }: { onProtect: () => void; demoEmail?: string | null }) {
  const email = useEmail(demoEmail);
  const [warn, setWarn] = useState(false);
  const click = () => {
    if (email === null) return setWarn(true);
    void askConfirm({ title: "Se déconnecter ?", body: `Ton profil et tes données locales sont effacés de ce téléphone. Pour revenir : « Retrouver mon compte » avec ${email ?? "ton email"}.`, confirm: "Se déconnecter" })
      .then((ok) => ok && void logoutDevice());
  };
  return (
    <div className="mb-4">
      <button type="button" disabled={email === undefined} onClick={click} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line text-sm disabled:opacity-50">
        <LogOut className="size-4" /> Se déconnecter
      </button>
      {warn && (
        <div className="mt-3 space-y-2 rounded-2xl border-2 border-red-500/60 bg-red-500/10 p-4">
          <p className="font-display font-extrabold text-red-300">⚠️ Sans email, tu perdras ton profil</p>
          <p className="text-xs text-muted">Aucun email n'est lié : après la déconnexion, ton profil, tes photos et tes conversations ne pourront plus être retrouvés sur aucun appareil.</p>
          <button type="button" onClick={onProtect} className="h-11 w-full rounded-full bg-[#FA6F6C] text-sm font-bold text-night">🛡️ Protège ton profil d'abord</button>
          <button type="button" onClick={() => void askConfirm({ title: "Perdre ton profil ?", body: "Sans email lié, ce profil sera définitivement inaccessible. Continuer ?", confirm: "Me déconnecter quand même", danger: true }).then((ok) => ok && void logoutDevice())} className="h-10 w-full rounded-full border border-red-500/60 text-xs text-red-300">Me déconnecter quand même</button>
          <button type="button" onClick={() => setWarn(false)} className="w-full text-xs text-muted">Annuler</button>
        </div>
      )}
    </div>
  );
}
