import { query } from "@/lib/db";
import type { Bloqueio } from "./painel-regras";

// Privacidade: horários bloqueados e fila de pedidos de remoção.
//
// ─── AS DUAS METADES DA MESMA OBRIGAÇÃO ────────────────────────────────────
//
// O bloqueio é a metade PREVENTIVA: item 7 do checklist legal
// (`docs/decisoes.md` §5) manda mapear horário de escolinha e não gravar nele.
// Criança em quadra é o caso em que legítimo interesse não sustenta a gravação,
// e a única defesa que funciona de verdade é não existir clipe para remover.
//
// O pedido de remoção é a metade REPARADORA, e `docs/legal/fluxo-remocao.md` §7
// é explícito: um clipe existe em seis lugares e apagar só do banco é o erro
// clássico. Este módulo cuida da camada 1 (`deleted_at`) e ENTREGA as chaves de
// objeto para quem faz as outras; a orquestração está em
// `app/painel/_lib/expurgo.ts`, porque tocar S3 e CloudFront não é papel de um
// módulo de consulta.

// ───────────────────────────────────────── horários bloqueados

export type BloqueioDaArenaRow = Bloqueio & {
  /** `null` quando o bloqueio vale para a arena inteira. */
  court: string | null;
};

export async function bloqueiosDaArena(partnerId: string): Promise<BloqueioDaArenaRow[]> {
  return query<BloqueioDaArenaRow>(
    `SELECT bl.id, bl.court_id, bl.weekday, bl.starts_time::text AS starts_time,
            bl.ends_time::text AS ends_time, bl.label, bl.active,
            ct.name AS court
       FROM court_blackout bl
       LEFT JOIN court ct ON ct.id = bl.court_id
      WHERE bl.partner_id = $1
      ORDER BY bl.weekday, bl.starts_time`,
    [partnerId],
  );
}

export async function criarBloqueio(
  partnerId: string,
  d: {
    courtId: string | null;
    weekday: number;
    inicio: string;
    fim: string;
    label: string | null;
    criadoPor: string | null;
  },
): Promise<{ id: string }> {
  const linhas = await query<{ id: string }>(
    `INSERT INTO court_blackout (partner_id, court_id, weekday, starts_time, ends_time,
                                 label, created_by)
     SELECT $1, $2::uuid, $3, $4::time, $5::time, $6, $7
      WHERE $2::uuid IS NULL
         OR EXISTS (SELECT 1 FROM court ct
                     WHERE ct.id = $2::uuid AND ct.partner_id = $1 AND ct.deleted_at IS NULL)
     RETURNING id`,
    [partnerId, d.courtId, d.weekday, d.inicio, d.fim, d.label, d.criadoPor],
  );
  const linha = linhas[0];
  // Sem linha = a quadra não é desta arena. Sem RLS, o `WHERE EXISTS` acima é a
  // barreira, e devolver silêncio aqui esconderia a tentativa.
  if (!linha) throw new Error("quadra não pertence a esta arena");
  return linha;
}

