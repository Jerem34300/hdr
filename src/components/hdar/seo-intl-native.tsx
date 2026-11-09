import type { IntlCityPayload } from "@/lib/hdar/seo-geo/intl.server";
import { SITE_URL } from "@/lib/hdar/seo";
import { SEO_PLACES } from "@/lib/hdar/seo-places-snapshot";
import { Hero, Ld, SeoShell, seoHead, Cta, Faq, Feature } from "./seo-pages";
import { BERLIN_DE, type NativeBlog } from "@/lib/hdar/seo-intl-blog";
import { LONDON_EN, MANCHESTER_EN, BRIGHTON_EN, BIRMINGHAM_EN, DUBLIN_EN } from "@/lib/hdar/seo-intl-blog-en";

const OPEN_LABEL: Record<string, string> = {
  de: "App öffnen",
  es: "Abrir la app",
  nl: "App openen",
  en: "Open the app",
  it: "Apri l'app",
  pt: "Abrir a app",
  ar: "افتح التطبيق",
  fr: "Ouvrir l'appli",
};

const BLOG: Record<string, NativeBlog> = {
  "de:berlin": BERLIN_DE,
  "en:london": LONDON_EN,
  "en:manchester": MANCHESTER_EN,
  "en:brighton": BRIGHTON_EN,
  "en:birmingham": BIRMINGHAM_EN,
  "en:dublin": DUBLIN_EN,
};

/** og:locale / hreflang per country for English pages (en-GB vs en-IE). */
function localeOf(c: IntlCityPayload) {
  if (c.lang === "en") return c.country === "IE" ? { og: "en_IE", hl: "en-IE" } : { og: "en_GB", hl: "en-GB" };
  if (c.lang === "de") return { og: "de_DE", hl: c.lang };
  if (c.lang === "es") return { og: "es_ES", hl: c.lang };
  if (c.lang === "nl") return { og: "nl_NL", hl: c.lang };
  return { og: `${c.lang}_${c.lang.toUpperCase()}`, hl: c.lang };
}

export function nativePath(lang: string, slug: string) {
  return `/${lang}/${slug}`;
}

export function intlNativeHead(c: IntlCityPayload | undefined) {
  if (!c) return seoHead({ title: "hdar.", desc: "", path: "/", noindex: true });
  const blog = BLOG[`${c.lang}:${c.s}`];
  const title = blog?.title ?? defaultTitle(c);
  const desc = blog?.desc ?? defaultDesc(c);
  const h = seoHead({ title, desc, path: c.path });
  const loc = localeOf(c);
  h.meta = h.meta.map((m) => ("property" in m && m.property === "og:locale" ? { ...m, content: loc.og } : m));
  const alts = [
    { rel: "alternate" as const, hrefLang: loc.hl, href: SITE_URL + c.path },
    { rel: "alternate" as const, hrefLang: "x-default", href: SITE_URL + c.path },
  ];
  // Keep FR city translations discoverable when a same-name FR page exists (rare).
  return { ...h, links: [...h.links, ...alts] };
}

function defaultTitle(c: IntlCityPayload) {
  if (c.lang === "de") return `${c.n}: Chat & Treffen in deiner Nähe — hdar.`;
  if (c.lang === "es") return `${c.n}: chat y encuentros cerca de ti — hdar.`;
  if (c.lang === "nl") return `${c.n}: chat & dates in de buurt — hdar.`;
  if (c.lang === "en") return `${c.n}: chat & meetups around you — hdar.`;
  return `${c.n} — hdar.`;
}
function defaultDesc(c: IntlCityPayload) {
  if (c.lang === "de") return `Chat und Treffen in ${c.n}, in deiner Nähe. Kostenlos, anonym, ab 18. Live-Karte und Viertel-Chat — für alle.`;
  if (c.lang === "es") return `Chat y encuentros en ${c.n}, cerca de ti. Gratis, anónimo, +18. Mapa en directo y chat del barrio, para todos.`;
  if (c.lang === "nl") return `Chat en dates in ${c.n}, bij jou in de buurt. Gratis, anoniem, 18+. Livekaart en buurtchat, voor iedereen.`;
  if (c.lang === "en") return `Chat and meetups in ${c.n}, around you. Free, anonymous, 18+. Live map and neighbourhood chat, for everyone.`;
  return `hdar. in ${c.n}. Free, anonymous, 18+.`;
}

