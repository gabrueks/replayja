import { query } from "@/lib/db";

// Saúde do sistema e do parceiro.

/**
 * O check de `/api/health`.
 *
 * Um `SELECT 1` e o relógio do banco. Simples de propósito: o Better Stack free
 * bate aqui a cada minuto (ADR §7), e um health check que faz consulta cara vira
 * o motivo de o compute do Neon nunca dormir — que é exatamente o custo que a
 * decisão do polling adaptativo existe para evitar.
 */
export async function bancoResponde(): Promise<{ ok: true; agora: Date } | { ok: false }> {
  try {
    const linhas = await query<{ agora: Date }>("SELECT now() AS agora");
    const agora = linhas[0]?.agora;
    return agora ? { ok: true, agora } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export type SaudeDoRelayRow = {
  id: string;
  status: string;
  ultimo_heartbeat: Date | null;
  desde_segundos: number | null;
  agent_version: string | null;
  disco_livre: string | null;
  jobs_pendentes: number;
};

/**
 * O relay que grava para esta arena (ou o relay único do piloto).
 *
 * ─── O QUE SIGNIFICA "ONLINE" AQUI ─────────────────────────────────────────
 *
 * `last_seen_at` é escrito pelo `POST /api/relay/health`, que chega a cada 60 s.
 * Mais de 180 s sem heartbeat (três ciclos) é relay fora do ar — um ciclo
 * perdido é ruído de rede, três não. `NULL` é outro estado, e não o mesmo:
 * significa que o relay NUNCA falou conosco, isto é, instalação incompleta. É a
 * diferença entre "caiu" e "nunca subiu", e as duas pedem ações diferentes.
 */
export async function saudeDoRelay(relayNodeId?: string | null): Promise<SaudeDoRelayRow | null> {
  const linhas = await query<SaudeDoRelayRow>(
    `SELECT r.id, r.status::text AS status,
            r.last_seen_at AS ultimo_heartbeat,
            EXTRACT(EPOCH FROM (now() - r.last_seen_at))::int AS desde_segundos,
            r.agent_version,
            (r.disk_free_bytes::numeric / NULLIF(r.disk_total_bytes, 0))::text AS disco_livre,
            (SELECT count(*)::int FROM clip_job j
              WHERE j.relay_node_id = r.id AND j.status = 'pending' AND j.expires_at > now())
              AS jobs_pendentes
       FROM relay_node r
      WHERE ($1::text IS NULL OR r.id = $1)
        AND r.status <> 'retired'
      ORDER BY r.last_seen_at DESC NULLS LAST
      LIMIT 1`,
    [relayNodeId ?? null],
  );
  return linhas[0] ?? null;
}

export type SaudeDaCameraRow = {
  id: string;
  name: string;
  /** `null` quando a câmera ainda não foi vinculada a nenhuma quadra. */
  court: string | null;
  court_id: string | null;
  court_slug: string | null;
  status: string;
  enabled: boolean;
  last_segment_at: Date | null;
  since_seconds: number | null;
  coverage_24h: string | null;
  coverage_1h: string | null;
  long_segments_24h: number;
  observed_bitrate_kbps: string | null;
  target_bitrate_kbps: number;
  recorded_until: Date | null;
  rtmp_port: number | null;
  relay_node_id: string;
  relay_status: string;
  relay_disk_free: string | null;
  relay_last_seen_at: Date | null;
  relay_since_seconds: number | null;
  /** `received_at` da última amostra de `camera_health`. */
  amostra_em: Date | null;
};

/**
 * Saúde das câmeras da arena — o painel do parceiro.
 *
 * NÃO projeta `rtmp_key` nem `rtsp_url`. O admin da arena não precisa deles
 * depois do provisionamento, e sem RLS a projeção explícita é a única barreira
 * (`modelo-de-dados.md` §7.3).
 *
 * `relay_node` e `relay_health` são infraestrutura NOSSA, compartilhada entre
 * arenas, e por isso não aparecem inteiros: o painel recebe só o resumo (status e
 * disco livre) montado aqui.
 */
export async function saudeDasCameras(partnerId: string): Promise<SaudeDaCameraRow[]> {
  return query<SaudeDaCameraRow>(
    `SELECT cam.id, cam.name, ct.name AS court, ct.id AS court_id,
            ct.slug::text AS court_slug,
            cam.status::text AS status, cam.enabled,
            cam.last_segment_at,
            EXTRACT(EPOCH FROM (now() - cam.last_segment_at))::int AS since_seconds,
            cam.coverage_24h,
            h.coverage_1h,
            h.received_at AS amostra_em,
            cam.long_segments_24h,
            cam.observed_bitrate_kbps,
            cam.target_bitrate_kbps,
            cam.recorded_until,
            cam.rtmp_port,
            r.id AS relay_node_id,
            r.status::text AS relay_status,
            (r.disk_free_bytes::numeric / NULLIF(r.disk_total_bytes, 0))::text AS relay_disk_free,
            r.last_seen_at AS relay_last_seen_at,
            EXTRACT(EPOCH FROM (now() - r.last_seen_at))::int AS relay_since_seconds
       FROM camera cam
       -- LEFT JOIN e não JOIN: câmera SEM quadra é o estado normal entre o
       -- cadastro e a vinculação, e ela é justamente a que precisa aparecer no
       -- painel (o relay não a grava). Com join interno ela sumia da tela, e a
       -- instalação incompleta só era descoberta pelo lance que não veio.
       LEFT JOIN court ct ON ct.id = cam.court_id
       JOIN relay_node r  ON r.id  = cam.relay_node_id
       -- A ULTIMA amostra de camera_health, e so ela. Um join simples com a
       -- tabela de amostras multiplicaria a linha por milhares (uma por minuto
       -- por câmera) e o painel passaria a ler o histórico inteiro para mostrar
       -- um ponto verde.
       LEFT JOIN LATERAL (
         SELECT ch.coverage_1h, ch.received_at
           FROM camera_health ch
          WHERE ch.camera_id = cam.id
          ORDER BY ch.received_at DESC
          LIMIT 1
       ) h ON true
      WHERE cam.partner_id = $1 AND cam.deleted_at IS NULL
      ORDER BY ct.display_order NULLS FIRST, cam.name`,
    [partnerId],
  );
}

export type OscilacaoRow = {
  dia: string;
  buracos: number;
  segundos_perdidos: number;
  maior_buraco: number;
  do_uplink: number;
  lances_afetados: number;
};

/**
 * "A internet da arena oscilou?" — a evidência para a conversa com o parceiro.
 *
 * Esta consulta existe para transformar uma reclamação nossa ("seu lance saiu
 * picotado") numa ação DELE. `likely_cause = 'arena_uplink'` é decidido por
 * `concurrent_cameras > 1` na mesma arena: buracos de uplink chegam em bando.
 */
export async function oscilacoesDoUplink(
  partnerId: string,
  dias = 30,
): Promise<OscilacaoRow[]> {
  return query<OscilacaoRow>(
    `SELECT date_trunc('day', g.started_at AT TIME ZONE p.timezone)::date::text AS dia,
            count(*)::int                     AS buracos,
            sum(g.duration_seconds)::int      AS segundos_perdidos,
            max(g.duration_seconds)::int      AS maior_buraco,
            count(*) FILTER (WHERE g.likely_cause = 'arena_uplink')::int AS do_uplink,
            COALESCE(sum(g.clips_affected), 0)::int AS lances_afetados
       FROM coverage_gap g
       JOIN partner p ON p.id = g.partner_id
      WHERE g.partner_id = $1
        AND g.started_at > now() - make_interval(days => $2::int)
      GROUP BY dia
      ORDER BY dia DESC`,
    [partnerId, dias],
  );
}

export type JobTravadoRow = {
  id: string;
  clip_id: string;
  camera_id: string;
  status: string;
  attempt: number;
  idade_segundos: number;
  error_code: string | null;
  error: string | null;
};

/** Jobs travados — alerta de pipeline. Sem Sentry, é a nossa página de
 *  incidentes. */
export async function jobsTravados(): Promise<JobTravadoRow[]> {
  return query<JobTravadoRow>(
    `SELECT j.id, j.clip_id, j.camera_id, j.status::text AS status, j.attempt,
            EXTRACT(EPOCH FROM (now() - j.created_at))::int AS idade_segundos,
            j.error_code, j.error
       FROM clip_job j
      WHERE j.status NOT IN ('done','failed')
        AND j.created_at < now() - interval '3 minutes'
      ORDER BY j.created_at
      LIMIT 200`,
  );
}

export type MetricasDaArenaRow = {
  lances_hoje: number;
  lances_7d: number;
  atletas_7d: number;
  compartilhamentos_7d: number;
  gatilhos_recusados_24h: number;
  clipes_parciais_7d: number;
};

/**
 * Os quatro números do topo do painel — reais, não fixture.
 *
 * Tudo numa consulta só e tudo com `partner_id` na cláusula WHERE: sem RLS, o
 * escopo por arena é exatamente isto, e um `FILTER` que esquecesse o parceiro
 * somaria a operação de outra pessoa no painel deste.
 *
 * As janelas são calculadas no FUSO DA ARENA (`AT TIME ZONE`), não em UTC: às
 * 21h de São Paulo já é outro dia em UTC, e "lances hoje" zeraria toda noite —
 * justamente no horário de pico da pelada.
 */
export async function metricasDaArena(
  partnerId: string,
  timezone: string,
): Promise<MetricasDaArenaRow> {
  const linhas = await query<MetricasDaArenaRow>(
    `WITH janela AS (
        SELECT (now() AT TIME ZONE $2)::date AS hoje_local
     )
     SELECT
       (SELECT count(*)::int FROM clip c, janela j
         WHERE c.partner_id = $1 AND c.deleted_at IS NULL AND c.expires_at > now()
           AND c.status IN ('ready','partial')
           AND (c.triggered_at AT TIME ZONE $2)::date = j.hoje_local) AS lances_hoje,
       (SELECT count(*)::int FROM clip c
         WHERE c.partner_id = $1 AND c.deleted_at IS NULL AND c.expires_at > now()
           AND c.status IN ('ready','partial')
           AND c.triggered_at > now() - interval '7 days') AS lances_7d,
       (SELECT count(DISTINCT te.requested_by_user_id)::int FROM trigger_event te
         WHERE te.partner_id = $1
           AND te.requested_by_user_id IS NOT NULL
           AND te.arrival_at > now() - interval '7 days') AS atletas_7d,
       (SELECT count(*)::int FROM share_event se
         WHERE se.partner_id = $1
           AND se.action = 'created'
           AND se.occurred_at > now() - interval '7 days') AS compartilhamentos_7d,
       (SELECT count(*)::int FROM trigger_event te
         WHERE te.partner_id = $1
           AND te.outcome <> 'accepted'
           AND te.arrival_at > now() - interval '24 hours') AS gatilhos_recusados_24h,
       (SELECT count(*)::int FROM clip c
         WHERE c.partner_id = $1 AND c.deleted_at IS NULL AND c.expires_at > now()
           AND c.status = 'partial'
           AND c.triggered_at > now() - interval '7 days') AS clipes_parciais_7d`,
    [partnerId, timezone],
  );
  return (
    linhas[0] ?? {
      lances_hoje: 0,
      lances_7d: 0,
      atletas_7d: 0,
      compartilhamentos_7d: 0,
      gatilhos_recusados_24h: 0,
      clipes_parciais_7d: 0,
    }
  );
}

export type LancesPorHoraRow = { hora: string; total: number };

/**
 * Lances por hora do dia local — o gráfico de barras do painel.
 *
 * Últimos 7 dias agregados por hora da arena. Sete dias e não um: com um dia só,
 * uma terça sem pelada desenharia um gráfico vazio e o parceiro concluiria que o
 * sistema parou.
 */
export async function lancesPorHoraNaArena(
  partnerId: string,
  timezone: string,
): Promise<LancesPorHoraRow[]> {
  return query<LancesPorHoraRow>(
    `SELECT lpad(EXTRACT(HOUR FROM (c.triggered_at AT TIME ZONE $2))::int::text, 2, '0') || 'h'
              AS hora,
            count(*)::int AS total
       FROM clip c
      WHERE c.partner_id = $1
        AND c.deleted_at IS NULL
        AND c.expires_at > now()
        AND c.status IN ('ready','partial')
        AND c.triggered_at > now() - interval '7 days'
      GROUP BY 1
      ORDER BY 1`,
    [partnerId, timezone],
  );
}
