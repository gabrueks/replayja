import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { Sessao } from "@/lib/session-cookie";

// TESTE DE INTEGRAÇÃO DA RETENÇÃO — um clipe VENCIDO de verdade, num Postgres
// de verdade, passando por cada consulta nomeada.
//
// ─── POR QUE A VARREDURA DE FONTE NÃO BASTA AQUI ───────────────────────────
//
// `tests/retencao.test.ts` prova que toda consulta de `clip` CONTÉM
// `expires_at > now()`. É a defesa contra a consulta que alguém escreve amanhã,
// e ela vale. O que ela não prova é que o filtro está no lugar certo dentro do
// SQL: um `AND` pendurado no ramo errado de um `OR`, ou dentro de um `LEFT
// JOIN ... ON` em vez do `WHERE`, passa na varredura e devolve o clipe vencido
// do mesmo jeito. Só o banco responde isso.
//
// Então este arquivo faz o caminho inteiro: cria arena, quadra, câmera, grupo e
// DOIS clipes — um vivo e um vencido —, e exige que cada consulta do produto
// devolva o vivo e não devolva o vencido.
//
// ─── COMO RODAR ────────────────────────────────────────────────────────────
//
//   docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres \
//     --name replayja-pg postgres:16-alpine
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres \
//     pnpm test
//
// Sem `TEST_DATABASE_URL` o arquivo é PULADO, não falha — a mesma regra de
// `migracoes.integracao.test.ts`. O CI define a variável e roda de verdade.

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

// As consultas são importadas DEPOIS de `DATABASE_URL` existir: `lib/db.ts` só
// abre o pool na primeira query, mas `dbConfigured()` lê a variável, e um
// import estático no topo do arquivo rodaria antes deste `beforeAll`.
type Consultas = {
  clipe: typeof import("@/db/queries/clipe");
  grupo: typeof import("@/db/queries/grupo");
  parceiro: typeof import("@/db/queries/parceiro");
  painelVisao: typeof import("@/db/queries/painel-visao");
  painelPrivacidade: typeof import("@/db/queries/painel-privacidade");
  expurgo: typeof import("@/db/queries/expurgo");
};

let pool: pg.Pool;
let q: Consultas;

/** A sessão mínima que `exigirLogin` aceita. */
const SESSAO: Sessao = { uid: "", email: "teste@replayja.test", exp: Date.now() + 3_600_000 };

const IDS = {
  partner: "",
  court: "",
  camera: "",
  relay: "",
  grupo: "",
  usuario: "",
  vivo: "",
  vencido: "",
};

