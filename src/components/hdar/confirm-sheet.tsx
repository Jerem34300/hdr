import { useEffect } from "react";
import { answerConfirm, useConfirm } from "@/lib/hdar/confirm";

export function ConfirmSheet() {
  const ask = useConfirm((s) => s.ask);

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && answerConfirm(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask]);

  if (!ask) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        aria-label="Annuler"
        className="absolute inset-0 bg-black/60"
        onClick={() => answerConfirm(false)}
      />
      <div className="dock relative mx-auto w-full max-w-md rounded-t-3xl border-t border-line bg-surface px-5 pt-5">
        <p id="confirm-title" className="font-display text-lg font-bold">
          {ask.title}
        </p>
        {ask.body && <p className="mt-1 text-sm text-muted">{ask.body}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 pb-2">
          <button
            type="button"
            className="h-12 rounded-full border border-line"
            onClick={() => answerConfirm(false)}
          >
            Annuler
          </button>
          <button
            type="button"
            autoFocus
            className={
              "h-12 rounded-full font-bold " +
              (ask.danger ? "bg-signal text-night" : "bg-ink text-night")
            }
            onClick={() => answerConfirm(true)}
          >
            {ask.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
