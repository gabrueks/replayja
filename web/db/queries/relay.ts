import { query, transacao } from "@/lib/db";
import { CLAIM_PADRAO, LEASE_SEGUNDOS } from "@/lib/limites";

// Consultas do RELAY. Autenticadas por `x-relay-key`, nunca por sessão.
//
// ─── QUEM MANDA EM QUEM ────────────────────────────────────────────────────
//
// Padrão herdado do relay v2 do Sentinela, em produção desde 29/08/2026: o APP
// NÃO ESCREVE NO RELAY. O relay pergunta — a lista de câmeras, a fila de jobs — e
// a resposta é sempre uma LISTA, nunca um comando.
//
// Três consequências que valem repetir:
//  1. O relay continua gravando com o app inteiramente fora do ar. Um deploy
//     quebrado na Vercel não custa nenhum lance — custa o atraso do corte.
//  2. A superfície de escrita do relay é ZERO.
//  3. O relay prefere errar para mais: se a lista não vier, vier inválida, vier
//     vazia ou remover mais da metade dos gravadores de uma vez, ele aborta o
//     ciclo e não desliga nada. Sobra é desperdício de disco; falta é lance
//     perdido — e no Sentinela três câmeras passaram um dia inteiro sem gravar
//     exatamente por uma falha silenciosa deste tipo.

export type RelayNodeRow = {
  id: string;
  base_url: string;
  rtmp_host: string;
  status: string;
  max_cameras: number;
  port_range_start: number;
  port_range_end: number;
  port_range_next: number;
};

/** O relay que corresponde ao hash da chave apresentada. */
export async function relayPorKeyHash(keyHash: string): Promise<RelayNodeRow | null> {
  const linhas = await query<RelayNodeRow>(
    `SELECT id, base_url, rtmp_host, status::text AS status, max_cameras,
            port_range_start, port_range_end, port_range_next
       FROM relay_node
      WHERE key_hash = $1 AND status IN ('provisioning','active','draining')`,
    [keyHash],
  );
  return linhas[0] ?? null;
}

export type CameraDoRelayRow = {
  id: string;
  partner_id: string;
  court_id: string;
  name: string;
  enabled: boolean;
  ingest_kind: string;
  rtmp_port: number | null;
  /** SEGREDO. Esta é a ÚNICA consulta do repositório que pode projetá-lo. */
  rtmp_key: string | null;
  /** SEGREDO (contém credencial). Idem. */
  rtsp_url: string | null;
  width: number;
  height: number;
  fps: number;
  target_bitrate_kbps: number;
  gop_seconds: string;
  segment_seconds: string;
  origin_lag_ms: number;
  retention_days: number;
  prune_after_hours: number;
  min_coverage_ratio: string;
  recording_window_opens: string | null;
  recording_window_closes: string | null;
  timezone: string;
  updated_at: Date;
};

/**
 * A lista de câmeras que este relay deve gravar.
 *
 * ESTA É A EXCEÇÃO DE PROJEÇÃO (`modelo-de-dados.md` §7.3): `rtmp_key` e
 * `rtsp_url` são segredos e só aparecem aqui e na tela de provisionamento. Sem
 * RLS não há privilégio de coluna, então a barreira é esta: a função tem um
 * chamador só, autenticado por `x-relay-key`, e `SELECT *` é proibido em todo
 * `db/queries/`.
 *
 * CÂMERA SEM QUADRA NÃO ENTRA NA LISTA — equivalente ao "sem destino não há
 * gravador" do Sentinela.
 *
 * A janela de gravação sai de `camera` quando preenchida e cai para a da `court`
 * quando não: é o que corta pela metade o custo de disco (retém só a janela de
 * operação) sem mexer na qualidade do clipe.
 */
export async function camerasDoRelay(relayNodeId: string): Promise<CameraDoRelayRow[]> {
  return query<CameraDoRelayRow>(
    `SELECT cam.id, cam.partner_id, cam.court_id, cam.name, cam.enabled,
            cam.ingest_kind::text AS ingest_kind,
            cam.rtmp_port, cam.rtmp_key, cam.rtsp_url,
            cam.width, cam.height, cam.fps, cam.target_bitrate_kbps,
            cam.gop_seconds, cam.segment_seconds, cam.origin_lag_ms,
            cam.retention_days, cam.prune_after_hours, cam.min_coverage_ratio,
            COALESCE(cam.recording_window_opens,  ct.opens_time)::text  AS recording_window_opens,
            COALESCE(cam.recording_window_closes, ct.closes_time)::text AS recording_window_closes,
            p.timezone,
            cam.updated_at
       FROM camera cam
       JOIN court   ct ON ct.id = cam.court_id
       JOIN partner p  ON p.id  = cam.partner_id
      WHERE cam.relay_node_id = $1
        AND cam.court_id IS NOT NULL
        AND cam.deleted_at IS NULL
        AND ct.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.status <> 'churned'
      ORDER BY cam.id`,
    [relayNodeId],
  );
}

