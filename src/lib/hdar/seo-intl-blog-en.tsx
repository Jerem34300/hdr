import type { NativeBlog } from "@/lib/hdar/seo-intl-blog";

/**
 * UK & Ireland — native English city pages. Each text is written for its city (no template swap).
 * Cheeky but never explicit, no invented hdar user counts, official figures only (ONS / CSO).
 */

const H2 = "mt-10 font-display text-xl font-bold";
const P = "mt-3 text-sm leading-relaxed";

const STEPS = (
  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
    <li>Open hdar.chat and confirm you&apos;re 18+. No email, no password.</li>
    <li>Tap &ldquo;Show me&rdquo;: you appear on the map, position rounded to roughly 110 metres.</li>
    <li>Use the neighbourhood chat (about 3 km around you) or a private message. Photos, voice notes and video only if you want.</li>
    <li>For a first meet, pick somewhere public — a bar, a café — and let a friend know where you are.</li>
  </ol>
);

const FAQ_BASE = (city: string) => [
  { q: `Is hdar free in ${city}?`, a: "Yes. The map, the neighbourhood chat and private messages are free. hdar+ is optional." },
  { q: "Do I need an account?", a: "No. A nickname and an 18+ confirmation are enough. No email, no password." },
  { q: "Can people see my exact address?", a: "No. Others see a position rounded to about 110 metres and an approximate distance — never your door." },
];

export const LONDON_EN: NativeBlog = {
  title: "Chat & plans in London, around you — hdar.",
  desc: "Chat, plans and meetups in London, around you. Free, anonymous, 18+. Live map from Soho to Vauxhall and Shoreditch.",
  h1: <>Chat, plans &amp; late nights in <span className="text-[#FA6F6C]">London</span></>,
  lead:
    "London is huge, but your evening isn't. Whether you're finishing a drink in Soho or heading south to Vauxhall, a quick look at the map shows who's around right now — not a catalogue of profiles from the other side of the M25.",
  cta: "Open the map",
  sub: "Free · anonymous · rounded location · 18+",
  facts: ["Residents", "Area", "Age"],
  sourceLabel: "Official figures:",
  body: (
    <>
      <h2 className={H2}>A city of a hundred villages</h2>
      <p className={P}>
        Londoners don&apos;t really live in &ldquo;London&rdquo; — they live in their bit of it. <strong>Soho</strong>, around Old Compton Street,
        is still where a lot of nights start: small bars, people spilling onto the pavement, a wink across the street.{" "}
        <strong>Vauxhall</strong> keeps the late crowd south of the river. <strong>Shoreditch</strong> and <strong>Dalston</strong> are louder,
        younger and more spontaneous. hdar works the same way: it shows what&apos;s happening near you, not across 32 boroughs.
      </p>
      <p className={P}>
        You decide when you&apos;re visible — one hour, three hours or the whole night — and you vanish from the map the moment you hide.
        No nude gallery on the public pages, no &ldquo;thousands online now&rdquo; headline. Just a glance, a message, maybe a pint later.
      </p>

      <h2 className={H2}>Plans in London, area by area</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        <li><strong>Soho &amp; the West End</strong> — compact, busy, perfect for a first drink before deciding where the night goes.</li>
        <li><strong>Vauxhall &amp; Kennington</strong> — later hours, club nights, the after-party side of town.</li>
        <li><strong>Shoreditch, Hackney &amp; Dalston</strong> — warehouse venues, pubs and plenty of last-minute plans.</li>
        <li><strong>Clapham &amp; Brixton</strong> — neighbourhood pubs, good for meeting someone who actually lives nearby.</li>
      </ul>

      <h2 className={H2}>Numbers with a source (not hdar stats)</h2>
      <p className={P}>
        The Office for National Statistics estimates Greater London&apos;s population at <strong>9,122,909</strong> at mid-2025, over an area of{" "}
        <strong>1,571.96 km²</strong> (ONS mid-year estimates, table MYE5, published 29 July 2026). Those are city figures, not hdar user numbers —
        we won&apos;t invent a &ldquo;people online in London&rdquo; counter.
      </p>

      <h2 className={H2}>Keeping it discreet</h2>
      {STEPS}
    </>
  ),
  cruisingTitle: "Cruising spots in London",
  cruisingText:
    "On the hdar map, public spots — parks, heaths, places flagged by the community — sit on an optional layer called “Other public places”. Switch it on if that's your thing. We don't list addresses on this page: only the live map, for adults, with a reminder to stay discreet and respect everyone else using the space.",
  cruisingCta: "Open the map · public spots layer in London",
  cruisingNote: "18+ · opt-in layer · no addresses listed on this page.",
  placesTitle: "Venues on the hdar map",
  placesIntro: "Only approved entries from the map. No made-up addresses.",
  placesEmpty:
    "There are no approved partner venues in London on the hdar map yet, so none are listed here. Bars, saunas or clubs that want to appear can get in touch via the contact page.",
  nearTitle: "Other cities",
  faqTitle: "FAQ",
  faq: [
    ...FAQ_BASE("London"),
    { q: "Is hdar only for gay men?", a: "No. It's open to every orientation, LGBT-friendly, and strictly 18+." },
    { q: "Can I use it if I'm just visiting London?", a: "Yes. The map follows you, so it works the same in a hotel in King's Cross as in a flat in Peckham." },
  ],
  foot: "hdar. — outings and meetups around you, for everyone. Free, discreet, 18+ only.",
};

