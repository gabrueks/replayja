import { describe, expect, it } from "vitest";
import {
  dataCompletaNaArena,
  dataCurta,
  dataCurtaNaArena,
  dataHoraNaArena,
  dataLonga,
  dataMedia,
  diaComPreposicao,
  diaCurto,
  diaEMes,
  diaIsoDaData,
  diaLongo,
  diaRelativoLongo,
  diaRelativoNaArena,
  diasComPreposicao,
  diasCurtos,
  diasLongos,
  faixaDeHorario,
  hhmm,
  horaHumana,
  DIAS_CURTOS,
  DIAS_LONGOS,
  MESES_CURTOS,
  MESES_LONGOS,
} from "@/lib/datas";

const SP = "America/Sao_Paulo";

// O achado P2-31: onze cópias de tabela de dia da semana, em DUAS convenções de
// índice incompatíveis, as duas chamadas `DIAS`. Um copy-paste entre elas erra o
// dia em silêncio. Estes testes prendem a convenção ESCOLHIDA.

describe("a convenção de índice", () => {
  it("é ISO-8601 em todas as tabelas: 1 = segunda, 7 = domingo", () => {
    expect(DIAS_CURTOS[1]).toBe("seg");
    expect(DIAS_CURTOS[7]).toBe("dom");
    expect(DIAS_LONGOS[1]).toBe("segunda");
    expect(DIAS_LONGOS[7]).toBe("domingo");
  });

  it("o índice 0 é vazio, e isso é o que faz um `weekdays` torto sumir do texto", () => {
    // A alternativa — `DIAS[0] = "domingo"` — transformaria um zero por engano
    // num domingo plausível, que é o erro que não dá para ver na revisão.
    expect(DIAS_CURTOS[0]).toBe("");
    expect(DIAS_LONGOS[0]).toBe("");
    expect(MESES_CURTOS[0]).toBe("");
    expect(MESES_LONGOS[0]).toBe("");
  });

  it("mês é 1-indexado como o humano lê, e não 0 como o `Date`", () => {
    expect(MESES_CURTOS[9]).toBe("set");
    expect(MESES_LONGOS[9]).toBe("setembro");
    expect(MESES_CURTOS[12]).toBe("dez");
  });

  it("fora da faixa devolve string vazia, nunca `undefined`", () => {
    expect(diaCurto(0)).toBe("");
    expect(diaCurto(9)).toBe("");
    expect(diaLongo(-1)).toBe("");
  });
});

describe("diaIsoDaData", () => {
  it("13 de setembro de 2026 é um domingo (7)", () => {
    expect(diaIsoDaData("2026-09-13")).toBe(7);
  });

  it("domingo é 7 e nunca 0", () => {
    expect(diaIsoDaData("2026-09-12")).toBe(6); // sábado
    expect(diaIsoDaData("2026-09-13")).toBe(7); // domingo
    expect(diaIsoDaData("2026-09-14")).toBe(1); // segunda
  });

  it("NÃO sofre o clássico 'um dia a menos'", () => {
    // `new Date("2026-09-13")` é meia-noite UTC e volta para o dia 12 em
    // qualquer fuso negativo. A conta aqui é feita em UTC dos dois lados.
    const antes = process.env.TZ;
    try {
      process.env.TZ = "America/Sao_Paulo";
      expect(diaIsoDaData("2026-09-13")).toBe(7);
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      expect(diaIsoDaData("2026-09-13")).toBe(7);
    } finally {
      process.env.TZ = antes;
    }
  });

  it("devolve nulo para lixo, em vez de um dia plausível", () => {
    expect(diaIsoDaData("13/09/2026")).toBeNull();
    expect(diaIsoDaData("")).toBeNull();
    expect(diaIsoDaData("2026-13-01")).toBeNull();
  });
});

describe("os quatro formatos viraram quatro funções nomeadas", () => {
  it("diaEMes é o que o campo de data mostra — sempre pt-BR", () => {
    // É a resposta ao P0-3: o navegador pode renderizar `09/13/2026`, mas o que
    // a pessoa confere é esta linha.
    expect(diaEMes("2026-09-13")).toBe("13 de set");
    expect(diaEMes("2026-01-01")).toBe("1 de jan");
  });

  it("dataCurta é a linha de contexto de um card", () => {
    expect(dataCurta("2026-09-12")).toBe("Sáb, 12 set");
    expect(dataCurta("2026-09-13")).toBe("Dom, 13 set");
  });

  it("dataMedia é o cabeçalho de rodada", () => {
    expect(dataMedia("2026-09-14")).toBe("Segunda, 14 set");
  });

  it("dataLonga é título de tela", () => {
    expect(dataLonga("2026-09-13")).toBe("Domingo, 13 de setembro");
  });

  it("data inválida volta como veio, e não como 'NaN de undefined'", () => {
    expect(dataCurta("amanhã")).toBe("amanhã");
    expect(dataLonga("")).toBe("");
  });
});

describe("hora", () => {
  it("hhmm corta os segundos do `time` do Postgres", () => {
    expect(hhmm("20:00:00")).toBe("20:00");
    expect(hhmm("20:00")).toBe("20:00");
  });

  it("hhmm conserta o que um `.slice(0, 5)` estragaria", () => {
    // `"8:00".slice(0, 5)` devolve `"8:00"`, que desalinha a coluna tabular.
    expect(hhmm("8:00")).toBe("08:00");
  });

  it("horaHumana é como se fala", () => {
    expect(horaHumana("20:00")).toBe("20h");
    expect(horaHumana("21:30")).toBe("21h30");
    expect(horaHumana("20:00:00")).toBe("20h");
  });

  it("faixaDeHorario usa travessão de intervalo, nos dois modos", () => {
    expect(faixaDeHorario("20:00:00", "21:00:00")).toBe("20:00–21:00");
    expect(faixaDeHorario("20:00", "21:30", { humano: true })).toBe("20h–21h30");
    // En dash, e não hífen: é o sinal tipográfico de intervalo.
    expect(faixaDeHorario("20:00", "21:00")).toContain("–");
  });
});

