import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type Row = { message: string; source: string; at: number };

export const Route = createFileRoute("/debug")({
  head: () => ({
    meta: [
      { title: "Diagnostic — hdar." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DebugPage,
});

function DebugPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    try {
      setRows(JSON.parse(localStorage.getItem("hdar-errors") || "[]") as Row[]);
    } catch {
      setRows([]);
    }
  }, []);
  return (
    <main className="min-h-dvh bg-night px-5 py-8 text-ink">
      <p className="font-display text-sm tracking-tight">
        hdar<span className="text-signal">.</span>
      </p>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Diagnostic</h1>
      <p className="mt-2 max-w-md text-sm text-muted">Dernières erreurs gardées sur cet appareil.</p>
      {rows.length === 0 ? (
        <p className="mt-8 text-sm">Aucune erreur enregistrée.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={`${row.at}-${row.message}`} className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <p>{row.message}</p>
              <p className="mt-1 text-xs text-muted">
                {row.source} · {new Date(row.at).toLocaleString("fr")}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link to="/" className="mt-8 inline-flex h-11 items-center text-sm text-signal">
        Retour
      </Link>
    </main>
  );
}
