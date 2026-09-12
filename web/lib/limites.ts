// Tetos e constantes de produto num lugar só — `docs/api/README.md` §6 e
// `docs/modelo-de-dados.md` §5. Espalhar número mágico por rota é como o
// cooldown de um lugar deixa de bater com o cooldown do outro.

/** Rate limits: `[limite, janela em segundos]`. */
export const LIMITES = {
  /** 3 envios por e-mail a cada 15 min (o doc diz 3; o Sentinela usa 5 por
   *  causa do "Reenviar código" — aqui fica 5 pelo mesmo motivo, e o teto de IP
   *  é o que contém abuso de verdade). */
  otpStartEmail: [5, 15 * 60],
  otpStartIp: [10, 60 * 60],
  /** 5 tentativas por código. */
  otpVerifyEmail: [5, 15 * 60],
  otpVerifyIp: [30, 15 * 60],
  /** 120 buscas por usuário por hora — anti-varredura (`api/README.md` §3). */
  buscaClipes: [120, 60 * 60],
  /** 30 downloads por usuário por hora. */
  downloadClipe: [30, 60 * 60],
  /** 10 gatilhos virtuais por usuário por quadra por hora. */
  triggerVirtual: [10, 60 * 60],
  /** Botão físico: 120 por hora (o cooldown de 8 s é checagem, não contador). */
  triggerFisico: [120, 60 * 60],
  /** 120 requisições por relay por minuto — detecta relay em loop. */
  relay: [120, 60],
} as const satisfies Record<string, readonly [number, number]>;

/** Cooldown do gatilho, por QUADRA. Cinco apertos seguidos viram um clipe. */
export const COOLDOWN_QUADRA_MS = 8_000;

/** Janela máxima da busca de clipes. Controle de privacidade, não técnico. */
export const JANELA_MAX_MS = 6 * 60 * 60 * 1000;

/** `to` não pode ser mais antigo que isto. */
export const JANELA_MAX_IDADE_DIAS = 400;

/** Paginação por keyset — `api/README.md` §2. */
export const PAGINA_PADRAO = 24;
export const PAGINA_MAX = 60;

// ───────────────────────────────────── janela do corte (§4 do api/README)

/** Trecho ENTREGUE: `[t_press − 24 s, t_press + 1 s]` = 25 s. */
export const PRE_ROLL_PADRAO_S = 24;
export const POST_ROLL_PADRAO_S = 1;

/**
 * Folga do corte BRUTO sobre o entregue: 8 s antes, 5 s depois = 13 s a mais.
 *
 * De propósito. Absorve o erro das duas medidas de latência, o alinhamento de
 * segmento (o remux `-c copy` começa no segmento que CONTÉM `from`) e a variação
 * de `wake_latency` entre pilha nova e pilha velha. Bytes extras num arquivo
 * temporário do relay custam zero; um lance cortado ao meio custa o cliente.
 */
export const FOLGA_CUT_ANTES_S = 8;
export const FOLGA_CUT_DEPOIS_S = 5;

/** Lease do `clip_job`: reivindicado e não confirmado nisso volta a `pending`. */
export const LEASE_SEGUNDOS = 120;

/** `clip_job.expires_at = created_at + 30 min`. Só para não acumular lixo. */
export const JOB_TTL_MINUTOS = 30;

/** Máximo de jobs por chamada de reivindicação. */
export const CLAIM_MAX = 20;
export const CLAIM_PADRAO = 5;

/** `attempt` limita a 5 tentativas antes de `failed`. */
export const TENTATIVAS_MAX = 5;

/**
 * Bitrate do clipe entregue: **4000 kbps**.
 *
 * ─── A DIVERGÊNCIA, E POR QUE ELA FOI RESOLVIDA ASSIM ──────────────────────
 *
 * O `openapi.yaml` declarava `encodeProfile.bitrateKbps` com padrão 6000; a ADR
 * §5, `hardware/spec-captura.md` §4.4 e a volumetria (`modelo-de-dados.md` §8,
 * "4 Mbps × 25 s ÷ 8 = ~12,5 MB por clipe") dizem 4 Mbps. Três fontes contra uma,
 * e a que ficava sozinha era a que ninguém tinha usado para fazer conta.
 *
 * O número não é estético: ele multiplica o armazenamento residente, o upload
 * relay → storage e o EGRESS para o atleta — e egress é a linha que paga
 * CloudFront. A 6000, os ~235 GB residentes por arena virariam ~350 GB e os
 * 375 GB/mês de egress virariam ~560 GB.
 *
 * O relay usa o valor QUE VEM NO JOB quando ele vem, e 4000 quando não vem —
 * então este número é o que vale na prática.
 */
export const ENCODE_BITRATE_KBPS = 4000;

/** Teto instantâneo, ~12% acima do alvo: absorve o pico de um lance com muita
 *  movimentação sem estourar o tamanho do arquivo. */
export const ENCODE_MAXRATE_KBPS = 4500;

// ─────────────────────────────────────────────────────── retenção

/**
 * Retenção de clipe: **90 dias** — decidido (`decisoes.md` P-01 / G-03).
 *
 * A página do grupo precisa de histórico e a Política de Privacidade já foi
 * escrita com 90. Publicar um prazo que o sistema não cumpre viola a LGPD, e
 * essa era a razão do conflito entre os docs.
 */
export const CLIP_RETENTION_DIAS_PADRAO = 90;

/** Sessão completa no disco do relay: 7 dias no piloto. */
export const SESSION_RETENTION_DIAS_PADRAO = 7;

/** Clipe compartilhado ou baixado vira `pinned` e ganha mais 180 dias. */
export const PIN_EXTENSAO_DIAS = 180;

/** Recorte bruto no relay: 48 h. Depois disso, "estender" recorta da sessão. */
export const RETAIN_SOURCE_HORAS = 48;

// ──────────────────────────────────────────────── URLs assinadas

/** Reprodução: 6 h. Download: 15 min. Upload do relay: 60 min. */
export const URL_PLAY_SEGUNDOS = 6 * 60 * 60;
export const URL_DOWNLOAD_SEGUNDOS = 15 * 60;
export const URL_UPLOAD_SEGUNDOS = 60 * 60;
