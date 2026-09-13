import { query } from "@/lib/db";

// O EXPURGO — as consultas do job diário `purge_expired_clips` (04:00 BRT).
//
// ─── O ACHADO A-5 DA AUDITORIA DE 13/09, A METADE QUE FALTAVA ──────────────
//
// `b0567fa` consertou o que o USUÁRIO vê: um clipe vencido some da busca, do
// grupo, do contador e do download mesmo que nenhum job rode — porque a
// retenção é conferida no `WHERE`, e não num cron que pode não ter acordado.
// O que continuava faltando era tirar os BYTES: o MP4 ficava no S3 `sa-east-1`
// depois dos 90 dias, e a Política de Privacidade diz que não.
//
// Este módulo é a varredura e as duas escritas. Quem orquestra S3 e CloudFront
// é `app/api/cron/purge-clips/route.ts`, porque tocar storage não é papel de um
// módulo de consulta — a mesma divisão de `app/painel/_lib/expurgo.ts`.
//
// ─── DUAS FONTES, UM CAMINHO SÓ ────────────────────────────────────────────
//
//   retenção  `expires_at <= now() AND deleted_at IS NULL`  → `deleted_reason`
//             passa a ser `'expirado'`
//   takedown  `deleted_at IS NOT NULL AND purged_at IS NULL` → mantém o motivo
//             que o painel escreveu (`takedown <protocolo>`)
//
// A segunda fonte não é enfeite: `executarExpurgo` marca `deleted_at` ANTES de
// falar com o S3 (o relógio do SLA corre, e o vídeo precisa sair do ar em
// segundos). Se o `DeleteObjects` falhar ali, o protocolo fica `executado` e os
// bytes ficam para sempre — porque `deleted_at` já está preenchido e nada mais
// olha para aquela linha. `purged_at` é o que faz o job recolher esse caso na
// madrugada seguinte, sozinho.

export type ClipeParaExpurgoRow = {
  id: string;
  partner_id: string;
  court_id: string;
  storage_bucket: string;
  watermarked_object_key: string | null;
  source_object_key: string | null;
  thumbnail_object_key: string | null;
  preview_object_key: string | null;
  og_object_key: string | null;
  /** `expirado` (retenção) ou o motivo que o takedown já tinha escrito. */
  motivo: string;
  /** `true` quando a linha ainda não tinha `deleted_at` — o caso da retenção. */
  por_retencao: boolean;
};

/**
 * Os clipes cujos bytes precisam sair, em lote e na ordem mais antiga primeiro.
 *
 * ─── POR QUE A ORDEM É `expires_at` E NÃO `id` ─────────────────────────────
 *
 * O teto por passada existe para o job caber no `maxDuration` da Vercel. Com
 * um teto, a ordem deixa de ser detalhe: varrer do mais antigo para o mais novo
 * garante que um acúmulo (o job ficou uma semana fora do ar) seja drenado pela
 * ponta que está há mais tempo fora do prazo. A ordem inversa deixaria o clipe
 * mais velho para sempre no fim da fila.
 *
 * ─── NÃO HÁ LEASE AQUI, E NÃO PRECISA HAVER ───────────────────────────────
 *
 * Duas execuções concorrentes são um caso real na Vercel (retry de cron, deploy
 * no meio da janela), e a tentação é copiar o `FOR UPDATE SKIP LOCKED` de
 * `reivindicarJobs`. Não serviria de nada: `query()` roda uma instrução por
 * transação, então o lock morreria antes da chamada ao S3 — que é o trecho
 * longo. A idempotência vem de outro lugar, e de um mais forte: apagar uma
 * chave que já não existe é sucesso no S3, e `marcarClipesExpurgados` filtra
 * `purged_at IS NULL`. Duas passadas sobre o mesmo lote fazem trabalho
 * repetido e chegam ao mesmo estado — que é o que "idempotente" quer dizer.
 */
