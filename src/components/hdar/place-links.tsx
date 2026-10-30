/** Liens d'une fiche lieu : site, téléphone et réseaux (champs ou description), cliquables et sûrs. */
import { Facebook, Globe, Instagram, Phone } from "lucide-react";
import type { ReactNode } from "react";

type Kind = "web" | "tel" | "instagram" | "facebook" | "x";
export type PlaceLink = { kind: Kind; href: string; label: string };

/** Uniquement http(s) ; « exemple.com/x » devient https://exemple.com/x. */
export function safeHttp(raw: string): string | null {
  const s = raw.trim().replace(/[).,;:!?»]+$/, "");
  const v = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
const kindOf = (href: string): Kind => {
  const h = new URL(href).hostname.replace(/^www\.|^m\./, "");
  if (h === "instagram.com") return "instagram";
  if (h === "facebook.com" || h === "fb.com") return "facebook";
  if (h === "x.com" || h === "twitter.com") return "x";
  return "web";
};
const PHONE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const telHref = (p: string) => "tel:" + p.replace(/[^\d+]/g, "").replace(/^0/, "+33");
// URL avec schéma, ou domaine nu suivi d'un chemin (instagram.com/xxx).
const URLRE = /\bhttps?:\/\/[^\s<>"']+|\b(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']*/gi;

const LABEL: Record<Kind, string> = { web: "Site web", tel: "", instagram: "Instagram", facebook: "Facebook", x: "X" };

export function placeLinks(website: string | null, contact: string | null, description: string | null): PlaceLink[] {
  const out: PlaceLink[] = [];
  const seen = new Set<string>();
  const add = (l: PlaceLink) => { const k = l.href.replace(/\/$/, "").toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(l); } };
  const addUrl = (raw: string) => { const h = safeHttp(raw); if (h) { const k = kindOf(h); add({ kind: k, href: h, label: LABEL[k] }); } };
  if (website) addUrl(website);
  for (const t of [contact, description]) {
    if (!t) continue;
    for (const m of t.match(URLRE) ?? []) addUrl(m);
    for (const m of t.match(PHONE) ?? []) add({ kind: "tel", href: telHref(m), label: m.trim() });
  }
  const order: Kind[] = ["web", "tel", "instagram", "facebook", "x"];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}
const ICON: Record<Kind, (p: { className?: string }) => ReactNode> = {
  web: (p) => <Globe {...p} />, tel: (p) => <Phone {...p} />, instagram: (p) => <Instagram {...p} />, facebook: (p) => <Facebook {...p} />, x: (p) => <XIcon {...p} />,
};

export function PlaceLinkButtons({ links, onOpen }: { links: PlaceLink[]; onOpen?: (l: PlaceLink) => void }) {
  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      {links.map((l) => (
        <a key={l.href} href={l.href} {...(l.kind === "tel" ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
          onClick={() => onOpen?.(l)}
          className={"inline-flex h-10 items-center gap-2 rounded-full px-4 font-bold " + (l.kind === "web" ? "bg-signal text-night" : "border border-line text-ink")}>
          {ICON[l.kind]({ className: "size-4" })}
          {l.label}
        </a>
      ))}
    </div>
  );
}

/** Description avec liens et numéros cliquables (le texte reste identique). */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const re = new RegExp(`${URLRE.source}|${PHONE.source}`, "gi");
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const raw = m[0]; const i = m.index ?? 0;
    const trail = raw.match(/[).,;:!?»]+$/)?.[0] ?? "";
    const core = raw.slice(0, raw.length - trail.length);
    const isTel = new RegExp(`^${PHONE.source}$`).test(core);
    const href = isTel ? telHref(core) : safeHttp(core);
    if (!href) continue;
    parts.push(text.slice(last, i));
    parts.push(<a key={i} href={href} className="text-signal underline underline-offset-2" {...(isTel ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}>{core}</a>);
    if (trail) parts.push(trail);
    last = i + raw.length;
  }
  parts.push(text.slice(last));
  return <p className={className}>{parts}</p>;
}
