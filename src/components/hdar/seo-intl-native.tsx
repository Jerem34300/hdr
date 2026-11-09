import type { ReactNode } from "react";
import type { IntlCityPayload } from "@/lib/hdar/seo-geo/intl.server";
import { SITE_URL } from "@/lib/hdar/seo";
import { SEO_PLACES } from "@/lib/hdar/seo-places-snapshot";
import { Hero, Ld, SeoShell, seoHead, Cta, Faq } from "./seo-pages";
import { BERLIN_DE, type NativeBlog } from "@/lib/hdar/seo-intl-blog";
import { kitFor, type CityText, type Kit } from "@/lib/hdar/seo-intl/kit";
import { CITIES_DE } from "@/lib/hdar/seo-intl/cities-de";
import { CITIES_ES } from "@/lib/hdar/seo-intl/cities-es";
import { CITIES_NL } from "@/lib/hdar/seo-intl/cities-nl";
import { CITIES_IT } from "@/lib/hdar/seo-intl/cities-it";
import { CITIES_PT } from "@/lib/hdar/seo-intl/cities-pt";
import { CITIES_FR } from "@/lib/hdar/seo-intl/cities-fr";

/** Unique long-form text per `${lang}:${slug}` (primary language of each city). */
const TEXTS: Record<string, Record<string, CityText>> = { de: CITIES_DE, es: CITIES_ES, nl: CITIES_NL, it: CITIES_IT, pt: CITIES_PT, fr: CITIES_FR };

export function nativePath(lang: string, slug: string) {
  return `/${lang}/${slug}`;
}

