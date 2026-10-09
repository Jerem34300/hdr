import { DESIRES, PEOPLE, PLACES } from "@/lib/hdar/data";
import { isExpired, remainingLabel } from "@/lib/hdar/rules";
import { useHdar } from "@/lib/hdar/store";
import { bindTap } from "./tap";

export function Inbox() {
  const matches = useHdar((s) => s.matches);
  const signals = useHdar((s) => s.signals);
  const now = useHdar((s) => s.now);
  const blocks = useHdar((s) => s.blocks);
  const reports = useHdar((s) => s.reports);
  const openChat = useHdar((s) => s.openChat);
  const hidden = new Set([...blocks, ...reports]);
  const live = matches.filter((m) => !hidden.has(m.personId) && !isExpired(m.expiresAt, now));
  const pending = signals.filter((s) => !hidden.has(s.toId) && !live.some((m) => m.personId === s.toId));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Messages</h1>
      <p className="mt-1 text-sm text-muted">Tes discussions privées.</p>
      {live.length === 0 && pending.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">Aucune discussion. Ouvre-en une depuis la carte.</p>
      )}
      <ul className="mt-5 space-y-2">
        {live.map((match) => {
          const person = PEOPLE.find((p) => p.id === match.personId);
          if (!person) return null;
          const kind = person.tonight?.desires[0] ?? person.tags[0] ?? "plan";
          const label = DESIRES.find((d) => d.id === kind)?.label ?? "Ligne";
          const where = PLACES.find((p) => p.id === person.tonight?.place)?.label ?? "Dehors";
          const last = match.messages.at(-1);
          return (
            <li key={match.personId}>
              <button
                type="button"
                data-act="chat"
                data-id={match.personId}
                {...bindTap(() => openChat(match.personId))}
                className="flex h-20 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-display font-bold">
                      {label} · {where}
                    </span>
                    <span className="text-xs text-muted">{remainingLabel(match.expiresAt, now)}</span>
                  </span>
                  <span className="block truncate text-sm text-muted">{last?.text || "Ligne ouverte"}</span>
                </span>
                {match.unread > 0 && <span className="size-2.5 shrink-0 rounded-full bg-signal" />}
              </button>
            </li>
          );
        })}
      </ul>
      {pending.length > 0 && (
        <>
          <h2 className="mt-8 font-display text-lg font-bold">Envoyés</h2>
          <ul className="mt-3 space-y-2">
            {pending.map((sig) => {
              const person = PEOPLE.find((p) => p.id === sig.toId);
              if (!person) return null;
              const label = DESIRES.find((d) => d.id === sig.kind)?.label;
              return (
                <li key={`${sig.toId}-${sig.kind}`} className="text-sm text-muted">
                  <span>
                    {label} envoyé · poche anonyme
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
