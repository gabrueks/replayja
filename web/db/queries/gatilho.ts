import { query, transacao } from "@/lib/db";
import { emCooldown, montarJanela } from "@/lib/janela-corte";
import { bloqueioEmVigor, type Bloqueio } from "./painel-regras";
import {
  CLIP_RETENTION_DIAS_PADRAO,
  COOLDOWN_QUADRA_MS,
  JOB_TTL_MINUTOS,
  POST_ROLL_PADRAO_S,
  PRE_ROLL_PADRAO_S,
} from "@/lib/limites";

// O GATILHO — `api/README.md` §4.
//
// Os dois caminhos (botão físico no caminho, botão virtual com sessão) terminam
// na mesma função: criar `trigger_event` + `clip` + `clip_job` ATOMICAMENTE.
// A atomicidade é a única razão pela qual a fila mora no Postgres em vez de um
// broker — "criar o clipe e enfileirar o corte" não pode acontecer pela metade.

export type ContextoDaQuadra = {
  partner_id: string;
  court_id: string;
  court_name: string;
  timezone: string;
  clip_retention_days: number;
  camera_id: string | null;
  camera_origin_lag_ms: number;
  camera_last_segment_at: Date | null;
  relay_node_id: string | null;
  relay_status: string | null;
  ultimo_gatilho_at: Date | null;
};

/**
 * Tudo o que o gatilho precisa saber sobre a quadra, numa consulta só.
 *
 * Inclui `ultimo_gatilho_at` porque o COOLDOWN é uma checagem de coluna, não um
 * contador de rate limit — é barato e é exatamente a semântica desejada. A
 * câmera escolhida é a primeira habilitada da quadra (no piloto há uma por
 * quadra; quando houver duas, a regra de escolha vira decisão de produto).
 */
export async function contextoDaQuadra(courtId: string): Promise<ContextoDaQuadra | null> {
  const linhas = await query<ContextoDaQuadra>(
    `SELECT ct.partner_id, ct.id AS court_id, ct.name AS court_name,
            p.timezone, p.clip_retention_days,
            cam.id AS camera_id,
            COALESCE(cam.origin_lag_ms, 3000) AS camera_origin_lag_ms,
            cam.last_segment_at AS camera_last_segment_at,
            cam.relay_node_id,
            r.status::text AS relay_status,
            (SELECT max(te.arrival_at) FROM trigger_event te
              WHERE te.court_id = ct.id AND te.outcome = 'accepted') AS ultimo_gatilho_at
       FROM court ct
       JOIN partner p ON p.id = ct.partner_id
       LEFT JOIN LATERAL (
         SELECT c.id, c.origin_lag_ms, c.last_segment_at, c.relay_node_id
           FROM camera c
          WHERE c.court_id = ct.id AND c.enabled AND c.deleted_at IS NULL
          ORDER BY c.created_at
          LIMIT 1
       ) cam ON true
       LEFT JOIN relay_node r ON r.id = cam.relay_node_id
      WHERE ct.id = $1 AND ct.active AND ct.deleted_at IS NULL
        AND p.deleted_at IS NULL AND p.status IN ('active','pending')`,
    [courtId],
  );
  return linhas[0] ?? null;
}

export type BotaoRow = {
  id: string;
  partner_id: string;
  court_id: string;
  label: string;
  active: boolean;
  wake_latency_ms: number;
  last_event_counter: string | null;
};

/**
 * O botão pelo hash do token do caminho.
 *
 * O segredo na URL é fraco — exatamente como a chave RTMP, e pelo mesmo motivo: o
 * dispositivo do outro lado não sabe fazer melhor. A defesa é dano baixo (alguém
 * dispara um clipe numa quadra pública), cooldown de 8 s, rate limit e revogação
 * em um clique. Nunca projeta `token_hash`.
 */
export async function botaoPorTokenHash(tokenHash: string): Promise<BotaoRow | null> {
  const linhas = await query<BotaoRow>(
    `SELECT id, partner_id, court_id, label, active, wake_latency_ms,
            last_event_counter::text AS last_event_counter
       FROM button WHERE token_hash = $1`,
    [tokenHash],
  );
  return linhas[0] ?? null;
}

/** Registra que o botão deu sinal, mesmo quando o gatilho é RECUSADO. É o que
 *  permite diagnosticar "o botão está vivo mas nada aparece". */
