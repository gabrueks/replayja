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

export type SaudeDaCameraRow = {
  id: string;
  name: string;
  court: string;
  status: string;
  last_segment_at: Date | null;
  since_seconds: number | null;
  coverage_24h: string | null;
  long_segments_24h: number;
  observed_bitrate_kbps: string | null;
  target_bitrate_kbps: number;
  recorded_until: Date | null;
  relay_status: string;
  relay_disk_free: string | null;
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
    `SELECT cam.id, cam.name, ct.name AS court, cam.status::text AS status,
            cam.last_segment_at,
            EXTRACT(EPOCH FROM (now() - cam.last_segment_at))::int AS since_seconds,
            cam.coverage_24h,
            cam.long_segments_24h,
            cam.observed_bitrate_kbps,
            cam.target_bitrate_kbps,
            cam.recorded_until,
            r.status::text AS relay_status,
            (r.disk_free_bytes::numeric / NULLIF(r.disk_total_bytes, 0))::text AS relay_disk_free
       FROM camera cam
       JOIN court ct     ON ct.id = cam.court_id
       JOIN relay_node r ON r.id  = cam.relay_node_id
      WHERE cam.partner_id = $1 AND cam.deleted_at IS NULL
      ORDER BY ct.display_order, cam.name`,
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