export const MANCHESTER_EN: NativeBlog = {
  title: "Manchester chat & meetups near you — hdar.",
  desc: "Chat and meetups in Manchester tonight, close by. Free, anonymous, 18+. Live map around Canal Street, the Northern Quarter and Ancoats.",
  h1: <>Manchester nights, <span className="text-[#FA6F6C]">close by</span></>,
  lead:
    "Manchester does nights out properly. From Canal Street to the Northern Quarter, everything is walkable — so the person who catches your eye on the map is probably two streets away, not two hours.",
  cta: "Open the map",
  sub: "Free · anonymous · rounded location · 18+",
  facts: ["Residents", "Area", "Age"],
  sourceLabel: "Official figures:",
  body: (
    <>
      <h2 className={H2}>Small centre, big energy</h2>
      <p className={P}>
        The <strong>Gay Village</strong> along <strong>Canal Street</strong> has been the heart of Manchester&apos;s queer nightlife for decades —
        bars facing the water, crowds that move from one door to the next. A few minutes&apos; walk away, the <strong>Northern Quarter</strong>{" "}
        mixes record shops, cocktail bars and late kitchens, while <strong>Ancoats</strong> has turned old mills into places for a slower drink.
        hdar fits that rhythm: a quick look, a message in the neighbourhood chat, and you&apos;re meeting at the corner.
      </p>
      <p className={P}>
        Nothing on show that you don&apos;t choose to share. You appear for as long as you like and disappear with one tap. The fun stays in the
        hint, the reply, the &ldquo;where are you now?&rdquo;.
      </p>

      <h2 className={H2}>Where plans start in Manchester</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        <li><strong>Canal Street &amp; the Village</strong> — the obvious starting point, busy from early evening.</li>
        <li><strong>Northern Quarter</strong> — independent bars, good for a first date that might run late.</li>
        <li><strong>Ancoats &amp; New Islington</strong> — quieter, ideal for meeting someone in daylight first.</li>
        <li><strong>Deansgate &amp; Castlefield</strong> — canals, terraces and after-work drinks.</li>
      </ul>

      <h2 className={H2}>Numbers with a source (not hdar stats)</h2>
      <p className={P}>
        According to the ONS, Manchester&apos;s local authority area had an estimated <strong>588,256</strong> residents at mid-2025, on{" "}
        <strong>115.65 km²</strong> (mid-year estimates, table MYE5, published 29 July 2026). That&apos;s the city council area, not Greater
        Manchester — and definitely not a count of hdar users.
      </p>

      <h2 className={H2}>Keeping it discreet</h2>
      {STEPS}
    </>
  ),
  cruisingTitle: "Cruising spots in Manchester",
  cruisingText:
    "Parks and other public places flagged by the community live on an optional map layer, “Other public places”. It's off by default — switch it on if you want to see them around Manchester. No addresses here, just the live map, adults only, and a nudge to be discreet and considerate.",
  cruisingCta: "Open the map · public spots layer in Manchester",
  cruisingNote: "18+ · opt-in layer · no addresses listed on this page.",
  placesTitle: "Venues on the hdar map",
  placesIntro: "Only approved entries from the map. No made-up addresses.",
  placesEmpty:
    "No approved partner venues in Manchester on the hdar map yet. Venues in the Village or elsewhere in the city can reach us through the contact page.",
  nearTitle: "Other cities",
  faqTitle: "FAQ",
  faq: [
    ...FAQ_BASE("Manchester"),
    { q: "Does it work outside the city centre?", a: "Yes — Salford, Stockport or Chorlton, the map simply shows who's visible around you." },
    { q: "Who is hdar for?", a: "Everyone over 18, whatever your orientation. LGBT-friendly by design." },
  ],
  foot: "hdar. — outings and meetups around you, for everyone. Free, discreet, 18+ only.",
};

