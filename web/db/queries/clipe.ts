import { query } from "@/lib/db";
import { JANELA_MAX_MS, PAGINA_MAX, PAGINA_PADRAO } from "@/lib/limites";
import { janelaGrandeDemais } from "@/lib/problem";
import type { Sessao } from "@/lib/session";
import { exigirLogin } from "./autorizacao";

// A CONSULTA CENTRAL DO PRODUTO — `modelo-de-dados.md` §6.1.

export type ClipeRow = {
  id: string;
  court_id: string;
  court_name: string;
  court_slug: string;
  triggered_at: Date;
  started_at: Date;
  ended_at: Date;
  duration_seconds: string;
  width: number | null;
  height: number | null;
  size_bytes: string | null;
  coverage_ratio: string | null;
  status: string;
  watermarked_object_key: string | null;
  thumbnail_object_key: string | null;
  preview_object_key: string | null;
  view_count: number;
};

export type Cursor = { t: string; i: string };

export type BuscaDeClipes = {
  partnerId: string;
  /** `null` = todas as quadras. */
  courtId?: string | null;
  de: Date;
  ate: Date;
  cursor?: Cursor | null;
  limit?: number;
};

/**
 * "Clipes da arena X, quadra opcional, entre T1 e T2."
 *
 * ─── AS TRÊS DECISÕES EMBUTIDAS AQUI ───────────────────────────────────────
 *
 * 1. LOGIN OBRIGATÓRIO. Nenhum clipe é público, nem por link direto. A proteção
 *    do produto não vem de restringir QUEM vê (não existe forma confiável de
 *    saber de quem é o lance — um clipe de 22 s tem 10 a 20 pessoas em quadra, e
 *    reconhecimento facial é dado biométrico sensível sob a LGPD art. 11). Vem de
 *    restringir QUANTO se pode varrer, exigir identificação de quem viu, e
 *    responder rápido a pedido de remoção.
 *
 * 2. JANELA ≤ 6 HORAS, obrigatória. Nunca existe "listar todos os clipes da
 *    arena". Sem janela, sem resultado. É controle de privacidade barato E
 *    proteção do banco.
 *
 * 3. KEYSET, NUNCA OFFSET. Esta lista CRESCE ENQUANTO O USUÁRIO ROLA — a pelada
 *    está acontecendo e o relay está subindo clipes. Com `OFFSET`, cada clipe
 *    novo empurra a lista e o usuário vê itens repetidos entre páginas.
 *
 * O índice parcial `clip_partner_time_idx (partner_id, triggered_at DESC,
 * id DESC) WHERE status IN ('ready','partial') AND deleted_at IS NULL` cobre
 * filtro, ordenação e cursor. Plano esperado: `Index Scan Backward` + `Limit`.
 *
 * `partial` APARECE na busca: um lance com 3 segundos faltando ainda é o lance do
 * atleta; escondê-lo seria pior. O app rotula e o painel do parceiro conta as
 * ocorrências, porque a correção é do lado dele.
 */
export async function clipesDaArena(s: Sessao | null, b: BuscaDeClipes): Promise<ClipeRow[]> {
  exigirLogin(s);
  if (b.ate.getTime() - b.de.getTime() > JANELA_MAX_MS) throw janelaGrandeDemais();

  const limite = Math.min(Math.max(1, b.limit ?? PAGINA_PADRAO), PAGINA_MAX);

  return query<ClipeRow>(
    `SELECT
        c.id, c.court_id,
        ct.name AS court_name, ct.slug::text AS court_slug,
        c.triggered_at, c.started_at, c.ended_at, c.duration_seconds,
        c.width, c.height, c.size_bytes, c.coverage_ratio, c.status::text AS status,
        c.watermarked_object_key, c.thumbnail_object_key, c.preview_object_key,
        c.view_count
       FROM clip c
       JOIN court ct ON ct.id = c.court_id
      WHERE c.partner_id   = $1
        AND ($2::uuid IS NULL OR c.court_id = $2)
        AND c.triggered_at >= $3
        AND c.triggered_at <  $4
        AND c.status IN ('ready','partial')
        AND c.deleted_at IS NULL
        AND ($5::timestamptz IS NULL OR (c.triggered_at, c.id) < ($5, $6::uuid))
      ORDER BY c.triggered_at DESC, c.id DESC
      LIMIT $7`,
    [
      b.partnerId,
      b.courtId ?? null,
      b.de,
      b.ate,
      b.cursor?.t ?? null,
      b.cursor?.i ?? null,
      limite,
    ],
  );
}

export type ClipeDetalheRow = ClipeRow & {
  partner_id: string;
  partner_slug: string;
  partner_timezone: string;
  camera_id: string;
  cut_from: Date;
  cut_to: Date;
  expires_at: Date;
  watermark_applied: boolean;
};

