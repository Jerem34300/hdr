import type { CityPayload } from "@/lib/hdar/seo-geo/types";
import { SITE_URL } from "@/lib/hdar/seo";
import { Hero, Ld, seoHead } from "./seo-pages";

/** Pages villes traduites : /{lang}/city/{slug} (en, es, de, it, pt, ar). La version française reste /rencontre/{slug}. */
export const SEO_LANGS = ["en", "es", "de", "it", "pt", "ar"] as const;
export type SeoLang = (typeof SEO_LANGS)[number];
export const isSeoLang = (l: string): l is SeoLang => (SEO_LANGS as readonly string[]).includes(l);
export const intlPath = (l: SeoLang, s: string) => `/${l}/city/${s}`;

type Tx = {
  locale: string;
  title: (n: string, dep: string) => string;
  desc: (n: string, dep: string) => string;
  h1: string;
  intro: (n: string, pop: string, dep: string, reg: string) => string;
  sub: string;
  cta: string;
  facts: [string, string, string];
  feats: [string, string][];
  how: string;
  steps: [string, string, string];
  faqT: string;
  faq: [string, string][];
  near: (n: string) => string;
  fr: string;
  foot: string;
};

const T: Record<SeoLang, Tx> = {
  en: {
    locale: "en_US",
    title: (n, d) => `Meet people and go out in ${n} (${d}): the live map — hdar.`,
    desc: (n, d) => `Dating, friends and nights out in ${n} and around (${d}). Live map, neighbourhood chat, open to everyone and LGBT-friendly. Free, discreet, 18+.`,
    h1: "Meet people and go out in",
    intro: (n, p, d, r) => `${n} has ${p} inhabitants (${d}, ${r}). hdar shows who is visible around you right now, instead of a grid of profiles from all over the country.`,
    sub: "Free · no account · rounded location · 18+",
    cta: "Open the map",
    facts: ["inhabitants", "chat radius", "price"],
    feats: [["Go out tonight", "See who is out tonight and where things are happening."], ["Dating", "Take the time to talk first: messages, voice notes, video calls."], ["Make friends", "New in town? Find people for a drink, a sport or a walk."], ["For everyone, LGBT-friendly", "Straight, gay, lesbian, bi, trans or questioning: hdar is open to all."]],
    how: "How it works",
    steps: ["Open hdar.chat and confirm you are 18 or older. No e-mail.", "Tap “Show me”: you appear on the map for 1 h, 3 h or all night.", "Write in the neighbourhood chat, create a place or send a private message."],
    faqT: "Frequently asked questions",
    faq: [["Is hdar free?", "Yes. The map, the neighbourhood chat, private messages and places are free. A paid option (hdar+) adds extras but is not required."], ["Do I need an account or an e-mail?", "No. You choose a nickname and confirm you are 18. No e-mail, no password, no mandatory photo."], ["Is my exact location visible?", "No. Others see a location rounded to about 110 metres and an approximate distance, never your address."]],
    near: (n) => `Around ${n}`,
    fr: "Version française",
    foot: "hdar. — nights out and meetups around you, for everyone. Free, discreet, 18+ only.",
  },
  es: {
    locale: "es_ES",
    title: (n, d) => `Conocer gente y salir en ${n} (${d}): el mapa en directo — hdar.`,
    desc: (n, d) => `Citas, amistad y salidas en ${n} y alrededores (${d}). Mapa en directo, chat del barrio, abierto a todos y LGBT-friendly. Gratis, discreto, +18.`,
    h1: "Conocer gente y salir en",
    intro: (n, p, d, r) => `${n} tiene ${p} habitantes (${d}, ${r}). hdar te muestra quién está visible a tu alrededor ahora mismo, en lugar de una cuadrícula de perfiles de todo el país.`,
    sub: "Gratis · sin cuenta · ubicación aproximada · +18",
    cta: "Abrir el mapa",
    facts: ["habitantes", "radio del chat", "precio"],
    feats: [["Salir esta noche", "Mira quién está fuera esta noche y dónde hay ambiente."], ["Citas", "Tómate tu tiempo para hablar: mensajes, audios, videollamadas."], ["Hacer amigos", "¿Nuevo en la ciudad? Encuentra gente para tomar algo, hacer deporte o pasear."], ["Para todos, LGBT-friendly", "Hetero, gay, lesbiana, bi, trans o explorando: hdar está abierto a todos."]],
    how: "Cómo funciona",
    steps: ["Abre hdar.chat y confirma que tienes 18 años. Sin e-mail.", "Toca «Mostrarme»: apareces en el mapa durante 1 h, 3 h o toda la noche.", "Escribe en el chat del barrio, crea un lugar o envía un mensaje privado."],
    faqT: "Preguntas frecuentes",
    faq: [["¿hdar es gratis?", "Sí. El mapa, el chat del barrio, los mensajes privados y los lugares son gratis. Una opción de pago (hdar+) añade extras, pero no es necesaria."], ["¿Necesito una cuenta o un e-mail?", "No. Eliges un apodo y confirmas que tienes 18 años. Sin e-mail, sin contraseña, sin foto obligatoria."], ["¿Se ve mi ubicación exacta?", "No. Los demás ven una ubicación redondeada a unos 110 metros y una distancia aproximada, nunca tu dirección."]],
    near: (n) => `Alrededor de ${n}`,
    fr: "Versión francesa",
    foot: "hdar. — salidas y encuentros a tu alrededor, para todos. Gratis, discreto, solo +18.",
  },
  de: {
    locale: "de_DE",
    title: (n, d) => `Leute treffen und ausgehen in ${n} (${d}): die Live-Karte — hdar.`,
    desc: (n, d) => `Dating, Freundschaft und Ausgehen in ${n} und Umgebung (${d}). Live-Karte, Viertel-Chat, offen für alle und LGBT-freundlich. Kostenlos, diskret, ab 18.`,
    h1: "Leute treffen und ausgehen in",
    intro: (n, p, d, r) => `${n} hat ${p} Einwohner (${d}, ${r}). hdar zeigt dir, wer gerade in deiner Nähe sichtbar ist, statt eines Rasters von Profilen aus dem ganzen Land.`,
    sub: "Kostenlos · ohne Konto · gerundeter Standort · ab 18",
    cta: "Karte öffnen",
    facts: ["Einwohner", "Chat-Radius", "Preis"],
    feats: [["Heute Abend ausgehen", "Sieh, wer heute Abend unterwegs ist und wo etwas los ist."], ["Dating", "Lass dir Zeit zum Schreiben: Nachrichten, Sprachnachrichten, Videoanrufe."], ["Freunde finden", "Neu in der Stadt? Finde Leute für einen Drink, Sport oder einen Spaziergang."], ["Für alle, LGBT-freundlich", "Hetero, schwul, lesbisch, bi, trans oder auf der Suche: hdar ist für alle offen."]],
    how: "So funktioniert es",
    steps: ["Öffne hdar.chat und bestätige, dass du mindestens 18 bist. Keine E-Mail.", "Tippe auf „Zeig mich“: Du erscheinst 1 Std., 3 Std. oder die ganze Nacht auf der Karte.", "Schreib im Viertel-Chat, erstelle einen Ort oder sende eine private Nachricht."],
    faqT: "Häufige Fragen",
    faq: [["Ist hdar kostenlos?", "Ja. Karte, Viertel-Chat, private Nachrichten und Orte sind kostenlos. Eine kostenpflichtige Option (hdar+) bietet Extras, ist aber nicht nötig."], ["Brauche ich ein Konto oder eine E-Mail?", "Nein. Du wählst einen Spitznamen und bestätigst, dass du 18 bist. Keine E-Mail, kein Passwort, kein Pflichtfoto."], ["Ist mein genauer Standort sichtbar?", "Nein. Andere sehen einen auf etwa 110 Meter gerundeten Standort und eine ungefähre Entfernung, nie deine Adresse."]],
    near: (n) => `Rund um ${n}`,
    fr: "Französische Version",
    foot: "hdar. — Ausgehen und Treffen in deiner Nähe, für alle. Kostenlos, diskret, nur ab 18.",
  },
  it: {
    locale: "it_IT",
    title: (n, d) => `Conoscere persone e uscire a ${n} (${d}): la mappa dal vivo — hdar.`,
    desc: (n, d) => `Incontri, amicizia e uscite a ${n} e dintorni (${d}). Mappa dal vivo, chat di quartiere, aperta a tutti e LGBT-friendly. Gratis, discreta, 18+.`,
    h1: "Conoscere persone e uscire a",
    intro: (n, p, d, r) => `${n} conta ${p} abitanti (${d}, ${r}). hdar ti mostra chi è visibile intorno a te adesso, invece di una griglia di profili di tutto il paese.`,
    sub: "Gratis · senza account · posizione arrotondata · 18+",
    cta: "Apri la mappa",
    facts: ["abitanti", "raggio della chat", "prezzo"],
    feats: [["Uscire stasera", "Guarda chi è fuori stasera e dove c'è movimento."], ["Incontri", "Prenditi il tempo di parlare: messaggi, vocali, videochiamate."], ["Fare amicizia", "Nuovo in città? Trova persone per un drink, uno sport o una passeggiata."], ["Per tutti, LGBT-friendly", "Etero, gay, lesbica, bi, trans o in ricerca: hdar è aperto a tutti."]],
    how: "Come funziona",
    steps: ["Apri hdar.chat e conferma di avere 18 anni. Nessuna e-mail.", "Tocca «Mostrami»: appari sulla mappa per 1 h, 3 h o tutta la notte.", "Scrivi nella chat di quartiere, crea un luogo o invia un messaggio privato."],
    faqT: "Domande frequenti",
    faq: [["hdar è gratis?", "Sì. Mappa, chat di quartiere, messaggi privati e luoghi sono gratuiti. Un'opzione a pagamento (hdar+) aggiunge extra, ma non è necessaria."], ["Serve un account o un'e-mail?", "No. Scegli un nickname e confermi di avere 18 anni. Niente e-mail, niente password, nessuna foto obbligatoria."], ["La mia posizione esatta è visibile?", "No. Gli altri vedono una posizione arrotondata a circa 110 metri e una distanza approssimativa, mai il tuo indirizzo."]],
    near: (n) => `Intorno a ${n}`,
    fr: "Versione francese",
    foot: "hdar. — uscite e incontri intorno a te, per tutti. Gratis, discreto, solo 18+.",
  },
  pt: {
    locale: "pt_PT",
    title: (n, d) => `Conhecer pessoas e sair em ${n} (${d}): o mapa ao vivo — hdar.`,
    desc: (n, d) => `Encontros, amizade e saídas em ${n} e arredores (${d}). Mapa ao vivo, chat do bairro, aberto a todos e LGBT-friendly. Grátis, discreto, 18+.`,
    h1: "Conhecer pessoas e sair em",
    intro: (n, p, d, r) => `${n} tem ${p} habitantes (${d}, ${r}). O hdar mostra quem está visível à tua volta agora, em vez de uma grelha de perfis do país inteiro.`,
    sub: "Grátis · sem conta · localização arredondada · 18+",
    cta: "Abrir o mapa",
    facts: ["habitantes", "raio do chat", "preço"],
    feats: [["Sair esta noite", "Vê quem está fora esta noite e onde há movimento."], ["Encontros", "Leva o teu tempo a conversar: mensagens, áudios, videochamadas."], ["Fazer amigos", "Novo na cidade? Encontra pessoas para um copo, um desporto ou um passeio."], ["Para todos, LGBT-friendly", "Hétero, gay, lésbica, bi, trans ou a descobrir: o hdar está aberto a todos."]],
    how: "Como funciona",
    steps: ["Abre hdar.chat e confirma que tens 18 anos. Sem e-mail.", "Toca em «Mostrar-me»: apareces no mapa durante 1 h, 3 h ou toda a noite.", "Escreve no chat do bairro, cria um local ou envia uma mensagem privada."],
    faqT: "Perguntas frequentes",
    faq: [["O hdar é grátis?", "Sim. O mapa, o chat do bairro, as mensagens privadas e os locais são grátis. Uma opção paga (hdar+) acrescenta extras, mas não é necessária."], ["Preciso de conta ou e-mail?", "Não. Escolhes um nome e confirmas que tens 18 anos. Sem e-mail, sem palavra-passe, sem foto obrigatória."], ["A minha localização exata é visível?", "Não. Os outros veem uma localização arredondada a cerca de 110 metros e uma distância aproximada, nunca a tua morada."]],
    near: (n) => `À volta de ${n}`,
    fr: "Versão francesa",
    foot: "hdar. — saídas e encontros à tua volta, para todos. Grátis, discreto, só 18+.",
  },
  ar: {
    locale: "ar_AR",
    title: (n, d) => `تعارف وخروج في ${n} (${d}): الخريطة المباشرة — hdar.`,
    desc: (n, d) => `مواعدة وصداقة وسهرات في ${n} وما حولها (${d}). خريطة مباشرة ودردشة الحي، مفتوحة للجميع وصديقة لمجتمع الميم. مجاني، متكتّم، للبالغين +18.`,
    h1: "تعارف وخروج في",
    intro: (n, p, d, r) => `يبلغ عدد سكان ${n} ${p} نسمة (${d}، ${r}). يُظهر لك hdar من هو ظاهر حولك الآن، بدلاً من شبكة ملفات من كل البلد.`,
    sub: "مجاني · بدون حساب · موقع تقريبي · +18",
    cta: "افتح الخريطة",
    facts: ["نسمة", "نطاق الدردشة", "السعر"],
    feats: [["الخروج الليلة", "شاهد من في الخارج الليلة وأين الأجواء."], ["مواعدة", "خذ وقتك في الحديث: رسائل، رسائل صوتية، مكالمات فيديو."], ["تكوين صداقات", "جديد في المدينة؟ جد أشخاصاً لمشروب أو رياضة أو نزهة."], ["للجميع", "مهما كان توجّهك، hdar مفتوح للجميع."]],
    how: "كيف يعمل",
    steps: ["افتح hdar.chat وأكّد أن عمرك 18 عاماً أو أكثر. بدون بريد إلكتروني.", "اضغط «أظهرني»: تظهر على الخريطة لمدة ساعة أو 3 ساعات أو طوال الليل.", "اكتب في دردشة الحي، أو أنشئ مكاناً، أو أرسل رسالة خاصة."],
    faqT: "أسئلة شائعة",
    faq: [["هل hdar مجاني؟", "نعم. الخريطة ودردشة الحي والرسائل الخاصة والأماكن مجانية. خيار مدفوع (hdar+) يضيف ميزات إضافية لكنه غير ضروري."], ["هل أحتاج إلى حساب أو بريد إلكتروني؟", "لا. تختار اسماً مستعاراً وتؤكد أن عمرك 18 عاماً. بدون بريد، بدون كلمة مرور، بدون صورة إلزامية."], ["هل موقعي الدقيق ظاهر؟", "لا. يرى الآخرون موقعاً مقرّباً إلى نحو 110 أمتار ومسافة تقريبية، وليس عنوانك أبداً."]],
    near: (n) => `حول ${n}`,
    fr: "النسخة الفرنسية",
    foot: "hdar. — سهرات ولقاءات حولك، للجميع. مجاني، متكتّم، للبالغين +18 فقط.",
  },
};