export const BRIGHTON_EN: NativeBlog = {
  title: "Brighton chat, plans & meetups nearby — hdar.",
  desc: "Chat and plans in Brighton, near you. Free, anonymous, 18+. Live map from Kemptown to the Lanes and the seafront.",
  h1: <>Brighton, by the sea and <span className="text-[#FA6F6C]">around you</span></>,
  lead:
    "Brighton is small enough to bump into people and lively enough to want to. Between Kemptown, the Lanes and the seafront, the map shows who's out right now — and who fancies a walk along the pier.",
  cta: "Open the map",
  sub: "Free · anonymous · rounded location · 18+",
  facts: ["Residents", "Area", "Age"],
  sourceLabel: "Official figures:",
  body: (
    <>
      <h2 className={H2}>Seaside, but never sleepy</h2>
      <p className={P}>
        Brighton has a reputation, and it earns it. <strong>Kemptown</strong>, around St James&apos;s Street, is the city&apos;s best-known
        LGBT+ neighbourhood, with bars that fill up on Friday and don&apos;t really empty until Sunday. <strong>The Lanes</strong> and{" "}
        <strong>North Laine</strong> are made for wandering, and the <strong>seafront</strong> turns every summer evening into an excuse to stay
        out. In a city this compact, &ldquo;nearby&rdquo; on hdar really means nearby.
      </p>
      <p className={P}>
        You choose when you&apos;re on the map and for how long. A flirty message, a drink on the beach, a little mystery — that&apos;s the
        tone. No explicit photos on the public pages and no made-up crowd numbers.
      </p>

      <h2 className={H2}>Plans in Brighton</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        <li><strong>Kemptown</strong> — bars, cabaret and the easiest place to start an evening.</li>
        <li><strong>The Lanes &amp; North Laine</strong> — cafés and pubs, great for a first meet in daylight.</li>
        <li><strong>Seafront &amp; the beach</strong> — sunset drinks in summer, bracing walks in winter.</li>
        <li><strong>Hove</strong> — calmer, more local, still only a short walk away.</li>
      </ul>

      <h2 className={H2}>Numbers with a source (not hdar stats)</h2>
      <p className={P}>
        The ONS estimates the population of Brighton and Hove at <strong>284,170</strong> at mid-2025, on an area of{" "}
        <strong>82.82 km²</strong> (mid-year estimates, table MYE5, published 29 July 2026). These figures cover the whole Brighton and Hove
        unitary authority. They are not hdar user numbers.
      </p>

      <h2 className={H2}>Keeping it discreet</h2>
      {STEPS}
    </>
  ),
  cruisingTitle: "Cruising spots in Brighton",
  cruisingText:
    "Public places shared by the community — parks, quiet stretches, viewpoints — appear on an opt-in map layer called “Other public places”. Turn it on to see what's around Brighton. We keep addresses off this page: only the live map, for over-18s, with a reminder to be discreet and respectful of others.",
  cruisingCta: "Open the map · public spots layer in Brighton",
  cruisingNote: "18+ · opt-in layer · no addresses listed on this page.",
  placesTitle: "Venues on the hdar map",
  placesIntro: "Only approved entries from the map. No made-up addresses.",
  placesEmpty:
    "No approved partner venues in Brighton on the hdar map yet. Kemptown bars or other venues that want a spot can contact us via the contact page.",
  nearTitle: "Other cities",
  faqTitle: "FAQ",
  faq: [
    ...FAQ_BASE("Brighton"),
    { q: "Does it cover Hove too?", a: "Yes. The map isn't limited to a district — it shows who's visible around you, wherever you are." },
    { q: "Is it only for the LGBT+ crowd?", a: "No. hdar is for everyone over 18, LGBT-friendly and open to all orientations." },
  ],
  foot: "hdar. — outings and meetups around you, for everyone. Free, discreet, 18+ only.",
};

