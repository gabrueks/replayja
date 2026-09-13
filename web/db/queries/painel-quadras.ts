import { query, transacao } from "@/lib/db";

// Cadastro de quadras — o inventário que a arena mantém sozinha.
//
// ─── O QUE MUDA QUANDO A ARENA PASSA A EDITAR ISTO ─────────────────────────
//
// Até esta task, quadra nascia no `scripts/seed-piloto.ts`. Um seed é o lugar
// certo para a instalação e o lugar errado para a operação: renomear "Quadra 3"
// para "Quadra do fundo" às 22h de um sábado não pode depender de alguém com
// acesso ao repositório.
//
// O que a arena NÃO controla continua fora daqui: a porta do relay, a chave de
// transmissão e o token do botão vivem em `relay.ts` e `gatilho.ts`, porque são
// segredos de dispositivo e a regra de projeção (`modelo-de-dados.md` §7.3) não
// abre exceção por conveniência de tela.

export type QuadraDoPainelRow = {
  id: string;
  slug: string;
  name: string;
  sport: string;
  surface: string | null;
  indoor: boolean;
  display_order: number;
  active: boolean;
  opens_time: string | null;
  closes_time: string | null;
  cameras: number;
  botoes: number;
  lances_30d: number;
};

/**
 * As quadras com o que o painel precisa decidir: tem câmera? tem botão?
 *
 * Inclui as INATIVAS (a pública, `quadrasDoParceiro`, não inclui). Desativar uma
 * quadra é reversível e o parceiro precisa vê-la para reativá-la — uma quadra
 * que some da tela ao ser desativada é uma quadra que ninguém liga de volta.
 */
export async function quadrasDoPainel(partnerId: string): Promise<QuadraDoPainelRow[]> {
  return query<QuadraDoPainelRow>(
    `SELECT ct.id, ct.slug::text AS slug, ct.name, ct.sport::text AS sport,
            ct.surface, ct.indoor, ct.display_order, ct.active,
            ct.opens_time::text AS opens_time, ct.closes_time::text AS closes_time,
            (SELECT count(*)::int FROM camera cam
              WHERE cam.court_id = ct.id AND cam.deleted_at IS NULL) AS cameras,
            (SELECT count(*)::int FROM button b
              WHERE b.court_id = ct.id AND b.active) AS botoes,
            (SELECT count(*)::int FROM clip c
              WHERE c.court_id = ct.id AND c.deleted_at IS NULL
                AND c.expires_at > now()
                AND c.status IN ('ready','partial')
                AND c.triggered_at > now() - interval '30 days') AS lances_30d
       FROM court ct
      WHERE ct.partner_id = $1 AND ct.deleted_at IS NULL
      ORDER BY ct.active DESC, ct.display_order, ct.name`,
    [partnerId],
  );
}

export async function slugDeQuadraEmUso(
  partnerId: string,
  slug: string,
  exceto?: string | null,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `SELECT id FROM court
      WHERE partner_id = $1 AND slug = $2 AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      LIMIT 1`,
    [partnerId, slug, exceto ?? null],
  );
  return Boolean(linhas[0]);
}

export type DadosDaQuadra = {
  slug: string;
  name: string;
  sport: string;
  surface: string | null;
  indoor: boolean;
  opensTime: string | null;
  closesTime: string | null;
};

/**
 * Cria a quadra no fim da ordem de exibição.
 *
 * `display_order` sai de `max + 1` DENTRO da transação: calcular fora é a
 * corrida clássica de duas abas criando quadra ao mesmo tempo, que produz duas
 * quadras com a mesma posição e uma lista que muda de ordem a cada recarga.
 */
export async function criarQuadra(
  partnerId: string,
  d: DadosDaQuadra,
): Promise<{ id: string; slug: string }> {
  return transacao(async (q) => {
    const linhas = await q<{ id: string; slug: string }>(
      `INSERT INTO court (partner_id, slug, name, sport, surface, indoor,
                          display_order, active, opens_time, closes_time)
       VALUES ($1, $2, $3, $4::court_sport, $5, $6,
               (SELECT COALESCE(max(display_order), 0) + 1 FROM court WHERE partner_id = $1),
               true, $7::time, $8::time)
       RETURNING id, slug::text AS slug`,
      [
        partnerId,
        d.slug,
        d.name,
        d.sport,
        d.surface,
        d.indoor,
        d.opensTime,
        d.closesTime,
      ],
    );
    return linhas[0]!;
  });
}

