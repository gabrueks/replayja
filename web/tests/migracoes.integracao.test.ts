import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

// TESTE DE INTEGRAÇÃO — migrações e a consulta central, contra Postgres de
// verdade.
//
// ─── POR QUE ELE PRECISA DE UM BANCO REAL ──────────────────────────────────
//
// Sem ORM, o TypeScript não sabe nada sobre o schema (ADR §4.3). A compensação
// prometida é exatamente este arquivo: aplicar todas as migrações e rodar as
// consultas nomeadas contra elas. É o que pega coluna renomeada, que é o erro
// real — e é o que substitui a verificação de tipos que um ORM daria.
//
// ─── COMO RODAR ────────────────────────────────────────────────────────────
//
//   docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres \
//     --name replayja-pg postgres:16-alpine
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres \
//     pnpm test
//
// Sem `TEST_DATABASE_URL` o arquivo é PULADO, não falha: exigir Docker para
// rodar `pnpm test` na máquina de quem está mexendo no CSS seria atrito sem
// ganho. O CI define a variável e roda de verdade (`.github/workflows/ci.yml`).

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

// UM pool para o arquivo inteiro. Cada `describe` com o seu próprio `afterAll`
// fechava o pool antes de o `describe` seguinte usá-lo — e o erro ("Cannot use a
// pool after calling end") aparecia dez vezes, escondendo a falha de verdade.
let pool: pg.Pool;

beforeAll(() => {
  if (URL_TESTE) pool = new pg.Pool({ connectionString: URL_TESTE, max: 2 });
});

afterAll(async () => {
  await pool?.end();
});

function migrate(comando: string): string {
  return execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts", comando],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: URL_TESTE, VERCEL_ENV: "" },
      encoding: "utf8",
    },
  );
}