export async function registrarSinalDoBotao(
  buttonId: string,
  dados: { batteryPercent?: number | null; eventCounter?: number | null },
): Promise<void> {
  await query(
    `UPDATE button SET
       last_signal_at = now(),
       battery_percent = COALESCE($2, battery_percent),
       battery_reported_at = CASE WHEN $2 IS NULL THEN battery_reported_at ELSE now() END,
       last_event_counter = COALESCE($3, last_event_counter)
     WHERE id = $1`,
    [buttonId, dados.batteryPercent ?? null, dados.eventCounter ?? null],
  );
}

export type ResultadoDoGatilho =
  | {
      aceito: true;
      triggerEventId: string;
      clipId: string;
      clipJobId: string;
      relayNodeId: string;
      pressEstimatedAt: Date;
      deliverFrom: Date;
      deliverTo: Date;
      buttonWakeLatencyMs: number;
      cameraOriginLagMs: number;
    }
  | {
      aceito: false;
      motivo:
        | "rejected_cooldown"
        | "rejected_no_coverage"
        | "rejected_camera_unknown"
        | "rejected_button_revoked"
        | "rejected_relay_down"
        | "rejected_blackout";
      triggerEventId: string | null;
      /** Presente quando a chave de idempotência já tinha sido usada. */
      duplicado?: { triggerEventId: string; clipId: string | null };
      /** Preenchido só em `rejected_blackout` — o rótulo do horário bloqueado. */
      bloqueio?: { id: string; label: string | null };
    };

export type PedidoDeGatilho = {
  courtId: string;
  source: "physical_button" | "virtual_button" | "api";
  buttonId?: string | null;
  requestedByUserId?: string | null;
  idempotencyKey?: string | null;
  buttonWakeLatencyMs?: number;
  preRollSeconds?: number;
  postRollSeconds?: number;
  userAgent?: string | null;
  sourceIpHash?: string | null;
  /** Injetável para teste; em produção é sempre o relógio do servidor. */
  arrivalAt?: Date;
};

/**
 * Cria `trigger_event` + `clip` + `clip_job` numa transação.
 *
 * ─── A ORDEM DAS RECUSAS, E POR QUE ELA IMPORTA ────────────────────────────
 *
 * Cooldown primeiro (é a checagem mais barata e a mais comum), depois o HORÁRIO
 * BLOQUEADO, depois câmera, depois cobertura, depois relay. O bloqueio vem antes
 * da câmera porque é uma decisão de POLÍTICA e não de infraestrutura: durante a
 * escolinha a câmera pode estar perfeita e ainda assim não pode haver clipe, e
 * dizer "câmera fora do ar" ali mandaria o suporte da arena caçar um defeito
 * inexistente. Toda recusa AINDA GRAVA um `trigger_event` com
 * o `outcome` — é o que vira evidência no painel do parceiro ("o botão foi
 * apertado 14 vezes e a câmera estava fora do ar"). Um gatilho recusado que não
 * deixa rastro é um chamado de suporte sem resposta.
 *
 * O `arrival_at` é `clock_timestamp()` e não `now()`: dentro de uma transação
 * `now()` devolve o início dela, e para um carimbo que é a FONTE DA VERDADE DO
 * TEMPO do produto isso seria errado por construção.
 */
