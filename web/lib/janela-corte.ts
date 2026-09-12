import {
  COOLDOWN_QUADRA_MS,
  FOLGA_CUT_ANTES_S,
  FOLGA_CUT_DEPOIS_S,
  POST_ROLL_PADRAO_S,
  PRE_ROLL_PADRAO_S,
} from "./limites";

// A janela do corte — `docs/api/README.md` §4 e `modelo-de-dados.md` §4.1.
//
// ─── TRÊS INSTANTES QUE NINGUÉM DEVE CONFUNDIR ─────────────────────────────
//
//   t_cena     quando o lance aconteceu de verdade
//   t_chegada  quando o POST do botão chegou ao NOSSO servidor (`arrival_at`,
//              `clock_timestamp()`) — é a única fonte de tempo confiável, porque
//              nem o botão nem a câmera têm relógio
//   posição no índice do relay, onde aquele quadro foi gravado
//
// E duas latências que os separam, ambas medidas na instalação:
//
//   button.wake_latency_ms  (1500 padrão) botão sai do sono profundo, associa no
//                           Wi-Fi, resolve DNS, faz TLS. A maior e a mais variável
//   camera.origin_lag_ms    (3000 padrão) encoder da câmera + rede da arena +
//                           buffer do ffmpeg no relay
//
// O relay NÃO descobre `origin_lag` sozinho: o `PROGRAM-DATE-TIME` que ele
// publica é hora de CHEGADA, não hora da cena. No Sentinela essa perna chegou a
// ~12 s e ficou invisível a qualquer conta feita contra o próprio relay — a
// prova aritmética foi uma amostra dar latência NEGATIVA de −0,13 s.

export type EntradaJanela = {
  /** `trigger_event.arrival_at` — o carimbo do nosso servidor. */
  arrivalAt: Date;
  /** `button.wake_latency_ms`. Zero para o botão virtual (não há dispositivo). */
  buttonWakeLatencyMs: number;
  /** `camera.origin_lag_ms`. */
  cameraOriginLagMs: number;
  /** Segundos antes do aperto que entram no clipe entregue. */
  preRollSeconds?: number;
  /** Segundos depois do aperto. */
  postRollSeconds?: number;
};

export type Janela = {
  /** `arrival_at − wake_latency`. É o instante usado para montar a janela. */
  pressEstimatedAt: Date;
  /** Trecho entregue ao atleta (25 s por padrão). */
  deliverFrom: Date;
  deliverTo: Date;
  /** Janela bruta a remuxar com `-c copy` — 13 s mais larga, de propósito. */
  cutFrom: Date;
  cutTo: Date;
};

/**
 * Monta a janela do corte.
 *
 *   t_press = arrival_at − wake_latency
 *   deliver = [ t_press − 24 s + origin_lag , t_press + 1 s + origin_lag ]
 *   cut     = [ deliver.from − 8 s , deliver.to + 5 s ]
 *
 * O `origin_lag` SOMA (não subtrai) porque a linha do tempo do relay está
 * ATRASADA em relação à cena: o quadro do instante `t` chegou ao relay em
 * `t + origin_lag`, então é ali que ele foi gravado.
 */
export function montarJanela(e: EntradaJanela): Janela {
  const pre = e.preRollSeconds ?? PRE_ROLL_PADRAO_S;
  const post = e.postRollSeconds ?? POST_ROLL_PADRAO_S;

  const pressMs = e.arrivalAt.getTime() - e.buttonWakeLatencyMs;
  const baseMs = pressMs + e.cameraOriginLagMs;

  const deliverFromMs = baseMs - pre * 1000;
  const deliverToMs = baseMs + post * 1000;

  return {
    pressEstimatedAt: new Date(pressMs),
    deliverFrom: new Date(deliverFromMs),
    deliverTo: new Date(deliverToMs),
    cutFrom: new Date(deliverFromMs - FOLGA_CUT_ANTES_S * 1000),
    cutTo: new Date(deliverToMs + FOLGA_CUT_DEPOIS_S * 1000),
  };
}

/**
 * O gatilho caiu no cooldown da quadra?
 *
 * O cooldown não é só antiabuso: é a idempotência de quem não tem como ser
 * idempotente. Cinco apertos em três segundos viram um clipe — e um botão que
 * reenvia porque não recebeu o `202` cai na mesma regra.
 *
 * `ultimoGatilhoAt` é `null` quando a quadra nunca foi acionada: passa.
 */
export function emCooldown(
  ultimoGatilhoAt: Date | null,
  agora: Date = new Date(),
  janelaMs: number = COOLDOWN_QUADRA_MS,
): boolean {
  if (!ultimoGatilhoAt) return false;
  const delta = agora.getTime() - ultimoGatilhoAt.getTime();
  // Relógio para trás (gatilho "no futuro") conta como cooldown ativo: é mais
  // seguro recusar do que criar dois clipes por um salto de NTP.
  if (delta < 0) return true;
  return delta < janelaMs;
}

/** Quantos milissegundos ainda faltam do cooldown. Zero quando já liberou. */
export function restaDoCooldown(
  ultimoGatilhoAt: Date | null,
  agora: Date = new Date(),
  janelaMs: number = COOLDOWN_QUADRA_MS,
): number {
  if (!emCooldown(ultimoGatilhoAt, agora, janelaMs)) return 0;
  const passado = agora.getTime() - ultimoGatilhoAt!.getTime();
  return Math.max(0, janelaMs - Math.max(0, passado));
}
