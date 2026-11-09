/**
 * Per-language kit for native intl city pages (/{lang}/{slug}): every UI string in the page language.
 * City-specific long-form text lives in ./cities-<lang>.ts — this file only holds shared wording.
 */

export type Faq = { q: string; a: string };

/** Unique long-form text for one city (Berlin standard). `**x**` marks bold. */
export type CityText = {
  title: string;
  desc: string;
  h1: [string, string, string?];
  lead: string;
  introTitle: string;
  intro: string[];
  quartersTitle: string;
  quarters: [string, string][];
  cruising: string;
  faq: Faq[];
};

export type NumbersInput = { n: string; pop: string | null; area: string | null; source: string };

export type Kit = {
  open: string;
  cta: string;
  sub: string;
  facts: [string, string, string];
  sourceLabel: string;
  numbersTitle: string;
  numbers: (x: NumbersInput) => string;
  discreetTitle: string;
  steps: string[];
  cruisingTitle: (n: string) => string;
  cruisingCta: (n: string) => string;
  cruisingNote: string;
  placesTitle: string;
  placesIntro: string;
  placesEmpty: (n: string) => string;
  nearTitle: string;
  faqTitle: string;
  faqBase: (n: string) => Faq[];
  foot: string;
  footer: { tagline: string; all: string; faq: string; terms: string; privacy: string; contact: string };
  kinds: Record<string, string>;
  /** Plain in-language page for secondary-language variants (noindex) — e.g. /fr/zuerich. */
  generic?: (n: string, country: string) => CityText;
};

