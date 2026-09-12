import { describe, expect, it } from "vitest";
import {
  bloqueioEmVigor,
  diaIsoNaArena,
  minutosDoDia,
  validarBloqueio,
  type Bloqueio,
} from "@/db/queries/painel-regras";

// O horário bloqueado (escolinha) — item 7 do checklist legal de
// `docs/decisoes.md` §5.
//
// ─── POR QUE ISTO PRECISA DE TESTE DE MESA ─────────────────────────────────
//
// A regra decide se a gravação de um LANCE é recusada, e conferi-la abrindo a
// tela exige esperar a terça de manhã. Os três jeitos de errar são todos
// silenciosos: usar o fuso da máquina (a função da Vercel roda em UTC), tratar o
// fim do intervalo como fechado, e ignorar o escopo por quadra.
//
// As datas são calculadas a partir de instantes ABSOLUTOS com fuso explícito, e
// não de `new Date("2026-09-14T08:30")` — que usaria o relógio de quem roda o
// teste e passaria no Brasil e falharia no CI.

const SP = "America/Sao_Paulo";
const LISBOA = "Europe/Lisbon";

/** 2026-09-14 é uma SEGUNDA-feira. 08:30 em São Paulo = 11:30 UTC. */
const segunda0830 = new Date("2026-09-14T11:30:00Z");

function bloqueio(over: Partial<Bloqueio> = {}): Bloqueio {
  return {
    id: "b1",
    court_id: null,
    weekday: 1,
    starts_time: "08:00:00",
    ends_time: "09:00:00",
    label: "Escolinha",
    active: true,
    ...over,
  };
}

describe("minutosDoDia", () => {
  it("aceita HH:MM e HH:MM:SS, que é como o pg devolve `time`", () => {
    expect(minutosDoDia("08:00")).toBe(480);
    expect(minutosDoDia("08:00:00")).toBe(480);
    expect(minutosDoDia("23:59")).toBe(1439);
    expect(minutosDoDia("00:00")).toBe(0);
  });
});

describe("diaIsoNaArena", () => {
  it("usa o fuso da arena e não o da máquina", () => {
    // 2026-09-15T01:30Z é terça em UTC e ainda SEGUNDA em São Paulo (22:30).
    const viradaUtc = new Date("2026-09-15T01:30:00Z");
    expect(diaIsoNaArena(viradaUtc, SP)).toBe(1);
    expect(diaIsoNaArena(viradaUtc, "UTC")).toBe(2);
  });

  it("domingo é 7 e não 0 — é o ISO, o mesmo de `play_group.weekdays`", () => {
    // 2026-09-13 é domingo.
    expect(diaIsoNaArena(new Date("2026-09-13T15:00:00Z"), SP)).toBe(7);
  });

  it("a mesma arena vista de outro fuso continua respondendo pelo fuso DELA", () => {
    // Um admin em Lisboa abrindo o painel não muda o dia da quadra.
    expect(diaIsoNaArena(segunda0830, SP)).toBe(1);
    expect(diaIsoNaArena(segunda0830, LISBOA)).toBe(1);
  });
});

