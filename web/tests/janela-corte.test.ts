import { describe, expect, it } from "vitest";
import { emCooldown, montarJanela, restaDoCooldown } from "@/lib/janela-corte";
import {
  COOLDOWN_QUADRA_MS,
  FOLGA_CUT_ANTES_S,
  FOLGA_CUT_DEPOIS_S,
  POST_ROLL_PADRAO_S,
  PRE_ROLL_PADRAO_S,
} from "@/lib/limites";

const T0 = new Date("2026-09-08T23:47:00.000Z");
const s = (d: Date) => d.toISOString();

describe("janela do corte", () => {
  it("desconta a latência do botão e soma a da câmera", () => {
    // t_press  = chegada − 1500 ms          → 23:46:58.500
    // deliver  = [t_press − 24 s + 3 s, t_press + 1 s + 3 s]
    //          = [23:46:37.500, 23:47:02.500]
    const j = montarJanela({
      arrivalAt: T0,
      buttonWakeLatencyMs: 1500,
      cameraOriginLagMs: 3000,
    });
    expect(s(j.pressEstimatedAt)).toBe("2026-09-08T23:46:58.500Z");
    expect(s(j.deliverFrom)).toBe("2026-09-08T23:46:37.500Z");
    expect(s(j.deliverTo)).toBe("2026-09-08T23:47:02.500Z");
  });

  it("o `origin_lag` SOMA, não subtrai", () => {
    // A linha do tempo do relay está ATRASADA em relação à cena: o quadro do
    // instante `t` chegou ao relay em `t + origin_lag`, então é ali que ele foi
    // gravado. Inverter o sinal é o erro que produz "meu lance não está no
    // vídeo" — e é invisível em teste manual com latência pequena.
    const semLag = montarJanela({ arrivalAt: T0, buttonWakeLatencyMs: 0, cameraOriginLagMs: 0 });
    const comLag = montarJanela({ arrivalAt: T0, buttonWakeLatencyMs: 0, cameraOriginLagMs: 5000 });
    expect(comLag.deliverFrom.getTime()).toBe(semLag.deliverFrom.getTime() + 5000);
    expect(comLag.deliverTo.getTime()).toBe(semLag.deliverTo.getTime() + 5000);
  });

  it("entrega 25 s por padrão", () => {
    const j = montarJanela({ arrivalAt: T0, buttonWakeLatencyMs: 0, cameraOriginLagMs: 0 });
    const duracao = (j.deliverTo.getTime() - j.deliverFrom.getTime()) / 1000;
    expect(duracao).toBe(PRE_ROLL_PADRAO_S + POST_ROLL_PADRAO_S);
    expect(duracao).toBe(25);
  });

  it("o corte bruto é 13 s mais largo que o entregue", () => {
    // De propósito (`api/README.md` §4): absorve o erro das duas medidas, o
    // alinhamento de segmento (o remux `-c copy` começa no segmento que CONTÉM
    // `from`) e a variação de `wake_latency` entre pilha nova e velha. Bytes
    // extras num arquivo temporário do relay custam zero; um lance cortado ao
    // meio custa o cliente.
    const j = montarJanela({ arrivalAt: T0, buttonWakeLatencyMs: 1500, cameraOriginLagMs: 3000 });
    expect((j.deliverFrom.getTime() - j.cutFrom.getTime()) / 1000).toBe(FOLGA_CUT_ANTES_S);
    expect((j.cutTo.getTime() - j.deliverTo.getTime()) / 1000).toBe(FOLGA_CUT_DEPOIS_S);
    const bruto = (j.cutTo.getTime() - j.cutFrom.getTime()) / 1000;
    const entregue = (j.deliverTo.getTime() - j.deliverFrom.getTime()) / 1000;
    expect(bruto - entregue).toBe(13);
    expect(bruto).toBe(38);
  });

  it("respeita pre/post roll customizados (estender lance)", () => {
    const j = montarJanela({
      arrivalAt: T0,
      buttonWakeLatencyMs: 0,
      cameraOriginLagMs: 0,
      preRollSeconds: 32,
      postRollSeconds: 9,
    });
    expect((j.deliverTo.getTime() - j.deliverFrom.getTime()) / 1000).toBe(41);
  });

  it("botão virtual: sem dispositivo dormindo, wake = 0", () => {
    const j = montarJanela({ arrivalAt: T0, buttonWakeLatencyMs: 0, cameraOriginLagMs: 3000 });
    expect(j.pressEstimatedAt.getTime()).toBe(T0.getTime());
  });
});

describe("cooldown por quadra", () => {
  const agora = new Date("2026-09-08T23:47:00.000Z");

  it("quadra nunca acionada passa", () => {
    expect(emCooldown(null, agora)).toBe(false);
    expect(restaDoCooldown(null, agora)).toBe(0);
  });

  it("dentro de 8 s recusa", () => {
    const ultimo = new Date(agora.getTime() - 3000);
    expect(emCooldown(ultimo, agora)).toBe(true);
    expect(restaDoCooldown(ultimo, agora)).toBe(COOLDOWN_QUADRA_MS - 3000);
  });

  it("exatamente 8 s já passa", () => {
    const ultimo = new Date(agora.getTime() - COOLDOWN_QUADRA_MS);
    expect(emCooldown(ultimo, agora)).toBe(false);
  });

  it("depois de 8 s passa", () => {
    expect(emCooldown(new Date(agora.getTime() - 9000), agora)).toBe(false);
  });

  it("cinco apertos em três segundos viram um clipe só", () => {
    // O cooldown não é só antiabuso: é a IDEMPOTÊNCIA de quem não tem como ser
    // idempotente. Um botão que reenvia porque não recebeu o `202` cai na mesma
    // regra.
    const primeiro = new Date("2026-09-08T23:47:00.000Z");
    const apertos = [0, 600, 1200, 1900, 2800].map((ms) => new Date(primeiro.getTime() + ms));
    let aceito = 0;
    let ultimoAceito: Date | null = null;
    for (const t of apertos) {
      if (!emCooldown(ultimoAceito, t)) {
        aceito++;
        ultimoAceito = t;
      }
    }
    expect(aceito).toBe(1);
  });

  it("relógio para trás conta como cooldown ativo", () => {
    // Um salto de NTP não pode virar dois clipes: é mais seguro recusar.
    const futuro = new Date(agora.getTime() + 5000);
    expect(emCooldown(futuro, agora)).toBe(true);
  });
});
