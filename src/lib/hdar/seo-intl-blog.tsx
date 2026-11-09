import type { ReactNode } from "react";

export type NativeBlog = {
  title: string;
  desc: string;
  h1: ReactNode;
  lead: string;
  cta: string;
  sub: string;
  facts: [string, string, string];
  sourceLabel: string;
  body: ReactNode;
  /** « Lieux de drague » equivalent → live map, public-places layer (no addresses). */
  cruisingTitle?: string;
  cruisingText?: string;
  cruisingCta?: string;
  cruisingNote?: string;
  placesTitle: string;
  placesIntro: string;
  placesEmpty?: string;
  nearTitle: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
  foot: string;
};

/** Berlin — einzigartiger DE-Text, anzüglich ohne Nacktheit, keine erfundenen Nutzerzahlen. */
export const BERLIN_DE: NativeBlog = {
  title: "Berlin: Chat & Treffen in deiner Nähe — hdar.",
  desc: "Chat und Treffen in Berlin, in deiner Nähe. Kostenlos, anonym, ab 18. Live-Karte um Schöneberg, Kreuzberg, Prenzlauer Berg.",
  h1: <>Treffen & Nächte in <span className="text-[#FA6F6C]">Berlin</span></>,
  lead:
    "Berlin bleibt spät wach. Zwischen Nollendorfplatz, Kreuzberg und dem Prenzlauer Berg reicht oft ein Blick auf die Karte: wer gerade sichtbar ist, wohin es zieht — ohne Profilkatalog aus ganz Deutschland.",
  cta: "Karte öffnen",
  sub: "Kostenlos · anonym · Standort gerundet · ab 18",
  facts: ["Einwohner", "Fläche", "Alter"],
  sourceLabel: "Offizielle Zahlen:",
  body: (
    <>
      <h2 className="mt-10 font-display text-xl font-bold">Eine Stadt, viele Nachtschichten</h2>
      <p className="mt-3 text-sm leading-relaxed">
        Berlin ist groß — und trotzdem lokal. Am <strong>Nollendorfplatz</strong> und entlang der Motzstraße liegt seit Jahrzehnten ein dichter
        Kiez mit Bars, die bis in den Morgen gehen. In <strong>Kreuzberg</strong> und am Kottbusser Tor mischen sich Clubs, Spätis und Gespräche
        auf der Straße. <strong>Prenzlauer Berg</strong> und der Kollwitzplatz sind ruhiger, aber abends genauso gut für ein erstes Treffen
        draußen. hdar zeigt dich nur, wenn du es willst: eine Stunde, drei Stunden oder die ganze Nacht — Position auf etwa 110 Meter gerundet.
      </p>
      <p className="mt-3 text-sm leading-relaxed">
        Die Stimmung bleibt andeutungsvoll: ein Blick, ein Chat im Viertel, vielleicht ein Drink später. Keine Galerie mit Nacktfotos auf der
        öffentlichen Seite, kein Zählen von „wer gerade online ist“ als Marketingzahl. Was du auf der Karte siehst, ist live — und verschwindet,
        wenn du dich ausblendest.
      </p>

      <h2 className="mt-10 font-display text-xl font-bold">Kieze, die man kennt</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        <li><strong>Schöneberg</strong> — Nollendorfkiez, Motzstraße: klassisches Ausgehviertel, viele Bars auf engem Raum.</li>
        <li><strong>Kreuzberg / Neukölln</strong> — Oranienstraße, Weserstraße: später, lauter, oft spontan.</li>
        <li><strong>Mitte / Friedrichshain</strong> — zwischen Alex und Warschauer Straße: Touristenstrom und trotzdem Ecken zum Untertauchen.</li>
        <li><strong>Prenzlauer Berg</strong> — eher Café und Spaziergang, gut für ein erstes Treffen bei Licht.</li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-bold">Zahlen mit Quelle (keine hdar-Statistik)</h2>
      <p className="mt-3 text-sm leading-relaxed">
        Zum Stichtag 31.12.2024 meldet die amtliche Statistik <strong>3.685.265 Einwohner</strong> und eine Fläche von{" "}
        <strong>891,12 km²</strong> (Destatis / Amt für Statistik Berlin-Brandenburg, Fortschreibung auf Basis Zensus 2022). Das sind
        Stadtzahlen — keine Nutzerzahlen von hdar. Wir erfinden keine „X Leute gerade online in Berlin“.
      </p>

      <h2 className="mt-10 font-display text-xl font-bold">So bleibt es diskret</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>hdar.chat öffnen, 18+ bestätigen — ohne E-Mail.</li>
        <li>„Mich zeigen“ tippen: du erscheinst auf der Karte, Standort gerundet.</li>
        <li>Viertel-Chat (ca. 3 km) oder private Nachricht — Foto, Sprachnachricht, Video nur wenn du willst.</li>
        <li>Erste Treffen lieber öffentlich (Café, Bar), jemanden Bescheid geben.</li>
      </ol>
    </>
  ),
  cruisingTitle: "Cruising-Orte in Berlin",
  cruisingText:
    "Parks und andere öffentliche Orte, die die Community meldet, liegen auf der Kartenebene „Andere öffentliche Orte“. Sie ist standardmäßig aus — schalte sie ein, wenn du sehen willst, was es in Berlin gibt. Keine Adressen hier, nur die Live-Karte, ab 18, mit Diskretion und Rücksicht auf andere.",
  cruisingCta: "Karte öffnen · öffentliche Orte in Berlin",
  cruisingNote: "18+ · Ebene nur auf Wunsch · keine Adressen auf dieser Seite.",
  placesTitle: "Orte auf der hdar-Karte",
  placesIntro: "Nur freigeschaltete Einträge aus der Karte (approved). Keine erfundenen Adressen.",
  placesEmpty:
    "Partner-Bars, Saunen und Clubs für Berlin sind in der Datenbank noch in Prüfung (Prospection EU, Status pending) und erscheinen deshalb hier nicht als sichtbare Partner. Öffentliche, freigeschaltete Orte (Parks, ausgewiesene FKK-Stellen u. a.) bleiben auf der Live-Karte sichtbar, sobald du die Schicht aktivierst — ohne Nutzerzahlen dazu.",
  nearTitle: "Andere Städte in Deutschland",
  faqTitle: "Häufige Fragen",
  faq: [
    { q: "Ist hdar in Berlin kostenlos?", a: "Ja. Karte, Viertel-Chat und private Nachrichten sind kostenlos. hdar+ ist optional." },
    { q: "Brauche ich ein Konto?", a: "Nein. Spitzname und 18+-Bestätigung reichen. Keine E-Mail, kein Passwort." },
    { q: "Sieht man meine genaue Adresse?", a: "Nein. Andere sehen eine auf etwa 110 Meter gerundete Position und eine ungefähre Entfernung." },
    { q: "Ist hdar nur für Schwule?", a: "Nein. Offen für alle Orientierungen, LGBT-freundlich, ab 18." },
  ],
  foot: "hdar. — Ausgehen und Treffen in deiner Nähe, für alle. Kostenlos, diskret, nur ab 18.",
};