export async function criarGatilho(p: PedidoDeGatilho): Promise<ResultadoDoGatilho> {
  const agora = p.arrivalAt ?? new Date();

  return transacao(async (q) => {
    // Idempotência (camada 1 de `api/README.md` §5): um botão que reenvia porque
    // não recebeu o `202` não pode virar dois clipes.
    if (p.idempotencyKey) {
      const ja = await q<{ id: string; clip_id: string | null }>(
        `SELECT id, clip_id FROM trigger_event WHERE idempotency_key = $1`,
        [p.idempotencyKey],
      );
      if (ja[0]) {
        return {
          aceito: false,
          motivo: "rejected_cooldown",
          triggerEventId: ja[0].id,
          duplicado: { triggerEventId: ja[0].id, clipId: ja[0].clip_id },
        };
      }
    }

    const ctx = (
      await q<ContextoDaQuadra>(
        `SELECT ct.partner_id, ct.id AS court_id, ct.name AS court_name,
                p.timezone, p.clip_retention_days,
                cam.id AS camera_id,
                COALESCE(cam.origin_lag_ms, 3000) AS camera_origin_lag_ms,
                cam.last_segment_at AS camera_last_segment_at,
                cam.relay_node_id,
                r.status::text AS relay_status,
                (SELECT max(te.arrival_at) FROM trigger_event te
                  WHERE te.court_id = ct.id AND te.outcome = 'accepted') AS ultimo_gatilho_at
           FROM court ct
           JOIN partner p ON p.id = ct.partner_id
           LEFT JOIN LATERAL (
             SELECT c.id, c.origin_lag_ms, c.last_segment_at, c.relay_node_id
               FROM camera c
              WHERE c.court_id = ct.id AND c.enabled AND c.deleted_at IS NULL
              ORDER BY c.created_at LIMIT 1
           ) cam ON true
           LEFT JOIN relay_node r ON r.id = cam.relay_node_id
          WHERE ct.id = $1 AND ct.active AND ct.deleted_at IS NULL
            AND p.deleted_at IS NULL AND p.status IN ('active','pending')
          FOR UPDATE OF ct`,
        [p.courtId],
      )
    )[0];

    if (!ctx) {
      return { aceito: false, motivo: "rejected_camera_unknown", triggerEventId: null };
    }

    const wake = p.buttonWakeLatencyMs ?? 0;
    const janela = montarJanela({
      arrivalAt: agora,
      buttonWakeLatencyMs: wake,
      cameraOriginLagMs: ctx.camera_origin_lag_ms,
      preRollSeconds: p.preRollSeconds ?? PRE_ROLL_PADRAO_S,
      postRollSeconds: p.postRollSeconds ?? POST_ROLL_PADRAO_S,
    });

    const gravaEvento = async (outcome: string, clipId: string | null, clipJobId: string | null) => {
      const r = await q<{ id: string }>(
        `INSERT INTO trigger_event (
           partner_id, court_id, camera_id, button_id, source, requested_by_user_id,
           idempotency_key, arrival_at, press_estimated_at,
           button_wake_latency_ms_applied, camera_origin_lag_ms_applied,
           deliver_from, deliver_to, cut_from, cut_to, outcome,
           clip_id, clip_job_id, user_agent, source_ip_hash
         ) VALUES ($1,$2,$3,$4,$5::trigger_source,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                   $16::trigger_outcome,$17,$18,$19,$20)
         RETURNING id`,
        [
          ctx.partner_id,
          ctx.court_id,
          ctx.camera_id,
          p.buttonId ?? null,
          p.source,
          p.requestedByUserId ?? null,
          p.idempotencyKey ?? null,
          agora,
          janela.pressEstimatedAt,
          wake,
          ctx.camera_origin_lag_ms,
          janela.deliverFrom,
          janela.deliverTo,
          janela.cutFrom,
          janela.cutTo,
          outcome,
          clipId,
          clipJobId,
          p.userAgent?.slice(0, 300) ?? null,
          p.sourceIpHash ?? null,
        ],
      );
      return r[0]!.id;
    };

    // 1. Cooldown por QUADRA. Cinco apertos em três segundos viram um clipe.
    //
    // A conta vem de `emCooldown` (`lib/janela-corte.ts`) e não é refeita aqui.
    // Ela estava DUPLICADA: a versão testada morava na lib, a versão que rodava
    // em produção era uma linha escrita à mão neste arquivo, e os três testes de
    // `tests/janela-corte.test.ts` guardavam a que ninguém executava. As duas
    // concordavam por sorte — inclusive no caso do relógio que anda para trás,
    // em que `delta < 0` também conta como cooldown ativo (é mais seguro recusar
    // do que criar dois clipes por um salto de NTP). Sorte não é invariante.
    const ultimo = ctx.ultimo_gatilho_at ? new Date(ctx.ultimo_gatilho_at) : null;
    if (emCooldown(ultimo, agora, COOLDOWN_QUADRA_MS)) {
      return {
        aceito: false,
        motivo: "rejected_cooldown",
        triggerEventId: await gravaEvento("rejected_cooldown", null, null),
      };
    }

    // 2. HORÁRIO BLOQUEADO (escolinha) — item 7 do checklist legal de
    //    `docs/decisoes.md` §5.
    //
    //    Depois do cooldown e ANTES da câmera, de propósito. Depois do cooldown
    //    porque este é o caminho quente e o cooldown já está em memória (uma
    //    criança apertando o botão dez vezes não vira dez consultas a mais).
    //    Antes da câmera porque o bloqueio é uma decisão DE POLÍTICA: a câmera
    //    pode estar ótima, e ainda assim não pode haver clipe. Recusar por
    //    "câmera fora do ar" num horário de escolinha mandaria o suporte da
    //    arena caçar um defeito que não existe.
    //
    //    A avaliação é `bloqueioEmVigor` (pura, testada em
    //    `tests/painel-blackout.test.ts`) e não SQL: a comparação depende do
    //    relógio de parede DA ARENA, e é exatamente o tipo de conta que precisa
    //    de teste de mesa para a virada da meia-noite e o fim de intervalo.
    const bloqueios = await q<Bloqueio>(
      `SELECT bl.id, bl.court_id, bl.weekday,
              bl.starts_time::text AS starts_time,
              bl.ends_time::text   AS ends_time,
              bl.label, bl.active
         FROM court_blackout bl
        WHERE bl.partner_id = $1
          AND bl.active
          AND (bl.court_id IS NULL OR bl.court_id = $2)`,
      [ctx.partner_id, ctx.court_id],
    );
    const bloqueio = bloqueioEmVigor(bloqueios, ctx.court_id, agora, ctx.timezone);
    if (bloqueio) {
      return {
        aceito: false,
        motivo: "rejected_blackout",
        triggerEventId: await gravaEvento("rejected_blackout", null, null),
        bloqueio: { id: bloqueio.id, label: bloqueio.label },
      };
    }

    // 3. Quadra sem câmera atribuída.
    if (!ctx.camera_id || !ctx.relay_node_id) {
      return {
        aceito: false,
        motivo: "rejected_camera_unknown",
        triggerEventId: await gravaEvento("rejected_camera_unknown", null, null),
      };
    }

    // 4. Câmera sem segmento há mais de 60 s = fora do ar. Melhor dizer isso ao
    //    atleta agora do que entregar um clipe vazio daqui a 30 s.
    const semSegmento =
      !ctx.camera_last_segment_at ||
      agora.getTime() - new Date(ctx.camera_last_segment_at).getTime() > 60_000;
    if (semSegmento) {
      return {
        aceito: false,
        motivo: "rejected_no_coverage",
        triggerEventId: await gravaEvento("rejected_no_coverage", null, null),
      };
    }

    // 5. Relay fora.
    if (ctx.relay_status !== "active") {
      return {
        aceito: false,
        motivo: "rejected_relay_down",
        triggerEventId: await gravaEvento("rejected_relay_down", null, null),
      };
    }

    const retencao = ctx.clip_retention_days || CLIP_RETENTION_DIAS_PADRAO;

    const clip = (
      await q<{ id: string }>(
        `INSERT INTO clip (
           partner_id, court_id, camera_id, triggered_at,
           started_at, ended_at, cut_from, cut_to, duration_seconds,
           status, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',
                   $4::timestamptz + make_interval(days => $10::int))
         RETURNING id`,
        [
          ctx.partner_id,
          ctx.court_id,
          ctx.camera_id,
          janela.pressEstimatedAt,
          janela.deliverFrom,
          janela.deliverTo,
          janela.cutFrom,
          janela.cutTo,
          (janela.deliverTo.getTime() - janela.deliverFrom.getTime()) / 1000,
          retencao,
        ],
      )
    )[0]!;

    const job = (
      await q<{ id: string }>(
        `INSERT INTO clip_job (
           clip_id, partner_id, camera_id, relay_node_id,
           cut_from, cut_to, deliver_from, deliver_to,
           status, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',
                   now() + make_interval(mins => $9::int))
         RETURNING id`,
        [
          clip.id,
          ctx.partner_id,
          ctx.camera_id,
          ctx.relay_node_id,
          janela.cutFrom,
          janela.cutTo,
          janela.deliverFrom,
          janela.deliverTo,
          JOB_TTL_MINUTOS,
        ],
      )
    )[0]!;

    await q(`UPDATE clip SET clip_job_id = $2 WHERE id = $1`, [clip.id, job.id]);

    const eventoId = await gravaEvento("accepted", clip.id, job.id);
    await q(`UPDATE clip SET trigger_event_id = $2 WHERE id = $1`, [clip.id, eventoId]);

    if (p.buttonId) {
      await q(
        `UPDATE button SET last_pressed_at = $2, press_count_total = press_count_total + 1
          WHERE id = $1`,
        [p.buttonId, agora],
      );
    }

    return {
      aceito: true,
      triggerEventId: eventoId,
      clipId: clip.id,
      clipJobId: job.id,
      relayNodeId: ctx.relay_node_id,
      pressEstimatedAt: janela.pressEstimatedAt,
      deliverFrom: janela.deliverFrom,
      deliverTo: janela.deliverTo,
      buttonWakeLatencyMs: wake,
      cameraOriginLagMs: ctx.camera_origin_lag_ms,
    };
  });
}