export const BIRMINGHAM_EN: NativeBlog = {
  title: "Birmingham chat & meetups around you — hdar.",
  desc: "Chat, plans and meetups in Birmingham, around you. Free, anonymous, 18+. Live map around Southside, Hurst Street and Digbeth.",
  h1: <>Meetups &amp; plans in <span className="text-[#FA6F6C]">Birmingham</span></>,
  lead:
    "Birmingham has more going on after dark than people give it credit for. From the Gay Village in Southside to Digbeth's warehouses, the map shows who's around tonight — close enough to say hello.",
  cta: "Open the map",
  sub: "Free · anonymous · rounded location · 18+",
  facts: ["Residents", "Area", "Age"],
  sourceLabel: "Official figures:",
  body: (
    <>
      <h2 className={H2}>Brum after hours</h2>
      <p className={P}>
        Birmingham&apos;s <strong>Gay Village</strong> sits in <strong>Southside</strong>, around <strong>Hurst Street</strong>, a few minutes
        from New Street station — bars, clubs and a crowd that keeps going into the small hours. Next door, <strong>Digbeth</strong> has turned
        old industrial units into club spaces and street-food yards, while the <strong>Jewellery Quarter</strong> is where you go for a quieter
        glass of something. hdar keeps it local: who&apos;s near you, right now.
      </p>
      <p className={P}>
        Your visibility is yours to set — an hour, three, or the whole night. Suggestive is fine; explicit isn&apos;t what the public pages are for.
        And we never pad things out with fake &ldquo;online now&rdquo; numbers.
      </p>

      <h2 className={H2}>Where Birmingham plans happen</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        <li><strong>Southside &amp; Hurst Street</strong> — the Village, theatres and late bars in one walkable patch.</li>
        <li><strong>Digbeth</strong> — club nights, gigs and a more spontaneous crowd.</li>
        <li><strong>Jewellery Quarter</strong> — cocktail bars and a calmer pace for a first meet.</li>
        <li><strong>Moseley &amp; Kings Heath</strong> — neighbourhood pubs south of the centre.</li>
      </ul>

      <h2 className={H2}>Numbers with a source (not hdar stats)</h2>
      <p className={P}>
        The ONS puts Birmingham&apos;s population at an estimated <strong>1,176,960</strong> at mid-2025, over <strong>267.78 km²</strong>{" "}
        (mid-year estimates, table MYE5, published 29 July 2026) — the largest local authority in England by population. City figures only,
        not hdar users.
      </p>

      <h2 className={H2}>Keeping it discreet</h2>
      {STEPS}
    </>
  ),
  cruisingTitle: "Cruising spots in Birmingham",
  cruisingText:
    "Community-flagged public places — parks and other outdoor spots — are on an optional layer of the hdar map, “Other public places”. It stays hidden unless you switch it on. No addresses on this page: just the live map, strictly 18+, and a reminder to keep it discreet and respect other people around.",
  cruisingCta: "Open the map · public spots layer in Birmingham",
  cruisingNote: "18+ · opt-in layer · no addresses listed on this page.",
  placesTitle: "Venues on the hdar map",
  placesIntro: "Only approved entries from the map. No made-up addresses.",
  placesEmpty:
    "No approved partner venues in Birmingham on the hdar map yet. Venues in Southside or elsewhere can get in touch through the contact page.",
  nearTitle: "Other cities",
  faqTitle: "FAQ",
  faq: [
    ...FAQ_BASE("Birmingham"),
    { q: "Does it work across the West Midlands?", a: "Yes. Wolverhampton, Solihull or Coventry — the map shows who's visible around you, wherever you open it." },
    { q: "Who can use hdar?", a: "Anyone over 18, of any orientation. It's LGBT-friendly and open to all." },
  ],
  foot: "hdar. — outings and meetups around you, for everyone. Free, discreet, 18+ only.",
};

