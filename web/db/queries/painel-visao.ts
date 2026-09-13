import { query } from "@/lib/db";

// Os números da visão geral do painel — todos reais, nenhum fixture.
//
// ─── POR QUE UM MÓDULO SÓ PARA ISTO ────────────────────────────────────────
//
// `db/queries/saude.ts` responde "a máquina está bem?" e é lido por
// `/api/health`, que o monitor externo bate a cada minuto. As consultas daqui
// respondem "o negócio está indo bem?", varrem janelas de 30 dias e só rodam
// quando um humano abre o painel. Juntá-las faria o health check pagar o preço
// do relatório — e é assim que o compute do Neon deixa de dormir à noite.
//
// TODA consulta aqui tem `partner_id` na cláusula WHERE. Sem RLS, é exatamente
// isso que separa o painel desta arena do painel da arena vizinha.

export type MetricasDoPainelRow = {
  lances_hoje: number;
  lances_7d: number;
  lances_30d: number;
  atletas_7d: number;
  atletas_30d: number;
  grupos_ativos: number;
  compartilhamentos_7d: number;
  gatilhos_recusados_24h: number;
  clipes_parciais_7d: number;
  /** Gatilhos recusados por horário bloqueado nas últimas 24 h. */
  bloqueados_24h: number;
};

/**
 * Os números do topo, numa consulta só.
 *
 * ─── AS JANELAS SÃO DO RELÓGIO DA ARENA, NÃO DO UTC ────────────────────────
 *
 * "Hoje" numa função da Vercel (que roda em UTC) vira outro dia às 21h de São
 * Paulo — isto é, o contador zeraria no meio do horário de pico da pelada, que é
 * exatamente quando o parceiro olha o painel. `AT TIME ZONE` resolve, e é por
 * isso que `timezone` é parâmetro e não constante.
 *
 * "Atletas" conta `requested_by_user_id` DISTINTOS de `trigger_event`, e não
 * usuários que assistiram: quem aperta o botão é quem joga. Contar espectador
 * inflaria o número com o grupo de WhatsApp inteiro.
 *
 * "Grupos ativos" é grupo com pelo menos um MEMBRO ativo, e não grupo criado:
 * um grupo cujo dono saiu não é audiência para o parceiro. Deliberadamente não
 * é "grupo com lance na semana" — um grupo cuja pelada foi cancelada por chuva
 * continua existindo, e o número serve para dimensionar base, não frequência.
 *
 * As contagens de `clip` filtram `expires_at > now()` pelo mesmo motivo que as
 * do atleta: o painel e a busca são duas contagens da mesma coisa, e duas
 * contagens da mesma coisa sempre divergem. Um "lances 30 d" que inclui o que o
 * atleta não consegue mais abrir faz o parceiro reclamar de um bug que é uma
 * política.
 */
export async function metricasDoPainel(
  partnerId: string,
  timezone: string,
): Promise<MetricasDoPainelRow> {
  const linhas = await query<MetricasDoPainelRow>(
    `SELECT
       (SELECT count(*)::int FROM clip c
         WHERE c.partner_id = $1 AND c.deleted_at IS NULL AND c.expires_at > now()
           AND c.status IN ('ready','partial')
           AND (c.triggered_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)
         AS lances_hoje,
       (SELECT count(*)::int FROM clip c
         WHERE c.partner_id = $1 AND c.deleted_at IS NULL AND c.expires_at > now()
           AND c.status IN ('ready','partial')
           AND c.triggered_at > now() - interval '7 days')  AS lances_7d,
       (SELECT count(*)::int FROM clip c
         WHERE c.partner_id = $1 AND c.deleted_at IS NULL AND c.expires_at > now()
           AND c.status IN ('ready','partial')
           AND c.triggered_at > now() - interval '30 days') AS lances_30d,
       (SELECT count(DISTINCT te.requested_by_user_id)::int FROM trigger_event te
         WHERE te.partner_id = $1 AND te.requested_by_user_id IS NOT NULL
           AND te.arrival_at > now() - interval '7 days')   AS atletas_7d,
       (SELECT count(DISTINCT te.requested_by_user_id)::int FROM trigger_event te
         WHERE te.partner_id = $1 AND te.requested_by_user_id IS NOT NULL
           AND te.arrival_at > now() - interval '30 days')  AS atletas_30d,
       (SELECT count(*)::int FROM play_group g
         WHERE g.partner_id = $1 AND g.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM play_group_member m
                        WHERE m.play_group_id = g.id AND m.status = 'active')) AS grupos_ativos,
       (SELECT count(*)::int FROM share_event se
         WHERE se.partner_id = $1 AND se.action = 'created'
           AND se.occurred_at > now() - interval '7 days')  AS compartilhamentos_7d,
       (SELECT count(*)::int FROM trigger_event te
         WHERE te.partner_id = $1 AND te.outcome <> 'accepted'
           AND te.arrival_at > now() - interval '24 hours') AS gatilhos_recusados_24h,
       (SELECT count(*)::int FROM clip c
         WHERE c.partner_id = $1 AND c.deleted_at IS NULL AND c.expires_at > now()
           AND c.status = 'partial'
           AND c.triggered_at > now() - interval '7 days')  AS clipes_parciais_7d,
       (SELECT count(*)::int FROM trigger_event te
         WHERE te.partner_id = $1 AND te.outcome::text = 'rejected_blackout'
           AND te.arrival_at > now() - interval '24 hours') AS bloqueados_24h`,
    [partnerId, timezone],
  );
  return (
    linhas[0] ?? {
      lances_hoje: 0,
      lances_7d: 0,
      lances_30d: 0,
      atletas_7d: 0,
      atletas_30d: 0,
      grupos_ativos: 0,
      compartilhamentos_7d: 0,
      gatilhos_recusados_24h: 0,
      clipes_parciais_7d: 0,
      bloqueados_24h: 0,
    }
  );
}