/** O resultado do gatilho, para o polling de 1 s do cliente. */
export async function resultadoDoGatilho(
  triggerEventId: string,
): Promise<{ status: string; clipId: string | null; outcome: string; coverageRatio: number | null } | null> {
  const linhas = await query<{
    outcome: string;
    clip_id: string | null;
    clip_status: string | null;
    coverage_ratio: string | null;
  }>(
    `SELECT te.outcome::text AS outcome, te.clip_id,
            c.status::text AS clip_status, c.coverage_ratio
       FROM trigger_event te
       LEFT JOIN clip c ON c.id = te.clip_id
      WHERE te.id = $1`,
    [triggerEventId],
  );
  const l = linhas[0];
  if (!l) return null;
  return {
    status: l.outcome === "accepted" ? (l.clip_status ?? "pending") : "rejected",
    clipId: l.clip_id,
    outcome: l.outcome,
    coverageRatio: l.coverage_ratio === null ? null : Number(l.coverage_ratio),
  };
}

/** O relay a acordar depois de enfileirar o job. */
export async function baseUrlDoRelay(relayNodeId: string): Promise<string | null> {
  const linhas = await query<{ base_url: string }>(
    `SELECT base_url FROM relay_node WHERE id = $1`,
    [relayNodeId],
  );
  return linhas[0]?.base_url ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// OS BOTÕES, PELO PAINEL DO PARCEIRO
// ═══════════════════════════════════════════════════════════════════════════
//
// Aqui pelo mesmo motivo que o provisionamento de câmera está em `relay.ts`: o
// grep de disciplina do CI restringe o hash do token do botão a este arquivo e
// a `relay.ts`, e criar/regerar botão precisa escrevê-lo. Abrir exceção no grep
// por conveniência de tela é como a regra deixa de valer.
//
// ─── O TOKEN APARECE UMA VEZ. UMA. ─────────────────────────────────────────
//
// O banco guarda só o SHA-256 (`modelo-de-dados.md` §3.10), então não existe
// "ver de novo" — e não deve existir. Quem perdeu a URL regenera, o que invalida
// a antiga. É por isso que a função de criação DEVOLVE o token cru: é a única
// vez que ele existe fora do dispositivo, e a tela precisa mostrá-lo inteiro,
// com QR, antes que a pessoa saia daquela página.

export type BotaoDoPainelRow = {
  id: string;
  court_id: string;
  court: string;
  label: string;
  kind: string;
  model: string | null;
  active: boolean;
  token_last4: string;
  battery_percent: number | null;
  battery_reported_at: Date | null;
  last_signal_at: Date | null;
  last_pressed_at: Date | null;
  /** Segundos desde o último sinal — `null` quando nunca deu nenhum. */
  desde_sinal_segundos: number | null;
  press_count_total: string;
  lances_30d: number;
  recusados_30d: number;
};

/**
 * Os botões da arena, com o sinal de vida que existe.
 *
 * ─── NÃO HÁ HEARTBEAT DE BOTÃO, E A TELA PRECISA ASSUMIR ISSO ──────────────
 *
 * Um dispositivo de pilha que dorme não pode pagar por um heartbeat (30 s
 * mataria a bateria em dias — é o comentário do índice `button_silent_idx` na
 * 0006). A liveness é inferida de `last_signal_at`, que é escrito em TODA
 * requisição, inclusive nas recusadas. Isso é um sinal fraco, e a tela o trata
 * como tal: "sem sinal há 6 dias" é informação, não alarme.
 *
 * `press_count_total` é `bigint` e sai como texto: em JS ele passaria por
 * `number` e, num contador que só cresce, é exatamente o tipo de coluna que
 * ninguém pensa em conferir.
 */
export async function botoesDoPainel(partnerId: string): Promise<BotaoDoPainelRow[]> {
  return query<BotaoDoPainelRow>(
    `SELECT b.id, b.court_id, ct.name AS court, b.label, b.kind::text AS kind, b.model,
            b.active, b.token_last4, b.battery_percent, b.battery_reported_at,
            b.last_signal_at, b.last_pressed_at,
            EXTRACT(EPOCH FROM (now() - b.last_signal_at))::int AS desde_sinal_segundos,
            b.press_count_total::text AS press_count_total,
            (SELECT count(*)::int FROM trigger_event te
              WHERE te.button_id = b.id AND te.outcome = 'accepted'
                AND te.arrival_at > now() - interval '30 days') AS lances_30d,
            (SELECT count(*)::int FROM trigger_event te
              WHERE te.button_id = b.id AND te.outcome <> 'accepted'
                AND te.arrival_at > now() - interval '30 days') AS recusados_30d
       FROM button b
       JOIN court ct ON ct.id = b.court_id
      WHERE b.partner_id = $1 AND ct.deleted_at IS NULL
      ORDER BY b.active DESC, ct.display_order, b.label`,
    [partnerId],
  );
}

/**
 * Cria um botão e devolve o token CRU — a única vez em que ele existe aqui.
 *
 * O `EXISTS` sobre `court` não é teatro: sem ele, um uuid de quadra de outra
 * arena criaria, nesta arena, um botão que dispara lá. Sem RLS, esta linha é a
 * barreira.
 */
export async function criarBotao(
  partnerId: string,
  d: {
    courtId: string;
    label: string;
    kind: "wifi_webhook" | "zigbee_hub" | "virtual";
    model: string | null;
    token: string;
    hashDoToken: string;
    wakeLatencyMs?: number;
  },
): Promise<{ id: string; token: string; last4: string } | null> {
  const last4 = d.token.slice(-4);
  const linhas = await query<{ id: string }>(
    `INSERT INTO button (partner_id, court_id, token_hash, token_last4, label, kind,
                         model, active, wake_latency_ms)
     SELECT $1, $2, $3, $4, $5, $6::button_kind, $7, true, $8
      WHERE EXISTS (SELECT 1 FROM court ct
                     WHERE ct.id = $2 AND ct.partner_id = $1 AND ct.deleted_at IS NULL)
     RETURNING id`,
    [
      partnerId,
      d.courtId,
      d.hashDoToken,
      last4,
      d.label,
      d.kind,
      d.model,
      d.wakeLatencyMs ?? 1500,
    ],
  );
  return linhas[0] ? { id: linhas[0].id, token: d.token, last4 } : null;
}

/**
 * Gera um token novo para um botão existente.
 *
 * ─── ISTO INVALIDA A URL QUE ESTÁ DENTRO DO DISPOSITIVO ────────────────────
 *
 * O botão continua mandando `POST` para a URL antiga e passa a receber 404. A
 * tela diz isso antes; aqui a garantia é que o token velho morre no mesmo
 * instante em que o novo nasce — nunca os dois valendo.
 *
 * `press_count_total` e o histórico de `trigger_event` são PRESERVADOS: o botão
 * é o mesmo equipamento, e zerar o contador apagaria a única evidência de que
 * ele já funcionou.
 */
export async function regenerarTokenDoBotao(
  partnerId: string,
  buttonId: string,
  token: string,
  hashDoToken: string,
): Promise<{ token: string; last4: string } | null> {
  const last4 = token.slice(-4);
  const linhas = await query<{ id: string }>(
    `UPDATE button SET token_hash = $3, token_last4 = $4, active = true
      WHERE id = $2 AND partner_id = $1
      RETURNING id`,
    [partnerId, buttonId, hashDoToken, last4],
  );
  return linhas[0] ? { token, last4 } : null;
}

/**
 * Revoga (ou reativa) o botão.
 *
 * Revogar é um UPDATE e não um DELETE: `trigger_event.button_id` aponta para
 * aqui, e apagar a linha transformaria o histórico de acionamentos em órfão —
 * exatamente o registro que o painel usa para provar que o botão estava sendo
 * apertado enquanto a câmera estava fora do ar.
 *
 * Um botão revogado ainda recebe `202` com `rejected_button_revoked` (a rota
 * responde 202 sempre, porque o firmware não sabe tratar erro) e continua
 * gravando `last_signal_at` — é assim que se descobre que o botão trocado ainda
 * está pendurado na parede, apertando.
 */
export async function definirBotaoAtivo(
  partnerId: string,
  buttonId: string,
  ativo: boolean,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE button SET active = $3
      WHERE id = $2 AND partner_id = $1 RETURNING id`,
    [partnerId, buttonId, ativo],
  );
  return Boolean(linhas[0]);
}

/** Renomeia o botão ("Botão Quadra 1", "Botão do fundo"). */
export async function renomearBotao(
  partnerId: string,
  buttonId: string,
  label: string,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE button SET label = $3
      WHERE id = $2 AND partner_id = $1 RETURNING id`,
    [partnerId, buttonId, label],
  );
  return Boolean(linhas[0]);
}
