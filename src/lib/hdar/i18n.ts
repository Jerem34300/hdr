import { create } from "zustand";

/** Langues de l'interface. Le français est la langue source (et le repli). */
export const LANGS = [
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "ar", name: "العربية" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
const KEY = "hdar-lang";
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

/** Langue du téléphone (navigator.languages), français par défaut. */
export function deviceLang(): Lang {
  if (typeof navigator === "undefined") return "fr";
  for (const l of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const c = (l || "").slice(0, 2).toLowerCase();
    if (isLang(c)) return c;
  }
  return "fr";
}
function initial(): { lang: Lang; forced: boolean } {
  if (typeof window === "undefined") return { lang: "fr", forced: false };
  const q = new URLSearchParams(location.search).get("lang");
  if (isLang(q)) return { lang: q, forced: true };
  try {
    const v = localStorage.getItem(KEY);
    if (isLang(v)) return { lang: v, forced: true };
  } catch { /* stockage indisponible */ }
  return { lang: deviceLang(), forced: false };
}

type Dict = Record<string, string>;
const dicts: Partial<Record<Lang, Dict>> = { fr: {} };
const loaders = import.meta.glob<{ default: Dict }>("./i18n/*.json");

export const useLang = create<{ lang: Lang; forced: boolean; ready: number; setLang: (l: Lang | null) => void }>((set) => ({
  ...initial(),
  ready: 0,
  setLang: (l) => {
    try {
      if (l) localStorage.setItem(KEY, l);
      else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    set({ lang: l ?? deviceLang(), forced: !!l });
  },
}));

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** Traduction d'un texte source français (renvoie le texte tel quel s'il n'est pas connu). */
export function t(fr: string, lang: Lang = useLang.getState().lang): string {
  if (lang === "fr") return fr;
  const d = dicts[lang];
  if (!d) return fr;
  const k = norm(fr);
  return d[k] ?? fr;
}
/** Nom d'un pays dans la langue de l'interface (Intl). */
export function countryName(cc: string, lang: Lang = useLang.getState().lang): string {
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

// ---------- Traduction de l'interface rendue (nœuds texte + attributs) ----------
// Les contenus des membres (messages, pseudos, bios, annonces…) sont marqués translate="no" et ne sont jamais traduits.
const SKIP = "[translate=no],[data-noi18n],script,style,textarea,code,.maplibregl-map";
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const src = new WeakMap<Node, string>(); // texte français d'origine
const out = new WeakMap<Node, string>(); // dernière valeur posée par nous
const srcAttr = new WeakMap<Element, Record<string, string>>();

function translateText(n: Text, lang: Lang) {
  const v = n.nodeValue ?? "";
  if (out.get(n) === v) {
    const s = src.get(n)!;
    const next = trText(s, lang);
    if (next !== v) { out.set(n, next); n.nodeValue = next; }
    return;
  }
  if (!/[A-Za-zÀ-ÿ]/.test(v)) return;
  src.set(n, v);
  const next = trText(v, lang);
  out.set(n, next);
  if (next !== v) n.nodeValue = next;
}
function trText(v: string, lang: Lang) {
  if (lang === "fr") return v;
  const k = norm(v);
  if (!k) return v;
  const d = dicts[lang];
  const r = d?.[k];
  if (r) return v.replace(k, r);
  // Textes avec nombres : « Se montrer 3 h » -> clé « Se montrer {n} h ».
  if (/\d/.test(k)) {
    const nums = k.match(/\d+(?:[.,]\d+)?/g) ?? [];
    const tpl = d?.[k.replace(/\d+(?:[.,]\d+)?/g, "{n}")];
    if (tpl) { let i = 0; return v.replace(k, tpl.replace(/\{n\}/g, () => nums[i++] ?? "")); }
  }
  // « Général France » (salon par pays) : mot traduit + pays via Intl.
  const g = /^Général (.+)$/.exec(k);
  if (g && d?.["Général"]) return v.replace(k, `${d["Général"]} ${g[1]}`);
  return v;
}
function translateAttrs(el: Element, lang: Lang) {
  let rec = srcAttr.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    if (!rec) { rec = {}; srcAttr.set(el, rec); }
    const prevOut = rec["_" + a];
    if (prevOut !== v) rec[a] = v;
    const next = lang === "fr" ? rec[a] : (dicts[lang]?.[norm(rec[a])] ?? rec[a]);
    rec["_" + a] = next;
    if (next !== v) el.setAttribute(a, next);
  }
}
function walk(root: Node, lang: Lang) {
  if (root.nodeType === 3) {
    const p = root.parentElement;
    if (p && !p.closest(SKIP)) translateText(root as Text, lang);
    return;
  }
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (el.closest(SKIP)) return;
  translateAttrs(el, lang);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === 3) translateText(n as Text, lang);
    else translateAttrs(n as Element, lang);
  }
}

let observer: MutationObserver | null = null;
async function load(lang: Lang) {
  if (dicts[lang]) return;
  const l = loaders[`./i18n/${lang}.json`];
  if (l) dicts[lang] = (await l()).default;
}
function applyDoc(lang: Lang) {
  const h = document.documentElement;
  h.lang = lang;
  h.dir = lang === "ar" ? "rtl" : "ltr";
}
/** À appeler une fois côté client : applique la langue et suit les changements du DOM. */
// Pages SEO françaises : jamais traduites à la volée (elles ont leurs versions /{lang}/city/…). Robots : français.
const SEO_FR = /^\/(rencontre|fr|petites-annonces|annonces|cam-to-cam|alternative-|live-coquin|tchat-|webcam-|cgu|confidentialite|faq|contact)/;
export function startI18n() {
  if (typeof window === "undefined" || observer) return;
  if (/bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent) && !useLang.getState().forced) useLang.setState({ lang: "fr" });
  const run = async (lang: Lang) => {
    await load(lang);
    if (useLang.getState().lang !== lang || blocked()) return;
    applyDoc(lang);
    walk(document.body, lang);
    useLang.setState((s) => ({ ready: s.ready + 1 }));
  };
  const blocked = () => SEO_FR.test(location.pathname) || /^\/(en|es|de|it|pt|ar)\//.test(location.pathname);
  observer = new MutationObserver((muts) => {
    if (blocked()) return;
    const lang = useLang.getState().lang;
    if (lang === "fr" && !document.documentElement.dataset.i18nWas) return;
    for (const m of muts) {
      if (m.type === "characterData") walk(m.target, lang);
      else if (m.type === "attributes") { if (m.target.nodeType === 1 && !(m.target as Element).closest(SKIP)) translateAttrs(m.target as Element, lang); }
      else m.addedNodes.forEach((n) => walk(n, lang));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  void run(useLang.getState().lang);
  useLang.subscribe((s, p) => {
    if (s.lang !== p.lang) {
      if (p.lang !== "fr") document.documentElement.dataset.i18nWas = "1";
      void run(s.lang);
    }
  });
}