rodar("a retenção, contra o banco", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    pool = new pg.Pool({ connectionString: URL_TESTE, max: 2 });

    q = {
      clipe: await import("@/db/queries/clipe"),
      grupo: await import("@/db/queries/grupo"),
      parceiro: await import("@/db/queries/parceiro"),
      painelVisao: await import("@/db/queries/painel-visao"),
      painelPrivacidade: await import("@/db/queries/painel-privacidade"),
      expurgo: await import("@/db/queries/expurgo"),
    };

    // O schema tem de existir. `migracoes.integracao.test.ts` roda o `up` num
    // banco limpo; aqui só conferimos, porque derrubar o schema no meio de uma
    // suíte paralela seria cruel.
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.columns
        WHERE table_name = 'clip' AND column_name = 'purged_at'`,
    );
    expect(
      rows[0]?.n,
      "rode `pnpm migrate` no banco de teste antes (falta clip.purged_at, migração 0016)",
    ).toBe("1");

    const sufixo = Date.now().toString(36);

    const inserir = async <T extends pg.QueryResultRow>(sql: string, params: unknown[]) =>
      (await pool.query<T>(sql, params)).rows[0]!;

    IDS.partner = (
      await inserir<{ id: string }>(
        `INSERT INTO partner (slug, legal_name, display_name, timezone, status, clip_retention_days)
         VALUES ($1, 'Arena Teste LTDA', 'Arena Teste', 'America/Sao_Paulo', 'active', 90)
         RETURNING id`,
        [`ret-${sufixo}`],
      )
    ).id;

    IDS.court = (
      await inserir<{ id: string }>(
        `INSERT INTO court (partner_id, slug, name) VALUES ($1, 'q1', 'Quadra 1') RETURNING id`,
        [IDS.partner],
      )
    ).id;

    // `camera.id` e `relay_node.id` viram nome de diretório e segmento de URL
    // no relay, então têm formato restrito (`^[a-z0-9]{6,32}$` na camera).
    IDS.relay = `relay${sufixo}`;
    await pool.query(
      `INSERT INTO relay_node (id, base_url, rtmp_host, key_hash)
       VALUES ($1, 'https://relay.test', 'stream.test', $1)`,
      [IDS.relay],
    );

    IDS.camera = `cam${sufixo}`;
    await pool.query(
      `INSERT INTO camera (id, partner_id, court_id, relay_node_id, name)
       VALUES ($1, $2, $3, $4, 'Câmera 1')`,
      [IDS.camera, IDS.partner, IDS.court, IDS.relay],
    );

    IDS.usuario = (
      await inserir<{ id: string }>(
        `INSERT INTO app_user (email) VALUES ($1) RETURNING id`,
        [`atleta-${sufixo}@replayja.test`],
      )
    ).id;
    SESSAO.uid = IDS.usuario;

    // O grupo joga TODO DIA, numa janela de 6 horas CENTRADA NA HORA ATUAL da
    // arena. Seis horas é o teto do `play_group_janela_chk` — um grupo "das 6h
    // às 23h" viraria um dump de toda a arena, e o banco não deixa. Centrar na
    // hora atual é o que garante que os dois clipes (agora, e há 100 dias no
    // mesmo horário local) caiam dentro da janela, sem depender de a que horas
    // o teste roda. A aritmética de `time` do Postgres dá a volta na
    // meia-noite sozinha, e a segunda perna do CHECK cobre esse caso.
    IDS.grupo = (
      await inserir<{ id: string }>(
        `INSERT INTO play_group (partner_id, slug, name, weekdays, start_time, end_time,
                                 timezone, all_courts, active_from, visibility, created_by)
         VALUES ($1, 'pelada', 'Pelada', ARRAY[1,2,3,4,5,6,7]::smallint[],
                 ((now() AT TIME ZONE 'America/Sao_Paulo')::time - interval '3 hours'),
                 ((now() AT TIME ZONE 'America/Sao_Paulo')::time + interval '3 hours'),
                 'America/Sao_Paulo', true, (now() - interval '400 days')::date, 'unlisted', $2)
         RETURNING id`,
        [IDS.partner, IDS.usuario],
      )
    ).id;

    await pool.query(
      `INSERT INTO play_group_member (play_group_id, user_id, invited_email, role, status, accepted_at)
       VALUES ($1, $2, $3, 'owner', 'active', now())`,
      [IDS.grupo, IDS.usuario, `atleta-${sufixo}@replayja.test`],
    );

    const clipe = async (quando: string, validade: string) =>
      (
        await inserir<{ id: string }>(
          `INSERT INTO clip (partner_id, court_id, camera_id, triggered_at, started_at, ended_at,
                             cut_from, cut_to, duration_seconds, status, expires_at,
                             storage_bucket, watermarked_object_key, source_object_key,
                             thumbnail_object_key, og_object_key)
           VALUES ($1, $2, $3, now() - $4::interval, now() - $4::interval,
                   now() - $4::interval + interval '22 seconds',
                   now() - $4::interval, now() - $4::interval + interval '22 seconds',
                   22, 'ready', now() + $5::interval, 'replayja-clips',
                   'clips/p/c/2026-01-01/' || gen_random_uuid()::text || '/wm.mp4',
                   'clips/p/c/2026-01-01/x/src.mp4',
                   'clips/p/c/2026-01-01/x/thumb.jpg',
                   'clips/p/c/2026-01-01/x/og.jpg')
           RETURNING id`,
          [IDS.partner, IDS.court, IDS.camera, quando, validade],
        )
      ).id;

    // Vivo: gravado agora, vale por mais 90 dias. "Agora" e não "há uma hora"
    // porque o contador de HOJE é por data LOCAL — uma hora atrás, às 00h30, já
    // seria ontem, e o teste falharia uma vez por dia, de madrugada.
    IDS.vivo = await clipe("1 minute", "90 days");
    // Vencido: gravado há 100 dias, venceu ontem. É o clipe que TUDO tem de
    // esconder — e que o job de expurgo tem de achar.
    IDS.vencido = await clipe("100 days", "-1 day");
  }, 60_000);

  afterAll(async () => {
    // Limpeza pelo topo: `ON DELETE CASCADE` leva quadra, câmera, clipe e grupo.
    if (IDS.partner) await pool.query(`DELETE FROM partner WHERE id = $1`, [IDS.partner]);
    if (IDS.usuario) await pool.query(`DELETE FROM app_user WHERE id = $1`, [IDS.usuario]);
    // `relay_node` não pende de `partner` (um relay serve várias arenas), então
    // o CASCADE não o leva junto — e ele tem `key_hash` único.
    if (IDS.relay) await pool.query(`DELETE FROM relay_node WHERE id = $1`, [IDS.relay]);
    await pool?.end();
  });

  // ── as rotas do atleta ────────────────────────────────────────────────────

  it("a BUSCA devolve o vivo e não o vencido", async () => {
    const linhas = await q.clipe.clipesDaArena(SESSAO, {
      partnerId: IDS.partner,
      de: new Date(Date.now() - 5 * 60 * 60 * 1000),
      ate: new Date(Date.now() + 60 * 60 * 1000),
    });
    const ids = linhas.map((l) => l.id);
    expect(ids).toContain(IDS.vivo);
    expect(ids).not.toContain(IDS.vencido);
  });

  it("o DETALHE do vencido é nulo", async () => {
    expect(await q.clipe.clipePorId(SESSAO, IDS.vivo)).not.toBeNull();
    expect(await q.clipe.clipePorId(SESSAO, IDS.vencido)).toBeNull();
  });

  it("o ESTADO (polling) do vencido é nulo", async () => {
    expect(await q.clipe.estadoDoClipe(SESSAO, IDS.vivo)).not.toBeNull();
    expect(await q.clipe.estadoDoClipe(SESSAO, IDS.vencido)).toBeNull();
  });

  it("a CAPA do vencido é nula — o card do WhatsApp não acha mais a miniatura", async () => {
    expect(await q.clipe.capaDoClipe(IDS.vivo)).not.toBeNull();
    expect(await q.clipe.capaDoClipe(IDS.vencido)).toBeNull();
  });

  it("o CONTADOR da página pública não conta o vencido", async () => {
    // Os dois clipes estão em dias locais diferentes (hoje e há 100 dias), então
    // o contador de HOJE só poderia ver o vivo. O que este caso prende é o
    // contrário: que ele NÃO passe a ver o vencido se alguém mexer na janela.
    const n = await q.parceiro.lancesDeHojeNaArena(IDS.partner, "America/Sao_Paulo");
    expect(n).toBe(1);
  });

  it("o GRUPO não lista nem conta o vencido", async () => {
    const sessoes = await q.clipe.sessoesSemanaisDoGrupo(IDS.grupo, 60);
    const total = sessoes.reduce((soma, s) => soma + s.clip_count, 0);
    expect(total, "a contagem por ocorrência enxergou o clipe vencido").toBe(1);

    const daSessao = await q.clipe.clipesDoGrupoPorSessao(SESSAO, IDS.grupo, 200, 10);
    const ids = daSessao.map((l) => l.id).filter(Boolean);
    expect(ids).toContain(IDS.vivo);
    expect(ids).not.toContain(IDS.vencido);
  });

  it("o PAINEL não conta o vencido", async () => {
    const m = await q.painelVisao.metricasDoPainel(IDS.partner, "America/Sao_Paulo");
    // Janela de 30 dias: o vencido tem 100 dias e ficaria de fora de qualquer
    // jeito. O que importa é `lances_hoje`, onde só o vivo cabe.
    expect(m.lances_hoje).toBe(1);
  });

  it("a fila de REMOÇÃO do painel não oferece o vencido", async () => {
    const lista = await q.painelPrivacidade.clipesRemoviveisDaArena(IDS.partner, {}, 50);
    const ids = lista.map((l) => l.id);
    expect(ids).toContain(IDS.vivo);
    expect(ids).not.toContain(IDS.vencido);
    expect(await q.painelPrivacidade.clipeDaArena(IDS.partner, IDS.vencido)).toBeNull();
  });

  // ── o 410 ────────────────────────────────────────────────────────────────

  it("`clipeSumido` acha o vencido — é o que sustenta o 410", async () => {
    const sumido = await q.clipe.clipeSumido(SESSAO, IDS.vencido);
    expect(sumido).not.toBeNull();
    expect(sumido!.id).toBe(IDS.vencido);
    // E NÃO acha o vivo: senão o 410 responderia por cima do clipe que funciona.
    expect(await q.clipe.clipeSumido(SESSAO, IDS.vivo)).toBeNull();
  });

  // ── o pino não ressuscita ─────────────────────────────────────────────────

  it("baixar um clipe vencido não empurra a validade dele", async () => {
    await q.clipe.registrarDownloadDoClipe(SESSAO, IDS.vencido, 180);
    const { rows } = await pool.query<{ vencido: boolean; downloads: number }>(
      `SELECT expires_at <= now() AS vencido, download_count AS downloads
         FROM clip WHERE id = $1`,
      [IDS.vencido],
    );
    expect(rows[0]!.vencido, "o GREATEST ressuscitou o clipe vencido").toBe(true);
    expect(rows[0]!.downloads).toBe(0);
  });

  // ── o expurgo ────────────────────────────────────────────────────────────

  it("o EXPURGO acha o vencido, e só ele", async () => {
    const lote = await q.expurgo.clipesVencidosParaExpurgo(100);
    const ids = lote.map((l) => l.id);
    expect(ids).toContain(IDS.vencido);
    expect(ids).not.toContain(IDS.vivo);
    const alvo = lote.find((l) => l.id === IDS.vencido)!;
    expect(alvo.por_retencao).toBe(true);
    expect(alvo.motivo).toBe("expirado");
  });

  it("marcar o expurgo é idempotente: a segunda passada não acha nada", async () => {
    const primeiro = await q.expurgo.marcarClipesExpurgados([IDS.vencido], "expirado");
    expect(primeiro).toBe(1);
    const segundo = await q.expurgo.marcarClipesExpurgados([IDS.vencido], "expirado");
    expect(segundo, "o job reapagaria o mesmo clipe todo dia").toBe(0);

    const { rows } = await pool.query<{
      deleted_reason: string;
      status: string;
      pinned: boolean;
      purgado: boolean;
    }>(
      `SELECT deleted_reason, status::text AS status, pinned, purged_at IS NOT NULL AS purgado
         FROM clip WHERE id = $1`,
      [IDS.vencido],
    );
    expect(rows[0]!.deleted_reason).toBe("expirado");
    expect(rows[0]!.status).toBe("expired");
    expect(rows[0]!.pinned).toBe(false);
    expect(rows[0]!.purgado).toBe(true);

    const depois = await q.expurgo.clipesVencidosParaExpurgo(100);
    expect(depois.map((l) => l.id)).not.toContain(IDS.vencido);
  });

  it("o takedown entra na MESMA varredura e mantém o motivo dele", async () => {
    // O caminho que o painel percorre: `deleted_at` primeiro (o SLA corre), S3
    // depois. Simulamos a falha do S3 — a linha fica marcada e os bytes ficam.
    await q.painelPrivacidade.marcarClipesRemovidos(
      IDS.partner,
      [IDS.vivo],
      "takedown RJ-2026-0001",
      null,
    );

    const lote = await q.expurgo.clipesVencidosParaExpurgo(100);
    const alvo = lote.find((l) => l.id === IDS.vivo);
    expect(alvo, "o takedown sem bytes apagados não entrou na fila do expurgo").toBeDefined();
    expect(alvo!.por_retencao).toBe(false);
    expect(alvo!.motivo).toBe("takedown RJ-2026-0001");

    await q.expurgo.marcarClipesExpurgados([IDS.vivo], "takedown");
    const { rows } = await pool.query<{ deleted_reason: string }>(
      `SELECT deleted_reason FROM clip WHERE id = $1`,
      [IDS.vivo],
    );
    // O motivo original SOBREVIVE: é a única prova de por que aquele vídeo saiu.
    expect(rows[0]!.deleted_reason).toBe("takedown RJ-2026-0001");
  });

  it("o termômetro zera quando a fila esvazia", async () => {
    const fila = await q.expurgo.contarClipesVencidos();
    expect(fila.pendentes).toBe(0);
  });
});