const KIND_DE: Record<string, string> = { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Shop", other: "Ort" };
const KIND_EN: Record<string, string> = { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Shop", other: "Venue" };
const KIND_FR: Record<string, string> = { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Boutique", other: "Lieu" };

export function IntlNativePage({ c }: { c: IntlCityPayload }) {
  const blog = BLOG[`${c.lang}:${c.s}`];
  const places = SEO_PLACES[c.s] ?? [];
  const nf = new Intl.NumberFormat(c.lang);
  const pop = c.pop != null ? nf.format(c.pop) : null;
  const area = c.area_km2 != null ? nf.format(c.area_km2) : null;

  if (blog) {
    return (
      <SeoShell>
        <div lang={c.lang} data-noi18n>
          <Ld data={{ "@context": "https://schema.org", "@type": "WebPage", url: SITE_URL + c.path, inLanguage: c.lang, name: blog.h1, about: { "@type": "City", name: c.n, geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng } } }} />
          <Hero seed={c.s} open={OPEN_LABEL[c.lang] ?? OPEN_LABEL.fr} home={`/?lang=${c.lang}`} kicker={`${c.countryName} · 18+`} title={<>{blog.h1}</>}>
            <p className="mt-4 text-lg leading-snug text-ink/85">{blog.lead}</p>
            <Cta label={blog.cta} />
            <p className="mt-3 text-xs text-muted">{blog.sub}</p>
            {(pop || area) && (
              <dl className="mt-8 grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                {pop && <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">{blog.facts[0]}</dt><dd className="font-display text-xl font-bold">{pop}</dd></div>}
                {area && <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">{blog.facts[1]}</dt><dd className="font-display text-xl font-bold">{area} km²</dd></div>}
                <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">{blog.facts[2]}</dt><dd className="font-display text-xl font-bold">18+</dd></div>
              </dl>
            )}
          </Hero>
          <article className="mx-auto max-w-2xl px-5 pb-16">
            <p className="text-xs text-muted">
              {blog.sourceLabel}{" "}
              <a className="underline" href={c.source_url} rel="noopener" target="_blank">{c.source}</a>
              {c.pop_year ? ` (${c.pop_year})` : ""}.
            </p>
            {blog.body}
            {blog.cruisingTitle && (
              <section className="seo-reveal mt-12">
                <h2 className="font-display text-2xl font-bold">{blog.cruisingTitle}</h2>
                <p className="mt-3 text-sm leading-relaxed">{blog.cruisingText}</p>
                <p className="mt-4">
                  <a
                    href={`/?layers=public&lat=${c.lat}&lng=${c.lng}&ville=${encodeURIComponent(c.n)}`}
                    className="inline-flex h-12 items-center rounded-full border border-[#FA6F6C]/40 bg-[#FA6F6C]/10 px-5 text-sm font-semibold text-[#FA6F6C] hover:bg-[#FA6F6C]/20"
                  >
                    {blog.cruisingCta}
                  </a>
                </p>
                {blog.cruisingNote && <p className="mt-2 text-xs text-muted">{blog.cruisingNote}</p>}
              </section>
            )}
            {places.length > 0 && (
              <section className="seo-reveal mt-12">
                <h2 className="font-display text-2xl font-bold">{blog.placesTitle}</h2>
                <p className="mt-2 text-sm text-muted">{blog.placesIntro}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {places.map((p) => (
                    <li key={p.name} className="seo-card px-4 py-3">
                      <strong>{p.name}</strong>
                      <span className="text-muted"> · {(c.lang === "de" ? KIND_DE : c.lang === "en" ? KIND_EN : KIND_FR)[p.kind] ?? p.kind}</span>
                      {p.note ? <span className="block text-xs text-muted mt-1">{p.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {places.length === 0 && blog.placesEmpty && (
              <section className="seo-reveal mt-12">
                <h2 className="font-display text-2xl font-bold">{blog.placesTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed">{blog.placesEmpty}</p>
              </section>
            )}
            {c.nearby.length > 0 && (
              <section className="seo-reveal mt-12">
                <h2 className="font-display text-2xl font-bold">{blog.nearTitle}</h2>
                <p className="mt-3 flex flex-wrap gap-2">
                  {c.nearby.map((m) => (
                    <a key={m.s} href={nativePath(c.lang, m.s)} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-[#FA6F6C]">{m.n}</a>
                  ))}
                </p>
              </section>
            )}
            <Faq title={blog.faqTitle} items={blog.faq} />
            <div className="seo-reveal my-12 text-center"><Cta label={blog.cta} /></div>
            <p className="pb-8 text-center text-xs text-muted">{blog.foot}</p>
          </article>
        </div>
      </SeoShell>
    );
  }

  // Lightweight stub for cities without a full blog yet (prepare rollout).
  return (
    <SeoShell>
      <div lang={c.lang} data-noi18n>
        <Hero seed={c.s} open={OPEN_LABEL[c.lang] ?? OPEN_LABEL.fr} home={`/?lang=${c.lang}`} kicker={c.countryName} title={<>{c.n}</>}>
          <p className="mt-4 text-lg leading-snug text-ink/85">{defaultDesc(c)}</p>
          <Cta />
          {(pop || area) && (
            <dl className="mt-8 grid grid-cols-2 gap-2 text-center">
              {pop && <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">pop.</dt><dd className="font-display text-xl font-bold">{pop}</dd></div>}
              {area && <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">km²</dt><dd className="font-display text-xl font-bold">{area}</dd></div>}
            </dl>
          )}
        </Hero>
        <article className="mx-auto max-w-2xl px-5 pb-16">
          <p className="text-xs text-muted"><a className="underline" href={c.source_url} rel="noopener" target="_blank">{c.source}</a></p>
          <ul className="mt-8 grid gap-2 sm:grid-cols-2">
            <Feature icon="💬" title="Chat">Live map & neighbourhood chat.</Feature>
            <Feature icon="🔒" title="18+">Anonymous, rounded location.</Feature>
          </ul>
          {c.nearby.length > 0 && (
            <p className="mt-10 flex flex-wrap gap-2">{c.nearby.map((m) => <a key={m.s} href={nativePath(c.lang, m.s)} className="rounded-full border border-line px-3 py-1.5 text-sm">{m.n}</a>)}</p>
          )}
        </article>
      </div>
    </SeoShell>
  );
}
