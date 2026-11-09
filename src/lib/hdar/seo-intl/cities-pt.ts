import type { CityText } from "./kit";

/** Português (PT) — texto único por cidade. Atrevido sem nudez, sem números de utilizadores inventados. */
export const CITIES_PT: Record<string, CityText> = {
  lisboa: {
    title: "Lisboa: chat e encontros perto de ti — hdar.",
    desc: "Chat, encontros e saídas em Lisboa, perto de ti. Grátis, anónimo, 18+. Mapa em tempo real pelo Príncipe Real, Bairro Alto, Cais do Sodré e Alfama.",
    h1: ["Chat e encontros em ", "Lisboa", ", logo ali"],
    lead: "Lisboa sobe e desce colinas, mas a tua noite fica perto. Entre o Príncipe Real, o Bairro Alto e o Cais do Sodré, basta olhar para o mapa para ver quem anda por perto agora.",
    introTitle: "Sete colinas e muitas noites",
    intro: [
      "O **Príncipe Real** é há anos o coração LGBT+ de Lisboa: bares, jardins e olhares que demoram um segundo a mais. Ao lado, o **Bairro Alto** enche as ruas de gente de copo na mão, e o **Cais do Sodré**, com a sua famosa rua cor-de-rosa, leva a noite até tarde. **Alfama** é mais calma, entre miradouros e fado, e o **Intendente** junta esplanadas e um ambiente misturado.",
      "A hdar funciona como a cidade: mostra o que acontece perto de ti. Tu decides quando estás visível — uma hora, três horas ou a noite toda — com a localização arredondada. Um olhar, uma mensagem no chat do bairro e, quem sabe, uma imperial a seguir.",
    ],
    quartersTitle: "Planos em Lisboa, bairro a bairro",
    quarters: [
      ["Príncipe Real", "Bares e jardins, o clássico para começar."],
      ["Bairro Alto", "Ruas cheias e copos na rua."],
      ["Cais do Sodré", "Noite longa junto ao rio."],
      ["Alfama e Intendente", "Miradouros, esplanadas e um ritmo mais calmo."],
    ],
    cruising: "No mapa da hdar, os locais públicos assinalados pela comunidade — parques, jardins e outros espaços ao ar livre — ficam numa camada opcional chamada «Outros locais públicos». Ativa-a se quiseres ver o que há em Lisboa. Aqui não damos moradas: só o mapa em tempo real, para maiores de 18, com discrição e respeito pelos outros.",
    faq: [
      { q: "Funciona fora do centro, na Linha ou na Margem Sul?", a: "Sim. Em Cascais, Almada ou Oeiras, o mapa mostra quem está visível à tua volta." },
      { q: "A hdar é só para gays?", a: "Não. É para toda a gente com 18 anos ou mais, de qualquer orientação, LGBT-friendly." },
    ],
  },
  porto: {
    title: "Porto: chat e encontros perto de ti — hdar.",
    desc: "Chat e encontros no Porto, perto de ti. Grátis, anónimo, 18+. Mapa em tempo real pela Ribeira, Galerias de Paris, Baixa e Foz.",
    h1: ["Porto: encontros ", "à beira do Douro"],
    lead: "O Porto é acolhedor e sai à noite sem cerimónia. Da Ribeira às Galerias de Paris, o mapa mostra quem está perto agora.",
    introTitle: "Granito, rio e noites longas",
    intro: [
      "A **Ribeira**, à beira do Douro, é postal e esplanada ao mesmo tempo. Na **Baixa**, a zona das **Galerias de Paris** e das ruas à volta concentra bares e noite até tarde. **Cedofeita** e a **rua de Miguel Bombarda** são mais criativas, com galerias e cafés, e a **Foz** é o sítio para ver o pôr do sol junto ao mar.",
      "Com a hdar estás visível só quando queres, pelo tempo que escolheres, e a localização é arredondada. Uma mensagem no chat do bairro, um copo de vinho do Porto — sem nudez nas páginas públicas e sem números inventados.",
    ],
    quartersTitle: "Zonas do Porto",
    quarters: [
      ["Ribeira", "Esplanadas à beira do rio."],
      ["Galerias de Paris e Baixa", "Bares e noite até tarde."],
      ["Cedofeita e Miguel Bombarda", "Galerias, cafés e ambiente criativo."],
      ["Foz", "Mar e pôr do sol, para um encontro de dia."],
    ],
    cruising: "Os locais públicos assinalados pela comunidade — parques, jardins e zonas junto ao mar — aparecem na camada opcional «Outros locais públicos». Para o Porto não publicamos moradas: só o mapa em tempo real, 18+, com discrição e respeito.",
    faq: [
      { q: "Funciona em Gaia ou Matosinhos?", a: "Sim. O mapa mostra quem está visível à tua volta, dos dois lados do rio." },
      { q: "Para quem é a hdar?", a: "Para toda a gente com 18 anos ou mais, de qualquer orientação." },
    ],
  },
};