/**
 * Versão da lista de câmeras. Muda quando qualquer câmera muda.
 *
 * Permite responder `304` a `GET /relay/cameras?since=` e dizer no
 * `POST /relay/health` se o relay precisa rebuscar. Vale a pena porque a lista é
 * pedida a cada 2 minutos por relay e quase nunca muda.
 */
export async function versaoDasCameras(relayNodeId: string): Promise<string> {
  const linhas = await query<{ v: string }>(
    `SELECT COALESCE(
              md5(count(*)::text || '|' || COALESCE(max(cam.updated_at)::text, '-')),
              'vazio'
            ) AS v
       FROM camera cam
      WHERE cam.relay_node_id = $1 AND cam.court_id IS NOT NULL AND cam.deleted_at IS NULL`,
    [relayNodeId],
  );
  return linhas[0]?.v ?? "vazio";
}

export type JobReivindicadoRow = {
  id: string;
  clip_id: string;
  camera_id: string;
  trigger_event_id: string | null;
  cut_from: Date;
  cut_to: Date;
  deliver_from: Date;
  deliver_to: Date;
  priority: number;
  attempt: number;
  expires_at: Date;
  lease_expires_at: Date;
  watermark_enabled: boolean;
  watermark_version: number | null;
  watermark_object_key: string | null;
  watermark_position: string | null;
  watermark_opacity: string | null;
  /** Largura em % da largura do vídeo (18 = 18%). É o que o `claim` manda. */
  watermark_width_pct: string | null;
  watermark_scale: string | null;
  watermark_margin: string | null;
  partner_id: string;
  court_id: string;
};

/**
 * REIVINDICAÇÃO ATÔMICA DE JOBS — `modelo-de-dados.md` §3.12.
 *
 * `FOR UPDATE SKIP LOCKED` garante que dois relays nunca peguem o mesmo job.
 * Sem broker: a propriedade que importa é transacionalidade ("criar o clipe e
 * enfileirar o corte" precisa ser atômico) e o volume do piloto é de 1 job a cada
 * 7 minutos.
 *
 * O LEASE de 120 s é o que cobre o caso feio — o relay morrer no meio de um
 * corte. Vencido sem confirmação, o job volta para `pending` e é reexecutado. E
 * reexecutar é SEGURO porque a janela é absoluta: `cut_from`/`cut_to` são
 * instantes, não "os últimos 22 segundos". O mesmo job rodado três vezes produz
 * três arquivos idênticos na mesma chave de objeto.
 *
 * Antes de reivindicar, devolve à fila os leases vencidos — assim um relay que
 * volta do reboot recolhe o próprio trabalho abandonado sem depender do cron.
 */
export async function reivindicarJobs(
  relayNodeId: string,
  max = CLAIM_PADRAO,
): Promise<JobReivindicadoRow[]> {
  return transacao(async (q) => {
    // Lease vencido volta para `pending`. `attempt` já foi incrementado na
    // reivindicação anterior, então a tentativa perdida conta — é o que faz o
    // teto de 5 significar alguma coisa.
    await q(
      `UPDATE clip_job
          SET status = CASE WHEN attempt >= 5 THEN 'failed'::job_status ELSE 'pending'::job_status END,
              error_code = CASE WHEN attempt >= 5 THEN 'timeout' ELSE error_code END,
              claimed_at = NULL,
              lease_expires_at = NULL
        WHERE relay_node_id = $1
          AND status IN ('claimed','cutting','processing','uploading')
          AND lease_expires_at < now()`,
      [relayNodeId],
    );

    return q<JobReivindicadoRow>(
      `WITH alvo AS (
          SELECT id FROM clip_job
           WHERE relay_node_id = $1
             AND status = 'pending'
             AND expires_at > now()
           ORDER BY priority DESC, created_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
       ),
       reivindicados AS (
          UPDATE clip_job j
             SET status = 'claimed',
                 claimed_at = now(),
                 lease_expires_at = now() + make_interval(secs => $3::float8),
                 attempt = j.attempt + 1
           WHERE j.id IN (SELECT id FROM alvo)
          RETURNING j.*
       )
       SELECT r.id, r.clip_id, r.camera_id, r.trigger_event_id,
              r.cut_from, r.cut_to, r.deliver_from, r.deliver_to,
              r.priority, r.attempt, r.expires_at, r.lease_expires_at,
              r.partner_id, c.court_id,
              p.watermark_enabled,
              b.watermark_version, b.watermark_object_key,
              b.watermark_position::text AS watermark_position,
              b.watermark_opacity, b.watermark_width_pct,
              b.watermark_scale, b.watermark_margin
         FROM reivindicados r
         JOIN clip c    ON c.id = r.clip_id
         JOIN partner p ON p.id = r.partner_id
         LEFT JOIN partner_branding b ON b.partner_id = r.partner_id
        ORDER BY r.priority DESC, r.created_at`,
      [relayNodeId, max, LEASE_SEGUNDOS],
    );
  });
}