/** Um clipe. Login obrigatório, mesma regra da busca. */
export async function clipePorId(
  s: Sessao | null,
  clipId: string,
): Promise<ClipeDetalheRow | null> {
  exigirLogin(s);
  const linhas = await query<ClipeDetalheRow>(
    `SELECT
        c.id, c.court_id, c.partner_id, c.camera_id,
        p.slug::text AS partner_slug, p.timezone AS partner_timezone,
        ct.name AS court_name, ct.slug::text AS court_slug,
        c.triggered_at, c.started_at, c.ended_at, c.cut_from, c.cut_to,
        c.duration_seconds, c.width, c.height, c.size_bytes,
        c.coverage_ratio, c.status::text AS status,
        c.watermarked_object_key, c.thumbnail_object_key, c.preview_object_key,
        c.watermark_applied, c.view_count, c.expires_at
       FROM clip c
       JOIN court ct   ON ct.id = c.court_id
       JOIN partner p  ON p.id  = c.partner_id
      WHERE c.id = $1
        AND c.deleted_at IS NULL
        AND c.status IN ('ready','partial')`,
    [clipId],
  );
  return linhas[0] ?? null;
}

export type SessaoSemanalRow = {
  local_date: string;
  window_start: Date;
  window_end: Date;
  clip_count: number;
  first_clip_at: Date | null;
  last_clip_at: Date | null;
};

/**
 * Sessões semanais de um grupo — `modelo-de-dados.md` §6.2.
 *
 * ─── POR QUE A CONVERSÃO É NA CONSULTA, E NÃO NO ARMAZENAMENTO ─────────────
 *
 * A pelada é "toda segunda às 20h NO HORÁRIO DA ARENA". Guardar isso como
 * `timestamptz` congelaria o offset e quebraria se o Brasil reintroduzisse
 * horário de verão (abolido em 2019, mas reversível — em 2018 a mudança quebrou
 * sistemas no país inteiro). `time` + `timezone` converte na consulta e sempre
 * acerta.
 *
 * `date_trunc('week', ...)` no Postgres devolve SEGUNDA-FEIRA, o que casa com a
 * convenção ISO de `weekdays` (1 = segunda … 7 = domingo) — é por isso que o
 * `dow` é calculado com `isodow`.
 *
 * `end_time <= start_time` significa que a sessão CRUZA A MEIA-NOITE: a janela
 * ganha um dia no fim.
 */
export async function sessoesSemanaisDoGrupo(
  playGroupId: string,
  semanas = 12,
): Promise<SessaoSemanalRow[]> {
  return query<SessaoSemanalRow>(
    `WITH g AS (
        SELECT id, partner_id, weekdays, start_time, end_time, timezone,
               all_courts, active_from
          FROM play_group
         WHERE id = $1 AND deleted_at IS NULL
     ),
     semanas AS (
        SELECT generate_series(
                 date_trunc('week', (now() AT TIME ZONE (SELECT timezone FROM g)))::date
                   - make_interval(weeks => $2::int - 1),
                 date_trunc('week', (now() AT TIME ZONE (SELECT timezone FROM g)))::date,
                 interval '1 week'
               )::date AS semana
     ),
     ocorrencias AS (
        SELECT (s.semana + (d - 1)) AS local_date, g.*
          FROM semanas s
          CROSS JOIN g
          CROSS JOIN LATERAL unnest(g.weekdays) AS d
         WHERE (s.semana + (d - 1)) >= g.active_from
           AND (s.semana + (d - 1)) <= (now() AT TIME ZONE g.timezone)::date
     ),
     janelas AS (
        SELECT
          o.local_date,
          o.id AS play_group_id,
          o.partner_id,
          o.all_courts,
          ((o.local_date + o.start_time) AT TIME ZONE o.timezone) AS window_start,
          ((o.local_date
              + CASE WHEN o.end_time <= o.start_time THEN interval '1 day' ELSE interval '0' END
              + o.end_time) AT TIME ZONE o.timezone) AS window_end
          FROM ocorrencias o
     )
     SELECT j.local_date::text AS local_date,
            j.window_start,
            j.window_end,
            count(c.id)::int   AS clip_count,
            min(c.triggered_at) AS first_clip_at,
            max(c.triggered_at) AS last_clip_at
       FROM janelas j
       LEFT JOIN clip c
         ON c.partner_id   = j.partner_id
        AND c.triggered_at >= j.window_start
        AND c.triggered_at <  j.window_end
        AND c.status IN ('ready','partial')
        AND c.deleted_at IS NULL
        AND (
          j.all_courts
          OR c.court_id IN (SELECT court_id FROM play_group_court WHERE play_group_id = j.play_group_id)
        )
      GROUP BY j.local_date, j.window_start, j.window_end
      ORDER BY j.window_start DESC`,
    [playGroupId, semanas],
  );
}
