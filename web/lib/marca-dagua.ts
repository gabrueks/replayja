// A marca d'água que vai no `claim` — a parte PURA, sem S3 e sem banco.
//
// ─── A REGRA DE PRODUTO (decisão 9 do PLANO, D-03 de `decisoes.md`) ────────
//
//   parceiro com PNG → a marca DELE no canto configurado, em destaque,
//                      MAIS uma assinatura discreta do Replay já no canto
//                      inferior oposto (10% de largura, 60% de opacidade)
//   parceiro sem PNG → só a do Replay já, 14% de largura, `bottom-right`
//
// Quem compõe as duas camadas é o worker: a assinatura é NOSSA e os números dela
// não são configuráveis por parceiro, então mandá-los pela rede a cada job seria
// contrato a mais para manter sincronizado sem nada a ganhar. O `claim` decide
// só o que varia — qual PNG, onde, de que tamanho.
//
// ─── O PONTO QUE MERECE ESTAR ESCRITO ──────────────────────────────────────
//
// `partner.watermark_enabled = false` NÃO produz clipe limpo: produz clipe com a
// marca do Replay já. O toggle desliga a marca DO PARCEIRO, não a nossa. Isso é
// deliberado e é o que "a do Replay já como padrão" quer dizer — um clipe sem
// marca nenhuma circula no WhatsApp sem dizer de onde veio, o que é justamente o
// que o produto vende. Se um dia houver plano que compre o clipe limpo, ele vira
// um `kind` novo aqui, não um `if` escondido no relay.

/** Como o contrato do relay escreve a posição (hífen, não `_`). */
export type PosicaoDaMarca = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export type TipoDeMarca = "partner" | "default";

export type MarcaDoJob = {
  kind: TipoDeMarca;
  /** URL assinada de leitura (1 h). `null` no `default`: o PNG é local no relay. */
  url: string | null;
  sha256?: string;
  version: number;
  position: PosicaoDaMarca;
  /** Opacidade em PONTOS PERCENTUAIS (85 = 0,85). Mesma unidade de `widthPct`. */
  opacityPct: number;
  /** Largura da marca em % da largura do vídeo. */
  widthPct: number;
};

/** Validade da URL assinada da marca. Uma hora: o relay cacheia por versão e
 *  rebusca no máximo uma vez por troca de logo, então validade longa só
 *  aumentaria a janela de uma URL vazada. */
export const MARCA_URL_SEGUNDOS = 3600;

/** A marca do Replay já quando o parceiro não tem PNG (decisão 9). */
export const MARCA_PADRAO = {
  position: "bottom-right" as const,
  opacityPct: 85,
  widthPct: 14,
};

const POSICOES: Record<string, PosicaoDaMarca> = {
  bottom_right: "bottom-right",
  bottom_left: "bottom-left",
  top_right: "top-right",
  top_left: "top-left",
  "bottom-right": "bottom-right",
  "bottom-left": "bottom-left",
  "top-right": "top-right",
  "top-left": "top-left",
};

/**
 * `watermark_position` do banco (enum com `_`) → o contrato do relay (com `-`).
 *
 * Aceita as duas grafias e cai em `bottom-right` no desconhecido: uma posição
 * inválida não pode custar a marca do clipe inteiro.
 */
export function posicaoDaMarca(bruta: string | null | undefined): PosicaoDaMarca {
  return POSICOES[(bruta ?? "").trim().toLowerCase()] ?? MARCA_PADRAO.position;
}

/** Número do banco (`numeric` chega como string no `pg`) com piso, teto e
 *  padrão. Um `NaN` aqui viraria `scale=NaN:-1` no ffmpeg e reprovaria o clipe. */
function pct(bruto: unknown, padrao: number, min: number, max: number): number {
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return padrao;
  // O painel guarda opacidade como FRAÇÃO (0.85) desde a migração 0002; o
  // contrato do relay fala em pontos percentuais. Converter aqui, e não no
  // relay, mantém a unidade do contrato inequívoca.
  const emPontos = n <= 1 && max > 1 ? n * 100 : n;
  return Math.min(max, Math.max(min, Math.round(emPontos * 10) / 10));
}

export type BrandingDoJob = {
  watermark_enabled: boolean;
  watermark_object_key: string | null;
  watermark_version: number | null;
  watermark_position: string | null;
  watermark_opacity: string | number | null;
  watermark_width_pct: string | number | null;
};

/**
 * Decide a marca de um job. `url` vem de fora porque assiná-la exige rede — o
 * que esta função faz é a REGRA, e é a regra que precisa de teste.
 *
 * `url` nula com `kind: "partner"` não acontece: sem conseguir assinar, o
 * chamador pede `default`, e o relay aplica a nossa marca local em vez de
 * entregar um clipe cru.
 */
export function marcaDoJob(b: BrandingDoJob | null, url: string | null): MarcaDoJob {
  if (b && b.watermark_enabled && b.watermark_object_key && url) {
    return {
      kind: "partner",
      url,
      version: Number(b.watermark_version ?? 1) || 1,
      position: posicaoDaMarca(b.watermark_position),
      opacityPct: pct(b.watermark_opacity, 85, 20, 100),
      // 5–30 é a mesma faixa da CHECK de `partner_branding.watermark_width_pct`
      // (migração do painel). Prender aqui também é cinto e suspensório: um
      // valor fora da faixa só chegaria por escrita direta no banco, e mesmo
      // assim não pode virar um `scale=` absurdo no ffmpeg.
      widthPct: pct(b.watermark_width_pct, 18, 5, 30),
    };
  }
  return {
    kind: "default",
    url: null,
    // Versão 0 = "a marca padrão do Replay já". Não é um parceiro de versão
    // zero: é a ausência de parceiro, e o `confirm` grava esse 0 para que
    // "quais clipes reprocessar quando a arena enviar o logo" seja uma consulta.
    version: 0,
    ...MARCA_PADRAO,
  };
}
