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

// Premier rendu client = rendu serveur (français) pour une hydratation identique (pas d'erreur React #418) ;
// la vraie langue est posée par startI18n(), juste après le montage.
export const useLang = create<{ lang: Lang; forced: boolean; ready: number; setLang: (l: Lang | null) => void }>((set) => ({
  lang: "fr",
  forced: false,
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
  return d[fr] ?? d[norm(fr)] ?? fr;
}
/** Texte à trous : tf("Bonjour {n}", nom) -> traduit puis remplit les {n} dans l'ordre. */
export function tf(fr: string, ...vals: (string | number)[]): string {
  let i = 0;
  return t(fr).replace(/\{n\}/g, () => String(vals[i++] ?? ""));
}
/** Locale Intl de l'interface, pour dates, heures et nombres. */
export function locale(lang: Lang = useLang.getState().lang): string {
  return lang === "fr" ? "fr-FR" : lang === "en" ? "en-GB" : lang === "pt" ? "pt-PT" : lang === "ar" ? "ar-u-nu-latn" : lang;
}
// Gabarits à trous ({n} = n'importe quel texte), compilés une fois par langue, du plus précis au plus général.
const tpls: Partial<Record<Lang, { re: RegExp; tr: string }[]>> = {};
function templates(lang: Lang) {
  if (tpls[lang]) return tpls[lang]!;
  const d = dicts[lang] ?? {};
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const list = Object.keys(d)
    .filter((k) => k.includes("{n}") && k.replace(/\{n\}/g, "").replace(/[\s·,.:!?()]/g, "").length >= 2)
    .sort((a, b) => b.replace(/\{n\}/g, "").length - a.replace(/\{n\}/g, "").length)
    .map((k) => ({ re: new RegExp("^" + k.split("{n}").map(esc).join("(.+?)") + "$", "s"), tr: d[k] }));
  return (tpls[lang] = list);
}
function trKey(k: string, lang: Lang): string | undefined {
  const d = dicts[lang];
  if (!d) return;
  const r = d[k];
  if (r) return r;
  // Nombres d'abord (rapide), puis gabarits généraux.
  if (/\d/.test(k)) {
    const nums = k.match(/\d+(?:[.,]\d+)?/g) ?? [];
    const tpl = d[k.replace(/\d+(?:[.,]\d+)?/g, "{n}")];
    if (tpl) { let i = 0; return tpl.replace(/\{n\}/g, () => nums[i++] ?? ""); }
  }
  for (const { re, tr } of templates(lang)) {
    const m = re.exec(k);
    if (m) {
      let i = 1;
      return tr.replace(/\{n\}/g, () => { const x = m[i++] ?? ""; return d[x] ?? x; });
    }
  }
  const g = /^Général (.+)$/.exec(k);
  if (g && d["Général"]) return `${d["Général"]} ${g[1]}`;
}
/** Message du robot hdar (texte source français, stocké en base) dans la langue de l'utilisateur. */
export function tBot(body: string, lang: Lang = useLang.getState().lang): string {
  if (lang === "fr" || !dicts[lang]) return body;
  return trKey(body, lang) ?? trKey(norm(body), lang) ?? body;
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
  const r = trKey(k, lang);
  return r ? v.replace(k, r) : v;
}
function translateAttrs(el: Element, lang: Lang) {
  let rec = srcAttr.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    if (!rec) { rec = {}; srcAttr.set(el, rec); }
    const prevOut = rec["_" + a];
    if (prevOut !== v) rec[a] = v;
    const next = lang === "fr" ? rec[a] : (trKey(norm(rec[a]), lang) ?? rec[a]);
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

// ---------- Libellés qui doivent tenir sur une ligne (boutons, pilules, onglets) ----------
// Un élément [data-fit] (nowrap + overflow hidden + ellipsis, classe .fit) voit sa police réduite jusqu'à 75 %
// si le texte traduit déborde ; au-delà, l'ellipsis CSS prend le relais. Recalculé après chaque traduction et au redimensionnement.
function fitOne(el: HTMLElement) {
  el.style.fontSize = "";
  const w = el.clientWidth;
  if (!w || el.scrollWidth <= w + 1) return;
  const base = parseFloat(getComputedStyle(el).fontSize) || 12;
  let k = 1;
  for (let i = 0; i < 4 && el.scrollWidth > el.clientWidth + 0.5 && k > 0.75; i++) {
    k = Math.max(0.75, k * (el.clientWidth / el.scrollWidth) * 0.97);
    el.style.fontSize = (base * k).toFixed(2) + "px";
  }
}
let fitQueued = false;
export function fitLabels() {
  if (typeof window === "undefined" || fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    document.querySelectorAll<HTMLElement>("[data-fit]").forEach(fitOne);
  });
}
async function load(lang: Lang) {
  if (dicts[lang]) return;
  const l = loaders[`./i18n/${lang}.json`];
  if (l) { dicts[lang] = (await l()).default; delete tpls[lang]; }
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
  useLang.setState(initial());
  if (/bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent) && !useLang.getState().forced) useLang.setState({ lang: "fr" });
  const run = async (lang: Lang) => {
    await load(lang);
    if (useLang.getState().lang !== lang || blocked()) return;
    applyDoc(lang);
    walk(document.body, lang);
    fitLabels();
    useLang.setState((s) => ({ ready: s.ready + 1 }));
  };
  const blocked = () => SEO_FR.test(location.pathname) || /^\/(en|es|de|it|pt|ar)\//.test(location.pathname);
  observer = new MutationObserver((muts) => {
    if (blocked()) return;
    const lang = useLang.getState().lang;
    if (lang === "fr" && !document.documentElement.dataset.i18nWas) { fitLabels(); return; }
    for (const m of muts) {
      if (m.type === "characterData") walk(m.target, lang);
      else if (m.type === "attributes") { if (m.target.nodeType === 1 && !(m.target as Element).closest(SKIP)) translateAttrs(m.target as Element, lang); }
      else m.addedNodes.forEach((n) => walk(n, lang));
    }
    fitLabels();
  });
  window.addEventListener("resize", fitLabels);
  void document.fonts?.ready.then(fitLabels);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  void run(useLang.getState().lang);
  useLang.subscribe((s, p) => {
    if (s.lang !== p.lang) {
      if (p.lang !== "fr") document.documentElement.dataset.i18nWas = "1";
      void run(s.lang);
    }
  });
}
