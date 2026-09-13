import { query, tryQuery } from "@/lib/db";
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
  /**
   * Inclui os clipes que AINDA ESTÃO SENDO CORTADOS (`pending`…`uploading`).
   *
   * ─── POR QUE ISTO É UMA OPÇÃO, E NÃO O PADRÃO ────────────────────────────
   *
   * O índice `clip_partner_time_idx` é PARCIAL (`WHERE status IN
   * ('ready','partial')`), então esta variante não o usa — ela cai no
   * `clip_court_time_idx`/seq scan da janela, que é barato porque a janela tem
   * no máximo 6 horas e é sempre de UMA arena.
   *
   * O que se ganha vale a troca: quem acabou de apertar o botão precisa VER o
   * lance nascendo. Um card "processando" que vira "pronto" em 30 s é a
   * diferença entre "funcionou" e "não gravou nada" — e foi essa ausência que
   * fez o atleta apertar o botão de novo no 1.0.
   */
  incluirProcessando?: boolean;
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
        AND (
          c.status IN ('ready','partial')
          OR ($8::boolean AND c.status IN ('pending','cutting','processing','uploading'))
        )
        AND c.deleted_at IS NULL
        -- A RETENÇÃO É CONFERIDA AQUI, E NÃO NUM JOB QUE PODE NÃO TER RODADO.
        -- expires_at nasce em triggered_at + partner.clip_retention_days e
        -- é empurrado em 180 dias por download/compartilhamento. O expurgo de
        -- BYTES continua sendo trabalho do job; o que o atleta VÊ não pode
        -- depender de um cron ter acordado.
        AND c.expires_at > now()
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
      b.incluirProcessando ?? false,
    ],
  );
}

export type ClipeDetalheRow = ClipeRow & {
  partner_id: string;
  partner_slug: string;
  partner_display_name: string;
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
        p.slug::text AS partner_slug, p.display_name AS partner_display_name,
        p.timezone AS partner_timezone,
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
        AND c.expires_at > now()
        AND c.status IN ('ready','partial')`,
    [clipId],
  );
  return linhas[0] ?? null;
}

export type CapaDoClipeRow = {
  partner_slug: string;
  thumbnail_object_key: string | null;
  status: string;
};

/**
 * A CAPA de um clipe — e SÓ ela. Não recebe sessão, de propósito.
 *
 * ─── A EXCEÇÃO, E POR QUE ELA NÃO ABRE NADA ────────────────────────────────
 *
 * `generateMetadata` roda para o CRAWLER do WhatsApp, que não tem cookie. Sem
 * uma leitura sem sessão, o link de um lance chega no grupo como um retângulo
 * cinza — e um card sem imagem é um link que ninguém abre, o que mata a
 * divulgação que o parceiro compra.
 *
 * O que isto projeta é a chave do objeto no BUCKET PÚBLICO de thumbnails —
 * exatamente o arquivo que já é servido sem assinatura por decisão consciente
 * (`lib/storage.ts`, `bucketDoPapel`). Nenhuma chave do bucket privado, nenhum
 * horário, nenhuma quadra, nenhum nome: quem tiver o id do clipe consegue a
 * mesma miniatura que o card já mostra, e nada além.
 *
 * O VÍDEO continua exigindo login: ele vem de `clipePorId`, que chama
 * `exigirLogin`.
 */
export async function capaDoClipe(clipId: string): Promise<CapaDoClipeRow | null> {
  const linhas = await query<CapaDoClipeRow>(
    `SELECT p.slug::text AS partner_slug, c.thumbnail_object_key, c.status::text AS status
       FROM clip c
       JOIN partner p ON p.id = c.partner_id
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [clipId],
  );
  return linhas[0] ?? null;
}

export type EstadoDoClipeRow = {
  id: string;
  partner_slug: string;
  court_name: string;
  status: string;
  coverage_ratio: string | null;
  triggered_at: Date;
  partner_timezone: string;
};

/**
 * Só o ESTADO de um clipe — o alvo do polling depois do botão virtual.
 *
 * Diferente de `clipePorId` em dois pontos, e os dois são de propósito:
 * responde para QUALQUER status (senão o clipe que está sendo cortado voltaria
 * 404 justo na janela em que o polling existe para cobrir), e projeta o mínimo
 * — nenhuma chave de objeto, porque quem está esperando ainda não pode assistir.
 *
 * Login continua obrigatório: é a mesma regra da busca.
 */
