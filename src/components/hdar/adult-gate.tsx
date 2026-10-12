import { useEffect, useState, type ReactNode } from "react";
import { adultConfirmed, confirmAdult, ensureSession } from "@/lib/hdar/session";

/** One-time 18+ confirmation, remembered on this device, then silent anonymous sign-in. */
export function AdultGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ask" | "ok">("loading");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (adultConfirmed()) {
      setState("ok");
      void ensureSession().catch(() => undefined);
    } else setState("ask");
  }, []);
  if (state === "ok") return <>{children}</>;
  if (state === "loading") return null;
  return (
    <main className="grid min-h-screen place-items-center bg-night p-6 text-ink">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!checked) return setError("Hdar est réservé aux 18 ans et plus.");
          confirmAdult();
          setState("ok");
          void ensureSession().catch((err: unknown) => setError(String(err)));
        }}
      >
        <h1 className="font-display text-3xl font-extrabold">hdar.</h1>
        <p className="text-sm text-muted">Anonyme, sans inscription. Réservé aux adultes.</p>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          J'ai 18 ans ou plus
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="h-12 w-full rounded-full bg-signal text-night">
          Entrer
        </button>
      </form>
    </main>
  );
}
