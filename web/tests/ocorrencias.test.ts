import { describe, expect, it } from "vitest";
import {
  diaIsoDaData,
  janelaDaOcorrencia,
  proximaOcorrencia,
  somarDiasLocais,
  ultimasOcorrencias,
  type FiltroRecorrente,
} from "@/lib/ocorrencias";
import { relogioDe } from "@/lib/fuso";

// A DERIVAÇÃO DAS OCORRÊNCIAS DO GRUPO.
//
// É o cálculo que sustenta o diferencial do produto ("os vídeos já organizados
// por semana, atualizados sozinhos"). Ele não tem tabela: erra em silêncio, e o
// sintoma é uma semana faltando na página — que ninguém reporta como bug, porque
// parece que simplesmente não teve jogo.

const SP = "America/Sao_Paulo";

const FUT_SEXTA: FiltroRecorrente = {
  weekdays: [5],
  startTime: "20:00",
  endTime: "21:00",
  timezone: SP,
};

/** Um instante absoluto a partir da hora de São Paulo (hoje, `-03:00` fixo). */
function emSaoPaulo(iso: string): Date {
  return new Date(`${iso}-03:00`);
}

describe("aritmética de data local", () => {
  it("atravessa a virada de mês", () => {
    expect(somarDiasLocais("2026-09-30", 1)).toBe("2026-10-01");
    expect(somarDiasLocais("2026-10-01", -1)).toBe("2026-09-30");
    expect(somarDiasLocais("2026-08-31", -7)).toBe("2026-08-24");
  });

  it("atravessa a virada de ano e o ano bissexto", () => {
    expect(somarDiasLocais("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDiasLocais("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDiasLocais("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("lê o dia da semana ISO sem o clássico `um dia a menos`", () => {
    // `new Date('2026-09-11')` é lido como UTC e, em qualquer fuso negativo,
    // volta para o dia 10 — que é quinta. A âncora ao MEIO-DIA evita isso.
    expect(diaIsoDaData("2026-09-11")).toBe(5); // sexta
    expect(diaIsoDaData("2026-09-13")).toBe(7); // domingo
    expect(diaIsoDaData("2026-09-14")).toBe(1); // segunda
  });
});

describe("janela de uma ocorrência", () => {
  it("converte com o fuso da ARENA, não o da máquina", () => {
    // O teste roda com o `TZ` do CI (UTC). Se a conversão usasse o relógio da
    // máquina, "20:00" viraria 20:00Z — e a busca do grupo voltaria vazia sem
    // erro nenhum, que é o modo de falhar mais caro deste produto.
    const o = janelaDaOcorrencia(FUT_SEXTA, "2026-09-11");
    expect(o.inicio.toISOString()).toBe("2026-09-11T23:00:00.000Z");
    expect(o.fim.toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("aceita o `time` com segundos que o `pg` devolve", () => {
    const o = janelaDaOcorrencia(
      { ...FUT_SEXTA, startTime: "20:00:00", endTime: "21:00:00" },
      "2026-09-11",
    );
    expect(o.inicio.toISOString()).toBe("2026-09-11T23:00:00.000Z");
  });

  it("a pelada que cruza a meia-noite termina no dia seguinte", () => {
    const noturna: FiltroRecorrente = { ...FUT_SEXTA, startTime: "23:00", endTime: "00:30" };
    const o = janelaDaOcorrencia(noturna, "2026-09-30");
    expect(o.inicio.toISOString()).toBe("2026-10-01T02:00:00.000Z");
    // Virada de mês E de dia na mesma janela.
    expect(o.fim.toISOString()).toBe("2026-10-01T03:30:00.000Z");
    expect(o.fim.getTime()).toBeGreaterThan(o.inicio.getTime());
  });
});

describe("últimas ocorrências", () => {
  it("devolve as N mais recentes, da mais nova para a mais velha", () => {
    // Sábado, 12 de setembro de 2026, 10h em São Paulo.
    const agora = emSaoPaulo("2026-09-12T10:00:00");
    const o = ultimasOcorrencias(FUT_SEXTA, 4, agora);
    expect(o.map((x) => x.localDate)).toEqual([
      "2026-09-11",
      "2026-09-04",
      "2026-08-28",
      "2026-08-21",
    ]);
  });

  it("atravessa a virada de mês para trás", () => {
    const agora = emSaoPaulo("2026-10-03T10:00:00");
    const o = ultimasOcorrencias(FUT_SEXTA, 3, agora);
    expect(o.map((x) => x.localDate)).toEqual(["2026-10-02", "2026-09-25", "2026-09-18"]);
  });

  it("a pelada que já começou entra; a que ainda não começou, não", () => {
    // Sexta às 20:30: a sessão das 20h está ACONTECENDO, e é justamente onde os
    // lances estão nascendo.
    const durante = ultimasOcorrencias(FUT_SEXTA, 1, emSaoPaulo("2026-09-11T20:30:00"));
    expect(durante[0]?.localDate).toBe("2026-09-11");

    // Sexta às 19:00: ainda não começou, então a mais recente é a da semana
    // passada. Uma seção "hoje · 0 lances" antes do jogo faria o grupo parecer
    // quebrado toda sexta de manhã.
    const antes = ultimasOcorrencias(FUT_SEXTA, 1, emSaoPaulo("2026-09-11T19:00:00"));
    expect(antes[0]?.localDate).toBe("2026-09-04");
  });

  it("grupo de vários dias devolve todas as ocorrências, não uma por semana", () => {
    const tresDias: FiltroRecorrente = { ...FUT_SEXTA, weekdays: [1, 3, 5] };
    const o = ultimasOcorrencias(tresDias, 6, emSaoPaulo("2026-09-12T10:00:00"));
    expect(o.map((x) => x.localDate)).toEqual([
      "2026-09-11",
      "2026-09-09",
      "2026-09-07",
      "2026-09-04",
      "2026-09-02",
      "2026-08-31",
    ]);
  });

  it("sem dias da semana não há ocorrência (e não há laço infinito)", () => {
    expect(ultimasOcorrencias({ ...FUT_SEXTA, weekdays: [] }, 8)).toEqual([]);
  });
});

describe("próxima ocorrência", () => {
  it("é hoje quando o jogo ainda vai começar", () => {
    const p = proximaOcorrencia(FUT_SEXTA, emSaoPaulo("2026-09-11T09:00:00"));
    expect(p?.localDate).toBe("2026-09-11");
  });

  it("continua sendo hoje logo depois de o jogo começar", () => {
    // Quem está na quadra às 20:30 não pode ler "próximo jogo: semana que vem".
    const p = proximaOcorrencia(FUT_SEXTA, emSaoPaulo("2026-09-11T20:30:00"));
    expect(p?.localDate).toBe("2026-09-11");
  });

  it("vira a semana quando a tolerância passa", () => {
    const p = proximaOcorrencia(FUT_SEXTA, emSaoPaulo("2026-09-11T23:59:00"));
    expect(p?.localDate).toBe("2026-09-18");
  });

  it("atravessa a virada de mês para frente", () => {
    const p = proximaOcorrencia(FUT_SEXTA, emSaoPaulo("2026-09-26T10:00:00"));
    expect(p?.localDate).toBe("2026-10-02");
  });

  it("usa o relógio DA ARENA para saber que dia é hoje", () => {
    // 23h30 de sexta em São Paulo já é SÁBADO em UTC. Se a função olhasse o
    // relógio do servidor (a Vercel roda em UTC), ela contaria a partir de
    // sábado e a próxima sexta sairia certa por acidente — mas o mesmo erro às
    // 23h30 de QUINTA pularia a pelada de sexta inteira.
    const quintaTarde = emSaoPaulo("2026-09-10T23:30:00");
    expect(relogioDe(quintaTarde, SP).data).toBe("2026-09-10");
    expect(quintaTarde.toISOString().slice(0, 10)).toBe("2026-09-11"); // UTC já virou

    const p = proximaOcorrencia(FUT_SEXTA, quintaTarde);
    expect(p?.localDate).toBe("2026-09-11");
  });

  it("o fuso vem do GRUPO, e um fuso diferente muda o instante", () => {
    // `America/Sao_Paulo` está em `-03`; `America/Manaus`, em `-04`. As duas
    // "20:00" são instantes diferentes, e é isso que a coluna `timezone` do
    // grupo existe para preservar — congelar offset quebraria no dia em que o
    // horário de verão voltasse por decreto.
    const sp = janelaDaOcorrencia(FUT_SEXTA, "2026-09-11");
    const manaus = janelaDaOcorrencia(
      { ...FUT_SEXTA, timezone: "America/Manaus" },
      "2026-09-11",
    );
    expect(manaus.inicio.getTime() - sp.inicio.getTime()).toBe(60 * 60 * 1000);
  });
});