/** Liens hreflang communs (FR + langues), à ajouter aux pages villes. */
export function cityAlternates(s: string) {
  return [
    { rel: "alternate", hrefLang: "fr", href: `${SITE_URL}/rencontre/${s}` },
    ...SEO_LANGS.map((l) => ({ rel: "alternate", hrefLang: l, href: SITE_URL + intlPath(l, s) })),
    { rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}/rencontre/${s}` },
  ];
}

export function intlCityHead(l: SeoLang, c: CityPayload | undefined) {
  if (!c) return seoHead({ title: "hdar.", desc: "", path: "/", noindex: true });
  const tx = T[l];
  const h = seoHead({ title: tx.title(c.n, c.dep.n), desc: tx.desc(c.n, c.dep.n), path: intlPath(l, c.s), noindex: c.strong === false });
  h.meta = h.meta.map((m) => ("property" in m && m.property === "og:locale" ? { ...m, content: tx.locale } : m));
  return { ...h, links: [...h.links, ...cityAlternates(c.s)] };
}

export function IntlCityPage({ l, c }: { l: SeoLang; c: CityPayload }) {
  const tx = T[l];
  const nf = (n: number) => new Intl.NumberFormat(l).format(n);
  return (
    <main lang={l} dir={l === "ar" ? "rtl" : "ltr"} data-noi18n className="h-dvh overflow-y-auto bg-night text-ink">
      <Ld data={{ "@context": "https://schema.org", "@type": "WebPage", url: SITE_URL + intlPath(l, c.s), inLanguage: l, name: `${tx.h1} ${c.n}`, about: { "@type": "City", name: c.n } }} />
      <Hero seed={c.s} kicker={`${c.dep.n} · ${c.reg.n}`} title={<>{tx.h1} <span className="text-[#FA6F6C]">{c.n}</span></>}>
        <p className="mt-4 text-lg leading-snug text-ink/85">{tx.intro(c.n, nf(c.p), c.dep.n, c.reg.n)}</p>
        <a href={`/?lang=${l}`} className="seo-cta mt-7 inline-flex h-14 items-center rounded-full px-7 font-semibold text-night">{tx.cta}</a>
        <p className="mt-3 text-xs text-muted">{tx.sub}</p>
        <dl className="mt-8 grid grid-cols-3 gap-2 text-center">
          <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">{tx.facts[0]}</dt><dd className="font-display text-xl font-bold">{nf(c.p)}</dd></div>
          <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">{tx.facts[1]}</dt><dd className="font-display text-xl font-bold">~3 km</dd></div>
          <div className="seo-card px-2 py-3"><dt className="text-[11px] text-muted">{tx.facts[2]}</dt><dd className="font-display text-xl font-bold">0 €</dd></div>
        </dl>
      </Hero>
      <article className="mx-auto max-w-2xl px-5">
        <ul className="mt-10 grid gap-2 sm:grid-cols-2">
          {tx.feats.map(([t, d]) => <li key={t} className="seo-card p-4"><p className="font-bold">{t}</p><p className="mt-1 text-sm text-ink/80">{d}</p></li>)}
        </ul>
        <h2 className="mt-12 font-display text-2xl font-bold">{tx.how}</h2>
        <ol className="mt-4 space-y-2 text-sm leading-relaxed">{tx.steps.map((s, i) => <li key={i}><strong className="text-[#FA6F6C]">{i + 1}.</strong> {s}</li>)}</ol>
        {c.nearby.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold">{tx.near(c.n)}</h2>
            <p className="mt-3 flex flex-wrap gap-2">{c.nearby.slice(0, 12).map((m) => <a key={m.s} href={intlPath(l, m.s)} className="rounded-full border border-line px-3 py-1.5 text-sm">{m.n}{m.k != null && <span className="text-muted"> · {m.k} km</span>}</a>)}</p>
          </section>
        )}
        <section className="mt-12">
          <Ld data={{ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: l, mainEntity: tx.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }} />
          <h2 className="font-display text-2xl font-bold">{tx.faqT}</h2>
          <div className="mt-4 space-y-2">{tx.faq.map(([q, a]) => <details key={q} className="seo-card p-4"><summary className="cursor-pointer font-bold">{q}</summary><p className="mt-2 text-sm text-ink/80">{a}</p></details>)}</div>
        </section>
        <p className="my-10 flex flex-wrap gap-3 text-sm">
          <a className="underline" href={`/rencontre/${c.s}`} lang="fr">{tx.fr}</a>
          {SEO_LANGS.filter((x) => x !== l).map((x) => <a key={x} className="underline uppercase" href={intlPath(x, c.s)} lang={x}>{x}</a>)}
        </p>
      </article>
      <footer className="mx-auto max-w-2xl border-t border-line px-5 py-8 text-xs text-muted"><p>{tx.foot}</p></footer>
    </main>
  );
}