const de: Kit = {
  open: "App öffnen",
  cta: "Karte öffnen",
  sub: "Kostenlos · anonym · Standort gerundet · ab 18",
  facts: ["Einwohner", "Fläche", "Alter"],
  sourceLabel: "Offizielle Zahlen:",
  numbersTitle: "Zahlen mit Quelle (keine hdar-Statistik)",
  numbers: ({ n, pop, area, source }) =>
    `Laut amtlicher Statistik (${source}) zählt ${n} **${pop} Einwohner**${area ? ` auf einer Fläche von **${area} km²**` : ""}. ` +
    `Das sind Stadtzahlen — keine Nutzerzahlen von hdar. Wir erfinden keine „X Leute gerade online in ${n}“.`,
  discreetTitle: "So bleibt es diskret",
  steps: [
    "hdar.chat öffnen, 18+ bestätigen — ohne E-Mail.",
    "„Mich zeigen“ tippen: du erscheinst auf der Karte, Standort auf etwa 110 Meter gerundet.",
    "Viertel-Chat (ca. 3 km) oder private Nachricht — Foto, Sprachnachricht, Video nur wenn du willst.",
    "Erste Treffen lieber öffentlich (Café, Bar) und jemandem Bescheid geben.",
  ],
  cruisingTitle: (n) => `Cruising-Orte in ${n}`,
  cruisingCta: (n) => `Karte öffnen · öffentliche Orte in ${n}`,
  cruisingNote: "18+ · Ebene nur auf Wunsch · keine Adressen auf dieser Seite.",
  placesTitle: "Orte auf der hdar-Karte",
  placesIntro: "Nur freigeschaltete Einträge aus der Karte. Keine erfundenen Adressen.",
  placesEmpty: (n) =>
    `Für ${n} gibt es auf der hdar-Karte noch keine freigeschalteten Partner-Bars, -Saunen oder -Clubs — deshalb steht hier keiner. Betreiber können sich über die Kontaktseite melden.`,
  nearTitle: "Andere Städte",
  faqTitle: "Häufige Fragen",
  faqBase: (n) => [
    { q: `Ist hdar in ${n} kostenlos?`, a: "Ja. Karte, Viertel-Chat und private Nachrichten sind kostenlos. hdar+ ist optional." },
    { q: "Brauche ich ein Konto?", a: "Nein. Spitzname und 18+-Bestätigung reichen. Keine E-Mail, kein Passwort." },
    { q: "Sieht man meine genaue Adresse?", a: "Nein. Andere sehen eine auf etwa 110 Meter gerundete Position und eine ungefähre Entfernung." },
  ],
  foot: "hdar. — Ausgehen und Treffen in deiner Nähe, für alle. Kostenlos, diskret, nur ab 18.",
  footer: { tagline: "hdar. — Ausgehen und Treffen in deiner Nähe, für alle. Kostenlos, diskret, nur ab 18.", all: "Alle Städte", faq: "FAQ", terms: "AGB", privacy: "Datenschutz", contact: "Kontakt" },
  kinds: { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Shop", other: "Ort" },
  generic: (n) => ({
    title: `${n}: Chat & Treffen in deiner Nähe — hdar.`,
    desc: `Chat und Treffen in ${n}, in deiner Nähe. Kostenlos, anonym, ab 18. Live-Karte und Viertel-Chat — für alle.`,
    h1: ["Chat & Treffen in ", n],
    lead: `Ein Blick auf die Karte zeigt, wer in ${n} gerade sichtbar ist — in deiner Nähe, nicht im ganzen Land.`,
    introTitle: `hdar in ${n}`,
    intro: [
      "hdar zeigt dich nur, wenn du es willst: eine Stunde, drei Stunden oder die ganze Nacht — Position auf etwa 110 Meter gerundet. Ein Blick, ein Chat im Viertel, vielleicht ein Drink später.",
    ],
    quartersTitle: "",
    quarters: [],
    cruising: "Öffentliche Orte, die die Community meldet, liegen auf der optionalen Kartenebene „Andere öffentliche Orte“. Keine Adressen hier — nur die Live-Karte, ab 18, diskret und mit Respekt für andere.",
    faq: [],
  }),
};

const fr: Kit = {
  open: "Ouvrir l'appli",
  cta: "Ouvrir la carte",
  sub: "Gratuit · anonyme · position arrondie · 18+",
  facts: ["Habitants", "Superficie", "Âge"],
  sourceLabel: "Chiffres officiels :",
  numbersTitle: "Des chiffres sourcés (pas des stats hdar)",
  numbers: ({ n, pop, area, source }) =>
    `Selon la statistique officielle (${source}), ${n} compte **${pop} habitants**${area ? ` sur **${area} km²**` : ""}. ` +
    `Ce sont des chiffres de la ville, pas des chiffres d'utilisateurs hdar : on n'invente pas de « X personnes en ligne à ${n} ».`,
  discreetTitle: "Rester discret",
  steps: [
    "Ouvre hdar.chat et confirme tes 18 ans — sans e-mail.",
    "Touche « Me montrer » : tu apparais sur la carte, position arrondie à environ 110 mètres.",
    "Tchat du quartier (environ 3 km) ou message privé — photo, vocal ou vidéo seulement si tu veux.",
    "Pour un premier rendez-vous, choisis un lieu public (café, bar) et préviens quelqu'un.",
  ],
  cruisingTitle: (n) => `Lieux de drague à ${n}`,
  cruisingCta: (n) => `Ouvrir la carte · lieux publics à ${n}`,
  cruisingNote: "18+ · calque à activer · aucune adresse sur cette page.",
  placesTitle: "Lieux sur la carte hdar",
  placesIntro: "Uniquement les lieux validés sur la carte. Aucune adresse inventée.",
  placesEmpty: (n) =>
    `Aucun bar, sauna ou club partenaire validé pour ${n} sur la carte hdar pour l'instant, donc aucun n'est listé ici. Les établissements peuvent nous écrire via la page contact.`,
  nearTitle: "Autres villes",
  faqTitle: "Questions fréquentes",
  faqBase: (n) => [
    { q: `hdar est-il gratuit à ${n} ?`, a: "Oui. La carte, le tchat du quartier et les messages privés sont gratuits. hdar+ est optionnel." },
    { q: "Faut-il créer un compte ?", a: "Non. Un pseudo et la confirmation de tes 18 ans suffisent. Ni e-mail, ni mot de passe." },
    { q: "Voit-on mon adresse exacte ?", a: "Non. Les autres voient une position arrondie à environ 110 mètres et une distance approximative." },
  ],
  foot: "hdar. — sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, réservé aux 18 ans et plus.",
  footer: { tagline: "hdar. — sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, réservé aux 18 ans et plus.", all: "Toutes les villes", faq: "FAQ", terms: "CGU", privacy: "Confidentialité", contact: "Contact" },
  kinds: { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Boutique", other: "Lieu" },
  generic: (n) => ({
    title: `${n} : tchat et rencontres autour de toi — hdar.`,
    desc: `Tchat et rencontres à ${n}, autour de toi. Gratuit, anonyme, 18+. Carte en direct et tchat du quartier, pour tout le monde.`,
    h1: ["Tchat et plans à ", n],
    lead: `Un coup d'œil sur la carte suffit pour voir qui est visible à ${n} en ce moment — près de toi, pas à l'autre bout du pays.`,
    introTitle: `hdar à ${n}`,
    intro: [
      "Tu n'apparais que si tu le veux : une heure, trois heures ou toute la nuit, avec une position arrondie à environ 110 mètres. Un regard, un message dans le tchat du quartier, peut-être un verre ensuite.",
    ],
    quartersTitle: "",
    quarters: [],
    cruising: "Les lieux publics signalés par la communauté sont sur le calque optionnel « Autres lieux publics ». Aucune adresse ici : seulement la carte en direct, pour les 18 ans et plus, avec discrétion et respect des autres.",
    faq: [],
  }),
};

const nl: Kit = {
  open: "App openen",
  cta: "Open de kaart",
  sub: "Gratis · anoniem · locatie afgerond · 18+",
  facts: ["Inwoners", "Oppervlakte (land)", "Leeftijd"],
  sourceLabel: "Officiële cijfers:",
  numbersTitle: "Cijfers met bron (geen hdar-statistiek)",
  numbers: ({ n, pop, area, source }) =>
    `Volgens de officiële statistiek (${source}) telt ${n} **${pop} inwoners**${area ? ` op **${area} km² land**` : ""}. ` +
    `Dat zijn cijfers over de stad, geen gebruikersaantallen van hdar — we verzinnen geen „X mensen nu online in ${n}”.`,
  discreetTitle: "Zo blijft het discreet",
  steps: [
    "Open hdar.chat en bevestig dat je 18+ bent — zonder e-mail.",
    "Tik op „Laat me zien”: je verschijnt op de kaart, locatie afgerond op ongeveer 110 meter.",
    "Buurtchat (ongeveer 3 km) of een privébericht — foto, spraakbericht of video alleen als jij dat wilt.",
    "Spreek de eerste keer af op een openbare plek (café, bar) en laat iemand weten waar je bent.",
  ],
  cruisingTitle: (n) => `Cruisingplekken in ${n}`,
  cruisingCta: (n) => `Open de kaart · openbare plekken in ${n}`,
  cruisingNote: "18+ · laag alleen als je die aanzet · geen adressen op deze pagina.",
  placesTitle: "Plekken op de hdar-kaart",
  placesIntro: "Alleen goedgekeurde plekken van de kaart. Geen verzonnen adressen.",
  placesEmpty: (n) =>
    `Er staan nog geen goedgekeurde partnerbars, -sauna's of -clubs in ${n} op de hdar-kaart, dus hier staat er geen. Zaken kunnen contact opnemen via de contactpagina.`,
  nearTitle: "Andere steden",
  faqTitle: "Veelgestelde vragen",
  faqBase: (n) => [
    { q: `Is hdar gratis in ${n}?`, a: "Ja. De kaart, de buurtchat en privéberichten zijn gratis. hdar+ is optioneel." },
    { q: "Heb ik een account nodig?", a: "Nee. Een bijnaam en een 18+-bevestiging zijn genoeg. Geen e-mail, geen wachtwoord." },
    { q: "Ziet iemand mijn precieze adres?", a: "Nee. Anderen zien een positie afgerond op ongeveer 110 meter en een geschatte afstand." },
  ],
  foot: "hdar. — uitgaan en afspreken bij jou in de buurt, voor iedereen. Gratis, discreet, alleen 18+.",
  footer: { tagline: "hdar. — uitgaan en afspreken bij jou in de buurt, voor iedereen. Gratis, discreet, alleen 18+.", all: "Alle steden", faq: "FAQ", terms: "Voorwaarden", privacy: "Privacy", contact: "Contact" },
  kinds: { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Winkel", other: "Plek" },
  generic: (n) => ({
    title: `${n}: chat & afspreken in de buurt — hdar.`,
    desc: `Chat en afspraakjes in ${n}, bij jou in de buurt. Gratis, anoniem, 18+. Livekaart en buurtchat, voor iedereen.`,
    h1: ["Chat & afspreken in ", n],
    lead: `Eén blik op de kaart laat zien wie er nu zichtbaar is in ${n} — dichtbij, niet aan de andere kant van het land.`,
    introTitle: `hdar in ${n}`,
    intro: [
      "Je bent alleen zichtbaar als jij dat wilt: een uur, drie uur of de hele nacht, met een locatie afgerond op ongeveer 110 meter. Een blik, een berichtje in de buurtchat, misschien later een drankje.",
    ],
    quartersTitle: "",
    quarters: [],
    cruising: "Openbare plekken die de community meldt, staan op de optionele kaartlaag „Other public places” (de app is in het Engels). Geen adressen hier — alleen de livekaart, 18+, discreet en met respect voor anderen.",
    faq: [],
  }),
};

const es: Kit = {
  open: "Abrir la app",
  cta: "Abrir el mapa",
  sub: "Gratis · anónimo · ubicación redondeada · +18",
  facts: ["Habitantes", "Superficie", "Edad"],
  sourceLabel: "Cifras oficiales:",
  numbersTitle: "Cifras con fuente (no son estadísticas de hdar)",
  numbers: ({ n, pop, area, source }) =>
    `Según la estadística oficial (${source}), ${n} tiene **${pop} habitantes**${area ? ` en **${area} km²**` : ""}. ` +
    `Son cifras de la ciudad, no de usuarios de hdar: no nos inventamos un «X personas conectadas en ${n}».`,
  discreetTitle: "Cómo mantenerlo discreto",
  steps: [
    "Abre hdar.chat y confirma que tienes 18 años o más — sin correo.",
    "Toca «Mostrarme»: apareces en el mapa con la ubicación redondeada a unos 110 metros.",
    "Chat del barrio (unos 3 km) o mensaje privado — foto, nota de voz o vídeo solo si quieres.",
    "Para una primera cita, elige un sitio público (un bar, una cafetería) y avisa a alguien.",
  ],
  cruisingTitle: (n) => `Zonas de cruising en ${n}`,
  cruisingCta: (n) => `Abrir el mapa · lugares públicos en ${n}`,
  cruisingNote: "+18 · capa opcional · sin direcciones en esta página.",
  placesTitle: "Locales en el mapa de hdar",
  placesIntro: "Solo locales aprobados en el mapa. Ninguna dirección inventada.",
  placesEmpty: (n) =>
    `Todavía no hay bares, saunas ni clubs asociados aprobados en ${n} en el mapa de hdar, así que aquí no aparece ninguno. Los locales pueden escribirnos desde la página de contacto.`,
  nearTitle: "Otras ciudades",
  faqTitle: "Preguntas frecuentes",
  faqBase: (n) => [
    { q: `¿hdar es gratis en ${n}?`, a: "Sí. El mapa, el chat del barrio y los mensajes privados son gratis. hdar+ es opcional." },
    { q: "¿Necesito una cuenta?", a: "No. Basta con un apodo y confirmar que eres mayor de edad. Ni correo ni contraseña." },
    { q: "¿Se ve mi dirección exacta?", a: "No. Los demás ven una posición redondeada a unos 110 metros y una distancia aproximada." },
  ],
  foot: "hdar. — salir y conocer gente cerca de ti, para todo el mundo. Gratis, discreto, solo +18.",
  footer: { tagline: "hdar. — salir y conocer gente cerca de ti, para todo el mundo. Gratis, discreto, solo +18.", all: "Todas las ciudades", faq: "FAQ", terms: "Condiciones", privacy: "Privacidad", contact: "Contacto" },
  kinds: { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Tienda", other: "Lugar" },
};

const it: Kit = {
  open: "Apri l'app",
  cta: "Apri la mappa",
  sub: "Gratis · anonimo · posizione arrotondata · 18+",
  facts: ["Abitanti", "Superficie", "Età"],
  sourceLabel: "Dati ufficiali:",
  numbersTitle: "Numeri con fonte (non statistiche hdar)",
  numbers: ({ n, pop, area, source }) =>
    `Secondo i dati ufficiali (${source}), ${n} conta **${pop} residenti**${area ? ` su **${area} km²**` : ""}. ` +
    `Sono numeri della città, non utenti di hdar: non inventiamo un «X persone online a ${n}».`,
  discreetTitle: "Come restare discreti",
  steps: [
    "Apri hdar.chat e conferma di avere almeno 18 anni — senza e-mail.",
    "Tocca «Mostrami»: compari sulla mappa con la posizione arrotondata a circa 110 metri.",
    "Chat di quartiere (circa 3 km) o messaggio privato — foto, vocale o video solo se vuoi.",
    "Per il primo incontro scegli un posto pubblico (un bar, un caffè) e avvisa qualcuno.",
  ],
  cruisingTitle: (n) => `Luoghi di cruising a ${n}`,
  cruisingCta: (n) => `Apri la mappa · luoghi pubblici a ${n}`,
  cruisingNote: "18+ · livello da attivare · nessun indirizzo in questa pagina.",
  placesTitle: "Locali sulla mappa hdar",
  placesIntro: "Solo locali approvati sulla mappa. Nessun indirizzo inventato.",
  placesEmpty: (n) =>
    `Per ora non ci sono bar, saune o club partner approvati a ${n} sulla mappa hdar, quindi qui non ne elenchiamo. I locali possono scriverci dalla pagina contatti.`,
  nearTitle: "Altre città",
  faqTitle: "Domande frequenti",
  faqBase: (n) => [
    { q: `hdar è gratis a ${n}?`, a: "Sì. Mappa, chat di quartiere e messaggi privati sono gratuiti. hdar+ è facoltativo." },
    { q: "Serve un account?", a: "No. Bastano un nickname e la conferma della maggiore età. Niente e-mail, niente password." },
    { q: "Si vede il mio indirizzo esatto?", a: "No. Gli altri vedono una posizione arrotondata a circa 110 metri e una distanza approssimativa." },
  ],
  foot: "hdar. — uscite e incontri vicino a te, per tutti. Gratis, discreto, solo 18+.",
  footer: { tagline: "hdar. — uscite e incontri vicino a te, per tutti. Gratis, discreto, solo 18+.", all: "Tutte le città", faq: "FAQ", terms: "Termini", privacy: "Privacy", contact: "Contatti" },
  kinds: { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Negozio", other: "Luogo" },
};

const pt: Kit = {
  open: "Abrir a app",
  cta: "Abrir o mapa",
  sub: "Grátis · anónimo · localização arredondada · 18+",
  facts: ["Habitantes", "Área", "Idade"],
  sourceLabel: "Dados oficiais:",
  numbersTitle: "Números com fonte (não são estatísticas da hdar)",
  numbers: ({ n, pop, area, source }) =>
    `Segundo os dados oficiais (${source}), ${n} tem **${pop} residentes**${area ? ` em **${area} km²**` : ""}. ` +
    `São números da cidade, não utilizadores da hdar: não inventamos um «X pessoas online em ${n}».`,
  discreetTitle: "Como manter a discrição",
  steps: [
    "Abre hdar.chat e confirma que tens 18 anos ou mais — sem e-mail.",
    "Toca em «Mostrar-me»: apareces no mapa com a localização arredondada a cerca de 110 metros.",
    "Chat do bairro (cerca de 3 km) ou mensagem privada — foto, áudio ou vídeo só se quiseres.",
    "Num primeiro encontro, escolhe um sítio público (um bar, um café) e avisa alguém.",
  ],
  cruisingTitle: (n) => `Locais de cruising em ${n}`,
  cruisingCta: (n) => `Abrir o mapa · locais públicos em ${n}`,
  cruisingNote: "18+ · camada opcional · sem moradas nesta página.",
  placesTitle: "Espaços no mapa da hdar",
  placesIntro: "Só espaços aprovados no mapa. Nenhuma morada inventada.",
  placesEmpty: (n) =>
    `Ainda não há bares, saunas ou clubes parceiros aprovados em ${n} no mapa da hdar, por isso não aparece nenhum aqui. Os espaços podem contactar-nos pela página de contacto.`,
  nearTitle: "Outras cidades",
  faqTitle: "Perguntas frequentes",
  faqBase: (n) => [
    { q: `A hdar é grátis em ${n}?`, a: "Sim. O mapa, o chat do bairro e as mensagens privadas são grátis. O hdar+ é opcional." },
    { q: "Preciso de conta?", a: "Não. Basta um nome de utilizador e confirmar que tens 18 anos. Sem e-mail, sem palavra-passe." },
    { q: "Vê-se a minha morada exata?", a: "Não. Os outros veem uma posição arredondada a cerca de 110 metros e uma distância aproximada." },
  ],
  foot: "hdar. — saídas e encontros perto de ti, para toda a gente. Grátis, discreto, só 18+.",
  footer: { tagline: "hdar. — saídas e encontros perto de ti, para toda a gente. Grátis, discreto, só 18+.", all: "Todas as cidades", faq: "FAQ", terms: "Termos", privacy: "Privacidade", contact: "Contacto" },
  kinds: { bar: "Bar", sauna: "Sauna", club: "Clube", sexshop: "Loja", other: "Local" },
};

const en: Kit = {
  open: "Open the app",
  cta: "Open the map",
  sub: "Free · anonymous · rounded location · 18+",
  facts: ["Residents", "Area", "Age"],
  sourceLabel: "Official figures:",
  numbersTitle: "Numbers with a source (not hdar stats)",
  numbers: ({ n, pop, area, source }) =>
    `According to official statistics (${source}), ${n} has **${pop} residents**${area ? ` over **${area} km²**` : ""}. These are city figures, not hdar user numbers.`,
  discreetTitle: "Keeping it discreet",
  steps: [
    "Open hdar.chat and confirm you're 18+. No email, no password.",
    "Tap “Show me”: you appear on the map, position rounded to roughly 110 metres.",
    "Use the neighbourhood chat (about 3 km) or a private message.",
    "For a first meet, pick somewhere public and let a friend know.",
  ],
  cruisingTitle: (n) => `Cruising spots in ${n}`,
  cruisingCta: (n) => `Open the map · public spots in ${n}`,
  cruisingNote: "18+ · opt-in layer · no addresses listed on this page.",
  placesTitle: "Venues on the hdar map",
  placesIntro: "Only approved entries from the map. No made-up addresses.",
  placesEmpty: (n) => `No approved partner venues in ${n} on the hdar map yet.`,
  nearTitle: "Other cities",
  faqTitle: "FAQ",
  faqBase: (n) => [{ q: `Is hdar free in ${n}?`, a: "Yes. The map, the neighbourhood chat and private messages are free. hdar+ is optional." }],
  foot: "hdar. — outings and meetups around you, for everyone. Free, discreet, 18+ only.",
  footer: { tagline: "hdar. — outings and meetups around you, for everyone. Free, discreet, 18+ only.", all: "All cities", faq: "FAQ", terms: "Terms", privacy: "Privacy", contact: "Contact" },
  kinds: { bar: "Bar", sauna: "Sauna", club: "Club", sexshop: "Shop", other: "Venue" },
};

export const KITS: Record<string, Kit> = { de, fr, nl, es, it, pt, en };
export const kitFor = (lang: string): Kit => KITS[lang] ?? fr;