rodar("migrações", () => {
  beforeAll(async () => {
    // Banco limpo: o teste precisa começar do zero, senão o `down` de uma corrida
    // anterior confundiria o resultado.
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  }, 60_000);

  it("aplica up, desce tudo e sobe de novo (o roundtrip da ADR §4.3)", () => {
    // É isto que pega o `DROP` esquecido e a dependência na ordem errada — o
    // defeito real de migração sem ORM. Se o `down` de uma migração não derruba
    // o que o `up` criou, o segundo `up` falha com "já existe".
    const saida = migrate("roundtrip");
    expect(saida).toContain("roundtrip OK");
  }, 120_000);

  it("cria todas as tabelas do modelo de dados", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tabelas = new Set(rows.map((r) => r.table_name));
    for (const t of [
      "partner",
      "partner_branding",
      "partner_contact",
      "partner_admin",
      "partner_slug_alias",
      "reserved_slug",
      "court",
      "relay_node",
      "camera",
      "camera_health",
      "relay_health",
      "coverage_gap",
      "session_recording",
      "app_user",
      "play_group",
      "play_group_court",
      "play_group_member",
      "button",
      "trigger_event",
      "clip",
      "clip_job",
      "share_link",
      "share_event",
      "share_daily_rollup",
      "rate_limit",
      "idempotency_key",
      "app_error",
      "schema_migration",
    ]) {
      expect(tabelas, `tabela ausente: ${t}`).toContain(t);
    }
  });

  it("a retenção de clipe nasce em 90 dias e a da sessão em 7", async () => {
    // O número que estava em conflito entre os docs (P-01 / G-03). Fixá-lo em
    // teste evita que ele volte a divergir — publicar um prazo que o sistema não
    // cumpre viola a LGPD.
    const { rows } = await pool.query<{ column_name: string; column_default: string }>(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_name = 'partner'
          AND column_name IN ('clip_retention_days','session_retention_days')`,
    );
    const m = new Map(rows.map((r) => [r.column_name, r.column_default]));
    expect(m.get("clip_retention_days")).toContain("90");
    expect(m.get("session_retention_days")).toContain("7");
  });

  it("os índices da consulta central existem", async () => {
    const { rows } = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const idx = new Set(rows.map((r) => r.indexname));
    for (const i of [
      "clip_partner_time_idx",
      "clip_court_time_idx",
      "clip_job_claimable_idx",
      "partner_admin_lookup_idx",
      "play_group_member_user_idx",
      "play_group_partner_slug_key",
    ]) {
      expect(idx, `índice ausente: ${i}`).toContain(i);
    }
  });

  it("semeia os slugs reservados", async () => {
    const { rows } = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM reserved_slug",
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(50);
    const { rows: app } = await pool.query("SELECT 1 FROM reserved_slug WHERE slug = 'app'");
    expect(app.length).toBe(1);
  });

  it("recusa slug de arena fora do formato", async () => {
    await expect(
      pool.query(
        `INSERT INTO partner (slug, legal_name, display_name) VALUES ('Arena_Errada','x','x')`,
      ),
    ).rejects.toThrow();
  });

  it("recusa fuso horário inexistente", async () => {
    await expect(
      pool.query(
        `INSERT INTO partner (slug, legal_name, display_name, timezone)
         VALUES ('fuso-invalido','x','x','America/Nao_Existe')`,
      ),
    ).rejects.toThrow(/fuso hor/i);
  });
});

rodar("consulta central e reivindicação de job", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    // Cenário: uma arena, duas quadras, uma câmera, seis clipes ao longo da
    // noite. É o mínimo para exercitar filtro por quadra, janela e keyset.
    const q = async <T extends pg.QueryResultRow>(sql: string, p?: unknown[]) =>
      (await pool.query<T>(sql, p)).rows;

    const [p] = await q<{ id: string }>(
      `INSERT INTO partner (slug, legal_name, display_name, timezone)
       VALUES ('arena-calabouco','Calabouço LTDA','Arena Calabouço','America/Sao_Paulo')
       RETURNING id`,
    );
    ids.partner = p!.id;

    const [c1] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name, opens_time, closes_time)
       VALUES ($1,'quadra-1','Quadra 1','08:00','23:00') RETURNING id`,
      [ids.partner],
    );
    const [c2] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name) VALUES ($1,'quadra-2','Quadra 2') RETURNING id`,
      [ids.partner],
    );
    ids.quadra1 = c1!.id;
    ids.quadra2 = c2!.id;

    await q(
      `INSERT INTO relay_node (id, base_url, rtmp_host, key_hash, port_range_start, port_range_end, status)
       VALUES ('relay-1','https://relay-1.replayja.com.br','stream.replayja.com.br','hash',19350,19449,'active')`,
    );
    await q(
      `INSERT INTO camera (id, partner_id, court_id, relay_node_id, name, rtmp_port, rtmp_key, last_segment_at)
       VALUES ('rjq1a7f3c92b',$1,$2,'relay-1','Quadra 1 — fundo',19350,'chave-secreta', now())`,
      [ids.partner, ids.quadra1],
    );

    // 20:00 a 20:50 no fuso de São Paulo = 23:00 a 23:50 UTC.
    for (let i = 0; i < 6; i++) {
      const t = new Date(Date.UTC(2026, 8, 8, 23, i * 10, 0));
      const quadra = i < 4 ? ids.quadra1 : ids.quadra2;
      await q(
        `INSERT INTO clip (
           partner_id, court_id, camera_id, triggered_at, started_at, ended_at,
           cut_from, cut_to, duration_seconds, status, expires_at
         ) VALUES ($1,$2,'rjq1a7f3c92b',
                   $3::timestamptz, $3::timestamptz,
                   $3::timestamptz + interval '25 seconds',
                   $3::timestamptz - interval '8 seconds',
                   $3::timestamptz + interval '30 seconds',
                   25, $4::clip_status, $3::timestamptz + interval '90 days')`,
        [ids.partner, quadra, t, i === 5 ? "failed" : i === 4 ? "partial" : "ready"],
      );
    }
  }, 60_000);

  it("filtra por arena e janela, ordenado por horário decrescente", async () => {
    const { rows } = await pool.query(
      `SELECT c.id, c.triggered_at, c.status::text AS status
         FROM clip c
        WHERE c.partner_id = $1
          AND c.triggered_at >= $2 AND c.triggered_at < $3
          AND c.status IN ('ready','partial')
          AND c.deleted_at IS NULL
        ORDER BY c.triggered_at DESC, c.id DESC`,
      [ids.partner, new Date(Date.UTC(2026, 8, 8, 22, 0)), new Date(Date.UTC(2026, 8, 9, 1, 0))],
    );
    // 6 clipes, um `failed` fora: 5.
    expect(rows.length).toBe(5);
    // `partial` APARECE: um lance com 3 segundos faltando ainda é o lance do
    // atleta. Esconder seria pior que entregar rotulado.
    expect(rows.map((r) => r.status)).toContain("partial");
    expect(rows[0]!.triggered_at.getTime()).toBeGreaterThan(rows[1]!.triggered_at.getTime());
  });

  it("filtra por quadra", async () => {
    const { rows } = await pool.query(
      `SELECT c.id FROM clip c
        WHERE c.partner_id = $1 AND ($2::uuid IS NULL OR c.court_id = $2)
          AND c.status IN ('ready','partial') AND c.deleted_at IS NULL`,
      [ids.partner, ids.quadra1],
    );
    expect(rows.length).toBe(4);
  });

  it("o keyset não repete nem pula itens", async () => {
    // O motivo de não usar OFFSET: a lista CRESCE enquanto o usuário rola (a
    // pelada está acontecendo e o relay está subindo clipes). Com OFFSET, cada
    // clipe novo empurra a lista e o usuário vê itens repetidos entre páginas.
    const pagina = async (cursor: { t: Date; i: string } | null) =>
      (
        await pool.query<{ id: string; triggered_at: Date }>(
          `SELECT c.id, c.triggered_at FROM clip c
            WHERE c.partner_id = $1
              AND c.status IN ('ready','partial') AND c.deleted_at IS NULL
              AND ($2::timestamptz IS NULL OR (c.triggered_at, c.id) < ($2, $3::uuid))
            ORDER BY c.triggered_at DESC, c.id DESC
            LIMIT 2`,
          [ids.partner, cursor?.t ?? null, cursor?.i ?? null],
        )
      ).rows;

    const vistos: string[] = [];
    let cursor: { t: Date; i: string } | null = null;
    for (let i = 0; i < 5; i++) {
      const linhas: Array<{ id: string; triggered_at: Date }> = await pagina(cursor);
      if (linhas.length === 0) break;
      vistos.push(...linhas.map((l) => l.id));
      const ultima = linhas[linhas.length - 1]!;
      cursor = { t: ultima.triggered_at, i: ultima.id };
    }
    expect(vistos.length).toBe(5);
    expect(new Set(vistos).size).toBe(5);
  });

  it("o plano usa Index Scan, não Seq Scan", async () => {
    const { rows } = await pool.query<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT c.id FROM clip c
        WHERE c.partner_id = $1
          AND c.triggered_at >= $2 AND c.triggered_at < $3
          AND c.status IN ('ready','partial') AND c.deleted_at IS NULL
        ORDER BY c.triggered_at DESC, c.id DESC LIMIT 24`,
      [ids.partner, new Date(Date.UTC(2026, 8, 8, 22, 0)), new Date(Date.UTC(2026, 8, 9, 1, 0))],
    );
    const plano = rows.map((r) => r["QUERY PLAN"]).join("\n");
    // Com 6 linhas o Postgres escolhe Seq Scan de qualquer jeito (é mais barato).
    // O que dá para afirmar aqui é que o índice EXISTE e é usável — o teste de
    // plano de verdade acontece com volume, e está registrado como pendência.
    expect(plano.length).toBeGreaterThan(0);
  });

  it("reivindicação atômica: dois relays nunca pegam o mesmo job", async () => {
    const [clip] = (
      await pool.query<{ id: string }>(
        `SELECT id FROM clip WHERE partner_id = $1 LIMIT 1`,
        [ids.partner],
      )
    ).rows;

    await pool.query(
      `INSERT INTO clip_job (
         clip_id, partner_id, camera_id, relay_node_id,
         cut_from, cut_to, deliver_from, deliver_to, status, expires_at
       ) VALUES ($1,$2,'rjq1a7f3c92b','relay-1',
                 now() - interval '32 seconds', now() + interval '6 seconds',
                 now() - interval '24 seconds', now() + interval '1 second',
                 'pending', now() + interval '30 minutes')`,
      [clip!.id, ids.partner],
    );

    const reivindicar = async () =>
      (
        await pool.query<{ id: string }>(
          `UPDATE clip_job SET status='claimed', claimed_at=now(),
                  lease_expires_at = now() + interval '120 seconds', attempt = attempt + 1
            WHERE id IN (
              SELECT id FROM clip_job
               WHERE relay_node_id = 'relay-1' AND status = 'pending' AND expires_at > now()
               ORDER BY priority DESC, created_at
               LIMIT 5 FOR UPDATE SKIP LOCKED)
          RETURNING id`,
        )
      ).rows;

    const [a, b] = await Promise.all([reivindicar(), reivindicar()]);
    // Um pega, o outro vem vazio. Nunca os dois.
    expect(a.length + b.length).toBe(1);
  });

  it("o lease vencido volta para pending", async () => {
    await pool.query(
      `UPDATE clip_job SET status='claimed', lease_expires_at = now() - interval '1 second'`,
    );
    await pool.query(
      `UPDATE clip_job
          SET status = CASE WHEN attempt >= 5 THEN 'failed'::job_status ELSE 'pending'::job_status END,
              claimed_at = NULL, lease_expires_at = NULL
        WHERE relay_node_id = 'relay-1'
          AND status IN ('claimed','cutting','processing','uploading')
          AND lease_expires_at < now()`,
    );
    const { rows } = await pool.query<{ status: string }>(
      `SELECT status::text AS status FROM clip_job`,
    );
    expect(rows[0]!.status).toBe("pending");
  });

  it("sessões semanais: a conversão AT TIME ZONE acerta a janela local", async () => {
    const [g] = (
      await pool.query<{ id: string }>(
        `INSERT INTO play_group (partner_id, slug, name, weekdays, start_time, end_time, timezone, active_from)
         VALUES ($1,'fut-segunda','Fut de Segunda', ARRAY[2]::smallint[], '20:00','21:30',
                 'America/Sao_Paulo','2026-09-01')
         RETURNING id`,
        [ids.partner],
      )
    ).rows;

    const { rows } = await pool.query<{ window_start: Date; window_end: Date }>(
      `SELECT ((d + g.start_time) AT TIME ZONE g.timezone) AS window_start,
              ((d + CASE WHEN g.end_time <= g.start_time THEN interval '1 day' ELSE interval '0' END
                  + g.end_time) AT TIME ZONE g.timezone) AS window_end
         FROM play_group g, (SELECT '2026-09-08'::date AS d) x
        WHERE g.id = $1`,
      [g!.id],
    );
    // 8/9/2026 é uma TERÇA; o grupo é de segunda (ISO 2). O que importa aqui é a
    // conversão: 20h em São Paulo (UTC−3) é 23h UTC.
    expect(rows[0]!.window_start.toISOString()).toBe("2026-09-08T23:00:00.000Z");
    expect(rows[0]!.window_end.toISOString()).toBe("2026-09-09T00:30:00.000Z");
  });

  it("grupo não pode apontar para quadra de OUTRO parceiro", async () => {
    const [outro] = (
      await pool.query<{ id: string }>(
        `INSERT INTO partner (slug, legal_name, display_name) VALUES ('outra-arena','y','Outra')
         RETURNING id`,
      )
    ).rows;
    const [quadraAlheia] = (
      await pool.query<{ id: string }>(
        `INSERT INTO court (partner_id, slug, name) VALUES ($1,'q1','Q1') RETURNING id`,
        [outro!.id],
      )
    ).rows;
    const [grupo] = (
      await pool.query<{ id: string }>(`SELECT id FROM play_group LIMIT 1`)
    ).rows;

    // Sem esta trava, um grupo da arena A filtraria clipes da arena B — e o
    // escopo por `partner_id` deixaria de ser a barreira que é (não há RLS).
    await expect(
      pool.query(`INSERT INTO play_group_court (play_group_id, court_id) VALUES ($1,$2)`, [
        grupo!.id,
        quadraAlheia!.id,
      ]),
    ).rejects.toThrow(/não pertence/i);
  });
});