export async function estadoDoClipe(
  s: Sessao | null,
  clipId: string,
): Promise<EstadoDoClipeRow | null> {
  exigirLogin(s);
  const linhas = await query<EstadoDoClipeRow>(
    `SELECT c.id, p.slug::text AS partner_slug, ct.name AS court_name,
            c.status::text AS status, c.coverage_ratio, c.triggered_at,
            p.timezone AS partner_timezone
       FROM clip c
       JOIN court ct  ON ct.id = c.court_id
       JOIN partner p ON p.id  = c.partner_id
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [clipId],
  );
  return linhas[0] ?? null;
}

/**
 * Marca o download: conta e FIXA a retenção.
 *
 * `pinned` não é enfeite de métrica — um clipe baixado (ou compartilhado) virou
 * link no grupo de WhatsApp, e um link que vira 404 em um mês é a promessa que
 * o produto não pode quebrar (`lib/limites.ts`, `PIN_EXTENSAO_DIAS`).
 *
 * Escrita não-crítica por natureza: quem chama já vai redirecionar para o
 * arquivo, e um erro aqui não pode derrubar o download.
 */
export async function registrarDownloadDoClipe(
  s: Sessao | null,
  clipId: string,
  extensaoDias: number,
): Promise<void> {
  exigirLogin(s);
  await tryQuery(
    `UPDATE clip
        SET download_count = download_count + 1,
            pinned = true,
            expires_at = GREATEST(expires_at, now() + make_interval(days => $2::int))
      WHERE id = $1 AND deleted_at IS NULL`,
    [clipId, extensaoDias],
  );
}

/** Conta uma visualização. Não-crítica: o player não pode falhar por isto. */
export async function registrarVisualizacaoDoClipe(
  s: Sessao | null,
  clipId: string,
): Promise<void> {
  exigirLogin(s);
  await tryQuery(`UPDATE clip SET view_count = view_count + 1 WHERE id = $1`, [clipId]);
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
 * A DERIVAÇÃO DAS OCORRÊNCIAS — o coração do grupo, em SQL.
 *
 * Fragmento compartilhado pelas duas consultas do grupo (a contagem por semana e
 * a lista de clipes de cada sessão). Está aqui em cima, e não copiado nas duas,
 * porque o dia em que as duas divergirem a tela vai mostrar "18 lances" em cima
 * de uma grade com 6 de outra janela — e ninguém vai desconfiar do SQL.
 *
 * Recebe `$1` = `play_group.id` e `$2` = quantas SEMANAS gerar para trás.
 *
 * ─── POR QUE A CONVERSÃO É NA CONSULTA, E NÃO NO ARMAZENAMENTO ─────────────
 *
 * A pelada é "toda segunda às 20h NO HORÁRIO DA ARENA". Guardar isso como
 * `timestamptz` congelaria o offset e quebraria se o Brasil reintroduzisse
 * horário de verão (abolido em 2019, mas reversível por decreto — em 2018 a
 * mudança quebrou sistemas no país inteiro). `time` + `timezone` converte na
 * consulta e sempre acerta, porque o Postgres usa a mesma base IANA que o
 * `Intl` do Node (`lib/fuso.ts`).
 *
 * `date_trunc('week', ...)` no Postgres devolve SEGUNDA-FEIRA, o que casa com a
 * convenção ISO de `weekdays` (1 = segunda … 7 = domingo).
 *
 * `end_time <= start_time` significa que a sessão CRUZA A MEIA-NOITE: a janela
 * ganha um dia no fim. E `semana + (d - 1)` atravessa virada de mês e de ano
 * sozinho, porque é aritmética de `date` do Postgres e não de string.
 */
const OCORRENCIAS_DO_GRUPO = `WITH g AS (
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
     brutas AS (
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
     ),
     -- Só o que JÁ COMEÇOU. O filtro por data sozinho deixaria passar a
     -- ocorrência de hoje à noite desde a meia-noite — e a página do grupo
     -- abriria toda sexta de manhã com "hoje · 0 lances", que se lê como
     -- "o produto não gravou". É também o que mantém esta derivação igual à de
     -- lib/ocorrencias.ts, que responde "quando é o próximo jogo".
     janelas AS (
        -- A projeção é explícita até dentro do CTE: sem RLS, a lista de colunas
        -- é a única barreira de projeção que existe, e o grep de disciplina do
        -- CI não abre exceção para CTE interno (nem deve).
        SELECT local_date, play_group_id, partner_id, all_courts, window_start, window_end FROM brutas WHERE window_start <= now()
     )`;

/**
 * Sessões semanais de um grupo — `modelo-de-dados.md` §6.2.
 *
 * Só a CONTAGEM por ocorrência: é o "18 lances" ao lado da data. Os clipes vêm
 * de `clipesDoGrupoPorSessao`, que exige sessão; esta aqui não, porque contagem
 * por janela é exatamente o que a página do grupo mostra a quem ainda não
 * entrou (o mesmo princípio da grade borrada da arena).
 */
export async function sessoesSemanaisDoGrupo(
  playGroupId: string,
  semanas = 12,
): Promise<SessaoSemanalRow[]> {
  return query<SessaoSemanalRow>(
    `${OCORRENCIAS_DO_GRUPO}
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
        AND c.expires_at > now()
        AND (
          j.all_courts
          OR c.court_id IN (SELECT court_id FROM play_group_court WHERE play_group_id = j.play_group_id)
        )
      GROUP BY j.local_date, j.window_start, j.window_end
      ORDER BY j.window_start DESC`,
    [playGroupId, semanas],
  );
}

/**
 * As OCORRÊNCIAS do filtro recorrente, com os clipes de cada uma.
 *
 * ─── POR QUE ISTO NÃO É `sessoesSemanaisDoGrupo` COM UM JOIN A MAIS ────────
 *
 * Aquela consulta responde "quantos lances em cada semana" — é o número do
 * cabeçalho. Esta responde "quais lances", e as duas não podem virar uma só sem
 * escolher entre duas coisas erradas: ou a contagem passa a ser o tamanho da
 * página (a semana com 18 lances diria "6"), ou a página passa a ser a semana
 * inteira (uma pelada de torneio derrubaria a tela no 4G da quadra).
 *
 * O `LEFT JOIN LATERAL` é o que faz a ocorrência SEM LANCE continuar
 * aparecendo, com uma linha de colunas nulas. Sumir com a semana vazia faria o
 * atleta achar que o produto perdeu o jogo dele; "nenhum lance nesta janela"
 * mostra que o sistema olhou e não achou (`WeekSection`).
 *
 * Login obrigatório, igual à busca: o grupo organiza os clipes, não muda quem
 * pode vê-los (`api/README.md` §3 — o grupo NÃO é uma ACL).
 */
export type ClipeDaSessaoRow = ClipeRow & { local_date: string; window_start: Date };

export async function clipesDoGrupoPorSessao(
  s: Sessao | null,
  playGroupId: string,
  ocorrencias = 8,
  porSessao = 6,
  /**
   * Quantas ocorrências RECENTES pular — o seletor de rodada da página do grupo.
   *
   * `OFFSET` e não `slice` em TypeScript: pular em memória significaria trazer
   * do banco todas as ocorrências desde hoje até a rodada pedida, com os seis
   * clipes de cada uma, para jogar fora a maior parte. Na rodada 40 isso é uma
   * consulta oito vezes maior que a tela.
   */
  pular = 0,
): Promise<ClipeDaSessaoRow[]> {
  exigirLogin(s);
  return query<ClipeDaSessaoRow>(
    `${OCORRENCIAS_DO_GRUPO},
     recentes AS (
        SELECT local_date, play_group_id, partner_id, all_courts, window_start, window_end
          FROM janelas ORDER BY window_start DESC LIMIT $2 OFFSET $4
     )
     SELECT r.local_date::text AS local_date, r.window_start,
            c.id, c.court_id, c.court_name, c.court_slug,
            c.triggered_at, c.started_at, c.ended_at, c.duration_seconds,
            c.width, c.height, c.size_bytes, c.coverage_ratio, c.status,
            c.watermarked_object_key, c.thumbnail_object_key, c.preview_object_key,
            c.view_count
       FROM recentes r
       LEFT JOIN LATERAL (
         SELECT cl.id, cl.court_id, ct.name AS court_name, ct.slug::text AS court_slug,
                cl.triggered_at, cl.started_at, cl.ended_at, cl.duration_seconds,
                cl.width, cl.height, cl.size_bytes, cl.coverage_ratio,
                cl.status::text AS status,
                cl.watermarked_object_key, cl.thumbnail_object_key, cl.preview_object_key,
                cl.view_count
           FROM clip cl
           JOIN court ct ON ct.id = cl.court_id
          WHERE cl.partner_id   = r.partner_id
            AND cl.triggered_at >= r.window_start
            AND cl.triggered_at <  r.window_end
            AND cl.status IN ('ready','partial')
            AND cl.deleted_at IS NULL
            AND cl.expires_at > now()
            AND (
              r.all_courts
              OR cl.court_id IN (
                   SELECT court_id FROM play_group_court WHERE play_group_id = r.play_group_id
                 )
            )
          ORDER BY cl.triggered_at DESC, cl.id DESC
          LIMIT $3
       ) c ON true
      ORDER BY r.window_start DESC, c.triggered_at DESC`,
    [playGroupId, ocorrencias, porSessao, pular],
  );
}
