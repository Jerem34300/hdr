import type { ReactNode } from "react";

export const ContactLink = () => (
  <a className="underline" href="/contact">
    formulaire de contact
  </a>
);

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="h-dvh overflow-y-auto bg-night px-5 py-10 text-ink">
      <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        <a href="/" className="text-muted underline">
          ← Retour à hdar.
        </a>
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        {children}
        <p className="pt-8 text-xs text-muted">Dernière mise à jour : 12 octobre 2026</p>
      </article>
    </main>
  );
}
