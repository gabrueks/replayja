import type { Status } from "@/components/ui/tipos";
import type { SaudeDaCameraRow } from "@/db/queries/saude";

// Como o painel LÊ a saúde de uma câmera.
//
// ─── O BUG QUE ISTO CONSERTA ───────────────────────────────────────────────
//
// As telas do painel comparavam `camera.status === "online"`. O enum
// `camera_status` do banco NÃO TEM `online`: ele tem `provisioned`, `recording`,
// `degraded`, `down` e `disabled`. A comparação era falsa para todos os cinco,
// então TODA câmera aparecia offline — inclusive uma gravando perfeitamente. Com
// fixture na tela ninguém percebeu; com dado real, o painel diria ao parceiro
// que a arena dele está fora do ar.
//
// ─── OS QUATRO ESTADOS QUE O PARCEIRO PRECISA DISTINGUIR ───────────────────
//
//   gravando   `recording` com cobertura ≥ 0,90 — está tudo certo
//   instavel   `degraded`, ou cobertura < 0,90: grava, mas com buracos. A ação é
//              do lado DELE (uplink da arena), e é por isso que não é "offline"
//   aguardando `provisioned` e nenhum segmento recebido: a câmera foi cadastrada
//              e NUNCA conectou. É instalação incompleta, não queda — e as duas
//              pedem ações opostas (configurar vs. reiniciar)
//   offline    `down`/`disabled`, ou já conectou e parou
//
// A referência de 0,90 vem da frota do Sentinela (19–24 câmeras, set/2026):
// 0,95–0,96 é câmera saudável, ~0,92 é a mediana, e abaixo de 0,90 é problema
// real e não ruído. A janela de julgamento é SEMPRE 24 h: a de 1 h engana logo
// depois de qualquer reinício da frota.

export const COBERTURA_SAUDAVEL = 0.9;

export type EstadoDaCamera = "gravando" | "instavel" | "aguardando" | "offline";

export type LeituraDaCamera = {
  estado: EstadoDaCamera;
  /** O que o `StatusDot` recebe. */
  ponto: Status;
  rotulo: string;
  /** `0.954` ou `null` quando nenhuma amostra chegou. */
  cobertura: number | null;
  /** "há 12s", "nunca". */
  ultimoSegmento: string;
  /** O relay que grava esta câmera está falando conosco? */
  relayOnline: boolean;
};

/** Três ciclos de heartbeat de 60 s. Um perdido é rede; três, não. */
const RELAY_OFFLINE_APOS_S = 180;

export function lerSaudeDaCamera(c: SaudeDaCameraRow): LeituraDaCamera {
  const cobertura = c.coverage_24h === null ? null : Number(c.coverage_24h);
  const nuncaConectou = c.last_segment_at === null;
  const relayOnline =
    c.relay_since_seconds !== null && c.relay_since_seconds <= RELAY_OFFLINE_APOS_S;

  let estado: EstadoDaCamera;
  if (!c.enabled || c.status === "disabled") estado = "offline";
  else if (nuncaConectou) estado = "aguardando";
  else if (c.status === "down") estado = "offline";
  else if (c.status === "degraded") estado = "instavel";
  else if (c.status === "recording")
    estado = cobertura !== null && cobertura < COBERTURA_SAUDAVEL ? "instavel" : "gravando";
  // `provisioned` COM segmento é uma câmera que gravou antes de o health chegar:
  // o estado honesto é "aguardando confirmação", que cai em `instavel` — nunca
  // em "gravando", porque não temos amostra que sustente isso.
  else estado = "instavel";

  const ponto: Status =
    estado === "gravando" ? "gravando" : estado === "instavel" ? "online" : "offline";

  const rotulo =
    estado === "gravando"
      ? "gravando"
      : estado === "instavel"
        ? "instável"
        : estado === "aguardando"
          ? "aguardando relay"
          : "offline";

  return {
    estado,
    ponto,
    rotulo,
    cobertura,
    ultimoSegmento:
      c.since_seconds === null || c.since_seconds === undefined
        ? "nunca"
        : formatarIdade(c.since_seconds),
    relayOnline,
  };
}

/** "há 12s", "há 4min", "há 3h", "há 2d" — o painel é lido de relance. */
export function formatarIdade(segundos: number): string {
  if (segundos < 90) return `há ${segundos}s`;
  if (segundos < 5400) return `há ${Math.round(segundos / 60)}min`;
  if (segundos < 172_800) return `há ${Math.round(segundos / 3600)}h`;
  return `há ${Math.round(segundos / 86_400)}d`;
}

export function porcentagem(v: number | null, casas = 1): string {
  return v === null ? "—" : `${(v * 100).toFixed(casas)}%`;
}