export type CanalRow = { channel: string; total: number };

/**
 * Compartilhamentos por canal — a métrica que o parceiro leva para a renovação.
 *
 * `action = 'created'` e não `opened`: o que importa aqui é quantas vezes um
 * atleta levou a marca da arena para fora, não quantas pessoas clicaram depois
 * (isso já entra em `opened`, e somar os dois contaria a mesma divulgação duas
 * vezes).
 */
export async function compartilhamentosPorCanal(
  partnerId: string,
  dias = 30,
): Promise<CanalRow[]> {
  return query<CanalRow>(
    `SELECT se.channel::text AS channel, count(*)::int AS total
       FROM share_event se
      WHERE se.partner_id = $1
        AND se.action = 'created'
        AND se.occurred_at > now() - make_interval(days => $2::int)
      GROUP BY 1
      ORDER BY total DESC, channel`,
    [partnerId, dias],
  );
}

export type GravacaoDaQuadraRow = {
  court_id: string;
  court: string;
  court_slug: string;
  ativa: boolean;
  /** `null` quando a quadra não tem câmera. */
  camera_id: string | null;
  ultima_gravacao: Date | null;
  ultima_gravacao_segundos: number | null;
  /** `0.954` — a média das câmeras da quadra nas últimas 24 h. */
  cobertura_24h: string | null;
  lances_7d: number;
  tem_botao: boolean;
};

/**
 * Uma linha por quadra: está gravando, desde quando, com que cobertura.
 *
 * ─── "ÚLTIMA GRAVAÇÃO" É A PERGUNTA QUE O PARCEIRO REALMENTE FAZ ───────────
 *
 * O painel antigo mostrava o estado da CÂMERA. Mas o parceiro não pensa em
 * câmera, pensa em quadra: "a quadra 3 está gravando?". Uma quadra sem câmera
 * nenhuma é um caso real (quadra nova cadastrada antes da instalação) e some
 * inteira de uma listagem que parte de `camera` — que é o pior jeito de
 * descobrir que faltou instalar uma.
 */
export async function gravacaoPorQuadra(partnerId: string): Promise<GravacaoDaQuadraRow[]> {
  return query<GravacaoDaQuadraRow>(
    `SELECT ct.id AS court_id, ct.name AS court, ct.slug::text AS court_slug, ct.active AS ativa,
            cam.id AS camera_id,
            cam.last_segment_at AS ultima_gravacao,
            EXTRACT(EPOCH FROM (now() - cam.last_segment_at))::int AS ultima_gravacao_segundos,
            cam.coverage_24h::text AS cobertura_24h,
            COALESCE(l.total, 0)::int AS lances_7d,
            EXISTS (SELECT 1 FROM button b WHERE b.court_id = ct.id AND b.active) AS tem_botao
       FROM court ct
       -- A câmera "da quadra" é a que gravou mais recentemente. No piloto há uma
       -- por quadra; quando houver duas, a linha continua respondendo "esta
       -- quadra está gravando?" em vez de duplicar a quadra na tela.
       LEFT JOIN LATERAL (
         SELECT c.id, c.last_segment_at, c.coverage_24h
           FROM camera c
          WHERE c.court_id = ct.id AND c.deleted_at IS NULL AND c.enabled
          ORDER BY c.last_segment_at DESC NULLS LAST, c.created_at
          LIMIT 1
       ) cam ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS total
           FROM clip cl
          WHERE cl.court_id = ct.id AND cl.deleted_at IS NULL
            AND cl.expires_at > now()
            AND cl.status IN ('ready','partial')
            AND cl.triggered_at > now() - interval '7 days'
       ) l ON true
      WHERE ct.partner_id = $1 AND ct.deleted_at IS NULL
      ORDER BY ct.display_order, ct.name`,
    [partnerId],
  );
}