export async function clipesVencidosParaExpurgo(limite: number): Promise<ClipeParaExpurgoRow[]> {
  return query<ClipeParaExpurgoRow>(
    `SELECT c.id, c.partner_id, c.court_id, c.storage_bucket,
            c.watermarked_object_key, c.source_object_key, c.thumbnail_object_key,
            c.preview_object_key, c.og_object_key,
            COALESCE(NULLIF(c.deleted_reason, ''), 'expirado') AS motivo,
            (c.deleted_at IS NULL) AS por_retencao
       FROM clip c
      WHERE c.purged_at IS NULL
        AND (
          -- Fonte 1: a retenção venceu e ninguém tocou na linha.
          (c.deleted_at IS NULL AND c.expires_at <= now())
          -- Fonte 2: já sumiu da API (takedown, ou uma passada anterior que
          -- marcou e não conseguiu apagar) e os bytes continuam no bucket.
          OR c.deleted_at IS NOT NULL
        )
      ORDER BY COALESCE(c.deleted_at, c.expires_at)
      LIMIT $1`,
    [limite],
  );
}

/**
 * Fecha o expurgo de um lote: o clipe some da API E some do disco.
 *
 * ─── UMA ESCRITA SÓ, DEPOIS DO S3, E POR QUÊ ───────────────────────────────
 *
 * `fluxo-remocao.md` §7 manda apagar o OBJETO antes da LINHA no expurgo por
 * retenção: órfão de registro é recuperável (a linha diz onde o objeto estava),
 * órfão de objeto cresce para sempre sem ninguém ver. Então esta função roda
 * DEPOIS do `DeleteObjects`, e só para as chaves que o S3 confirmou.
 *
 * `status = 'expired'` e `pinned = false` acompanham porque um clipe sem bytes
 * não é `ready`, e um pino que sobrevive ao arquivo só serviria para o próximo
 * download tentar assinar uma URL para um objeto que não existe.
 *
 * `deleted_reason` só é escrito quando ainda não havia um: o takedown já
 * escreveu `takedown <protocolo>` ali e sobrescrever isso por `'expirado'`
 * apagaria a única prova de por que aquele vídeo saiu do ar.
 */
export async function marcarClipesExpurgados(
  clipIds: readonly string[],
  motivo: string,
): Promise<number> {
  if (clipIds.length === 0) return 0;
  const linhas = await query<{ id: string }>(
    `UPDATE clip
        SET purged_at      = now(),
            deleted_at     = COALESCE(deleted_at, now()),
            deleted_reason = COALESCE(NULLIF(deleted_reason, ''), $2),
            status         = 'expired'::clip_status,
            pinned         = false
      WHERE id = ANY($1::uuid[]) AND purged_at IS NULL
      RETURNING id`,
    [clipIds as string[], motivo],
  );
  return linhas.length;
}

export type TermometroDoExpurgo = {
  /** Vencidos e com bytes ainda no bucket — a fila do job. */
  pendentes: number;
  /** O mais antigo da fila. `null` quando a fila está vazia. */
  mais_antigo: Date | null;
};

/**
 * Quanto trabalho sobrou. Vai na resposta do cron e no `/api/health`.
 *
 * Sem isto, um job com teto por passada é indistinguível de um job que parou de
 * funcionar: as duas situações respondem "apaguei 500". A fila é o número que
 * diferencia, e `mais_antigo` é o que vira alerta — um clipe há três dias fora
 * do prazo e ainda no bucket é a Política de Privacidade sendo descumprida, não
 * um backlog.
 */
export async function contarClipesVencidos(): Promise<TermometroDoExpurgo> {
  const linhas = await query<{ pendentes: number; mais_antigo: Date | null }>(
    `SELECT count(*)::int AS pendentes,
            min(COALESCE(c.deleted_at, c.expires_at)) AS mais_antigo
       FROM clip c
      WHERE c.purged_at IS NULL
        AND ((c.deleted_at IS NULL AND c.expires_at <= now()) OR c.deleted_at IS NOT NULL)`,
  );
  return linhas[0] ?? { pendentes: 0, mais_antigo: null };
}
