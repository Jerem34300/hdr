import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminBotGet, adminBotSet, type BotSettings } from "@/lib/hdar/live";
import { BotAvatar, BotBadge } from "./bot";

/** Admin · Robot d'accueil : activer / désactiver, modifier les textes. */
export function BotTab({ adminKey, demo }: { adminKey: string; demo?: BotSettings }) {
  const [s, setS] = useState<BotSettings | null>(demo ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!demo) void adminBotGet(adminKey).then(setS).catch((e: Error) => toast(e.message)); }, [adminKey, demo]);
  if (!s) return <p className="text-sm text-muted">Chargement…</p>;
  const area = "mt-1 w-full rounded-2xl border border-line bg-night p-3 text-sm leading-relaxed outline-none focus:border-signal";
  const save = () => {
    if (demo) return toast("Enregistré (aperçu)");
    setBusy(true);
    void adminBotSet(adminKey, s).then(() => toast("Réglages du robot enregistrés")).catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <BotAvatar className="size-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold">hdar <BotBadge /></p>
          <p className="text-xs text-muted">{s.welcomed} profils accueillis · {s.pending} en attente du message groupé · salon : {s.salon ?? "introuvable"}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" role="switch" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="size-5 accent-[#FA6F6C]" />
          {s.enabled ? "Activé" : "Désactivé"}
        </label>
      </div>
      <label className="block text-sm font-bold">Message privé de bienvenue <span className="font-normal text-muted">({"{pseudo}"} = pseudo du nouveau membre)</span>
        <textarea rows={12} value={s.dm_text} maxLength={2000} onChange={(e) => setS({ ...s, dm_text: e.target.value })} className={area} />
      </label>
      <label className="block text-sm font-bold">Message dans le salon Général <span className="font-normal text-muted">({"{mentions}"} = « @a, @b et @c », au plus 1 message / 10 min)</span>
        <textarea rows={2} value={s.salon_text} maxLength={300} onChange={(e) => setS({ ...s, salon_text: e.target.value })} className={area} />
      </label>
      <label className="block text-sm font-bold">Réponse automatique quand on écrit au robot
        <textarea rows={3} value={s.reply_text} maxLength={600} onChange={(e) => setS({ ...s, reply_text: e.target.value })} className={area} />
      </label>
      <button type="button" disabled={busy} onClick={save} className="h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">Enregistrer</button>
      <p className="text-xs text-muted">Un seul accueil par profil, seulement à la création d'un profil (pas pour les sessions sans profil). Le robot n'a pas de position et n'apparaît pas sur la carte.</p>
    </div>
  );
}
