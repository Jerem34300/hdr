import type { CityText } from "./kit";

/** Português (PT) — unique text per city. Cheeky without nudity, never invent user numbers. */
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
      "Com a hdar estás visível só quando queres, pelo tempo que escolheres, e a localização é arredondada. Uma mensagem no chat do bairro, um copo de vinho do Porto. Ninguém por perto? Afasta o mapa para ver quem está com vontade noutro lado, ou muda de cidade no canto superior direito.",
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

  "sao-paulo": {
    title: "São Paulo: planos e encontros perto de você — hdar.",
    desc: "Planos e encontros em São Paulo, perto de você. Grátis, anônimo, +18. Mapa ao vivo na Augusta, na Vila Madalena, no Centro e na Paulista.",
    h1: ["Planos e encontros em ", "São Paulo"],
    lead: "São Paulo é enorme, mas a sua noite cabe em alguns bairros. Um olhar no mapa, e você vê quem está perto de você — na Augusta, na Vila Madalena ou um pouco mais para o centro. Ninguém por perto? Afaste o zoom, ou troque de cidade no alto à direita.",
    introTitle: "Uma cidade de bairros, não de distâncias infinitas",
    intro: [
      "A **Augusta**, a **Paulista** e o **Baixo Augusta** ainda concentram muita saída, a pé ou de metrô. A **Vila Madalena** e **Pinheiros** têm outro ritmo, mais de bar de bairro e de primeiro encontro. O **Centro** e a **República** mudam o ar, mais de rua, e bairros como **Moema** ou a **Zona Oeste** funcionam igual no hdar: você vê quem está perto, não quem está a uma hora de trânsito.",
      "Você aparece o tempo que quiser — uma hora, três ou a noite toda —, com a posição arredondada, e some quando decidir. Uma mensagem, um plano perto de você, para todo mundo, maiores de 18.",
    ],
    quartersTitle: "Planos em São Paulo, bairro a bairro",
    quarters: [["Augusta, Paulista e Baixo Augusta", "o ponto de partida mais óbvio, tudo perto do metrô."], ["Vila Madalena e Pinheiros", "bares de bairro, um primeiro encontro mais calmo."], ["Centro e República", "outro ar, mais de rua."], ["Moema, Zona Oeste e outros bairros", "o mapa segue você, não fica preso a um único centro."]],
    cruising: "No mapa do hdar, os lugares públicos apontados pela comunidade — parques e outros espaços ao ar livre — ficam numa camada opcional, «Outros lugares públicos». Ela permanece desligada até você ligar. Nesta página não há endereços: só o mapa ao vivo, para maiores de 18, com um lembrete de ser discreto e respeitar as outras pessoas.",
    faq: [{"q": "Funciona também na Grande São Paulo?", "a": "Sim. O mapa mostra quem está visível perto de você, esteja você no centro ou mais longe."}, {"q": "É só para homens gays?", "a": "Não. É aberto a todas as orientações, acolhedor para todo mundo, e só para maiores de 18."}],
  },
  "rio-de-janeiro": {
    title: "Rio de Janeiro: planos e encontros perto de você — hdar.",
    desc: "Planos e encontros no Rio, perto de você. Grátis, anônimo, +18. Mapa ao vivo de Copacabana a Ipanema, à Lapa e à Zona Norte.",
    h1: ["Planos e encontros no ", "Rio de Janeiro"],
    lead: "No Rio, a noite muda de bairro com o bonde e o metrô. Um olhar no mapa, e você vê quem está perto de você — em Copacabana, na Lapa ou do outro lado da cidade. Ninguém por perto? Afaste o zoom, ou troque de cidade no alto à direita.",
    introTitle: "Praia, centro, outros ritmos",
    intro: [
      "**Copacabana** e **Ipanema** são o cartão-postal e, ao mesmo tempo, um ponto de partida real: orla, bares, um primeiro encontro à vista do mar. A **Lapa** e o **Centro** puxam a noite mais longa, mais de rua. **Botafogo** e **Flamengo** ficam no meio do caminho, práticos, e a **Zona Norte** ou a **Barra** entram no mesmo mapa quando é aí que você está — o hdar não finge que todo mundo mora na orla.",
      "Você aparece o tempo que quiser, com a posição arredondada, e some com um toque. Uma mensagem, um plano perto de você, para todo mundo, +18.",
    ],
    quartersTitle: "Planos no Rio",
    quarters: [["Copacabana e Ipanema", "a orla, um primeiro encontro simples."], ["Lapa e Centro", "a noite mais longa, mais de rua."], ["Botafogo e Flamengo", "no caminho, prático para se encontrar."], ["Zona Norte, Barra e o restante", "o mapa segue onde você está, não só a Zona Sul."]],
    cruising: "Os lugares públicos apontados pela comunidade — parques, orla, outros espaços ao ar livre — ficam numa camada opcional do mapa, «Outros lugares públicos», desligada por padrão. Sem endereços nesta página: só o mapa ao vivo, para maiores de 18, com um lembrete de ser discreto e respeitar as outras pessoas.",
    faq: [{"q": "Funciona fora da Zona Sul?", "a": "Sim. O mapa mostra quem está visível perto de você, em qualquer parte da cidade."}, {"q": "É só para um público?", "a": "Não. O hdar é para todas as orientações, acolhedor para todo mundo, e só para maiores de 18."}],
  },

};
