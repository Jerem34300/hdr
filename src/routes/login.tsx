import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-screen place-items-center bg-night p-6 text-ink">
      <div className="w-full max-w-sm space-y-3">
        <h1 className="font-display text-3xl font-extrabold">hdar.</h1>
        <p className="text-sm text-muted">Un compte, une vraie position, de vraies discussions.</p>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              className="h-12 w-full rounded-full bg-signal text-night"
            >
              Continuer avec {p.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">Connexion désactivée.</p>
        )}
      </div>
    </main>
  );
}