describe("bloqueioEmVigor", () => {
  it("bloqueia dentro da janela, no dia certo", () => {
    expect(bloqueioEmVigor([bloqueio()], "quadra-1", segunda0830, SP)?.id).toBe("b1");
  });

  it("não bloqueia no mesmo horário de outro dia", () => {
    const terca0830 = new Date("2026-09-15T11:30:00Z");
    expect(bloqueioEmVigor([bloqueio()], "quadra-1", terca0830, SP)).toBeNull();
  });

  it("o início é FECHADO e o fim é ABERTO", () => {
    const oito = new Date("2026-09-14T11:00:00Z"); // 08:00 em SP
    const nove = new Date("2026-09-14T12:00:00Z"); // 09:00 em SP
    expect(bloqueioEmVigor([bloqueio()], "q", oito, SP)).not.toBeNull();
    // Às 9h em ponto a aula acabou. Fosse fechado nos dois lados, dois bloqueios
    // colados (8–9 e 9–10) teriam um instante pertencendo aos dois.
    expect(bloqueioEmVigor([bloqueio()], "q", nove, SP)).toBeNull();
  });

  it("bloqueio da ARENA vale para qualquer quadra", () => {
    const arena = bloqueio({ court_id: null });
    expect(bloqueioEmVigor([arena], "qualquer-uma", segunda0830, SP)).not.toBeNull();
  });

  it("bloqueio de UMA quadra não vale para as outras", () => {
    const so1 = bloqueio({ court_id: "quadra-1" });
    expect(bloqueioEmVigor([so1], "quadra-1", segunda0830, SP)).not.toBeNull();
    expect(bloqueioEmVigor([so1], "quadra-2", segunda0830, SP)).toBeNull();
  });

  it("desligado não bloqueia — é o que a arena faz nas férias da escolinha", () => {
    expect(bloqueioEmVigor([bloqueio({ active: false })], "q", segunda0830, SP)).toBeNull();
  });

  it("o fuso da arena decide, e não o da máquina", () => {
    // 22:30 de segunda em São Paulo já é 01:30 de terça em UTC. Um bloqueio de
    // TERÇA de madrugada não pode pegar a pelada de segunda à noite.
    const segunda2230 = new Date("2026-09-15T01:30:00Z");
    const tercaMadrugada = bloqueio({ weekday: 2, starts_time: "01:00", ends_time: "02:00" });
    expect(bloqueioEmVigor([tercaMadrugada], "q", segunda2230, SP)).toBeNull();
  });

  it("lista vazia nunca bloqueia — é o estado de toda arena antes de configurar", () => {
    expect(bloqueioEmVigor([], "q", segunda0830, SP)).toBeNull();
  });

  it("devolve O BLOQUEIO, para que o painel consiga dizer qual foi", () => {
    const achado = bloqueioEmVigor([bloqueio({ label: "Sub-12" })], "q", segunda0830, SP);
    expect(achado?.label).toBe("Sub-12");
  });
});

describe("validarBloqueio", () => {
  it("recusa dia fora de 1–7", () => {
    expect(validarBloqueio({ weekday: 0, inicio: "08:00", fim: "09:00" })).toEqual({
      ok: false,
      motivo: "dia",
    });
    expect(validarBloqueio({ weekday: 8, inicio: "08:00", fim: "09:00" }).ok).toBe(false);
  });

  it("recusa horário mal formado", () => {
    expect(validarBloqueio({ weekday: 1, inicio: "8h", fim: "09:00" })).toEqual({
      ok: false,
      motivo: "horario",
    });
    expect(validarBloqueio({ weekday: 1, inicio: "25:00", fim: "26:00" }).ok).toBe(false);
  });

  it("recusa janela que atravessa a meia-noite", () => {
    // O `CHECK court_blackout_ordem_chk` recusaria no banco; recusar aqui é o
    // que transforma um 500 numa frase.
    expect(validarBloqueio({ weekday: 1, inicio: "22:00", fim: "02:00" })).toEqual({
      ok: false,
      motivo: "ordem",
    });
  });

  it("recusa janela igual (que não bloquearia nada)", () => {
    expect(validarBloqueio({ weekday: 1, inicio: "08:00", fim: "08:00" }).ok).toBe(false);
  });

  it("recusa acima de 12 horas", () => {
    expect(validarBloqueio({ weekday: 1, inicio: "06:00", fim: "23:00" })).toEqual({
      ok: false,
      motivo: "longo",
    });
  });

  it("aceita a janela típica de escolinha", () => {
    expect(validarBloqueio({ weekday: 3, inicio: "08:00", fim: "11:30" })).toEqual({ ok: true });
  });
});
