import { Forward, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deviceId } from "@/lib/hdar/device";
import { forwardMessage, fwdLabel, listConversations, listSalons, type Conversation, type FwdScope, type FwdSource, type Salon } from "@/lib/hdar/live";
import { useHdar } from "@/lib/hdar/store";
import { UserAvatar } from "./avatar";

type Target = { scope: FwdScope; id: string; name: string; emoji?: string | null; hint: string };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** En-tête « Transféré » / « Transféré de X » dans une bulle. */
export function FwdHeader({ fwd }: { fwd?: string | null }) {
  const l = fwdLabel(fwd);
  if (!l) return null;
  return <span className="bubble-meta mb-0.5 flex items-center gap-1 text-[12px] font-semibold italic"><Forward className="size-3.5" />{l}</span>;
}

/** Choisir où transférer : conversations privées récentes + salons, avec recherche. */
export function ForwardSheet({ src, id, preview, onClose, demo }: { src: FwdSource; id: string; preview: string; onClose: () => void; demo?: Target[] }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const [targets, setTargets] = useState<Target[] | null>(demo ?? null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (demo) return;
    void Promise.all([
      onboarded ? listConversations(deviceId()).catch(() => [] as Conversation[]) : Promise.resolve([] as Conversation[]),
      listSalons().catch(() => [] as Salon[]),
    ]).then(([c, s]) => setTargets([
      ...c.sort((a, b) => b.lastAt - a.lastAt).slice(0, 30).map((x) => ({ scope: "dm" as const, id: x.otherId, name: x.pseudo || "Anonyme", hint: "Message privé" })),
      ...s.map((x) => ({ scope: "salon" as const, id: x.id, name: x.name, emoji: x.emoji, hint: `Salon · ${x.people} en ligne` })),
    ]));
  }, [demo, onboarded]);
  const list = useMemo(() => (targets ?? []).filter((t) => !q || norm(t.name).includes(norm(q))), [targets, q]);
  const send = (t: Target) => {
    if (busy) return;
    setBusy(t.id);
    const done = () => { toast(`Transféré à ${t.name}`); onClose(); };
    if (demo) return done();
    void forwardMessage(src, id, t.scope, t.id, deviceId()).then(done).catch((e: Error) => { setBusy(null); toast(e.message); });
  };
  const dms = list.filter((t) => t.scope === "dm"), salons = list.filter((t) => t.scope === "salon");
  const row = (t: Target) => (
    <li key={t.scope + t.id}>
      <button type="button" disabled={!!busy} onClick={() => send(t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start active:bg-white/5 disabled:opacity-60">
        {t.scope === "dm" ? <UserAvatar id={t.id} name={t.name} className="size-10 rounded-full" /> : <span className="flex size-10 items-center justify-center rounded-full bg-surface text-xl">{t.emoji || <Users className="size-5" />}</span>}
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{t.name}</span><span className="block text-xs text-muted">{t.hint}</span></span>
        <span className="rounded-full bg-signal px-3 py-1 text-xs font-bold text-night">{busy === t.id ? "…" : "Envoyer"}</span>
      </button>
    </li>
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="dock flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-night pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-white/20" />
        <p className="shrink-0 px-4 font-display text-lg font-bold">Transférer</p>
        <p className="mx-4 mt-2 max-h-[5.75rem] shrink-0 overflow-y-auto rounded-xl bg-surface px-3 py-2 text-sm leading-snug break-words whitespace-pre-wrap text-muted">{preview}</p>
        <label className="mx-4 mt-3 flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-signal">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une personne ou un salon" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        </label>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-4">
          {!targets && <p className="px-4 py-6 text-center text-sm text-muted">Chargement…</p>}
          {targets && !list.length && <p className="px-4 py-6 text-center text-sm text-muted">Aucun résultat.</p>}
          {dms.length > 0 && <p className="px-4 pt-2 text-xs font-bold tracking-wider text-muted uppercase">Messages privés</p>}
          <ul>{dms.map(row)}</ul>
          {salons.length > 0 && <p className="px-4 pt-3 text-xs font-bold tracking-wider text-muted uppercase">Salons</p>}
          <ul>{salons.map(row)}</ul>
          {!onboarded && !demo && <p className="px-4 pt-3 text-xs text-muted">Crée ton profil pour transférer en message privé.</p>}
        </div>
      </div>
    </div>
  );
}
