import { useEffect, useState } from "react";
import { answerReport, REPORT_REASONS, useReport } from "@/lib/hdar/report";

export function ReportSheet() {
  const ask = useReport((s) => s.ask);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    setReason("");
    setDetails("");
  }, [ask]);

  if (!ask) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
    >
      <button
        type="button"
        aria-label="Annuler"
        className="absolute inset-0 bg-black/60"
        onClick={() => answerReport(null)}
      />
      <div className="dock relative mx-auto w-full max-w-md rounded-t-3xl border-t border-line bg-surface px-5 pt-5">
        <p id="report-title" className="font-display text-lg font-bold">
          Signaler {ask.pseudo}
        </p>
        <p className="mt-1 text-sm text-muted">Pourquoi ? La personne sera aussi bloquée.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              className={
                "h-10 rounded-full px-4 text-sm " +
                (reason === r ? "bg-signal text-night" : "border border-line")
              }
              onClick={() => setReason(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 h-20 w-full rounded-2xl border border-line bg-night px-4 py-3 text-base outline-none focus-visible:border-signal"
          maxLength={150}
          placeholder="Précisions (facultatif)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        <div className="mt-3 grid grid-cols-2 gap-3 pb-2">
          <button
            type="button"
            className="h-12 rounded-full border border-line"
            onClick={() => answerReport(null)}
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!reason}
            className="h-12 rounded-full bg-signal font-bold text-night disabled:opacity-40"
            onClick={() => answerReport(details.trim() ? `${reason} : ${details.trim()}` : reason)}
          >
            Signaler
          </button>
        </div>
      </div>
    </div>
  );
}