/** `**bold**` → <strong>. */
function rich(s: string): ReactNode {
  return s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

function cityText(c: IntlCityPayload, kit: Kit): CityText | null {
  return TEXTS[c.lang]?.[c.s] ?? kit.generic?.(c.n, c.countryName) ?? null;
}

const H2 = "mt-10 font-display text-xl font-bold";
const P = "mt-3 text-sm leading-relaxed";

/** Assemble a Berlin-standard page from a city text + the language kit. */
function buildBlog(c: IntlCityPayload, kit: Kit, t: CityText, nf: Intl.NumberFormat): NativeBlog {
  const pop = c.pop != null ? nf.format(c.pop) : null;
  const area = c.area_km2 != null ? nf.format(c.area_km2) : null;
  return {
    title: t.title,
    desc: t.desc,
    h1: <>{t.h1[0]}<span className="text-[#FA6F6C]">{t.h1[1]}</span>{t.h1[2] ?? ""}</>,
    lead: t.lead,
    cta: kit.cta,
    sub: kit.sub,
    facts: kit.facts,
    sourceLabel: kit.sourceLabel,
    body: (
      <>
        <h2 className={H2}>{t.introTitle}</h2>
        {t.intro.map((p, i) => <p key={i} className={P}>{rich(p)}</p>)}
        {t.quarters.length > 0 && (
          <>
            <h2 className={H2}>{t.quartersTitle}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              {t.quarters.map(([name, d]) => <li key={name}><strong>{name}</strong> — {d}</li>)}
            </ul>
          </>
        )}
        {pop && (
          <>
            <h2 className={H2}>{kit.numbersTitle(c.n)}</h2>
            <p className={P}>{rich(kit.numbers({ n: c.n, pop, area, source: c.source }))}</p>
          </>
        )}
        <h2 className={H2}>{kit.discreetTitle}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{kit.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </>
    ),
    cruisingTitle: kit.cruisingTitle(c.n),
    cruisingText: t.cruising,
    cruisingCta: kit.cruisingCta(c.n),
    cruisingNote: kit.cruisingNote,
    placesTitle: kit.placesTitle,
    placesIntro: kit.placesIntro,
    placesEmpty: kit.placesEmpty(c.n),
    nearTitle: kit.nearTitle,
    faqTitle: kit.faqTitle,
    faq: [...kit.faqBase(c.n), ...t.faq],
    foot: kit.foot,
  };
}

function blogFor(c: IntlCityPayload): NativeBlog | null {
  if (c.lang === "de" && c.s === "berlin") return BERLIN_DE;
  const kit = kitFor(c.lang);
  const t = cityText(c, kit);
  return t ? buildBlog(c, kit, t, new Intl.NumberFormat(c.numberLocale)) : null;
}

/** App deep link: language + centred on the city (+ optional public-places layer). */
// The app has no Dutch UI yet: send NL/BE-nl visitors to English rather than the French fallback.
const appLang = (lang: string) => (lang === "nl" ? "en" : lang);
function appHref(c: IntlCityPayload, layer?: boolean) {
  return `/?${layer ? "layers=public&" : ""}lang=${appLang(c.lang)}&lat=${c.lat}&lng=${c.lng}`;
}

export function intlNativeHead(c: IntlCityPayload | undefined) {
  if (!c) return seoHead({ title: "hdar.", desc: "", path: "/", noindex: true });
  const blog = blogFor(c);
  const h = seoHead({ title: blog?.title ?? `${c.n} — hdar.`, desc: blog?.desc ?? "", path: c.path, noindex: !c.isPrimary || !blog });
  const og = c.numberLocale.replace("-", "_");
  h.meta = h.meta.map((m) => ("property" in m && m.property === "og:locale" ? { ...m, content: og } : m));
  if (!c.isPrimary) return h;
  const hl = c.country === "CH" || c.country === "BE" ? c.numberLocale : c.lang;
  const alts = [
    { rel: "alternate" as const, hrefLang: hl, href: SITE_URL + c.path },
    { rel: "alternate" as const, hrefLang: "x-default", href: SITE_URL + c.path },
  ];
  return { ...h, links: [...h.links, ...alts] };
}

export function IntlNativePage({ c }: { c: IntlCityPayload }) {
  const kit = kitFor(c.lang);
  const blog = blogFor(c);
  const places = SEO_PLACES[c.s] ?? [];
  const nf = new Intl.NumberFormat(c.numberLocale);
  const pop = c.pop != null ? nf.format(c.pop) : null;
  const area = c.area_km2 != null ? nf.format(c.area_km2) : null;
  const footer = { lang: c.lang, ...kit.footer };
  if (!blog) return <SeoShell footer={footer}><div lang={c.lang} data-noi18n className="p-8">{c.n}</div></SeoShell>;

  return (
    <SeoShell footer={footer}>
      <div lang={c.lang} data-noi18n>
        <Ld data={{ "@context": "https://schema.org", "@type": "WebPage", url: SITE_URL + c.path, inLanguage: c.lang, name: blog.title, about: { "@type": "City", name: c.n, geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng } } }} />
        <Hero seed={c.s} open={kit.open} home={`/?lang=${appLang(c.lang)}`} kicker={`${c.countryName} · 18+`} title={<>{blog.h1}</>}>
          <p className="mt-4 text-lg leading-snug text-ink/85">{blog.lead}</p>
          <Cta label={blog.cta} href={appHref(c)} />
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
          {c.source && (
            <p className="text-xs text-muted">
              {blog.sourceLabel}{" "}
              <a className="underline" href={c.source_url} rel="noopener" target="_blank">{c.source}</a>.
            </p>
          )}
          {blog.body}
          {blog.cruisingTitle && (
            <section className="seo-reveal mt-12">
              <h2 className="font-display text-2xl font-bold">{blog.cruisingTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed">{blog.cruisingText}</p>
              <p className="mt-4">
                <a
                  href={appHref(c, true)}
                  className="inline-flex min-h-12 items-center rounded-full border border-[#FA6F6C]/40 bg-[#FA6F6C]/10 px-5 py-2 text-sm font-semibold text-[#FA6F6C] hover:bg-[#FA6F6C]/20"
                >
                  {blog.cruisingCta}
                </a>
              </p>
              {blog.cruisingNote && <p className="mt-2 text-xs text-muted">{blog.cruisingNote}</p>}
            </section>
          )}
          {places.length > 0 ? (
            <section className="seo-reveal mt-12">
              <h2 className="font-display text-2xl font-bold">{blog.placesTitle}</h2>
              <p className="mt-2 text-sm text-muted">{blog.placesIntro}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {places.map((p) => (
                  <li key={p.name} className="seo-card px-4 py-3">
                    <strong>{p.name}</strong>
                    <span className="text-muted"> · {kit.kinds[p.kind] ?? p.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : blog.placesEmpty ? (
            <section className="seo-reveal mt-12">
              <h2 className="font-display text-2xl font-bold">{blog.placesTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed">{blog.placesEmpty}</p>
            </section>
          ) : null}
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
          <div className="seo-reveal my-12 text-center"><Cta label={blog.cta} href={appHref(c)} /></div>
          <p className="pb-8 text-center text-xs text-muted">{blog.foot}</p>
        </article>
      </div>
    </SeoShell>
  );
}
