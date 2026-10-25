import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FAQ } from "@/lib/hdar/faq";
import { Ld } from "./seo-pages";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Page /faq : recherche + sections en accordéon, JSON-LD FAQPage (toutes les réponses restent dans le HTML pour Google). */
export function FaqPage() {
  const [q, setQ] = useState("");
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const sections = useMemo(
    () => FAQ.map((s) => ({ ...s, items: s.items.filter((f) => terms.every((t) => norm(`${f.q} ${f.a} ${s.title}`).includes(t))) })).filter((s) => s.items.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q],
  );
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.flatMap((s) => s.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))) };
  const count = sections.reduce((n, s) => n + s.items.length, 0);
  return (
    <main className="h-dvh overflow-y-auto bg-night text-ink">
      <Ld data={ld} />
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-16">
        <a href="/" className="text-sm text-muted underline">← Retour à hdar.</a>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">Questions fréquentes</h1>
        <p className="mt-1 text-sm text-muted">Gratuit, discret, 18+. Tout ce qu'il faut savoir pour profiter de hdar sereinement.</p>
        <div className="sticky top-0 z-10 -mx-4 mt-4 bg-night/95 px-4 py-2 backdrop-blur">
          <label className="flex h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-signal">
            <Search className="size-4 shrink-0 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : code, carte, bloquer, PIN…" aria-label="Rechercher dans la FAQ" className="h-full min-w-0 flex-1 bg-transparent text-base outline-none" />
          </label>
          {!terms.length && (
            <nav className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Sections">
              {FAQ.map((s) => <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs">{s.emoji} {s.title}</a>)}
            </nav>
          )}
        </div>
        {terms.length > 0 && <p className="mt-2 text-xs text-muted">{count} réponse{count > 1 ? "s" : ""}</p>}
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="mt-6 scroll-mt-32">
            <h2 className="mb-2 font-display text-lg font-bold">{s.emoji} {s.title}</h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {s.items.map((f) => (
                <details key={f.q} open={terms.length > 0} className="group border-b border-line/60 last:border-0">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">{f.q}</span>
                    <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 text-sm leading-relaxed text-muted">
                    <p>{f.a}</p>
                    {f.link && <a href={f.link.href} className="mt-2 inline-block font-bold text-signal underline">{f.link.label} →</a>}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
        {!count && (
          <p className="mt-8 text-center text-sm text-muted">Pas de réponse pour « {q} ». <a href="/contact" className="font-bold text-signal underline">Pose ta question à l'équipe</a>, on te répond vite.</p>
        )}
        <div className="mt-10 rounded-2xl border border-line bg-surface p-4 text-center">
          <p className="font-display font-bold">Tu n'as pas trouvé ?</p>
          <p className="mt-1 text-sm text-muted">L'équipe hdar te répond via le formulaire, même sans profil.</p>
          <a href="/contact" className="mt-3 inline-flex h-11 items-center rounded-full bg-signal px-6 text-sm font-bold text-night">Nous écrire</a>
        </div>
        <p className="mt-6 text-center text-xs text-muted"><a className="underline" href="/cgu">CGU</a> · <a className="underline" href="/confidentialite">Confidentialité</a> · <a className="underline" href="/contact">Contact</a></p>
      </div>
    </main>
  );
}