/**
 * Edita a quadra. O `partner_id` na cláusula WHERE é o que impede editar a
 * quadra de outra arena com um uuid adivinhado — sem RLS, é a única barreira.
 *
 * O SLUG não entra: ele está em `play_group.court_id`? não — mas está no link
 * `/[arena]/s/<quadra>-<data>-<hora>` que a pelada colou no WhatsApp, e o
 * formato do slug de sessão usa o slug da quadra como PREFIXO (decisão 23).
 * Trocá-lo quebraria links já compartilhados sem nenhum alias para socorrer.
 */
export async function editarQuadra(
  partnerId: string,
  courtId: string,
  d: Omit<DadosDaQuadra, "slug">,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE court SET name = $3, sport = $4::court_sport, surface = $5, indoor = $6,
                      opens_time = $7::time, closes_time = $8::time
      WHERE id = $2 AND partner_id = $1 AND deleted_at IS NULL
      RETURNING id`,
    [partnerId, courtId, d.name, d.sport, d.surface, d.indoor, d.opensTime, d.closesTime],
  );
  return Boolean(linhas[0]);
}

/**
 * Liga/desliga a quadra.
 *
 * DESATIVAR não apaga, e não desativa a câmera junto: a gravação contínua segue,
 * o que muda é que `contextoDaQuadra` deixa de achar a quadra e todo gatilho é
 * recusado. É o comportamento certo para "quadra em reforma": nada se perde, e
 * ninguém salva lance de uma obra.
 */
export async function definirQuadraAtiva(
  partnerId: string,
  courtId: string,
  ativa: boolean,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE court SET active = $3
      WHERE id = $2 AND partner_id = $1 AND deleted_at IS NULL
      RETURNING id`,
    [partnerId, courtId, ativa],
  );
  return Boolean(linhas[0]);
}

/**
 * Move uma câmera de quadra (ou a tira de todas, com `courtId = null`).
 *
 * Câmera sem quadra SOME da lista que o relay busca — é o "sem destino não há
 * gravador" da 0004. Por isso a tela precisa dizer isso em voz alta antes de
 * desvincular, e não depois.
 *
 * As duas cláusulas de `partner_id` (na câmera e na quadra) não são redundância:
 * sem a segunda, um uuid de quadra de outra arena vincularia a câmera desta lá.
 */
export async function vincularCameraAQuadra(
  partnerId: string,
  cameraId: string,
  courtId: string | null,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE camera SET court_id = $3::uuid
      WHERE id = $2 AND partner_id = $1 AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR EXISTS (
              SELECT 1 FROM court ct
               WHERE ct.id = $3::uuid AND ct.partner_id = $1 AND ct.deleted_at IS NULL))
      RETURNING id`,
    [partnerId, cameraId, courtId],
  );
  return Boolean(linhas[0]);
}

/** Move um botão de quadra. Mesma regra de escopo duplo da câmera. */
export async function vincularBotaoAQuadra(
  partnerId: string,
  buttonId: string,
  courtId: string,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE button SET court_id = $3
      WHERE id = $2 AND partner_id = $1
        AND EXISTS (SELECT 1 FROM court ct
                     WHERE ct.id = $3 AND ct.partner_id = $1 AND ct.deleted_at IS NULL)
      RETURNING id`,
    [partnerId, buttonId, courtId],
  );
  return Boolean(linhas[0]);
}

// Os rótulos dos esportes moram em `painel-rotulos.ts` porque a TELA precisa
// deles, e um `import` de valor deste arquivo arrastaria o `pg` para o bundle do
// navegador. A reexportação mantém um caminho só para o código de servidor.
export { ESPORTES, ehEsporte, type EsporteRow } from "./painel-rotulos";
