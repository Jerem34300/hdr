import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/hdar/seo";
import type { Mini } from "@/lib/hdar/seo-geo/types";

export const fmt = (n: number) => n.toLocaleString("fr-FR");
export const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
export const pick = <T,>(seed: string, arr: T[]) => arr[hash(seed) % arr.length];

export function seoHead(o: { title: string; desc: string; path: string; og?: string; noindex?: boolean }) {
  const url = SITE_URL + o.path, og = SITE_URL + (o.og ?? "/og.jpg?v=discret2");
  return {
    meta: [
      { title: o.title }, { name: "description", content: o.desc }, { name: "page-own-og", content: "1" },
      { property: "og:title", content: o.title }, { property: "og:description", content: o.desc }, { property: "og:site_name", content: "hdar." },
      { property: "og:url", content: url }, { property: "og:type", content: "website" }, { property: "og:image", content: og },
      { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }, { property: "og:locale", content: "fr_FR" },
      { name: "twitter:card", content: "summary_large_image" }, { name: "twitter:image", content: og },
      { name: "robots", content: o.noindex ? "noindex, follow" : "index, follow, max-image-preview:large" },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

const ORG = {
  "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": SITE_URL + "/#org", name: "hdar.", url: SITE_URL, logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png", width: 512, height: 512 } },
    { "@type": "WebSite", "@id": SITE_URL + "/#site", name: "hdar.", url: SITE_URL, inLanguage: "fr-FR", publisher: { "@id": SITE_URL + "/#org" } },
  ],
};
export const Ld = ({ data }: { data: unknown }) => <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;

export function Crumbs({ items }: { items: { name: string; to?: string }[] }) {
  return (
    <>
      <Ld data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, ...(it.to ? { item: SITE_URL + it.to } : {}) })) }} />
      <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            {it.to && i < items.length - 1 ? <a href={it.to} className="hover:text-ink">{it.name}</a> : <span className="text-ink/80">{it.name}</span>}
          </span>
        ))}
      </nav>
    </>
  );
}

/** Compteur animé : la valeur réelle est dans le HTML serveur, l'animation ne fait que la rejouer. */
export function Count({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setV(Math.round(value * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
      setV(0); requestAnimationFrame(step);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{fmt(v)}{suffix}</span>;
}

/** Hero : carte stylisée, points lumineux qui apparaissent, flares qui dérivent. Décoratif (aria-hidden), positions déterministes. */
export function Hero({ seed, kicker, title, children }: { seed: string; kicker: ReactNode; title: ReactNode; children?: ReactNode }) {
  const h = hash(seed);
  const dots = Array.from({ length: 11 }, (_, i) => {
    const a = ((h >> (i % 24)) % 360) * (Math.PI / 180) + i * 2.4, r = 14 + ((h >> i) % 30) + i * 2;
    return { l: 50 + Math.cos(a) * r * 1.2, t: 42 + Math.sin(a) * r * 0.75, d: 0.25 + i * 0.32, g: i % 3 === 1 };
  });
  return (
    <header className="seo-hero px-5 pb-12 pt-6">
      <div className="seo-grid" aria-hidden />
      <div className="seo-flare" aria-hidden style={{ width: 320, height: 320, left: -90, top: -60, background: "#FA6F6C" }} />
      <div className="seo-flare" aria-hidden style={{ width: 260, height: 260, right: -80, top: 120, background: "#3ee08f", animationDelay: "-6s", opacity: 0.35 }} />
      <div className="seo-flare" aria-hidden style={{ width: 200, height: 200, left: "35%", bottom: -90, background: "#8b7cff", animationDelay: "-11s", opacity: 0.3 }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {dots.map((d, i) => (
          <span key={i} className={`seo-dot ${d.g ? "g" : "c"}`} style={{ left: `${d.l}%`, top: `${d.t}%`, animationDelay: `${d.d}s, ${d.d}s` }} />
        ))}
      </div>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <a href="/" className="font-display text-lg font-extrabold tracking-tight">hdar<span className="text-[#FA6F6C]">.</span></a>
          <a href="/" className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs backdrop-blur">Ouvrir l'appli</a>
        </div>
        <p className="mt-14 text-xs font-semibold uppercase tracking-[.18em] text-[#3ee08f]">{kicker}</p>
        <h1 className="mt-3 font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>
        {children}
      </div>
    </header>
  );
}

export const Cta = ({ label = "Ouvrir la carte" }: { label?: string }) => (
  <Link to="/" className="seo-cta mt-7 inline-flex h-14 items-center gap-2 rounded-full px-7 font-semibold text-night">
    {label} <span aria-hidden>→</span>
  </Link>
);

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="seo-reveal mt-12">
      <Ld data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) }} />
      <h2 className="font-display text-2xl font-bold">Questions fréquentes</h2>
      <div className="mt-4 space-y-2">
        {items.map((i) => (
          <details key={i.q} className="seo-card px-4 py-3">
            <summary className="cursor-pointer font-medium">{i.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{i.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CityChips({ list, showKm }: { list: Mini[]; showKm?: boolean }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2 text-sm">
      {list.map((c) => (
        <li key={c.s}>
          <a href={`/rencontre/${c.s}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[.03] px-3 py-1.5 hover:border-[#FA6F6C]">
            {c.n}{showKm && c.k !== undefined && <span className="text-xs text-muted">{c.k} km</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SeoShell({ children }: { children: ReactNode }) {
  return (
    <main className="h-dvh overflow-y-auto bg-night text-ink">
      <Ld data={ORG} />
      {children}
      <footer className="mx-auto max-w-2xl border-t border-line px-5 py-8 text-xs text-muted">
        <p>hdar. — sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, réservé aux 18 ans et plus.</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <a href="/rencontre">Toutes les villes</a><a href="/live-coquin">Live</a><a href="/faq">FAQ</a><a href="/cgu">CGU</a><a href="/confidentialite">Confidentialité</a><a href="/contact">Contact</a>
        </p>
        <p className="mt-2">Données communes : INSEE via geo.api.gouv.fr.</p>
      </footer>
    </main>
  );
}

export const Feature = ({ icon, title, children }: { icon: string; title: string; children: ReactNode }) => (
  <li className="seo-card seo-reveal flex gap-3 p-4">
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FA6F6C]/15 text-lg">{icon}</span>
    <span><strong className="block">{title}</strong><span className="text-sm text-muted">{children}</span></span>
  </li>
);