export const DUBLIN_EN: NativeBlog = {
  title: "Dublin chat & plans near you — hdar.",
  desc: "Chat and plans in Dublin, close by. Free, anonymous, 18+. Live map across the city centre, George's Street, Temple Bar and Smithfield.",
  h1: <>Dublin chat &amp; plans, <span className="text-[#FA6F6C]">near you</span></>,
  lead:
    "Dublin is a city where the craic happens within a few streets of the Liffey. Open the map and you'll see who's out around George's Street, Temple Bar or Smithfield tonight — no endless scrolling through people miles away.",
  cta: "Open the map",
  sub: "Free · anonymous · rounded location · 18+",
  facts: ["Residents", "Area", "Age"],
  sourceLabel: "Official figures:",
  body: (
    <>
      <h2 className={H2}>Both sides of the Liffey</h2>
      <p className={P}>
        Most Dublin nights start somewhere in the <strong>city centre</strong>. <strong>South Great George&apos;s Street</strong> and the streets
        around it have long been a hub for LGBT+ bars, while <strong>Temple Bar</strong> pulls in visitors and live music. North of the river,{" "}
        <strong>Smithfield</strong> and <strong>Stoneybatter</strong> have a more local, laid-back feel. hdar keeps things close: who&apos;s
        visible within walking distance, not across the whole county.
      </p>
      <p className={P}>
        You set how long you stay on the map and you can disappear any time. A cheeky message, a pint, a bit of chat — that&apos;s the spirit.
        No explicit content on the public pages, and no invented user counts.
      </p>

      <h2 className={H2}>Plans in Dublin</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        <li><strong>George&apos;s Street &amp; Dame Street</strong> — bars and late venues, an easy first stop.</li>
        <li><strong>Temple Bar</strong> — lively and touristy, handy if you&apos;re visiting.</li>
        <li><strong>Smithfield &amp; Stoneybatter</strong> — pubs and cafés on the north side, more relaxed.</li>
        <li><strong>Portobello &amp; Rathmines</strong> — canal-side walks and neighbourhood spots.</li>
      </ul>

      <h2 className={H2}>Numbers with a source (not hdar stats)</h2>
      <p className={P}>
        In Census 2022, the Central Statistics Office counted <strong>592,713</strong> people in the Dublin City Council area — the most
        populous local authority on the island of Ireland (CSO, Census 2022). That&apos;s Dublin City, not County Dublin, and it has nothing to
        do with hdar user numbers.
      </p>

      <h2 className={H2}>Keeping it discreet</h2>
      {STEPS}
    </>
  ),
  cruisingTitle: "Cruising spots in Dublin",
  cruisingText:
    "Public places flagged by the community — parks and other outdoor spots — appear on an opt-in layer of the hdar map called “Other public places”. Switch it on to see what's around Dublin. No addresses here: only the live map, for adults, and a reminder to stay discreet and respect others.",
  cruisingCta: "Open the map · public spots layer in Dublin",
  cruisingNote: "18+ · opt-in layer · no addresses listed on this page.",
  placesTitle: "Venues on the hdar map",
  placesIntro: "Only approved entries from the map. No made-up addresses.",
  placesEmpty:
    "No approved partner venues in Dublin on the hdar map yet. Bars or clubs that want to be listed can contact us through the contact page.",
  nearTitle: "Other cities",
  faqTitle: "FAQ",
  faq: [
    ...FAQ_BASE("Dublin"),
    { q: "Does it work outside the city centre?", a: "Yes. Dún Laoghaire, Swords or Tallaght — the map shows who's visible around you, wherever you are." },
    { q: "Is hdar only for gay men?", a: "No. It's for everyone over 18, LGBT-friendly and open to all orientations." },
  ],
  foot: "hdar. — outings and meetups around you, for everyone. Free, discreet, 18+ only.",
};
