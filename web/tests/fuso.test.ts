import { describe, expect, it } from "vitest";
import {
  agoraNaArena,
  diaRelativoNaArena,
  duracaoFormatada,
  horaNaArena,
  instanteNaArena,
  relogioDe,
} from "@/lib/fuso";

// A conversão hora-da-arena ↔ instante é a peça que decide se a busca acha o
// lance. Na Vercel a máquina roda em UTC, e um erro de três horas aqui devolve
// "nenhum lance nesse horário" sem erro nenhum no log.

const SP = "America/Sao_Paulo";

describe("instanteNaArena", () => {
  it("20:00 em São Paulo é 23:00 UTC", () => {
    expect(instanteNaArena("2026-09-12", "20:00", SP).toISOString()).toBe(
      "2026-09-12T23:00:00.000Z",
    );
  });

  it("a virada do dia local não empurra a data", () => {
    // `hourCycle: "h23"` importa aqui: com `hour12: false` algumas versões do
    // ICU devolvem "24" à meia-noite e o dia inteiro anda para a frente.
    expect(instanteNaArena("2026-09-12", "00:00", SP).toISOString()).toBe(
      "2026-09-12T03:00:00.000Z",
    );
  });

  it("é a inversa de relogioDe", () => {
    for (const hora of ["00:00", "07:30", "12:00", "20:47", "23:59"]) {
      const d = instanteNaArena("2026-09-12", hora, SP);
      expect(relogioDe(d, SP)).toMatchObject({ data: "2026-09-12", hora });
    }
  });

  it("respeita um fuso que TEM horário de verão (a prova de que não há offset fixo)", () => {
    // Lisboa em julho está em UTC+1; em janeiro, em UTC+0. Um `-03` congelado
    // passaria nos dois testes de São Paulo e falharia aqui.
    expect(instanteNaArena("2026-07-15", "12:00", "Europe/Lisbon").toISOString()).toBe(
      "2026-07-15T11:00:00.000Z",
    );
    expect(instanteNaArena("2026-01-15", "12:00", "Europe/Lisbon").toISOString()).toBe(
      "2026-01-15T12:00:00.000Z",
    );
  });
});

describe("relógio da arena", () => {
  it("lê a hora local a partir do instante", () => {
    expect(horaNaArena(new Date("2026-09-12T23:47:00Z"), SP)).toBe("20:47");
  });

  it("o `iso` é o que o cliente lê com `new Date(...)` sem sufixo de fuso", () => {
    const r = agoraNaArena(SP, new Date("2026-09-12T23:47:05Z"));
    expect(r.iso).toBe("2026-09-12T20:47:05");
    expect(r.data).toBe("2026-09-12");
  });
});

describe("diaRelativoNaArena", () => {
  // 2026-09-12 23:30 UTC = 20:30 em São Paulo, ainda dia 12.
  const agora = new Date("2026-09-12T23:30:00Z");

  it("diz Hoje mesmo quando em UTC já é amanhã", () => {
    expect(diaRelativoNaArena(new Date("2026-09-13T02:00:00Z"), SP, agora)).toBe("Hoje");
  });

  it("diz Ontem e, antes disso, a data curta", () => {
    expect(diaRelativoNaArena(new Date("2026-09-11T23:00:00Z"), SP, agora)).toBe("Ontem");
    expect(diaRelativoNaArena(new Date("2026-09-08T23:00:00Z"), SP, agora)).toBe("ter, 8 set");
  });
});

describe("duracaoFormatada", () => {
  it("aceita o numeric que o pg devolve como string", () => {
    expect(duracaoFormatada("22.00")).toBe("0:22");
    expect(duracaoFormatada(65)).toBe("1:05");
    expect(duracaoFormatada(null)).toBe("0:00");
  });
});
