import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { adminBotAnnounce, adminBotGet, adminBotSet, type BotSettings } from "@/lib/hdar/live";
import { BotAvatar, BotBadge } from "./bot";

type Target = "salon" | "dm" | "both";
const TARGETS: { id: Target; label: string }[] = [
  { id: "salon", label: "Salon Général" },
  { id: "dm", label: "Message privé à tous" },
  { id: "both", label: "Les deux" },
];
const area = "mt-1 w-full rounded-2xl border border-line bg-night p-3 text-sm leading-relaxed outline-none focus:border-signal";

function Section({ title, hint, on, onToggle, children }: { title: string; hint: string; on: boolean; onToggle: (v: boolean) => void; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border p-4 ${on ? "border-signal/40 bg-surface" : "border-line bg-surface/60"}`}>
      <label className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold">{title}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <input type="checkbox" role="switch" aria-label={title} checked={on} onChange={(e) => onToggle(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[#FA6F6C]" />
      </label>
      <div className={on ? "mt-3 space-y-3" : "mt-3 space-y-3 opacity-50"}>{children}</div>
    </section>
  );
}

/** Admin · Robot hdar : accueil, relances, questions du jour, rappel des règles, conseils, annonces. */
export function BotTab({ adminKey, demo, demoAnnounce }: { adminKey: string; demo?: BotSettings; demoAnnounce?: { text: string; target: Target; count: number } }) {
  const [s, setS] = useState<BotSettings | null>(demo ?? null);
  const [busy, setBusy] = useState(false);
  const [ann, setAnn] = useState(demoAnnounce?.text ?? "");
  const [target, setTarget] = useState<Target>(demoAnnounce?.target ?? "salon");
  const [preview, setPreview] = useState<{ dm_count: number; salon?: string | null } | null>(demoAnnounce ? { dm_count: demoAnnounce.count, salon: "Général" } : null);
  useEffect(() => { if (!demo) void adminBotGet(adminKey).then(setS).catch((e: Error) => toast(e.message)); }, [adminKey, demo]);
  if (!s) return <p className="text-sm text-muted">Chargement…</p>;
  const set = (p: Partial<BotSettings>) => setS({ ...s, ...p });
  const save = () => {
    if (demo) return toast("Enregistré (aperçu)");
    setBusy(true);
    void adminBotSet(adminKey, s).then(() => toast("Réglages du robot enregistrés")).catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
  };
  const askPreview = () => {
    if (ann.trim().length < 3) return toast("Écris l'annonce d'abord");
    if (demo) return setPreview({ dm_count: 1284, salon: "Général" });
    void adminBotAnnounce(adminKey, ann, target, false).then(setPreview).catch((e: Error) => toast(e.message));
  };
  const send = () => {
    if (demo) { setPreview(null); return toast("Annonce envoyée (aperçu)"); }
    setBusy(true);
    void adminBotAnnounce(adminKey, ann, target, true)
      .then((r) => { toast(target === "salon" ? "Annonce publiée dans Général" : `Annonce envoyée · ${r.dm_count} messages privés en file`); setPreview(null); setAnn(""); })
      .catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
  };
  const nbQ = s.questions.split("\n").filter((l) => l.trim()).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <BotAvatar className="size-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold">hdar <BotBadge /></p>
          <p className="text-xs text-muted">{s.welcomed} profils accueillis · {s.pending} en attente · {s.opted_out ?? 0} ont coupé les relances{s.outbox ? ` · ${s.outbox} messages en file` : ""}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" role="switch" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="size-5 accent-[#FA6F6C]" />
          {s.enabled ? "Activé" : "Coupé"}
        </label>
      </div>

      <Section title="Accueil" hint="Message privé à chaque nouveau profil + bienvenue groupée dans Général (1 message / 10 min)." on={s.enabled} onToggle={(v) => set({ enabled: v })}>
        <label className="block text-sm font-bold">Message privé <span className="font-normal text-muted">({"{pseudo}"}, {"{provenance}"} = bloc parrainage ou lien de partage selon d'où vient le membre)</span>
          <textarea rows={6} value={s.dm_text} maxLength={2000} onChange={(e) => set({ dm_text: e.target.value })} className={area} /></label>
        <label className="block text-sm font-bold">Salon Général <span className="font-normal text-muted">({"{mentions}"})</span>
          <textarea rows={2} value={s.salon_text} maxLength={300} onChange={(e) => set({ salon_text: e.target.value })} className={area} /></label>
        <label className="block text-sm font-bold">Réponse automatique
          <textarea rows={2} value={s.reply_text} maxLength={600} onChange={(e) => set({ reply_text: e.target.value })} className={area} /></label>
      </Section>

      <Section title="Relances des inactifs" hint="Vers 3 jours puis 10 jours sans visite. 2 relances au plus par personne. Jamais aux bannis, ni à qui a bloqué le robot ou coupé ses messages." on={s.nudge_on} onToggle={(v) => set({ nudge_on: v })}>
        <label className="block text-sm font-bold">Relance n°1 (≈ 3 jours) <span className="font-normal text-muted">({"{pseudo}"})</span>
          <textarea rows={3} value={s.nudge1_text} maxLength={600} onChange={(e) => set({ nudge1_text: e.target.value })} className={area} /></label>
        <label className="block text-sm font-bold">Relance n°2 (≈ 10 jours)
          <textarea rows={3} value={s.nudge2_text} maxLength={600} onChange={(e) => set({ nudge2_text: e.target.value })} className={area} /></label>
      </Section>

      <Section title="Question du jour" hint="Dans un salon sans message depuis 3 h, entre 10 h et 22 h (heure de Paris). Une par salon et par jour au plus." on={s.question_on} onToggle={(v) => set({ question_on: v })}>
        <label className="block text-sm font-bold">Questions <span className="font-normal text-muted">(une par ligne · {nbQ})</span>
          <textarea rows={8} value={s.questions} maxLength={8000} onChange={(e) => set({ questions: e.target.value })} className={area} /></label>
      </Section>

      <Section title="Rappel des règles" hint="Après 3 signalements dans un salon en 30 min. Au plus 1 fois / 2 h par salon. Ne nomme personne." on={s.rules_on} onToggle={(v) => set({ rules_on: v })}>
        <textarea rows={3} aria-label="Texte du rappel" value={s.rules_text} maxLength={600} onChange={(e) => set({ rules_text: e.target.value })} className={area} />
      </Section>

      <Section title="Conseil profil" hint="Une seule fois, ≈ 24 h après l'inscription, s'il manque la photo ou la description." on={s.tip_on} onToggle={(v) => set({ tip_on: v })}>
        <textarea rows={3} aria-label="Texte du conseil" value={s.tip_text} maxLength={600} onChange={(e) => set({ tip_text: e.target.value })} className={area} />
      </Section>

      <button type="button" disabled={busy} onClick={save} className="h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">Enregistrer les réglages</button>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="font-display font-bold">📣 Annonce</p>
        <p className="text-xs text-muted">Envoyée uniquement quand tu confirmes. Les annonces passent même si le membre a coupé les relances.</p>
        <textarea rows={3} value={ann} maxLength={1000} placeholder="Ex. : Nouveau : choisis la couleur de tes bulles dans Apparence !" onChange={(e) => { setAnn(e.target.value); setPreview(null); }} className={area} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {TARGETS.map((t) => (
            <button key={t.id} type="button" onClick={() => { setTarget(t.id); setPreview(null); }} className={`rounded-full border px-2 py-2 text-xs font-bold ${target === t.id ? "border-signal bg-signal/15 text-signal" : "border-line text-muted"}`}>{t.label}</button>
          ))}
        </div>
        {!preview ? (
          <button type="button" onClick={askPreview} className="mt-3 h-11 w-full rounded-full border border-signal font-bold text-signal">Aperçu</button>
        ) : (
          <div className="mt-3 rounded-2xl border border-signal/50 bg-night p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Aperçu</p>
            <div className="mt-2 flex gap-2">
              <BotAvatar className="size-8 shrink-0 rounded-full" />
              <div className="rounded-2xl rounded-ss-md bg-surface px-3 py-2 text-sm whitespace-pre-wrap">📣 {ann}</div>
            </div>
            <p className="mt-3 text-sm">
              {target !== "dm" && <>Publié dans <b>{preview.salon ?? "Général"}</b>. </>}
              {target !== "salon" && <>Message privé à <b>{preview.dm_count}</b> membres (envoi progressif).</>}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPreview(null)} className="h-11 rounded-full border border-line font-bold">Annuler</button>
              <button type="button" disabled={busy} onClick={send} className="h-11 rounded-full bg-signal font-bold text-night disabled:opacity-50">Confirmer l'envoi</button>
            </div>
          </div>
        )}
      </section>
      <p className="text-xs text-muted">Le robot n'a pas de position, n'apparaît pas sur la carte, n'entre pas dans les statistiques et ne déclenche pas de notification de salon.</p>
    </div>
  );
}