/** Progresso ou falha de um job. `renewLease` renova o prazo do corte longo. */
export async function reportarStatusDoJob(
  relayNodeId: string,
  jobId: string,
  dados: {
    status: "cutting" | "processing" | "uploading" | "failed";
    error?: string | null;
    errorCode?: string | null;
    coverageRatio?: number | null;
    renewLease?: boolean;
  },
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE clip_job
        SET status = $3::job_status,
            error = COALESCE($4, error),
            error_code = COALESCE($5, error_code),
            coverage_ratio = COALESCE($6, coverage_ratio),
            lease_expires_at = CASE
              WHEN $7::boolean AND $3 <> 'failed'
                THEN now() + make_interval(secs => $8::float8)
              ELSE lease_expires_at END
      WHERE id = $2 AND relay_node_id = $1
      RETURNING id`,
    [
      relayNodeId,
      jobId,
      dados.status,
      dados.error ?? null,
      dados.errorCode ?? null,
      dados.coverageRatio ?? null,
      dados.renewLease ?? true,
      LEASE_SEGUNDOS,
    ],
  );
  // Espelha o estado no clipe, para que a tela do atleta não fique em `pending`
  // enquanto o corte acontece.
  if (linhas[0] && dados.status !== "failed") {
    await query(
      `UPDATE clip SET status = $2::clip_status
         WHERE id = (SELECT clip_id FROM clip_job WHERE id = $1)
           AND status IN ('pending','cutting','processing','uploading')`,
      [jobId, dados.status],
    );
  }
  return Boolean(linhas[0]);
}

export type ClipeParaUpload = {
  clip_id: string;
  partner_id: string;
  court_id: string;
  camera_id: string;
  triggered_at: Date;
  timezone: string;
  status: string;
  watermarked_object_key: string | null;
  thumbnail_object_key: string | null;
};

export async function clipeParaUpload(
  relayNodeId: string,
  clipId: string,
): Promise<ClipeParaUpload | null> {
  const linhas = await query<ClipeParaUpload>(
    `SELECT c.id AS clip_id, c.partner_id, c.court_id, c.camera_id,
            c.triggered_at, p.timezone, c.status::text AS status,
            c.watermarked_object_key, c.thumbnail_object_key
       FROM clip c
       JOIN clip_job j ON j.clip_id = c.id
       JOIN partner p  ON p.id = c.partner_id
      WHERE c.id = $1 AND j.relay_node_id = $2`,
    [clipId, relayNodeId],
  );
  return linhas[0] ?? null;
}

export type ArquivoConfirmado = {
  role: "watermarked" | "source" | "thumbnail" | "preview" | "og";
  objectKey: string;
  sizeBytes: number;
  sha256?: string | null;
};

/**
 * Fecha o clipe. `coverageRatio` decide o estado final:
 *
 *   1.0                    → `ready`
 *   entre min e 1.0        → `partial`, e o app diz honestamente quantos
 *                            segundos faltaram e por quê
 *   abaixo de min (0,6)    → `failed` com `no_coverage`, e o gatilho vira
 *                            evidência de uplink ruim no painel do parceiro
 *
 * Idempotente: reconfirmar devolve o estado atual sem efeito.
 */
export async function confirmarClipe(
  relayNodeId: string,
  clipId: string,
  dados: {
    arquivos: ArquivoConfirmado[];
    coverageRatio: number;
    actualFrom?: string | null;
    actualTo?: string | null;
    durationSeconds?: number | null;
    width?: number | null;
    height?: number | null;
    fps?: number | null;
    codec?: string | null;
    watermarkApplied?: boolean;
    watermarkVersion?: number | null;
    /**
     * QUAL marca saiu no clipe: `partner`, `default` ou `default-fallback`.
     *
     * O terceiro é o que justifica a coluna: o parceiro TEM logo, o relay não
     * conseguiu baixá-lo e entregou com a nossa marca. Sem isso, uma URL
     * expirada ou uma política de bucket errada produz clipes sem a marca da
     * arena — a única coisa que a arena vê do produto — e ninguém descobre até
     * alguém reclamar.
     */
    watermarkKind?: string | null;
    cutMs?: number | null;
    encodeMs?: number | null;
  },
): Promise<{ status: string } | null> {
  const porPapel = (p: ArquivoConfirmado["role"]) =>
    dados.arquivos.find((a) => a.role === p) ?? null;

  const principal = porPapel("watermarked") ?? porPapel("source");

  return transacao(async (q) => {
    const pertence = await q<{ min_coverage_ratio: string }>(
      `SELECT cam.min_coverage_ratio
         FROM clip c
         JOIN clip_job j ON j.clip_id = c.id
         JOIN camera cam ON cam.id = c.camera_id
        WHERE c.id = $1 AND j.relay_node_id = $2
        FOR UPDATE OF c`,
      [clipId, relayNodeId],
    );
    if (!pertence[0]) return null;

    const minimo = Number(pertence[0].min_coverage_ratio);
    const status =
      dados.coverageRatio >= 1 ? "ready" : dados.coverageRatio >= minimo ? "partial" : "failed";

    const linhas = await q<{ status: string }>(
      `UPDATE clip SET
          status = $2::clip_status,
          coverage_ratio = $3,
          started_at = COALESCE($4::timestamptz, started_at),
          ended_at   = COALESCE($5::timestamptz, ended_at),
          duration_seconds = COALESCE($6, duration_seconds),
          width = COALESCE($7, width), height = COALESCE($8, height),
          fps = COALESCE($9, fps), codec = COALESCE($10, codec),
          watermarked_object_key = COALESCE($11, watermarked_object_key),
          source_object_key      = COALESCE($12, source_object_key),
          thumbnail_object_key   = COALESCE($13, thumbnail_object_key),
          preview_object_key     = COALESCE($14, preview_object_key),
          og_object_key          = COALESCE($15, og_object_key),
          size_bytes      = COALESCE($16, size_bytes),
          checksum_sha256 = COALESCE($17, checksum_sha256),
          watermark_applied = COALESCE($18, watermark_applied),
          watermark_version = COALESCE($19, watermark_version),
          watermark_kind    = COALESCE($20, watermark_kind),
          failure_reason = CASE WHEN $2 = 'failed' THEN 'no_coverage' ELSE failure_reason END
        WHERE id = $1
        RETURNING status::text AS status`,
      [
        clipId,
        status,
        dados.coverageRatio,
        dados.actualFrom ?? null,
        dados.actualTo ?? null,
        dados.durationSeconds ?? null,
        dados.width ?? null,
        dados.height ?? null,
        dados.fps ?? null,
        dados.codec ?? null,
        porPapel("watermarked")?.objectKey ?? null,
        porPapel("source")?.objectKey ?? null,
        porPapel("thumbnail")?.objectKey ?? null,
        porPapel("preview")?.objectKey ?? null,
        porPapel("og")?.objectKey ?? null,
        principal?.sizeBytes ?? null,
        principal?.sha256 ?? null,
        dados.watermarkApplied ?? null,
        dados.watermarkVersion ?? null,
        dados.watermarkKind ?? null,
      ],
    );

    await q(
      `UPDATE clip_job
          SET status = $2::job_status,
              coverage_ratio = $3,
              cut_ms = COALESCE($4, cut_ms),
              encode_ms = COALESCE($5, encode_ms),
              lease_expires_at = NULL
        WHERE clip_id = $1`,
      [
        clipId,
        status === "failed" ? "failed" : "done",
        dados.coverageRatio,
        dados.cutMs ?? null,
        dados.encodeMs ?? null,
      ],
    );

    return linhas[0] ?? null;
  });
}

/**
 * `POST /relay/health` — 1 requisição por minuto por relay.
 *
 * SUBSTITUI INTEGRALMENTE o heartbeat de dispositivo do desenho anterior. Não há
 * mais equipamento nosso na arena para reportar saúde, e a saúde da câmera passa
 * a ser derivada do PRÓPRIO STREAM — um sinal melhor, porque mede o que importa
 * (existe vídeo gravado?) em vez do que um agente diz sobre si mesmo.
 */
export async function registrarSaudeDoRelay(
  relayNodeId: string,
  dados: {
    agentVersion?: string | null;
    diskTotalBytes?: number | null;
    diskFreeBytes?: number | null;
    pruningActive?: boolean;
    cpuLoad1m?: number | null;
    cpuStealPercent?: number | null;
    recorderCpuPercent?: number | null;
    workerCpuPercent?: number | null;
    indexWalBytes?: number | null;
    indexDbBytes?: number | null;
    jobsInFlight?: number | null;
    jobSlots?: number | null;
    jobsFailed1h?: number | null;
    p50CutMs?: number | null;
    p50EncodeMs?: number | null;
    cameras?: Array<{
      cameraId: string;
      recorderUp: boolean;
      lastSegmentAt?: string | null;
      coverage1h?: number | null;
      coverage24h?: number | null;
      bitrateKbps?: number | null;
      gbPerDay?: number | null;
      longSegments24h?: number | null;
      longestGapSeconds24h?: number | null;
      sessionsLast10m?: number | null;
      diskBytes?: number | null;
      recordedUntil?: string | null;
    }>;
  },
): Promise<void> {
  await transacao(async (q) => {
    await q(
      `INSERT INTO relay_health (
         relay_node_id, disk_total_bytes, disk_free_bytes, pruning_active,
         cpu_load_1m, cpu_steal_percent, recorder_cpu_percent, worker_cpu_percent,
         index_wal_bytes, index_db_bytes, jobs_in_flight, job_slots, jobs_failed_1h,
         p50_cut_ms, p50_encode_ms, agent_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        relayNodeId,
        dados.diskTotalBytes ?? null,
        dados.diskFreeBytes ?? null,
        dados.pruningActive ?? false,
        dados.cpuLoad1m ?? null,
        dados.cpuStealPercent ?? null,
        dados.recorderCpuPercent ?? null,
        dados.workerCpuPercent ?? null,
        dados.indexWalBytes ?? null,
        dados.indexDbBytes ?? null,
        dados.jobsInFlight ?? 0,
        dados.jobSlots ?? 2,
        dados.jobsFailed1h ?? 0,
        dados.p50CutMs ?? null,
        dados.p50EncodeMs ?? null,
        dados.agentVersion ?? null,
      ],
    );

    await q(
      `UPDATE relay_node SET
         last_seen_at = now(),
         agent_version = COALESCE($2, agent_version),
         disk_total_bytes = COALESCE($3, disk_total_bytes),
         disk_free_bytes = COALESCE($4, disk_free_bytes),
         pruning_active = COALESCE($5, pruning_active),
         cpu_steal_percent = COALESCE($6, cpu_steal_percent),
         index_wal_bytes = COALESCE($7, index_wal_bytes),
         jobs_in_flight = COALESCE($8, jobs_in_flight)
       WHERE id = $1`,
      [
        relayNodeId,
        dados.agentVersion ?? null,
        dados.diskTotalBytes ?? null,
        dados.diskFreeBytes ?? null,
        dados.pruningActive ?? null,
        dados.cpuStealPercent ?? null,
        dados.indexWalBytes ?? null,
        dados.jobsInFlight ?? null,
      ],
    );

    for (const c of dados.cameras ?? []) {
      // A amostra só entra se a câmera for DESTE relay: o corpo vem da rede, e
      // sem este filtro um relay poderia escrever a saúde da câmera de outro.
      const pertence = await q<{ id: string }>(
        `SELECT id FROM camera WHERE id = $1 AND relay_node_id = $2`,
        [c.cameraId, relayNodeId],
      );
      if (!pertence[0]) continue;

      await q(
        `INSERT INTO camera_health (
           camera_id, relay_node_id, recorder_up, last_segment_at,
           coverage_1h, coverage_24h, bitrate_kbps, gb_per_day,
           long_segments_24h, longest_gap_seconds_24h, sessions_last_10m, disk_bytes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          c.cameraId,
          relayNodeId,
          c.recorderUp,
          c.lastSegmentAt ?? null,
          c.coverage1h ?? null,
          c.coverage24h ?? null,
          c.bitrateKbps ?? null,
          c.gbPerDay ?? null,
          c.longSegments24h ?? 0,
          c.longestGapSeconds24h ?? null,
          c.sessionsLast10m ?? 0,
          c.diskBytes ?? null,
        ],
      );

      // O estado derivado do STREAM, não de um agente. `degraded` abaixo de 0,90
      // porque é aí que a frota do Sentinela mostrou problema real, não ruído.
      //
      // ─── A CÂMERA QUE NUNCA CONECTOU É `down`, NÃO `degraded` (A-14) ─────
      //
      // Com o gravador de pé apontado para uma câmera que nunca transmitiu, a
      // cobertura chega 0 e o CASE antigo caía em `degraded`. `degraded` se lê
      // como "grava, mas com buracos" — a ação é no uplink da arena. A verdade
      // era "nunca instalou", e a ação é configurar a câmera. Duas ações
      // opostas atrás do mesmo rótulo.
      //
      // A tela já sabia a diferença (`lib/saude-visao.ts` devolve `aguardando`
      // quando `last_segment_at` é nulo, e continua devolvendo). Quem mentia
      // era a COLUNA — e a coluna é o que um alerta futuro vai ler, não a tela.
      //
      // `down` e não `provisioned`: `provisioned` é o estado de nascimento, e
      // reescrevê-lo a cada heartbeat apagaria a diferença entre "cadastrada
      // agora" e "cadastrada há três semanas e nunca ligou". `down` é o que um
      // alerta tem de ver, porque é o que ela é: não está gravando.
      await q(
        `UPDATE camera SET
           last_segment_at = COALESCE($2::timestamptz, last_segment_at),
           coverage_24h = COALESCE($3, coverage_24h),
           observed_bitrate_kbps = COALESCE($4, observed_bitrate_kbps),
           long_segments_24h = COALESCE($5, long_segments_24h),
           recorded_until = COALESCE($6::timestamptz, recorded_until),
           first_connected_at = COALESCE(first_connected_at, $2::timestamptz),
           status = CASE
             WHEN NOT enabled THEN 'disabled'::camera_status
             WHEN $2::timestamptz IS NULL AND last_segment_at IS NULL
               THEN 'down'::camera_status
             WHEN $7::boolean IS NOT TRUE THEN 'down'::camera_status
             WHEN $3 IS NOT NULL AND $3 < 0.90 THEN 'degraded'::camera_status
             ELSE 'recording'::camera_status END
         WHERE id = $1`,
        [
          c.cameraId,
          c.lastSegmentAt ?? null,
          c.coverage24h ?? null,
          c.bitrateKbps ?? null,
          c.longSegments24h ?? null,
          c.recordedUntil ?? null,
          c.recorderUp,
        ],
      );
    }
  });
}

/** Quantos jobs esperam este relay. Vai na resposta do health, para ele saber
 *  se vale buscar a fila antes do próximo ciclo. */
export async function jobsPendentes(relayNodeId: string): Promise<number> {
  const linhas = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM clip_job
      WHERE relay_node_id = $1 AND status = 'pending' AND expires_at > now()`,
    [relayNodeId],
  );
  return Number(linhas[0]?.n ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// O PROVISIONAMENTO DE CÂMERA, PELO PAINEL DO PARCEIRO
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── POR QUE ISTO MORA AQUI E NÃO EM `painel-cameras.ts` ───────────────────
//
// A regra de projeção de `modelo-de-dados.md` §7.3 diz que a chave de
// transmissão só aparece neste arquivo, e o job `disciplina` do CI confere isso
// com um grep. A tela de detalhe da câmera PRECISA da chave — é ela que o
// instalador digita no app da câmera —, então a escolha é entre abrir exceção no
// grep ou trazer as consultas para o arquivo que já é a exceção.
//
// Trazer para cá é melhor: o grep continua valendo sem cláusula nova (uma
// exceção "menos uma coisa" é a que ninguém lembra de reavaliar), e quem for
// auditar onde a chave vaza continua tendo UM arquivo para ler.
//
// ─── O QUE MUDA NO MUNDO FÍSICO ────────────────────────────────────────────
//
// Cadastrar câmera aloca uma PORTA do relay, e a porta fica digitada dentro do
// equipamento na quadra. Rotacionar a chave DERRUBA a câmera instalada até
// alguém digitar a nova. As duas telas dizem isso antes de agir; estas funções
// garantem que, uma vez ditas, aconteçam inteiras ou não aconteçam.

export type CameraDoPainelRow = {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  court_id: string | null;
  court: string | null;
  court_slug: string | null;
  ingest_kind: string;
  rtmp_port: number | null;
  /** SEGREDO. Projetado só aqui, e só para admin da arena. */
  rtmp_key: string | null;
  key_version: number;
  key_rotated_at: Date | null;
  relay_node_id: string;
  rtmp_host: string;
  relay_status: string;
  width: number;
  height: number;
  fps: number;
  target_bitrate_kbps: number;
  observed_bitrate_kbps: string | null;
  gop_seconds: string;
  segment_seconds: string;
  last_segment_at: Date | null;
  since_seconds: number | null;
  first_connected_at: Date | null;
  coverage_24h: string | null;
  coverage_1h: string | null;
  long_segments_24h: number;
  recorded_until: Date | null;
  amostra_em: Date | null;
  lances_7d: number;
};

/**
 * A câmera com o que o instalador precisa para configurá-la.
 *
 * O `partner_id` na cláusula WHERE não é redundante com o `exigirAdminDaArena`
 * da página: sem ele, um id de câmera de outra arena (que é texto curto e
 * adivinhável — `arenavascoq1`) devolveria a chave de transmissão daquela arena
 * para um admin desta.
 */
export async function cameraDoPainel(
  partnerId: string,
  cameraId: string,
): Promise<CameraDoPainelRow | null> {
  const linhas = await query<CameraDoPainelRow>(
    `SELECT cam.id, cam.name, cam.enabled, cam.status::text AS status,
            cam.court_id, ct.name AS court, ct.slug::text AS court_slug,
            cam.ingest_kind::text AS ingest_kind,
            cam.rtmp_port, cam.rtmp_key, cam.key_version, cam.key_rotated_at,
            cam.relay_node_id, r.rtmp_host, r.status::text AS relay_status,
            cam.width, cam.height, cam.fps, cam.target_bitrate_kbps,
            cam.observed_bitrate_kbps, cam.gop_seconds, cam.segment_seconds,
            cam.last_segment_at,
            EXTRACT(EPOCH FROM (now() - cam.last_segment_at))::int AS since_seconds,
            cam.first_connected_at, cam.coverage_24h, cam.long_segments_24h,
            cam.recorded_until,
            h.coverage_1h, h.received_at AS amostra_em,
            COALESCE(l.total, 0)::int AS lances_7d
       FROM camera cam
       JOIN relay_node r ON r.id = cam.relay_node_id
       LEFT JOIN court ct ON ct.id = cam.court_id
       LEFT JOIN LATERAL (
         SELECT ch.coverage_1h, ch.received_at
           FROM camera_health ch
          WHERE ch.camera_id = cam.id
          ORDER BY ch.received_at DESC
          LIMIT 1
       ) h ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS total FROM clip c
          WHERE c.camera_id = cam.id AND c.deleted_at IS NULL
            AND c.status IN ('ready','partial')
            AND c.triggered_at > now() - interval '7 days'
       ) l ON true
      WHERE cam.id = $2 AND cam.partner_id = $1 AND cam.deleted_at IS NULL`,
    [partnerId, cameraId],
  );
  return linhas[0] ?? null;
}

export type RelayDisponivelRow = {
  id: string;
  rtmp_host: string;
  status: string;
  port_range_start: number;
  port_range_end: number;
  port_range_next: number;
  max_cameras: number;
  cameras: number;
};

/**
 * Os relays onde a próxima câmera pode entrar.
 *
 * No piloto há um só. `provisioning` entra na lista porque é exatamente o estado
 * em que a primeira câmera de uma arena nova é cadastrada — exigir `active`
 * faria o cadastro só funcionar depois do primeiro heartbeat, e o heartbeat
 * depende de haver câmera.
 */
export async function relaysDisponiveis(): Promise<RelayDisponivelRow[]> {
  return query<RelayDisponivelRow>(
    `SELECT r.id, r.rtmp_host, r.status::text AS status,
            r.port_range_start, r.port_range_end, r.port_range_next, r.max_cameras,
            (SELECT count(*)::int FROM camera c
              WHERE c.relay_node_id = r.id AND c.deleted_at IS NULL) AS cameras
       FROM relay_node r
      WHERE r.status IN ('active','provisioning')
      ORDER BY (r.port_range_end - r.port_range_next) DESC, r.id`,
  );
}

/** Sinaliza "relay sem vaga" desfazendo a transação, para não queimar a porta. */
class RelayCheio extends Error {
  constructor() {
    super("relay sem vaga");
    this.name = "RelayCheio";
  }
}

export type ResultadoDeCadastro =
  | { ok: true; cameraId: string; porta: number; chave: string; rtmpHost: string }
  | { ok: false; motivo: "faixa-esgotada" | "relay-cheio" | "quadra" | "id-em-uso" };

/**
 * Cadastra uma câmera alocando a PRÓXIMA PORTA LIVRE do relay.
 *
 * ─── A TRAVA É UM `UPDATE ... RETURNING`, NÃO UM `SELECT` E DEPOIS UM `UPDATE`
 *
 * Duas câmeras cadastradas ao mesmo tempo (duas abas, dois operadores durante a
 * instalação) leriam o mesmo `port_range_next` e receberiam a MESMA porta. O
 * índice único `camera_relay_port_key` recusaria a segunda — depois de já ter
 * mostrado a porta na tela para quem estava com a escada na mão.
 *
 * `UPDATE relay_node SET port_range_next = port_range_next + 1 ... RETURNING`
 * resolve porque o próprio UPDATE trava a linha do relay: o segundo cadastro
 * espera o COMMIT do primeiro e recebe a porta seguinte.
 *
 * O contador é MONOTÔNICO e não procura buraco. A 0004 explica por quê:
 * reaproveitar a porta de uma câmera removida faz uma câmera antiga, mal
 * desconfigurada no app do cliente, empurrar vídeo para o lugar de outra — e o
 * vídeo errado aparece na quadra errada, possivelmente de outra arena.
 */
export async function cadastrarCamera(
  partnerId: string,
  d: {
    cameraId: string;
    courtId: string;
    nome: string;
    relayNodeId: string;
    chave: string;
    targetBitrateKbps?: number;
  },
): Promise<ResultadoDeCadastro> {
  return transacao(async (q): Promise<ResultadoDeCadastro> => {
    const quadra = await q<{ id: string }>(
      `SELECT id FROM court
        WHERE id = $1 AND partner_id = $2 AND deleted_at IS NULL`,
      [d.courtId, partnerId],
    );
    if (!quadra[0]) return { ok: false, motivo: "quadra" };

    const jaExiste = await q<{ id: string }>(`SELECT id FROM camera WHERE id = $1`, [d.cameraId]);
    if (jaExiste[0]) return { ok: false, motivo: "id-em-uso" };

    const relay = await q<{
      rtmp_host: string;
      porta: number;
      max_cameras: number;
      cameras: number;
    }>(
      `UPDATE relay_node r
          SET port_range_next = GREATEST(r.port_range_next, r.port_range_start) + 1
        WHERE r.id = $1
          AND GREATEST(r.port_range_next, r.port_range_start) <= r.port_range_end
        RETURNING r.rtmp_host,
                  r.port_range_next - 1 AS porta,
                  r.max_cameras,
                  (SELECT count(*)::int FROM camera c
                    WHERE c.relay_node_id = r.id AND c.deleted_at IS NULL) AS cameras`,
      [d.relayNodeId],
    );
    const alocado = relay[0];
    if (!alocado) return { ok: false, motivo: "faixa-esgotada" };
    if (alocado.cameras >= alocado.max_cameras) {
      // O `throw` desfaz a transação inteira, então a porta NÃO é consumida.
      // Devolver `{ok:false}` aqui deixaria um buraco permanente na faixa a
      // cada tentativa contra um relay cheio.
      throw new RelayCheio();
    }

    await q(
      `INSERT INTO camera (id, partner_id, court_id, relay_node_id, name,
                           ingest_kind, rtmp_port, rtmp_key,
                           width, height, fps, target_bitrate_kbps,
                           origin_lag_ms, retention_days, prune_after_hours,
                           min_coverage_ratio, status, enabled, key_version)
       VALUES ($1,$2,$3,$4,$5,'rtmp_push',$6,$7,1920,1080,30,$8,3000,7,6,0.60,
               'provisioned',true,1)`,
      [
        d.cameraId,
        partnerId,
        d.courtId,
        d.relayNodeId,
        d.nome,
        alocado.porta,
        d.chave,
        d.targetBitrateKbps ?? 3000,
      ],
    );

    return {
      ok: true,
      cameraId: d.cameraId,
      porta: alocado.porta,
      chave: d.chave,
      rtmpHost: alocado.rtmp_host,
    };
  }).catch((err: unknown): ResultadoDeCadastro => {
    if (err instanceof RelayCheio) return { ok: false, motivo: "relay-cheio" };
    throw err;
  });
}

/**
 * Gera uma chave de transmissão nova para a câmera.
 *
 * ─── ISTO DERRUBA A CÂMERA ATÉ ALGUÉM IR À QUADRA ──────────────────────────
 *
 * A chave está digitada dentro do equipamento. Trocá-la faz o relay recusar o
 * `push` da câmera antiga: a gravação PARA, e o painel mostra "aguardando
 * relay" em minutos. É o comportamento certo (é para isso que se rotaciona uma
 * chave vazada), mas a tela precisa dizê-lo ANTES, e `key_version` existe para
 * que o suporte consiga correlacionar a queda com o clique.
 *
 * O `status` volta para `provisioned` de propósito: `lerSaudeDaCamera` lê isso
 * como "aguardando relay", que é o estado verdadeiro — configuração pendente,
 * não queda.
 */
export async function rotacionarChaveDaCamera(
  partnerId: string,
  cameraId: string,
  novaChave: string,
): Promise<{ chave: string; versao: number } | null> {
  const linhas = await query<{ rtmp_key: string; key_version: number }>(
    `UPDATE camera
        SET rtmp_key = $3,
            key_version = key_version + 1,
            key_rotated_at = now(),
            status = CASE WHEN enabled THEN 'provisioned'::camera_status ELSE status END
      WHERE id = $2 AND partner_id = $1 AND deleted_at IS NULL
      RETURNING rtmp_key, key_version`,
    [partnerId, cameraId, novaChave],
  );
  const l = linhas[0];
  return l ? { chave: l.rtmp_key, versao: l.key_version } : null;
}

/** Renomeia a câmera. O id nunca muda: ele é diretório em disco no relay. */
export async function renomearCamera(
  partnerId: string,
  cameraId: string,
  nome: string,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE camera SET name = $3
      WHERE id = $2 AND partner_id = $1 AND deleted_at IS NULL RETURNING id`,
    [partnerId, cameraId, nome],
  );
  return Boolean(linhas[0]);
}

/** Liga/desliga a câmera. Desligada, ela some da lista que o relay grava. */
export async function definirCameraAtiva(
  partnerId: string,
  cameraId: string,
  ativa: boolean,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE camera
        SET enabled = $3,
            status = CASE WHEN $3 THEN 'provisioned'::camera_status
                          ELSE 'disabled'::camera_status END
      WHERE id = $2 AND partner_id = $1 AND deleted_at IS NULL
      RETURNING id`,
    [partnerId, cameraId, ativa],
  );
  return Boolean(linhas[0]);
}

export type SerieDeCoberturaRow = {
  hora: string;
  cobertura: string | null;
  bitrate: string | null;
};

/**
 * Cobertura hora a hora nas últimas 24 h — o gráfico do detalhe da câmera.
 *
 * Agregado por hora e não amostra a amostra: `camera_health` recebe uma linha
 * por minuto por câmera, e 1.440 pontos num gráfico de 300 px não informam nada
 * que a média horária não informe.
 */
export async function coberturaDaCamera(
  partnerId: string,
  cameraId: string,
): Promise<SerieDeCoberturaRow[]> {
  return query<SerieDeCoberturaRow>(
    `SELECT to_char(date_trunc('hour', ch.received_at AT TIME ZONE p.timezone), 'HH24') || 'h'
              AS hora,
            round(avg(ch.coverage_1h), 3)::text  AS cobertura,
            round(avg(ch.bitrate_kbps), 0)::text AS bitrate
       FROM camera_health ch
       JOIN camera cam ON cam.id = ch.camera_id
       JOIN partner p  ON p.id = cam.partner_id
      WHERE ch.camera_id = $2 AND cam.partner_id = $1
        AND ch.received_at > now() - interval '24 hours'
      GROUP BY date_trunc('hour', ch.received_at AT TIME ZONE p.timezone)
      ORDER BY date_trunc('hour', ch.received_at AT TIME ZONE p.timezone)`,
    [partnerId, cameraId],
  );
}
