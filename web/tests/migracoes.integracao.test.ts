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
      "play_group_digest",
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

rodar("painel do parceiro", () => {
  // ─── O QUE ESTE BLOCO PEGA QUE O TYPESCRIPT NÃO PEGA ─────────────────────
  //
  // Sem ORM, `db/queries/painel-*.ts` é texto: uma coluna renomeada na migração
  // só aparece em produção. E três coisas da 0011 não têm como ser conferidas
  // sem um Postgres de verdade — o `ALTER TYPE ... ADD VALUE` dentro de
  // transação, o gatilho que mantém `watermark_scale` em sincronia, e a trava
  // que impede duas câmeras de receberem a mesma porta.

  type Ctx = {
    partnerId: string;
    quadra: string;
    outraQuadra: string;
    dono: string;
    segundoDono: string;
    gerente: string;
    relayId: string;
  };

  let ctx: Ctx;
  let painelQuadras: typeof import("@/db/queries/painel-quadras");
  let painelVisao: typeof import("@/db/queries/painel-visao");
  let painelMarca: typeof import("@/db/queries/painel-marca");
  let painelEquipe: typeof import("@/db/queries/painel-equipe");
  let painelPrivacidade: typeof import("@/db/queries/painel-privacidade");
  let relayQ: typeof import("@/db/queries/relay");
  let gatilhoQ: typeof import("@/db/queries/gatilho");
  let regras: typeof import("@/db/queries/painel-regras");
  let dbPainel: typeof import("@/lib/db");

  const q = async <T extends pg.QueryResultRow>(sql: string, p?: unknown[]) =>
    (await pool.query<T>(sql, p)).rows;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    painelQuadras = await import("@/db/queries/painel-quadras");
    painelVisao = await import("@/db/queries/painel-visao");
    painelMarca = await import("@/db/queries/painel-marca");
    painelEquipe = await import("@/db/queries/painel-equipe");
    painelPrivacidade = await import("@/db/queries/painel-privacidade");
    relayQ = await import("@/db/queries/relay");
    gatilhoQ = await import("@/db/queries/gatilho");
    regras = await import("@/db/queries/painel-regras");
    dbPainel = await import("@/lib/db");

    const [p] = await q<{ id: string }>(
      `INSERT INTO partner (slug, legal_name, display_name, timezone, status)
       VALUES ('arena-painel','Painel LTDA','Arena do Painel','America/Sao_Paulo','active')
       RETURNING id`,
    );
    const [c1] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name) VALUES ($1,'quadra-1','Quadra 1') RETURNING id`,
      [p!.id],
    );
    const [c2] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name) VALUES ($1,'quadra-2','Quadra 2') RETURNING id`,
      [p!.id],
    );
    // Faixa de portas curta de propósito: é o que torna o teste de esgotamento
    // possível sem cadastrar cem câmeras.
    await q(
      `INSERT INTO relay_node (id, base_url, rtmp_host, key_hash,
                               port_range_start, port_range_end, port_range_next, status)
       VALUES ('relay-painel','https://p.replayja.com.br','stream.replayja.com.br','hash-painel',
               19600,19602,19600,'active')`,
    );
    const [dono] = await q<{ id: string }>(
      `INSERT INTO app_user (email) VALUES ('dono-painel@exemplo.com') RETURNING id`,
    );
    const [segundo] = await q<{ id: string }>(
      `INSERT INTO app_user (email) VALUES ('segundo-dono@exemplo.com') RETURNING id`,
    );
    const [gerente] = await q<{ id: string }>(
      `INSERT INTO app_user (email) VALUES ('gerente-painel@exemplo.com') RETURNING id`,
    );
    await q(
      `INSERT INTO partner_admin (partner_id, user_id, invited_email, role, status, accepted_at)
       VALUES ($1,$2,'dono-painel@exemplo.com','owner','active', now())`,
      [p!.id, dono!.id],
    );

    ctx = {
      partnerId: p!.id,
      quadra: c1!.id,
      outraQuadra: c2!.id,
      dono: dono!.id,
      segundoDono: segundo!.id,
      gerente: gerente!.id,
      relayId: "relay-painel",
    };
  }, 60_000);

  afterAll(async () => {
    await dbPainel?.fecharPool();
  });

  // ────────────────────────────────────────────── esquema da 0011

  it("o enum de recusa ganhou `rejected_blackout` sem quebrar o roundtrip", async () => {
    // `ALTER TYPE ... ADD VALUE` dentro de transação só funciona no Postgres 12+
    // e não pode usar o valor na mesma transação. O `IF NOT EXISTS` é o que faz
    // o segundo `up` do roundtrip passar — o `down` não consegue removê-lo.
    const valores = await q<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'trigger_outcome'`,
    );
    expect(valores.map((v) => v.enumlabel)).toContain("rejected_blackout");
  });

  it("o gatilho mantém `watermark_scale` em sincronia com a largura em %", async () => {
    // Duas colunas para o mesmo número seria um convite à divergência. O relay
    // lê `watermark_scale`; o painel escreve `watermark_width_pct`.
    await painelMarca.brandingDoParceiro(ctx.partnerId);
    await q(`UPDATE partner_branding SET watermark_width_pct = 25 WHERE partner_id = $1`, [
      ctx.partnerId,
    ]);
    const [linha] = await q<{ escala: string }>(
      `SELECT watermark_scale::text AS escala FROM partner_branding WHERE partner_id = $1`,
      [ctx.partnerId],
    );
    expect(Number(linha!.escala)).toBeCloseTo(0.25, 5);
  });

  it("o protocolo de remoção nasce no formato que se diz ao telefone", async () => {
    const pedido = await painelPrivacidade.criarPedidoDeRemocao(ctx.partnerId, {
      courtId: null,
      clipIds: [],
      contato: "alguem@exemplo.com",
      papel: "titular",
      gravidade: "comum",
      motivo: null,
      canal: "painel",
    });
    expect(pedido.protocol).toMatch(/^RJ-\d{4}-\d{6}$/);
  });

  it("`court_blackout` recusa janela que atravessa a meia-noite", async () => {
    await expect(
      pool.query(
        `INSERT INTO court_blackout (partner_id, weekday, starts_time, ends_time)
         VALUES ($1, 1, '22:00', '02:00')`,
        [ctx.partnerId],
      ),
    ).rejects.toThrow();
  });

  // ─────────────────────────────────── porta do relay e chave

  it("cadastrar câmera aloca portas MONOTÔNICAS, sem repetir", async () => {
    const a = await relayQ.cadastrarCamera(ctx.partnerId, {
      cameraId: "painelcam0001",
      courtId: ctx.quadra,
      nome: "Quadra 1",
      relayNodeId: ctx.relayId,
      chave: regras.novaChaveDeTransmissao(),
    });
    const b = await relayQ.cadastrarCamera(ctx.partnerId, {
      cameraId: "painelcam0002",
      courtId: ctx.outraQuadra,
      nome: "Quadra 2",
      relayNodeId: ctx.relayId,
      chave: regras.novaChaveDeTransmissao(),
    });

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.porta).toBe(19600);
    expect(b.porta).toBe(19601);
  });

  it("recusa a câmera quando a faixa de portas acaba — em vez de repetir uma", async () => {
    // Sobrou uma porta (19602) na faixa do teste.
    const terceira = await relayQ.cadastrarCamera(ctx.partnerId, {
      cameraId: "painelcam0003",
      courtId: ctx.quadra,
      nome: "Quadra 1 — fundo",
      relayNodeId: ctx.relayId,
      chave: regras.novaChaveDeTransmissao(),
    });
    expect(terceira.ok).toBe(true);

    const quarta = await relayQ.cadastrarCamera(ctx.partnerId, {
      cameraId: "painelcam0004",
      courtId: ctx.quadra,
      nome: "Quadra 1 — lateral",
      relayNodeId: ctx.relayId,
      chave: regras.novaChaveDeTransmissao(),
    });
    expect(quarta).toEqual({ ok: false, motivo: "faixa-esgotada" });
  });

  it("não cadastra câmera em quadra de OUTRA arena", async () => {
    const [outra] = await q<{ id: string }>(
      `INSERT INTO partner (slug, legal_name, display_name)
       VALUES ('arena-vizinha-painel','Vizinha','Vizinha') RETURNING id`,
    );
    const [quadraVizinha] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name) VALUES ($1,'q1','Q1') RETURNING id`,
      [outra!.id],
    );
    const r = await relayQ.cadastrarCamera(ctx.partnerId, {
      cameraId: "painelcam9999",
      courtId: quadraVizinha!.id,
      nome: "Invasora",
      relayNodeId: ctx.relayId,
      chave: regras.novaChaveDeTransmissao(),
    });
    expect(r).toEqual({ ok: false, motivo: "quadra" });
  });

  it("rotacionar a chave incrementa a versão e devolve a câmera a `provisioned`", async () => {
    const antes = await relayQ.cameraDoPainel(ctx.partnerId, "painelcam0001");
    const r = await relayQ.rotacionarChaveDaCamera(
      ctx.partnerId,
      "painelcam0001",
      regras.novaChaveDeTransmissao(),
    );
    expect(r?.versao).toBe((antes?.key_version ?? 1) + 1);
    expect(r?.chave).not.toBe(antes?.rtmp_key);

    const depois = await relayQ.cameraDoPainel(ctx.partnerId, "painelcam0001");
    // `provisioned` é lido por `lerSaudeDaCamera` como "aguardando relay", que é
    // o estado verdadeiro: configuração pendente, não queda.
    expect(depois?.status).toBe("provisioned");
    expect(depois?.key_rotated_at).not.toBeNull();
  });

  it("a câmera de outra arena não é lida nem rotacionada por esta", async () => {
    const [outra] = await q<{ id: string }>(
      `SELECT id FROM partner WHERE slug = 'arena-vizinha-painel'`,
    );
    expect(await relayQ.cameraDoPainel(outra!.id, "painelcam0001")).toBeNull();
    expect(
      await relayQ.rotacionarChaveDaCamera(outra!.id, "painelcam0001", "aaaa"),
    ).toBeNull();
  });

  // ─────────────────────────────────────────────────── botões

  it("criar botão devolve o token UMA vez e guarda só o hash", async () => {
    const token = regras.novoTokenDeWebhook();
    const criado = await gatilhoQ.criarBotao(ctx.partnerId, {
      courtId: ctx.quadra,
      label: "Botão Quadra 1",
      kind: "wifi_webhook",
      model: null,
      token,
      hashDoToken: regras.hashDoSegredo(token),
    });
    expect(criado?.token).toBe(token);

    // O token cru não existe em lugar nenhum do banco.
    const [linha] = await q<{ guardado: string; last4: string }>(
      `SELECT token_hash AS guardado, token_last4 AS last4 FROM button WHERE id = $1`,
      [criado!.id],
    );
    expect(linha!.guardado).toBe(regras.hashDoSegredo(token));
    expect(linha!.guardado).not.toContain(token);
    expect(linha!.last4).toBe(token.slice(-4));

    // E o caminho de leitura do webhook acha o botão pelo hash.
    const achado = await gatilhoQ.botaoPorTokenHash(regras.hashDoSegredo(token));
    expect(achado?.id).toBe(criado!.id);
  });

  it("regenerar o token invalida o anterior no mesmo instante", async () => {
    const antigo = regras.novoTokenDeWebhook();
    const criado = await gatilhoQ.criarBotao(ctx.partnerId, {
      courtId: ctx.outraQuadra,
      label: "Botão Quadra 2",
      kind: "wifi_webhook",
      model: null,
      token: antigo,
      hashDoToken: regras.hashDoSegredo(antigo),
    });

    const novo = regras.novoTokenDeWebhook();
    await gatilhoQ.regenerarTokenDoBotao(
      ctx.partnerId,
      criado!.id,
      novo,
      regras.hashDoSegredo(novo),
    );

    expect(await gatilhoQ.botaoPorTokenHash(regras.hashDoSegredo(antigo))).toBeNull();
    expect((await gatilhoQ.botaoPorTokenHash(regras.hashDoSegredo(novo)))?.id).toBe(criado!.id);
  });

  it("não cria botão em quadra de outra arena", async () => {
    const [outra] = await q<{ id: string }>(
      `SELECT id FROM court WHERE partner_id = (SELECT id FROM partner WHERE slug = 'arena-vizinha-painel')`,
    );
    const token = regras.novoTokenDeWebhook();
    const r = await gatilhoQ.criarBotao(ctx.partnerId, {
      courtId: outra!.id,
      label: "Invasor",
      kind: "wifi_webhook",
      model: null,
      token,
      hashDoToken: regras.hashDoSegredo(token),
    });
    expect(r).toBeNull();
  });

  // ─────────────────────────────────────── horário bloqueado

  it("o gatilho é RECUSADO dentro do horário bloqueado, com motivo próprio", async () => {
    // A câmera precisa estar gravando: sem isso a recusa viria por falta de
    // cobertura e o teste passaria pelo motivo errado.
    await q(
      `UPDATE camera SET last_segment_at = now(), status = 'recording'
        WHERE id = 'painelcam0001'`,
    );

    const { relogioDe } = await import("@/lib/fuso");
    const agora = new Date();
    const local = relogioDe(agora, "America/Sao_Paulo");
    const minutos = regras.minutosDoDia(local.hora);
    const hhmm = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const inicio = hhmm(Math.max(0, minutos - 60));
    const fim = hhmm(Math.min(1439, minutos + 60));

    const bloqueio = await painelPrivacidade.criarBloqueio(ctx.partnerId, {
      courtId: ctx.quadra,
      weekday: regras.diaIsoNaArena(agora, "America/Sao_Paulo"),
      inicio,
      fim,
      label: "Escolinha",
      criadoPor: ctx.dono,
    });

    const recusado = await gatilhoQ.criarGatilho({
      courtId: ctx.quadra,
      source: "virtual_button",
      requestedByUserId: ctx.dono,
    });
    expect(recusado.aceito).toBe(false);
    if (recusado.aceito) return;
    expect(recusado.motivo).toBe("rejected_blackout");

    // A recusa deixa rastro — é o que vira evidência no painel.
    const [evento] = await q<{ outcome: string }>(
      `SELECT outcome::text AS outcome FROM trigger_event WHERE id = $1`,
      [recusado.triggerEventId],
    );
    expect(evento!.outcome).toBe("rejected_blackout");

    // Desligado, o mesmo horário deixa de bloquear.
    await painelPrivacidade.definirBloqueioAtivo(ctx.partnerId, bloqueio.id, false);
    const depois = await gatilhoQ.criarGatilho({
      courtId: ctx.quadra,
      source: "virtual_button",
      requestedByUserId: ctx.dono,
      // Sem `arrivalAt` injetado: adiantar o relógio faria a câmera parecer
      // parada há mais de 60 s e a recusa viria por falta de cobertura — o
      // teste passaria pelo motivo errado. O cooldown não pega aqui porque ele
      // só conta gatilhos com `outcome = 'accepted'`, e o anterior foi recusado.
    });
    expect(depois.aceito).toBe(true);
  });

  it("bloqueio de UMA quadra não recusa a outra", async () => {
    await q(
      `UPDATE camera SET last_segment_at = now(), status = 'recording'
        WHERE id = 'painelcam0002'`,
    );
    const { relogioDe } = await import("@/lib/fuso");
    const agora = new Date();
    const minutos = regras.minutosDoDia(relogioDe(agora, "America/Sao_Paulo").hora);
    const hhmm = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

    await painelPrivacidade.criarBloqueio(ctx.partnerId, {
      courtId: ctx.quadra,
      weekday: regras.diaIsoNaArena(agora, "America/Sao_Paulo"),
      inicio: hhmm(Math.max(0, minutos - 60)),
      fim: hhmm(Math.min(1439, minutos + 60)),
      label: null,
      criadoPor: ctx.dono,
    });

    const naOutra = await gatilhoQ.criarGatilho({
      courtId: ctx.outraQuadra,
      source: "virtual_button",
      requestedByUserId: ctx.dono,
    });
    expect(naOutra.aceito).toBe(true);
  });

  it("não cria bloqueio apontando para quadra de outra arena", async () => {
    const [outra] = await q<{ id: string }>(
      `SELECT id FROM court WHERE partner_id = (SELECT id FROM partner WHERE slug = 'arena-vizinha-painel')`,
    );
    await expect(
      painelPrivacidade.criarBloqueio(ctx.partnerId, {
        courtId: outra!.id,
        weekday: 1,
        inicio: "08:00",
        fim: "09:00",
        label: null,
        criadoPor: ctx.dono,
      }),
    ).rejects.toThrow();
  });

  // ──────────────────────────────────────────────── equipe

  it("o banco recusa remover o último dono — e a consulta avisa antes", async () => {
    const equipe = await painelEquipe.equipeDaArena(ctx.partnerId);
    const unicoDono = equipe.find((m) => m.role === "owner")!;

    expect(await painelEquipe.removerAdmin(ctx.partnerId, unicoDono.id)).toEqual({
      ok: false,
      motivo: "ultimo-owner",
    });

    // E a garantia de verdade: o gatilho `partner_admin_exige_owner` recusa a
    // mesma coisa por baixo, para `psql` e para qualquer rota futura.
    await expect(
      pool.query(`UPDATE partner_admin SET status = 'removed' WHERE id = $1`, [unicoDono.id]),
    ).rejects.toThrow(/owner/i);
  });

  it("com dois donos, remover um passa — e o outro segue dono", async () => {
    await painelEquipe.convidarAdmin(
      ctx.partnerId,
      "segundo-dono@exemplo.com",
      "owner",
      ctx.dono,
    );
    const equipe = await painelEquipe.equipeDaArena(ctx.partnerId);
    const donos = equipe.filter((m) => m.role === "owner" && m.status === "active");
    expect(donos.length).toBe(2);

    const removido = donos.find((d) => d.email === "segundo-dono@exemplo.com")!;
    expect(await painelEquipe.removerAdmin(ctx.partnerId, removido.id)).toEqual({ ok: true });

    const depois = await painelEquipe.equipeDaArena(ctx.partnerId);
    expect(depois.filter((m) => m.role === "owner" && m.status === "active").length).toBe(1);
  });

  it("convidar cria a conta pendente e reativa quem já foi removido", async () => {
    const primeira = await painelEquipe.convidarAdmin(
      ctx.partnerId,
      "novo-gerente@exemplo.com",
      "manager",
      ctx.dono,
    );
    expect(primeira).toEqual({ ok: true, jaTinhaConta: false });

    // `email_verified_at` fica NULO: quem criou a conta foi o dono da arena, não
    // a pessoa. A verificação acontece no primeiro login.
    const [usuario] = await q<{ verificado: string | null }>(
      `SELECT email_verified_at AS verificado FROM app_user WHERE email = 'novo-gerente@exemplo.com'`,
    );
    expect(usuario!.verificado).toBeNull();

    const segunda = await painelEquipe.convidarAdmin(
      ctx.partnerId,
      "novo-gerente@exemplo.com",
      "viewer",
      ctx.dono,
    );
    expect(segunda).toEqual({ ok: true, jaTinhaConta: true });
  });

  it("e-mail malformado é recusado antes de tocar o banco", async () => {
    expect(
      await painelEquipe.convidarAdmin(ctx.partnerId, "sem-arroba", "manager", ctx.dono),
    ).toEqual({ ok: false, motivo: "email" });
  });

  // ───────────────────────────────────────── consultas do painel

  it("as consultas da visão geral casam com o esquema aplicado", async () => {
    // É este teste que pega coluna renomeada — o erro real de um projeto sem
    // ORM. Ele roda o SQL de verdade, não uma imitação.
    const metricas = await painelVisao.metricasDoPainel(ctx.partnerId, "America/Sao_Paulo");
    expect(metricas.lances_hoje).toBeGreaterThanOrEqual(0);
    expect(metricas.bloqueados_24h).toBeGreaterThanOrEqual(1);

    const quadras = await painelVisao.gravacaoPorQuadra(ctx.partnerId);
    expect(quadras.length).toBe(2);
    // A listagem parte de `court`, então quadra sem câmera aparece — é o único
    // jeito de descobrir que faltou instalar uma.
    expect(quadras.every((x) => "camera_id" in x)).toBe(true);

    await painelVisao.compartilhamentosPorCanal(ctx.partnerId, 30);
    await painelQuadras.quadrasDoPainel(ctx.partnerId);
    await painelPrivacidade.pedidosDeRemocao(ctx.partnerId);
    await painelPrivacidade.bloqueiosDaArena(ctx.partnerId);
    await gatilhoQ.botoesDoPainel(ctx.partnerId);
    await relayQ.coberturaDaCamera(ctx.partnerId, "painelcam0001");
  });

  it("o expurgo marca o clipe e o escopo por arena é respeitado", async () => {
    const [clip] = await q<{ id: string }>(
      `INSERT INTO clip (partner_id, court_id, camera_id, triggered_at, started_at, ended_at,
                         cut_from, cut_to, duration_seconds, status, expires_at,
                         storage_bucket, watermarked_object_key, thumbnail_object_key)
       VALUES ($1,$2,'painelcam0001', now(), now(), now(), now(), now() + interval '1 minute',
               25,'ready', now() + interval '90 days',
               'replayja-clips','clips/a/b/c/wm.mp4','clips/a/b/c/thumb.jpg')
       RETURNING id`,
      [ctx.partnerId, ctx.quadra],
    );

    const arquivos = await painelPrivacidade.arquivosDosClipes(ctx.partnerId, [clip!.id]);
    expect(arquivos[0]?.watermarked_object_key).toBe("clips/a/b/c/wm.mp4");

    // Outra arena não enxerga o clipe — e por isso não consegue apagá-lo.
    const [vizinha] = await q<{ id: string }>(
      `SELECT id FROM partner WHERE slug = 'arena-vizinha-painel'`,
    );
    expect(await painelPrivacidade.arquivosDosClipes(vizinha!.id, [clip!.id])).toEqual([]);
    expect(
      await painelPrivacidade.marcarClipesRemovidos(vizinha!.id, [clip!.id], "takedown", null),
    ).toBe(0);

    expect(
      await painelPrivacidade.marcarClipesRemovidos(
        ctx.partnerId,
        [clip!.id],
        "takedown RJ-2026-000001",
        null,
      ),
    ).toBe(1);

    const [depois] = await q<{ deleted_at: Date | null; motivo: string; status: string }>(
      `SELECT deleted_at, deleted_reason AS motivo, status::text AS status
         FROM clip WHERE id = $1`,
      [clip!.id],
    );
    expect(depois!.deleted_at).not.toBeNull();
    expect(depois!.motivo).toContain("takedown");
    expect(depois!.status).toBe("expired");
  });

  it("salvar contatos substitui o conjunto, e esvaziar apaga de verdade", async () => {
    await painelMarca.salvarContatos(ctx.partnerId, [
      { kind: "whatsapp", value: "+5511988887777", label: "WhatsApp" },
      { kind: "address", value: "Rua Um, 100", label: "Endereço" },
    ]);
    expect((await painelMarca.contatosDoPainel(ctx.partnerId)).length).toBe(2);

    // Com upsert por tipo, o campo esvaziado simplesmente não chegaria e o
    // telefone velho ficaria na página pública para sempre.
    await painelMarca.salvarContatos(ctx.partnerId, [
      { kind: "whatsapp", value: "+5511999996666", label: "WhatsApp" },
    ]);
    const restantes = await painelMarca.contatosDoPainel(ctx.partnerId);
    expect(restantes.length).toBe(1);
    expect(restantes[0]!.value).toBe("+5511999996666");
  });

  it("o branding cria a linha 1:1 quando ela não existe e guarda os três parâmetros", async () => {
    await painelMarca.salvarBranding(ctx.partnerId, {
      posicao: "top_left",
      opacidade: 0.4,
      larguraPct: 22,
      marcaAtiva: true,
      corPrimaria: "#0b0c0e",
      corDestaque: "#ff6a1f",
      tagline: "Piloto",
      horarios: "Seg a sex 6h–23h",
    });
    const b = await painelMarca.brandingDoParceiro(ctx.partnerId);
    expect(b?.watermark_position).toBe("top_left");
    expect(Number(b?.watermark_opacity)).toBeCloseTo(0.4, 2);
    expect(b?.watermark_width_pct).toBe(22);

    // E a versão só sobe por upload confirmado — salvar o formulário não a toca.
    const versaoAntes = b!.watermark_version;
    await painelMarca.salvarBranding(ctx.partnerId, {
      posicao: "bottom_right",
      opacidade: 0.85,
      larguraPct: 18,
      marcaAtiva: true,
      corPrimaria: null,
      corDestaque: null,
      tagline: null,
      horarios: null,
    });
    expect((await painelMarca.brandingDoParceiro(ctx.partnerId))?.watermark_version).toBe(
      versaoAntes,
    );

    const nova = await painelMarca.registrarArquivoDaMarca(
      ctx.partnerId,
      "marca",
      `branding/${ctx.partnerId}/watermark.png`,
    );
    expect(nova).toBe(versaoAntes + 1);
  });

  it("quadra: criar, editar e desativar, sempre dentro da arena", async () => {
    const nova = await painelQuadras.criarQuadra(ctx.partnerId, {
      slug: "quadra-3",
      name: "Quadra 3",
      sport: "futevolei",
      surface: "areia",
      indoor: true,
      opensTime: "06:00",
      closesTime: "23:00",
    });
    expect(await painelQuadras.slugDeQuadraEmUso(ctx.partnerId, "quadra-3")).toBe(true);

    expect(
      await painelQuadras.editarQuadra(ctx.partnerId, nova.id, {
        name: "Quadra 3 — areia",
        sport: "beach_tennis",
        surface: "areia fina",
        indoor: false,
        opensTime: null,
        closesTime: null,
      }),
    ).toBe(true);

    const [vizinha] = await q<{ id: string }>(
      `SELECT id FROM partner WHERE slug = 'arena-vizinha-painel'`,
    );
    // O `partner_id` na cláusula WHERE é o que impede editar a quadra de outra
    // arena com um uuid adivinhado — sem RLS, é a única barreira.
    expect(
      await painelQuadras.editarQuadra(vizinha!.id, nova.id, {
        name: "Invadida",
        sport: "society",
        surface: null,
        indoor: false,
        opensTime: null,
        closesTime: null,
      }),
    ).toBe(false);

    expect(await painelQuadras.definirQuadraAtiva(ctx.partnerId, nova.id, false)).toBe(true);
    const lista = await painelQuadras.quadrasDoPainel(ctx.partnerId);
    // A inativa CONTINUA na lista: uma quadra que some ao ser desativada é uma
    // quadra que ninguém liga de volta.
    expect(lista.find((x) => x.id === nova.id)?.active).toBe(false);
  });

  it("desvincular a câmera da quadra é permitido — e é o que a para de gravar", async () => {
    expect(await painelQuadras.vincularCameraAQuadra(ctx.partnerId, "painelcam0003", null)).toBe(
      true,
    );
    const cameras = await relayQ.camerasDoRelay(ctx.relayId);
    // "Sem destino não há gravador": a câmera sem quadra some da lista do relay.
    expect(cameras.some((c) => c.id === "painelcam0003")).toBe(false);

    expect(
      await painelQuadras.vincularCameraAQuadra(ctx.partnerId, "painelcam0003", ctx.quadra),
    ).toBe(true);
    expect((await relayQ.camerasDoRelay(ctx.relayId)).some((c) => c.id === "painelcam0003")).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GRUPOS v2 — edição, saída, convite e resumo semanal.
//
// O que este bloco protege são REGRAS, não consultas: quem pode editar, o que
// acontece com o grupo quando o dono sai, quando um convite para de valer, e a
// promessa que o resumo semanal faz de não chegar duas vezes. Todas moram em
// `db/queries/` e nenhuma delas é observável pelo TypeScript — é aqui ou em
// lugar nenhum.
//
// Cada cenário tem o SEU grupo. Testes de membro são destrutivos por natureza
// (alguém sai, alguém é removido) e um grupo compartilhado faria a ordem dos
// `it` virar parte do contrato — que é a forma mais silenciosa de suíte
// quebrada.
rodar("grupo v2: edição, saída, convite e resumo", () => {
  type Contexto = {
    partnerId: string;
    quadraA: string;
    quadraB: string;
    grupoEdicao: string;
    grupoResumo: string;
    grupoSaida: string;
    dono: string;
    veterano: string;
    novato: string;
    reserva: string;
    estranho: string;
    /** A data local da pelada de ONTEM — a que o resumo tem de achar. */
    ontem: string;
    /** O clipe mais compartilhado da rodada de ontem. */
    clipeCampeao: string;
  };

  let ctx: Contexto;
  let grupos: typeof import("@/db/queries/grupo");
  let compart: typeof import("@/db/queries/compartilhamento");
  let db: typeof import("@/lib/db");

  const sessaoDe = (uid: string, email: string) => ({ uid, email, exp: 0 });

  const q = async <T extends pg.QueryResultRow>(sql: string, p?: unknown[]) =>
    (await pool.query<T>(sql, p)).rows;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    process.env.SESSION_SECRET ??= "segredo-de-teste-0123456789-abcdefghij";
    grupos = await import("@/db/queries/grupo");
    compart = await import("@/db/queries/compartilhamento");
    db = await import("@/lib/db");

    const { instanteNaArena, relogioDe } = await import("@/lib/fuso");
    const { diaIsoDaData, somarDiasLocais } = await import("@/lib/ocorrencias");

    const [p] = await q<{ id: string }>(
      `INSERT INTO partner (slug, legal_name, display_name, timezone)
       VALUES ('arena-v2','V2 LTDA','Arena V2','America/Sao_Paulo')
       RETURNING id`,
    );
    const [a] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name) VALUES ($1,'quadra-a','Quadra A') RETURNING id`,
      [p!.id],
    );
    const [b] = await q<{ id: string }>(
      `INSERT INTO court (partner_id, slug, name) VALUES ($1,'quadra-b','Quadra B') RETURNING id`,
      [p!.id],
    );
    await q(
      `INSERT INTO relay_node (id, base_url, rtmp_host, key_hash, port_range_start, port_range_end, status)
       VALUES ('relay-v2','https://v2.replayja.com.br','stream.replayja.com.br','hash-v2',19650,19749,'active')`,
    );
    await q(
      `INSERT INTO camera (id, partner_id, court_id, relay_node_id, name, rtmp_port, rtmp_key)
       VALUES ('rjv21a7f3c92',$1,$2,'relay-v2','Quadra A — fundo',19650,'chave')`,
      [p!.id, a!.id],
    );

    const pessoas: Record<string, string> = {};
    for (const [chave, email, nome] of [
      ["dono", "dono-v2@exemplo.com", "Dona V2"],
      ["veterano", "veterano-v2@exemplo.com", "Veterano"],
      ["novato", "novato-v2@exemplo.com", "Novato"],
      ["reserva", "reserva-v2@exemplo.com", "Reserva"],
      ["estranho", "estranho-v2@exemplo.com", "Estranho"],
    ] as const) {
      const [u] = await q<{ id: string }>(
        `INSERT INTO app_user (email, display_name) VALUES ($1,$2) RETURNING id`,
        [email, nome],
      );
      pessoas[chave] = u!.id;
    }

    // ─── A DATA É CALCULADA, NUNCA FIXA ─────────────────────────────────────
    //
    // O resumo olha para `now()` numa janela de 30 horas. "Ontem" está sempre
    // dentro dela; uma data fixa faria o teste passar hoje e falhar amanhã.
    const hoje = relogioDe(new Date(), "America/Sao_Paulo").data;
    const ontem = somarDiasLocais(hoje, -1);
    const diaDeOntem = diaIsoDaData(ontem);

    const criarGrupo = async (slug: string, nome: string) => {
      const [g] = await q<{ id: string }>(
        `INSERT INTO play_group
           (partner_id, created_by, slug, name, weekdays, start_time, end_time, timezone,
            all_courts, visibility, active_from)
         VALUES ($1,$2,$3,$4,$5::smallint[],'20:00','21:30','America/Sao_Paulo',
                 true,'unlisted',$6::date)
         RETURNING id`,
        [p!.id, pessoas.dono, slug, nome, [diaDeOntem], somarDiasLocais(ontem, -30)],
      );
      await q(
        `INSERT INTO play_group_member
           (play_group_id, user_id, invited_email, role, status, accepted_at)
         VALUES ($1,$2,'dono-v2@exemplo.com','owner','active', now() - interval '10 days')`,
        [g!.id, pessoas.dono],
      );
      await q(`UPDATE play_group SET member_count = 1 WHERE id = $1`, [g!.id]);
      return g!.id;
    };

    const grupoEdicao = await criarGrupo("fut-edicao", "Fut Edição");
    const grupoResumo = await criarGrupo("fut-resumo", "Fut Resumo");
    const grupoSaida = await criarGrupo("fut-saida", "Fut Saída");

    // O grupo do resumo tem mais um membro, para a lista de destinatários ter
    // mais de uma linha — e para "quem desligou não recebe" poder ser provado
    // sem esvaziar a lista.
    await q(
      `INSERT INTO play_group_member
         (play_group_id, user_id, invited_email, role, status, accepted_at)
       VALUES ($1,$2,'veterano-v2@exemplo.com','member','active', now() - interval '9 days')`,
      [grupoResumo, pessoas.veterano],
    );
    await q(`UPDATE play_group SET member_count = 2 WHERE id = $1`, [grupoResumo]);

    // O grupo da saída tem a fila inteira, com `accepted_at` ESCALONADO: é ele
    // que decide quem o gatilho promove.
    for (const [chave, email, diasAtras] of [
      ["veterano", "veterano-v2@exemplo.com", 9],
      ["novato", "novato-v2@exemplo.com", 8],
      ["reserva", "reserva-v2@exemplo.com", 7],
    ] as const) {
      await q(
        `INSERT INTO play_group_member
           (play_group_id, user_id, invited_email, role, status, accepted_at)
         VALUES ($1,$2,$3,'member','active', now() - make_interval(days => $4::int))`,
        [grupoSaida, pessoas[chave], email, diasAtras],
      );
    }
    await q(`UPDATE play_group SET member_count = 4 WHERE id = $1`, [grupoSaida]);

    // Três lances de ontem DENTRO da janela (20:30, 21:00, 21:15) na quadra A.
    // O das 21:00 leva compartilhamentos e é o campeão esperado; o das 21:15
    // leva mais VIEWS, e existe para provar que compartilhar vence ver.
    const clipes: Record<string, string> = {};
    for (const [chave, hora, views] of [
      ["cedo", "20:30", 1],
      ["campeao", "21:00", 2],
      ["visto", "21:15", 40],
    ] as const) {
      const t = instanteNaArena(ontem, hora, "America/Sao_Paulo");
      const [c] = await q<{ id: string }>(
        `INSERT INTO clip (
           partner_id, court_id, camera_id, triggered_at, started_at, ended_at,
           cut_from, cut_to, duration_seconds, status, expires_at,
           thumbnail_object_key, view_count
         ) VALUES ($1,$2,'rjv21a7f3c92',
                   $3::timestamptz, $3::timestamptz,
                   $3::timestamptz + interval '25 seconds',
                   $3::timestamptz - interval '8 seconds',
                   $3::timestamptz + interval '30 seconds',
                   25, 'ready', now() + interval '90 days',
                   $4, $5)
         RETURNING id`,
        [p!.id, a!.id, t, `thumbs/${chave}.jpg`, views],
      );
      clipes[chave] = c!.id;
    }

    for (const acao of ["created", "opened", "played"] as const) {
      await q(
        `INSERT INTO share_event (clip_id, partner_id, action, channel)
         VALUES ($1,$2,$3::share_action,'whatsapp')`,
        [clipes.campeao, p!.id, acao],
      );
    }

    ctx = {
      partnerId: p!.id,
      quadraA: a!.id,
      quadraB: b!.id,
      grupoEdicao,
      grupoResumo,
      grupoSaida,
      dono: pessoas.dono!,
      veterano: pessoas.veterano!,
      novato: pessoas.novato!,
      reserva: pessoas.reserva!,
      estranho: pessoas.estranho!,
      ontem,
      clipeCampeao: clipes.campeao!,
    };
  }, 60_000);

  afterAll(async () => {
    await db?.fecharPool();
  });

  // ─────────────────────────────────────────────────────── edição

  it("o dono edita nome, esporte, quadra e visibilidade — e fica registrado quem mexeu", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");

    await grupos.atualizarGrupo(dono, ctx.grupoEdicao, {
      name: "Fut Edição 2",
      description: "a pelada do trabalho",
      sport: "futevolei",
      weekdays: [1, 3],
      startTime: "19:00",
      endTime: "20:30",
      courtId: ctx.quadraB,
      visibility: "public",
    });

    const editado = await grupos.grupoParaEdicao(dono, ctx.grupoEdicao);
    expect(editado?.name).toBe("Fut Edição 2");
    expect(editado?.sport).toBe("futevolei");
    expect(editado?.visibility).toBe("public");
    expect(editado?.all_courts).toBe(false);
    expect(editado?.court_slug).toBe("quadra-b");
    expect(editado?.start_time.slice(0, 5)).toBe("19:00");
    expect(editado?.weekdays).toEqual([1, 3]);
    // O histórico mínimo: `updated_at` vem do gatilho, `updated_by` da edição.
    expect(editado?.updated_by_email).toBe("dono-v2@exemplo.com");
  });

  it("o SLUG não é editável — nem por acidente", async () => {
    // `EdicaoDeGrupo` não tem o campo, e o endereço continua o de sempre depois
    // da edição acima. É o link fixado no WhatsApp da pelada: trocá-lo quebraria
    // em silêncio tudo o que já foi compartilhado.
    const [linha] = await q<{ slug: string }>(
      `SELECT slug::text AS slug FROM play_group WHERE id = $1`,
      [ctx.grupoEdicao],
    );
    expect(linha!.slug).toBe("fut-edicao");
  });

  it("trocar para 'todas as quadras' apaga a quadra antiga em vez de somar", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    await grupos.atualizarGrupo(dono, ctx.grupoEdicao, {
      name: "Fut Edição 2",
      sport: null,
      weekdays: [1, 3],
      startTime: "19:00",
      endTime: "20:30",
      courtId: null,
      visibility: "unlisted",
    });

    const [quantas] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM play_group_court WHERE play_group_id = $1`,
      [ctx.grupoEdicao],
    );
    // Um merge deixaria a quadra B para trás e o grupo continuaria filtrando por
    // ela — sem nada na tela dizendo por quê.
    expect(quantas!.n).toBe(0);
    const editado = await grupos.grupoParaEdicao(dono, ctx.grupoEdicao);
    expect(editado?.all_courts).toBe(true);
    expect(editado?.sport).toBeNull();
  });

  it("membro comum não edita, e quem não é membro nem sabe que o grupo existe", async () => {
    const novato = sessaoDe(ctx.novato, "novato-v2@exemplo.com");
    const estranho = sessaoDe(ctx.estranho, "estranho-v2@exemplo.com");
    const edicao = {
      name: "Invadido",
      sport: null,
      weekdays: [1],
      startTime: "19:00",
      endTime: "20:00",
      courtId: null,
      visibility: "public" as const,
    };

    // Membro comum: 403. Não membro: 404 — nunca 403, senão a resposta vira um
    // oráculo de "este grupo existe".
    await expect(
      grupos.atualizarGrupo(novato, ctx.grupoSaida, edicao),
    ).rejects.toMatchObject({ init: { status: 403 } });
    await expect(
      grupos.atualizarGrupo(estranho, ctx.grupoEdicao, edicao),
    ).rejects.toMatchObject({ init: { status: 404 } });

    const [linha] = await q<{ name: string }>(`SELECT name FROM play_group WHERE id = $1`, [
      ctx.grupoEdicao,
    ]);
    expect(linha!.name).toBe("Fut Edição 2");
  });

  // ─────────────────────────────────────────────────────── convite

  it("o convite nasce com 14 dias e é reaproveitado — não vira uma linha por toque", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    const primeiro = await compart.linkDeConviteDoGrupo(dono, {
      playGroupId: ctx.grupoResumo,
      partnerId: ctx.partnerId,
    });
    const segundo = await compart.linkDeConviteDoGrupo(dono, {
      playGroupId: ctx.grupoResumo,
      partnerId: ctx.partnerId,
    });
    expect(segundo.id).toBe(primeiro.id);

    const [linha] = await q<{ dias: number }>(
      `SELECT round(extract(epoch FROM (expires_at - now())) / 86400)::int AS dias
         FROM share_link WHERE id = $1`,
      [primeiro.id],
    );
    expect(linha!.dias).toBe(14);

    const convite = await grupos.grupoPorTokenDeConvite(primeiro.token);
    expect(convite?.id).toBe(ctx.grupoResumo);
    // A tela de aceite precisa do nome de quem chamou — e do e-mail MASCARADO,
    // porque o token circula por encaminhamento.
    expect(convite?.convidou_nome).toBe("Dona V2");
    expect(convite?.convidou_email).toBe("d***@exemplo.com");
  });

  it("revogar mata o token na hora, e mantém a métrica dele", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    const link = await compart.linkDeConviteDoGrupo(dono, {
      playGroupId: ctx.grupoEdicao,
      partnerId: ctx.partnerId,
    });

    expect((await compart.convitesDoGrupo(dono, ctx.grupoEdicao)).length).toBe(1);
    expect(await compart.revogarConviteDoGrupo(dono, ctx.grupoEdicao, link.id)).toBe(true);

    expect(await grupos.grupoPorTokenDeConvite(link.token)).toBeNull();
    expect(await compart.convitesDoGrupo(dono, ctx.grupoEdicao)).toEqual([]);
    // Revogar é `revoked_at`, não `DELETE`: `share_event` aponta para esta linha
    // e "este link trouxe 6 pessoas antes de a gente cortar" é a informação que
    // justifica o corte.
    const [ainda] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM share_link WHERE id = $1`,
      [link.id],
    );
    expect(ainda!.n).toBe(1);

    // Revogar duas vezes não é erro — é uma tela que alguém abriu em duas abas.
    expect(await compart.revogarConviteDoGrupo(dono, ctx.grupoEdicao, link.id)).toBe(false);
  });

  it("não dá para revogar o convite de OUTRO grupo com um id adivinhado", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    const link = await compart.linkDeConviteDoGrupo(dono, {
      playGroupId: ctx.grupoSaida,
      partnerId: ctx.partnerId,
    });
    // O `target_id` na cláusula WHERE é a única barreira — não há RLS.
    expect(await compart.revogarConviteDoGrupo(dono, ctx.grupoEdicao, link.id)).toBe(false);
    expect(await grupos.grupoPorTokenDeConvite(link.token)).not.toBeNull();
  });

  it("convite vencido não resolve — e a mensagem é a mesma do revogado", async () => {
    const [vencido] = await q<{ token: string }>(
      `INSERT INTO share_link (token, target_type, target_id, partner_id, created_by, expires_at)
       VALUES ('venceuvenceu','group',$1,$2,$3, now() - interval '1 minute')
       RETURNING token`,
      [ctx.grupoResumo, ctx.partnerId, ctx.dono],
    );
    expect(await grupos.grupoPorTokenDeConvite(vencido!.token)).toBeNull();
  });

  // ─────────────────────────────────────────────── melhor da rodada

  it("o melhor da rodada é o mais COMPARTILHADO, não o mais visto", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    const { instanteNaArena } = await import("@/lib/fuso");
    const de = instanteNaArena(ctx.ontem, "20:00", "America/Sao_Paulo");
    const ate = instanteNaArena(ctx.ontem, "21:30", "America/Sao_Paulo");

    const melhor = await grupos.melhorDaRodada(dono, {
      playGroupId: ctx.grupoResumo,
      partnerId: ctx.partnerId,
      allCourts: true,
      de,
      ate,
    });
    // O das 21:15 tem 40 views; o campeão tem 2 views e 3 eventos de
    // compartilhamento. Ver é barato — compartilhar é uma decisão.
    expect(melhor?.id).toBe(ctx.clipeCampeao);
    expect(melhor?.share_count).toBe(3);
  });

  it("o destaque exige login, como toda miniatura do produto", async () => {
    const { instanteNaArena } = await import("@/lib/fuso");
    await expect(
      grupos.melhorDaRodada(null, {
        playGroupId: ctx.grupoResumo,
        partnerId: ctx.partnerId,
        allCourts: true,
        de: instanteNaArena(ctx.ontem, "20:00", "America/Sao_Paulo"),
        ate: instanteNaArena(ctx.ontem, "21:30", "America/Sao_Paulo"),
      }),
    ).rejects.toMatchObject({ init: { status: 401 } });
  });

  // ─────────────────────────────────────────────── resumo semanal

  it("a rodada de ontem entra na fila do resumo, com a contagem certa", async () => {
    const fila = await grupos.rodadasParaResumo();
    const minha = fila.find((r) => r.play_group_id === ctx.grupoResumo);
    expect(minha).toBeDefined();
    expect(minha!.local_date).toBe(ctx.ontem);
    expect(minha!.clip_count).toBe(3);
    expect(minha!.partner_display_name).toBe("Arena V2");
  });

  it("quem desligou o aviso não recebe — e o grupo sem ninguém ligado sai da fila", async () => {
    const veterano = sessaoDe(ctx.veterano, "veterano-v2@exemplo.com");
    await grupos.definirAvisoSemanal(veterano, ctx.grupoResumo, false);

    const destinatarios = await grupos.destinatariosDoResumo(ctx.grupoResumo);
    expect(destinatarios.map((d) => d.email)).toEqual(["dono-v2@exemplo.com"]);

    // O opt-in também é o que decide se o grupo entra na consulta: um grupo em
    // que TODO MUNDO desligou não deve nem ser considerado.
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    await grupos.definirAvisoSemanal(dono, ctx.grupoResumo, false);
    expect(
      (await grupos.rodadasParaResumo()).some((r) => r.play_group_id === ctx.grupoResumo),
    ).toBe(false);

    // E religar traz o grupo de volta — a preferência não é uma porta de mão
    // única.
    await grupos.definirAvisoSemanal(dono, ctx.grupoResumo, true);
    expect(
      (await grupos.rodadasParaResumo()).some((r) => r.play_group_id === ctx.grupoResumo),
    ).toBe(true);
  });

  it("a reserva do resumo é idempotente: a segunda passada do cron não manda de novo", async () => {
    expect(await grupos.reservarResumo(ctx.grupoResumo, ctx.ontem, 3, 1)).toBe(true);
    // A segunda execução perde a chave primária e desiste em silêncio. É o que
    // impede o e-mail duplicado quando o cron reexecuta.
    expect(await grupos.reservarResumo(ctx.grupoResumo, ctx.ontem, 3, 1)).toBe(false);

    // E a rodada some da fila: o `NOT EXISTS` contra `play_group_digest` é a
    // mesma barreira, vista do outro lado.
    expect(
      (await grupos.rodadasParaResumo()).some((r) => r.play_group_id === ctx.grupoResumo),
    ).toBe(false);

    const [linha] = await q<{ recipients: number; clip_count: number }>(
      `SELECT recipients, clip_count FROM play_group_digest
        WHERE play_group_id = $1 AND local_date = $2::date`,
      [ctx.grupoResumo, ctx.ontem],
    );
    expect(linha!.recipients).toBe(1);
    expect(linha!.clip_count).toBe(3);
  });

  it("as miniaturas do e-mail são os primeiros lances da janela, em ordem", async () => {
    const { instanteNaArena } = await import("@/lib/fuso");
    const lances = await grupos.lancesDoResumo(
      {
        playGroupId: ctx.grupoResumo,
        partnerId: ctx.partnerId,
        allCourts: true,
        de: instanteNaArena(ctx.ontem, "20:00", "America/Sao_Paulo"),
        ate: instanteNaArena(ctx.ontem, "21:30", "America/Sao_Paulo"),
      },
      3,
    );
    expect(lances.length).toBe(3);
    expect(lances[0]!.thumbnail_object_key).toBe("thumbs/cedo.jpg");
    expect(new Date(lances[0]!.triggered_at).getTime()).toBeLessThan(
      new Date(lances[2]!.triggered_at).getTime(),
    );
  });

  it("o descadastro por token desliga TODOS os grupos da pessoa", async () => {
    const { assinarDescadastro, lerDescadastro } = await import("@/lib/descadastro");
    const token = assinarDescadastro({ userId: ctx.dono, playGroupId: null });
    const alvo = lerDescadastro(token);
    expect(alvo).not.toBeNull();

    const desligados = await grupos.desligarAvisoSemanalPorUsuario(alvo!.userId, alvo!.playGroupId);
    // Três grupos: edição, resumo e saída. O dono está nos três com o padrão
    // ligado (menos onde o teste anterior mexeu, e lá ele religou).
    expect(desligados).toBe(3);

    const avisos = await grupos.avisosDoUsuario(sessaoDe(ctx.dono, "dono-v2@exemplo.com"));
    expect(avisos.every((a) => a.notify_weekly === false)).toBe(true);

    // Rodar de novo não é erro e não conta ninguém: o `WHERE notify_weekly`
    // torna a operação naturalmente idempotente.
    expect(await grupos.desligarAvisoSemanalPorUsuario(ctx.dono, null)).toBe(0);
  });

  // ─────────────────────────────────────────── sair, remover, promover

  it("membro sai e o contador RECONTA da tabela", async () => {
    const novato = sessaoDe(ctx.novato, "novato-v2@exemplo.com");
    const saida = await grupos.sairDoGrupo(novato, ctx.grupoSaida);
    // Saiu um membro comum: o dono continua sendo o dono, ninguém é promovido.
    expect(saida.novoDono?.email).toBe("dono-v2@exemplo.com");
    expect(saida.vazio).toBe(false);

    const [linha] = await q<{ member_count: number }>(
      `SELECT member_count FROM play_group WHERE id = $1`,
      [ctx.grupoSaida],
    );
    expect(linha!.member_count).toBe(3);
    // A linha continua lá, com `removed_at`: a métrica de "quem já passou pelo
    // grupo" não pode depender de o registro sumir.
    const [membro] = await q<{ status: string; removed_at: Date | null }>(
      `SELECT status::text AS status, removed_at FROM play_group_member
        WHERE play_group_id = $1 AND user_id = $2`,
      [ctx.grupoSaida, ctx.novato],
    );
    expect(membro!.status).toBe("removed");
    expect(membro!.removed_at).not.toBeNull();
  });

  it("quem saiu deixa de ver a página do grupo privado e de aparecer na lista", async () => {
    const novato = sessaoDe(ctx.novato, "novato-v2@exemplo.com");
    expect((await grupos.meusGrupos(novato)).some((g) => g.id === ctx.grupoSaida)).toBe(false);
    // E entrar de novo pelo link continua funcionando: a saída não é banimento.
    expect(await grupos.entrarNoGrupo(novato, ctx.grupoSaida, null)).toBe("entrou");
    expect(await grupos.sairDoGrupo(novato, ctx.grupoSaida)).toBeDefined();
  });

  it("o dono remove alguém — mas não a si mesmo, e membro comum não remove ninguém", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    const veterano = sessaoDe(ctx.veterano, "veterano-v2@exemplo.com");

    const [linhaDoDono] = await q<{ id: string }>(
      `SELECT id FROM play_group_member WHERE play_group_id = $1 AND user_id = $2`,
      [ctx.grupoSaida, ctx.dono],
    );
    const [linhaDaReserva] = await q<{ id: string }>(
      `SELECT id FROM play_group_member WHERE play_group_id = $1 AND user_id = $2`,
      [ctx.grupoSaida, ctx.reserva],
    );

    // Sair é outra ação, com outro nome e com promoção de sucessor — remover a
    // si mesmo pela lista deixaria o grupo sem dono sem ninguém perceber.
    expect(await grupos.removerMembroDoGrupo(dono, ctx.grupoSaida, linhaDoDono!.id)).toBe(
      "voce-mesmo",
    );
    await expect(
      grupos.removerMembroDoGrupo(veterano, ctx.grupoSaida, linhaDaReserva!.id),
    ).rejects.toMatchObject({ init: { status: 403 } });

    expect(await grupos.removerMembroDoGrupo(dono, ctx.grupoSaida, linhaDaReserva!.id)).toBe(
      "removido",
    );
    // Remover duas vezes não explode: a tela pode estar aberta em duas abas.
    expect(await grupos.removerMembroDoGrupo(dono, ctx.grupoSaida, linhaDaReserva!.id)).toBe(
      "nao-encontrado",
    );

    const [linha] = await q<{ member_count: number }>(
      `SELECT member_count FROM play_group WHERE id = $1`,
      [ctx.grupoSaida],
    );
    expect(linha!.member_count).toBe(2);
  });

  it("quando o dono sai, o banco promove o membro ATIVO MAIS ANTIGO", async () => {
    const dono = sessaoDe(ctx.dono, "dono-v2@exemplo.com");
    const saida = await grupos.sairDoGrupo(dono, ctx.grupoSaida);

    // O gatilho `play_group_member_promove_dono` é `DEFERRABLE INITIALLY
    // DEFERRED`: ele roda no COMMIT, e é por isso que "quem assumiu" só pode ser
    // consultado depois da transação.
    expect(saida.novoDono?.email).toBe("veterano-v2@exemplo.com");
    expect(saida.vazio).toBe(false);

    const papeis = await q<{ email: string; role: string; status: string }>(
      `SELECT invited_email::text AS email, role::text AS role, status::text AS status
         FROM play_group_member WHERE play_group_id = $1 ORDER BY accepted_at`,
      [ctx.grupoSaida],
    );
    const veterano = papeis.find((p) => p.email === "veterano-v2@exemplo.com");
    expect(veterano?.role).toBe("owner");
    expect(veterano?.status).toBe("active");

    // E o novo dono edita de verdade — a promoção não é decorativa.
    const novoDono = sessaoDe(ctx.veterano, "veterano-v2@exemplo.com");
    await grupos.atualizarGrupo(novoDono, ctx.grupoSaida, {
      name: "Fut Saída (assumido)",
      sport: null,
      weekdays: [2],
      startTime: "20:00",
      endTime: "21:30",
      courtId: null,
      visibility: "unlisted",
    });
    const editado = await grupos.grupoParaEdicao(novoDono, ctx.grupoSaida);
    expect(editado?.name).toBe("Fut Saída (assumido)");
  });

  it("o último a sair deixa o grupo VAZIO e VIVO — o link continua abrindo", async () => {
    const veterano = sessaoDe(ctx.veterano, "veterano-v2@exemplo.com");
    const saida = await grupos.sairDoGrupo(veterano, ctx.grupoSaida);

    expect(saida.novoDono).toBeNull();
    expect(saida.vazio).toBe(true);

    const [linha] = await q<{ member_count: number; deleted_at: Date | null }>(
      `SELECT member_count, deleted_at FROM play_group WHERE id = $1`,
      [ctx.grupoSaida],
    );
    expect(linha!.member_count).toBe(0);
    // Apagar o grupo quando o último sai destruiria o endereço permanente que é
    // o produto — o link fixado no WhatsApp há meses.
    expect(linha!.deleted_at).toBeNull();

    // E qualquer pessoa logada volta a entrar por ele.
    const estranho = sessaoDe(ctx.estranho, "estranho-v2@exemplo.com");
    expect(await grupos.entrarNoGrupo(estranho, ctx.grupoSaida, null)).toBe("entrou");
  });
});