describe("a preposição do dia (P2-39)", () => {
  it("é feminina de segunda a sexta e masculina no fim de semana", () => {
    // "Assim que alguém apertar o botão segunda entre 20:00 e 22:00" — a frase
    // em produção, sem preposição nenhuma.
    expect(diaComPreposicao(1)).toBe("na segunda");
    expect(diaComPreposicao(5)).toBe("na sexta");
    expect(diaComPreposicao(6)).toBe("no sábado");
    expect(diaComPreposicao(7)).toBe("no domingo");
  });

  it("uma lista de dias sai preposicionada inteira", () => {
    expect(diasComPreposicao([1, 6])).toBe("na segunda ou no sábado");
  });
});

describe("listas de dias", () => {
  it("curtas viram a linha do chip", () => {
    expect(diasCurtos([1, 3])).toBe("seg, qua");
    expect(diasCurtos([7])).toBe("dom");
  });

  it("longas aceitam o separador de quem chama", () => {
    expect(diasLongos([1, 3])).toBe("segunda ou quarta");
    expect(diasLongos([1, 3], ", ")).toBe("segunda, quarta");
  });

  it("um zero por engano some, em vez de virar domingo", () => {
    expect(diasCurtos([0, 1])).toBe("seg");
  });
});

describe("o que depende do fuso da arena", () => {
  // 2026-09-13T22:47Z é 19:47 de 13/09 em São Paulo — e já é 14/09 em UTC+2.
  const instante = new Date("2026-09-13T22:47:00Z");

  it("dataHoraNaArena lê o relógio da ARENA, e é a correção do P1-10", () => {
    // A tela de editar grupo mostrava "13 de set., 10:45" com o relógio da arena
    // em 07:45: `Intl.DateTimeFormat("pt-BR")` sem `timeZone`, em Server
    // Component, roda em UTC na Vercel.
    expect(dataHoraNaArena(instante, SP)).toBe("13 de set, 19:47");
    expect(dataHoraNaArena(instante, "UTC")).toBe("13 de set, 22:47");
  });

  it("dataCurtaNaArena e dataCompletaNaArena saem do mesmo relógio", () => {
    expect(dataCurtaNaArena(instante, SP)).toBe("13 de set");
    expect(dataCompletaNaArena(instante, SP)).toBe("Dom, 13 set · 19:47");
  });

  it("a data do fuso vence a data da máquina na virada do dia", () => {
    // 03:00Z do dia 14 ainda é meia-noite do dia 14 em São Paulo — mas
    // 02:59:59Z é dia 13 às 23:59:59.
    const quaseMeiaNoite = new Date("2026-09-14T02:59:00Z");
    expect(dataHoraNaArena(quaseMeiaNoite, SP)).toBe("13 de set, 23:59");
  });
});

describe("diaRelativoNaArena", () => {
  const agora = new Date("2026-09-13T22:47:00Z"); // 19:47 de 13/09 em SP

  it("hoje e ontem são comparados por DATA LOCAL, não por instante", () => {
    expect(diaRelativoNaArena(new Date("2026-09-13T15:00:00Z"), SP, agora)).toBe("Hoje");
    expect(diaRelativoNaArena(new Date("2026-09-12T23:00:00Z"), SP, agora)).toBe("Ontem");
  });

  it("mais longe vira 'seg, 8 set'", () => {
    expect(diaRelativoNaArena(new Date("2026-09-08T23:00:00Z"), SP, agora)).toBe("ter, 8 set");
  });

  it("diz Hoje mesmo quando em UTC já é amanhã", () => {
    // Veio de `tests/fuso.test.ts` junto com a função. 2026-09-13 02:00Z é
    // 23:00 do dia 12 em São Paulo — e a referência é 20:30 do dia 12.
    const noiteDoDia12 = new Date("2026-09-12T23:30:00Z");
    expect(diaRelativoNaArena(new Date("2026-09-13T02:00:00Z"), SP, noiteDoDia12)).toBe("Hoje");
    expect(diaRelativoNaArena(new Date("2026-09-11T23:00:00Z"), SP, noiteDoDia12)).toBe("Ontem");
  });

  it("um clipe das 21h de hoje NÃO vira 'ontem' por causa do UTC", () => {
    // 2026-09-13T00:30Z é 21:30 do dia 12 em São Paulo — ontem, e não hoje.
    expect(diaRelativoNaArena(new Date("2026-09-13T00:30:00Z"), SP, agora)).toBe("Ontem");
  });
});

describe("diaRelativoLongo", () => {
  const agora = new Date("2026-09-13T22:47:00Z"); // domingo 13/09, 19:47 em SP

  it("hoje, amanhã, e depois o nome do dia", () => {
    expect(diaRelativoLongo("2026-09-13", SP, agora)).toBe("hoje");
    expect(diaRelativoLongo("2026-09-14", SP, agora)).toBe("amanhã");
    expect(diaRelativoLongo("2026-09-18", SP, agora)).toBe("sexta");
  });
});