export async function definirBloqueioAtivo(
  partnerId: string,
  bloqueioId: string,
  ativo: boolean,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE court_blackout SET active = $3
      WHERE id = $2 AND partner_id = $1 RETURNING id`,
    [partnerId, bloqueioId, ativo],
  );
  return Boolean(linhas[0]);
}

export async function removerBloqueio(partnerId: string, bloqueioId: string): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `DELETE FROM court_blackout WHERE id = $2 AND partner_id = $1 RETURNING id`,
    [partnerId, bloqueioId],
  );
  return Boolean(linhas[0]);
}

// ──────────────────────────────────────── pedidos de remoção

export type PedidoDeRemocaoRow = {
  id: string;
  protocol: string;
  received_at: Date;
  channel: string;
  requester_contact: string | null;
  requester_role: string;
  scope: string;
  target_clip_ids: string[];
  severity: string;
  reason_free_text: string | null;
  status: string;
  hidden_at: Date | null;
  executed_at: Date | null;
  responded_at: Date | null;
  court: string | null;
  decidido_por: string | null;
};

/** A fila: pendentes primeiro, mais antigos no topo (o SLA corre do recebimento). */
export async function pedidosDeRemocao(
  partnerId: string,
  limite = 50,
): Promise<PedidoDeRemocaoRow[]> {
  return query<PedidoDeRemocaoRow>(
    `SELECT t.id, t.protocol, t.received_at, t.channel, t.requester_contact,
            t.requester_role::text AS requester_role, t.scope::text AS scope,
            t.target_clip_ids, t.severity::text AS severity, t.reason_free_text,
            t.status::text AS status, t.hidden_at, t.executed_at, t.responded_at,
            ct.name AS court, u.email::text AS decidido_por
       FROM takedown_request t
       LEFT JOIN court ct   ON ct.id = t.court_id
       LEFT JOIN app_user u ON u.id = t.decided_by
      WHERE t.partner_id = $1
      ORDER BY (t.status IN ('recebido','em_analise')) DESC, t.received_at
      LIMIT $2`,
    [partnerId, limite],
  );
}

export async function criarPedidoDeRemocao(
  partnerId: string,
  d: {
    courtId: string | null;
    clipIds: string[];
    contato: string | null;
    papel: "titular" | "responsavel_menor" | "terceiro" | "arena" | "autoridade";
    gravidade: "comum" | "menor" | "grave";
    motivo: string | null;
    canal: string;
  },
): Promise<{ id: string; protocol: string }> {
  const linhas = await query<{ id: string; protocol: string }>(
    `INSERT INTO takedown_request (partner_id, court_id, channel, requester_contact,
                                   requester_role, scope, target_clip_ids, severity,
                                   reason_free_text)
     VALUES ($1, $2::uuid, $3, $4, $5::takedown_requester,
             CASE WHEN cardinality($6::uuid[]) > 1 THEN 'clips'::takedown_scope
                  ELSE 'clip'::takedown_scope END,
             $6::uuid[], $7::takedown_severity, $8)
     RETURNING id, protocol`,
    [
      partnerId,
      d.courtId,
      d.canal,
      d.contato,
      d.papel,
      d.clipIds,
      d.gravidade,
      d.motivo,
    ],
  );
  return linhas[0]!;
}

export type ArquivoDoClipe = {
  clip_id: string;
  storage_bucket: string;
  watermarked_object_key: string | null;
  source_object_key: string | null;
  thumbnail_object_key: string | null;
  preview_object_key: string | null;
  og_object_key: string | null;
};

/**
 * As chaves de objeto dos clipes a expurgar — **só os desta arena**.
 *
 * O `partner_id` na cláusula WHERE é o que impede alguém com um uuid de clipe de
 * outra arena mandar apagá-lo pelo painel desta.
 */
export async function arquivosDosClipes(
  partnerId: string,
  clipIds: readonly string[],
): Promise<ArquivoDoClipe[]> {
  if (clipIds.length === 0) return [];
  return query<ArquivoDoClipe>(
    `SELECT c.id AS clip_id, c.storage_bucket, c.watermarked_object_key,
            c.source_object_key, c.thumbnail_object_key, c.preview_object_key,
            c.og_object_key
       FROM clip c
      WHERE c.partner_id = $1 AND c.id = ANY($2::uuid[])`,
    [partnerId, clipIds as string[]],
  );
}

/**
 * Camada 1 do expurgo: o clipe some da API.
 *
 * ─── ESTA ESCRITA VEM ANTES DAS OUTRAS CINCO, E ISSO É DELIBERADO ──────────
 *
 * `fluxo-remocao.md` §7 ordena apagar o OBJETO antes da LINHA, para não deixar
 * órfão de objeto. Isso vale para o expurgo por RETENÇÃO, que roda sozinho de
 * madrugada. Para o takedown vale o contrário: o relógio do SLA corre e a
 * primeira coisa que precisa acontecer é o vídeo sair do ar para quem abrir a
 * página. Então marca-se `deleted_at` primeiro (efeito imediato e reversível),
 * apagam-se os objetos depois (irreversível), e o `verification` registra o que
 * cada camada respondeu.
 */
export async function marcarClipesRemovidos(
  partnerId: string,
  clipIds: readonly string[],
  motivo: string,
  takedownId: string | null,
): Promise<number> {
  if (clipIds.length === 0) return 0;
  const linhas = await query<{ id: string }>(
    `UPDATE clip
        SET deleted_at = COALESCE(deleted_at, now()),
            deleted_reason = $3,
            takedown_request_id = COALESCE($4::uuid, takedown_request_id),
            status = 'expired'::clip_status,
            pinned = false
      WHERE partner_id = $1 AND id = ANY($2::uuid[])
      RETURNING id`,
    [partnerId, clipIds as string[], motivo, takedownId],
  );
  return linhas.length;
}

/** Fecha o protocolo com o resultado de cada camada. */
export async function registrarExecucaoDoPedido(
  partnerId: string,
  pedidoId: string,
  verificacao: Record<string, unknown>,
  concluido: boolean,
  decididoPor: string | null,
): Promise<void> {
  await query(
    `UPDATE takedown_request
        SET status = CASE WHEN $4::boolean THEN 'concluido'::takedown_status
                          ELSE 'executado'::takedown_status END,
            hidden_at   = COALESCE(hidden_at, now()),
            executed_at = COALESCE(executed_at, now()),
            verification = $3::jsonb,
            decided_by = COALESCE($5::uuid, decided_by)
      WHERE id = $2 AND partner_id = $1`,
    [partnerId, pedidoId, JSON.stringify(verificacao), concluido, decididoPor],
  );
}

export type ClipeRemovivelRow = {
  id: string;
  triggered_at: Date;
  court: string;
  court_id: string;
  status: string;
  duration_seconds: string;
  downloads: number;
  shares: number;
};

/**
 * Os lances recentes da arena, para o operador escolher qual remover.
 *
 * Mostra `downloads` e `shares` porque §8 do fluxo de remoção manda dimensionar
 * o problema antes de responder: um lance baixado por 12 pessoas exige uma
 * conversa diferente de um que ninguém abriu. Não projeta chave de objeto —
 * quem precisa dela é o expurgo, não a lista.
 */
export async function clipesRemoviveisDaArena(
  partnerId: string,
  filtro: { courtId?: string | null; termo?: string | null },
  limite = 40,
): Promise<ClipeRemovivelRow[]> {
  return query<ClipeRemovivelRow>(
    `SELECT c.id, c.triggered_at, ct.name AS court, c.court_id,
            c.status::text AS status, c.duration_seconds::text AS duration_seconds,
            c.download_count AS downloads, c.share_count AS shares
       FROM clip c
       JOIN court ct ON ct.id = c.court_id
      WHERE c.partner_id = $1
        AND c.deleted_at IS NULL
        AND ($2::uuid IS NULL OR c.court_id = $2::uuid)
        AND ($3::text = '' OR c.id::text ILIKE $3 || '%')
      ORDER BY c.triggered_at DESC
      LIMIT $4`,
    [partnerId, filtro.courtId ?? null, (filtro.termo ?? "").trim(), limite],
  );
}

/** Um clipe pelo id, restrito à arena — para a confirmação antes de remover. */
export async function clipeDaArena(
  partnerId: string,
  clipId: string,
): Promise<ClipeRemovivelRow | null> {
  const linhas = await query<ClipeRemovivelRow>(
    `SELECT c.id, c.triggered_at, ct.name AS court, c.court_id,
            c.status::text AS status, c.duration_seconds::text AS duration_seconds,
            c.download_count AS downloads, c.share_count AS shares
       FROM clip c
       JOIN court ct ON ct.id = c.court_id
      WHERE c.partner_id = $1 AND c.id = $2 AND c.deleted_at IS NULL`,
    [partnerId, clipId],
  );
  return linhas[0] ?? null;
}