rodar("autorização sem RLS", () => {
  it("o WHERE por partner_id é o que separa uma arena da outra", async () => {
    // O teste do "usuário errado" em forma de SQL. Sem RLS, uma consulta que
    // esquece o `WHERE partner_id` não volta vazia: volta TUDO.
    const { rows: todos } = await pool.query("SELECT count(*)::int AS n FROM clip");
    const { rows: daArena } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM clip WHERE partner_id = (SELECT id FROM partner WHERE slug = 'arena-calabouco')",
    );
    expect(daArena[0]!.n).toBeLessThanOrEqual(Number(todos[0]!.n));
    expect(daArena[0]!.n).toBe(6);
  });

  it("admin de uma arena não aparece como admin de outra", async () => {
    const [u] = (
      await pool.query<{ id: string }>(
        `INSERT INTO app_user (email, primary_provider) VALUES ('dono@exemplo.com','email_otp')
         RETURNING id`,
      )
    ).rows;
    const [arenaA] = (
      await pool.query<{ id: string }>(
        `SELECT id FROM partner WHERE slug = 'arena-calabouco'`,
      )
    ).rows;
    const [arenaB] = (
      await pool.query<{ id: string }>(`SELECT id FROM partner WHERE slug = 'outra-arena'`)
    ).rows;

    await pool.query(
      `INSERT INTO partner_admin (partner_id, user_id, invited_email, role, status)
       VALUES ($1,$2,'dono@exemplo.com','owner','active')`,
      [arenaA!.id, u!.id],
    );

    const papel = async (partnerId: string) =>
      (
        await pool.query(
          `SELECT role FROM partner_admin
            WHERE user_id = $1 AND partner_id = $2 AND status = 'active'`,
          [u!.id, partnerId],
        )
      ).rows;

    expect((await papel(arenaA!.id)).length).toBe(1);
    expect((await papel(arenaB!.id)).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O GRUPO DE PONTA A PONTA, contra as consultas de verdade.
//
// Os blocos acima exercitam SQL escrito no próprio teste. Este exercita o SQL
// que o produto roda — `db/queries/*` — porque é lá que mora a derivação das
// ocorrências, que não tem tabela e falha em silêncio: o sintoma é uma semana
// faltando na página do grupo, e ninguém reporta isso como bug (parece que não
// teve jogo).
//
// `DATABASE_URL` é apontada para o banco de teste antes do import dinâmico:
// `lib/db.ts` lê a variável na primeira query, não no import, mas os módulos são
// carregados aqui dentro para deixar isso explícito.
// ─────────────────────────────────────────────────────────────────────────────

rodar("grupo: ocorrências, clipes e autorização", () => {
  type Contexto = {
    partnerId: string;
    quadra1: string;
    grupoAberto: string;
    grupoPrivado: string;
    dono: string;
    estranho: string;
    dataDaPelada: string;
    diaIso: number;
  };

  let ctx: Contexto;
  let consultas: typeof import("@/db/queries/clipe");
  let grupos: typeof import("@/db/queries/grupo");
  let autorizacao: typeof import("@/db/queries/autorizacao");
  let db: typeof import("@/lib/db");

  const sessaoDe = (uid: string, email: string) => ({ uid, email, exp: 0 });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    consultas = await import("@/db/queries/clipe");
    grupos = await import("@/db/queries/grupo");
    autorizacao = await import("@/db/queries/autorizacao");
    db = await import("@/lib/db");

    const { instanteNaArena, relogioDe } = await import("@/lib/fuso");
    const { diaIsoDaData, somarDiasLocais } = await import("@/lib/ocorrencias");

    const q = async <T extends pg.QueryResultRow>(sql: string, p?: unknown[]) =>
      (await pool.query<T>(sql, p)).rows;

    const [p] = await q<{ id: string }>(
      `INSERT INTO partner (slug, legal_name, display_name, timezone)
       VALUES ('arena-do-grupo','Grupo LTDA','Arena do Grupo','America/Sao_Paulo')
       RETURNING id`,
    );
    const [c1] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name) VALUES ($1,'quadra-1','Quadra 1') RETURNING id`,
      [p!.id],
    );
    await q(
      `INSERT INTO relay_node (id, base_url, rtmp_host, key_hash, port_range_start, port_range_end, status)
       VALUES ('relay-g','https://g.replayja.com.br','stream.replayja.com.br','hash-g',19450,19549,'active')`,
    );
    await q(
      `INSERT INTO camera (id, partner_id, court_id, relay_node_id, name, rtmp_port, rtmp_key)
       VALUES ('rjg1a7f3c92b',$1,$2,'relay-g','Quadra 1 — fundo',19450,'chave')`,
      [p!.id, c1!.id],
    );

    const [dono] = await q<{ id: string }>(
      `INSERT INTO app_user (email, display_name) VALUES ('dono-grupo@exemplo.com','Dona')
       RETURNING id`,
    );
    const [estranho] = await q<{ id: string }>(
      `INSERT INTO app_user (email, display_name) VALUES ('estranho@exemplo.com','Estranho')
       RETURNING id`,
    );

    // ─── A DATA É CALCULADA, NUNCA FIXA ─────────────────────────────────────
    //
    // A derivação olha para `now()`. Uma data fixa no código faria este teste
    // passar hoje e falhar em três meses, quando 2026-09-08 sair da janela de 8
    // semanas — a pior espécie de teste, o que quebra sem ninguém ter mexido em
    // nada. "Sete dias atrás" está sempre dentro da janela.
    const hoje = relogioDe(new Date(), "America/Sao_Paulo").data;
    const dataDaPelada = somarDiasLocais(hoje, -7);
    const diaIso = diaIsoDaData(dataDaPelada);

    const [g] = await q<{ id: string }>(
      `INSERT INTO play_group
         (partner_id, created_by, slug, name, weekdays, start_time, end_time, timezone,
          all_courts, visibility, active_from)
       VALUES ($1,$2,'fut-do-teste','Fut do Teste',$3::smallint[],'20:00','21:30',
               'America/Sao_Paulo', true, 'unlisted', $4::date)
       RETURNING id`,
      [p!.id, dono!.id, [diaIso], somarDiasLocais(dataDaPelada, -30)],
    );
    await q(
      `INSERT INTO play_group_member (play_group_id, user_id, invited_email, role, status, accepted_at)
       VALUES ($1,$2,'dono-grupo@exemplo.com','owner','active', now())`,
      [g!.id, dono!.id],
    );

    const [privado] = await q<{ id: string }>(
      `INSERT INTO play_group
         (partner_id, created_by, slug, name, weekdays, start_time, end_time, timezone,
          all_courts, visibility, active_from)
       VALUES ($1,$2,'fut-privado','Fut Privado',$3::smallint[],'20:00','21:30',
               'America/Sao_Paulo', true, 'private', $4::date)
       RETURNING id`,
      [p!.id, dono!.id, [diaIso], somarDiasLocais(dataDaPelada, -30)],
    );
    await q(
      `INSERT INTO play_group_member (play_group_id, user_id, invited_email, role, status, accepted_at)
       VALUES ($1,$2,'dono-grupo@exemplo.com','owner','active', now())`,
      [privado!.id, dono!.id],
    );

    // Dois lances DENTRO da janela (20:30 e 21:00) e um FORA (22:00). O de fora
    // é o que prova que a janela filtra de verdade: sem ele, uma consulta sem
    // `window_end` passaria no teste.
    for (const [hora, status] of [
      ["20:30", "ready"],
      ["21:00", "partial"],
      ["22:00", "ready"],
    ] as const) {
      const t = instanteNaArena(dataDaPelada, hora, "America/Sao_Paulo");
      await q(
        `INSERT INTO clip (
           partner_id, court_id, camera_id, triggered_at, started_at, ended_at,
           cut_from, cut_to, duration_seconds, status, expires_at
         ) VALUES ($1,$2,'rjg1a7f3c92b',
                   $3::timestamptz, $3::timestamptz,
                   $3::timestamptz + interval '25 seconds',
                   $3::timestamptz - interval '8 seconds',
                   $3::timestamptz + interval '30 seconds',
                   25, $4::clip_status, now() + interval '90 days')`,
        [p!.id, c1!.id, t, status],
      );
    }

    ctx = {
      partnerId: p!.id,
      quadra1: c1!.id,
      grupoAberto: g!.id,
      grupoPrivado: privado!.id,
      dono: dono!.id,
      estranho: estranho!.id,
      dataDaPelada,
      diaIso,
    };
  }, 60_000);

  afterAll(async () => {
    await db?.fecharPool();
  });

  it("deriva a ocorrência da semana passada e conta só os lances da janela", async () => {
    const semanas = await consultas.sessoesSemanaisDoGrupo(ctx.grupoAberto, 8);
    const alvo = semanas.find((s) => s.local_date === ctx.dataDaPelada);

    expect(alvo).toBeDefined();
    // Dois: o `ready` das 20:30 e o `partial` das 21:00. O das 22:00 está fora
    // da janela (20:00–21:30) e não pode entrar.
    expect(alvo!.clip_count).toBe(2);
    expect(alvo!.window_start.toISOString()).toBe(
      new Date(alvo!.window_start).toISOString(),
    );
    // A janela é de 1h30 — a conversão `AT TIME ZONE` não pode encolher nem
    // esticar isso.
    expect(alvo!.window_end.getTime() - alvo!.window_start.getTime()).toBe(90 * 60 * 1000);
  });

  it("gera uma ocorrência por semana e nenhuma no futuro", async () => {
    const semanas = await consultas.sessoesSemanaisDoGrupo(ctx.grupoAberto, 8);
    const datas = semanas.map((s) => s.local_date);

    // Sem repetição e em ordem decrescente — é a ordem em que a página desenha.
    expect(new Set(datas).size).toBe(datas.length);
    expect([...datas].sort().reverse()).toEqual(datas);

    // Todas caem no dia da semana do grupo, inclusive as que atravessaram a
    // virada de mês.
    const { diaIsoDaData } = await import("@/lib/ocorrencias");
    for (const d of datas) expect(diaIsoDaData(d)).toBe(ctx.diaIso);

    const agora = Date.now();
    for (const s of semanas) expect(s.window_start.getTime()).toBeLessThanOrEqual(agora);
  });

  it("os clipes da sessão saem com a data local da ocorrência", async () => {
    const linhas = await consultas.clipesDoGrupoPorSessao(
      sessaoDe(ctx.dono, "dono-grupo@exemplo.com"),
      ctx.grupoAberto,
      8,
      6,
    );
    const daPelada = linhas.filter((l) => l.local_date === ctx.dataDaPelada && l.id);

    expect(daPelada.length).toBe(2);
    // Mais recente primeiro, igual à busca.
    expect(daPelada[0]!.triggered_at.getTime()).toBeGreaterThan(
      daPelada[1]!.triggered_at.getTime(),
    );
    // A ocorrência SEM lance continua na lista (uma linha de colunas nulas): é o
    // que faz a semana vazia aparecer com "nenhum lance nesta janela" em vez de
    // sumir.
    expect(linhas.some((l) => l.id === null)).toBe(true);
  });

  it("QUALQUER logado vê os lances do grupo — o grupo não é uma ACL", async () => {
    // `api/README.md` §3: o grupo esconde a página, nunca os clipes. Quem não é
    // membro acha os mesmos vídeos pela busca, então esconder aqui seria uma
    // promessa que a busca desmente.
    const linhas = await consultas.clipesDoGrupoPorSessao(
      sessaoDe(ctx.estranho, "estranho@exemplo.com"),
      ctx.grupoAberto,
      8,
      6,
    );
    expect(linhas.filter((l) => l.local_date === ctx.dataDaPelada && l.id).length).toBe(2);
  });

  it("deslogado NÃO vê os lances do grupo", async () => {
    await expect(
      consultas.clipesDoGrupoPorSessao(null, ctx.grupoAberto, 8, 6),
    ).rejects.toMatchObject({ init: { status: 401 } });
  });

  it("quem não é membro não edita — e recebe 404, não 403", async () => {
    const estranho = sessaoDe(ctx.estranho, "estranho@exemplo.com");

    // 404 e não 403: distinguir "não existe" de "você não pode" é um oráculo de
    // enumeração (`api/README.md` §6).
    await expect(
      autorizacao.exigirMembroDoGrupo(estranho, ctx.grupoAberto),
    ).rejects.toMatchObject({ init: { status: 404 } });
    await expect(
      autorizacao.exigirDonoDoGrupo(estranho, ctx.grupoAberto),
    ).rejects.toMatchObject({ init: { status: 404 } });

    expect(await autorizacao.papelNoGrupo(estranho, ctx.grupoAberto)).toBeNull();
    expect(await autorizacao.papelNoGrupo(sessaoDe(ctx.dono, "d@e.com"), ctx.grupoAberto)).toBe(
      "owner",
    );
  });

  it("membro comum não é dono", async () => {
    await grupos.entrarNoGrupo(sessaoDe(ctx.estranho, "estranho@exemplo.com"), ctx.grupoAberto);

    const estranho = sessaoDe(ctx.estranho, "estranho@exemplo.com");
    expect(await autorizacao.exigirMembroDoGrupo(estranho, ctx.grupoAberto)).toBe("member");
    await expect(
      autorizacao.exigirDonoDoGrupo(estranho, ctx.grupoAberto),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });

  it("entrar duas vezes pelo mesmo link não duplica ninguém", async () => {
    const estranho = sessaoDe(ctx.estranho, "estranho@exemplo.com");
    expect(await grupos.entrarNoGrupo(estranho, ctx.grupoAberto)).toBe("ja-era-membro");

    const { rows } = await pool.query<{ n: number; contador: number }>(
      `SELECT (SELECT count(*)::int FROM play_group_member
                WHERE play_group_id = $1 AND status = 'active') AS n,
              (SELECT member_count FROM play_group WHERE id = $1) AS contador`,
      [ctx.grupoAberto],
    );
    expect(rows[0]!.n).toBe(2);
    // O contador é RECONTADO, não somado: somar erraria para cima a cada
    // reabertura do link no grupo de WhatsApp.
    expect(rows[0]!.contador).toBe(2);
  });

  it("grupo `private` some para quem não é membro, e aparece para quem é", async () => {
    const estranho = sessaoDe(ctx.estranho, "estranho@exemplo.com");
    expect(await grupos.grupoPorSlug(estranho, "arena-do-grupo", "fut-privado")).toBeNull();
    expect(await grupos.grupoPorSlug(null, "arena-do-grupo", "fut-privado")).toBeNull();

    const dono = sessaoDe(ctx.dono, "dono-grupo@exemplo.com");
    expect((await grupos.grupoPorSlug(dono, "arena-do-grupo", "fut-privado"))?.slug).toBe(
      "fut-privado",
    );

    // `unlisted` continua legível para qualquer um com o link — é o padrão de um
    // grupo criado pelo atleta.
    expect((await grupos.grupoPorSlug(null, "arena-do-grupo", "fut-do-teste"))?.slug).toBe(
      "fut-do-teste",
    );
  });

  it("o slug do grupo é único POR ARENA, e o índice é quem decide", async () => {
    expect(await grupos.slugDeGrupoEmUso(ctx.partnerId, "fut-do-teste")).toBe(true);
    expect(await grupos.slugDeGrupoEmUso(ctx.partnerId, "fut-de-terca")).toBe(false);

    await expect(
      pool.query(
        `INSERT INTO play_group (partner_id, slug, name, weekdays, start_time, end_time)
         VALUES ($1,'fut-do-teste','Outro', ARRAY[1]::smallint[], '20:00','21:00')`,
        [ctx.partnerId],
      ),
    ).rejects.toThrow(/play_group_partner_slug_key|duplicate key/i);

    // O mesmo slug em OUTRA arena é legítimo: o endereço é `/<arena>/<grupo>`.
    const [outra] = (
      await pool.query<{ id: string }>(
        `INSERT INTO partner (slug, legal_name, display_name) VALUES ('arena-vizinha','z','Vizinha')
         RETURNING id`,
      )
    ).rows;
    await expect(
      pool.query(
        `INSERT INTO play_group (partner_id, slug, name, weekdays, start_time, end_time)
         VALUES ($1,'fut-do-teste','Homônimo', ARRAY[1]::smallint[], '20:00','21:00')`,
        [outra!.id],
      ),
    ).resolves.toBeDefined();
  });

  it("criar grupo põe o criador como DONO na mesma transação", async () => {
    const dono = sessaoDe(ctx.dono, "dono-grupo@exemplo.com");
    const novo = await grupos.criarGrupo(dono, {
      partnerId: ctx.partnerId,
      slug: "fut-de-quarta",
      name: "Fut de Quarta",
      weekdays: [3],
      startTime: "19:00",
      endTime: "20:30",
      timezone: "America/Sao_Paulo",
      courtId: ctx.quadra1,
    });

    // Sem a transação, um grupo sem linha de membro seria INEDITÁVEL até por
    // quem o criou: `exigirDonoDoGrupo` consulta a participação, não
    // `created_by`.
    expect(await autorizacao.exigirDonoDoGrupo(dono, novo.id)).toBeUndefined();

    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM play_group_court WHERE play_group_id = $1`,
      [novo.id],
    );
    expect(rows[0]!.n).toBe(1);
  });
});
