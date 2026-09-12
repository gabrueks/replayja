// Runner de migrações — SQL puro, sem ORM (ADR §4.3).
//
// Uso:
//   tsx scripts/migrate.ts up        [--if-configured] [--dry]
//   tsx scripts/migrate.ts down      [--steps=N]
//   tsx scripts/migrate.ts status
//   tsx scripts/migrate.ts roundtrip            (up → down tudo → up; é o do CI)
//
// ─── O DESENHO, E POR QUE ELE É ASSIM ──────────────────────────────────────
//
// Cada arquivo de `db/migrations/` tem DOIS blocos, separados por marcadores:
//
//   -- +migrate up      … o que aplicar
//   -- +migrate down    … o que desfazer
//
// O `down` não é enfeite. Sem ORM não há rollback automático, e a compensação
// que a ADR exige é exatamente esta: toda migração desce, e o CI roda
// `up, down, up` contra um Postgres efêmero. É o que pega o `DROP` esquecido e
// a dependência na ordem errada.
//
// SE UMA MIGRAÇÃO FALHA, O DEPLOY FALHA — de propósito. Subir código que espera
// uma coluna que não existe é o defeito que este script veio evitar. Cada
// arquivo roda dentro de UMA transação: ou entra inteiro, ou não entra e nada é
// registrado.
//
// ─── PREVIEW NÃO ESCREVE ESQUEMA ───────────────────────────────────────────
//
// Todo push de branch vira um preview na Vercel, e o preview roda o
// `vercel-build`. Se o `DATABASE_URL` estiver no escopo `preview` + `production`
// (que é o padrão de quem quer preview com dado real), uma branch pela metade
// aplicaria a migração dela EM PRODUÇÃO — sem deploy, sem revisão, sem ninguém
// pedir. Então fora de `VERCEL_ENV=production` o script só LÊ.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { sslDe } from "../lib/db";

const RAIZ = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const DIR_MIGRACOES = path.join(RAIZ, "db", "migrations");
const ENV_LOCAL = path.join(RAIZ, ".env.local");

const MARCADOR_UP = /^--\s*\+migrate\s+up\s*$/im;
const MARCADOR_DOWN = /^--\s*\+migrate\s+down\s*$/im;

// Dois deploys simultâneos tentariam o mesmo ALTER TABLE. Um lock consultivo de
// sessão põe um na fila do outro; o número é arbitrário e só precisa ser sempre
// o mesmo. O lock morre com a conexão.
const LOCK_KEY = "4711009823";

type Comando = "up" | "down" | "status" | "roundtrip";

type Migracao = {
  nome: string;
  up: string;
  down: string;
  checksum: string;
};

// ─────────────────────────────────────────────────────────── util

function lerEnvLocal(): void {
  if (!fs.existsSync(ENV_LOCAL)) return;
  for (const linha of fs.readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const chave = t.slice(0, eq).trim();
    if (process.env[chave] !== undefined) continue;
    // O `vercel env pull` grava o valor entre aspas.
    process.env[chave] = t.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

function carregarMigracoes(): Migracao[] {
  if (!fs.existsSync(DIR_MIGRACOES)) return [];
  return fs
    .readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith(".sql"))
    // Ordem lexicográfica = ordem cronológica, porque o nome começa com a data.
    .sort()
    .map((nome) => {
      const bruto = fs.readFileSync(path.join(DIR_MIGRACOES, nome), "utf8");
      const iUp = bruto.search(MARCADOR_UP);
      const iDown = bruto.search(MARCADOR_DOWN);
      if (iUp === -1) {
        throw new Error(`${nome}: falta o marcador "-- +migrate up"`);
      }
      if (iDown === -1) {
        // Recusar é melhor que aceitar: uma migração sem `down` quebra o
        // roundtrip do CI sem que ninguém perceba até o dia em que precisar dele.
        throw new Error(`${nome}: falta o marcador "-- +migrate down"`);
      }
      if (iDown < iUp) {
        throw new Error(`${nome}: o bloco "down" está antes do "up"`);
      }
      const up = bruto.slice(bruto.indexOf("\n", iUp) + 1, iDown).trim();
      const down = bruto.slice(bruto.indexOf("\n", iDown) + 1).trim();
      return {
        nome,
        up,
        down,
        checksum: crypto.createHash("sha256").update(up).digest("hex").slice(0, 16),
      };
    });
}

async function garantirTabela(c: pg.PoolClient): Promise<void> {
  await c.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
}

async function aplicadas(c: pg.PoolClient): Promise<Map<string, string>> {
  const r = await c.query<{ name: string; checksum: string }>(
    "SELECT name, checksum FROM schema_migration",
  );
  return new Map(r.rows.map((x) => [x.name, x.checksum]));
}

// ─────────────────────────────────────────────────────── comandos

async function up(c: pg.PoolClient, migracoes: Migracao[], dry: boolean): Promise<number> {
  const feitas = await aplicadas(c);
  let n = 0;
  for (const m of migracoes) {
    const anterior = feitas.get(m.nome);
    if (anterior) {
      if (anterior !== m.checksum) {
        // Editar uma migração já aplicada é o erro clássico: o banco de produção
        // ficou com a versão antiga e ninguém percebe. Melhor falhar alto e
        // pedir uma migração nova.
        throw new Error(
          `${m.nome}: o conteúdo mudou depois de aplicada (${anterior} → ${m.checksum}). ` +
            "Crie uma migração NOVA em vez de editar esta.",
        );
      }
      continue;
    }
    if (dry) {
      console.log(`[migrate] pendente: ${m.nome}`);
      n++;
      continue;
    }
    console.log(`[migrate] aplicando ${m.nome}`);
    await c.query("BEGIN");
    try {
      await c.query(m.up);
      await c.query("INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)", [
        m.nome,
        m.checksum,
      ]);
      await c.query("COMMIT");
      n++;
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      throw new Error(`${m.nome} falhou: ${(err as Error).message}`);
    }
  }
  return n;
}

async function down(c: pg.PoolClient, migracoes: Migracao[], passos: number): Promise<number> {
  const feitas = await aplicadas(c);
  // Ordem INVERSA: a última a subir é a primeira a descer. Sem isso, derrubar o
  // enum antes da tabela que o usa falha.
  const alvo = [...migracoes].reverse().filter((m) => feitas.has(m.nome)).slice(0, passos);
  for (const m of alvo) {
    console.log(`[migrate] desfazendo ${m.nome}`);
    await c.query("BEGIN");
    try {
      if (m.down) await c.query(m.down);
      await c.query("DELETE FROM schema_migration WHERE name = $1", [m.nome]);
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      throw new Error(`down de ${m.nome} falhou: ${(err as Error).message}`);
    }
  }
  return alvo.length;
}

async function status(c: pg.PoolClient, migracoes: Migracao[]): Promise<void> {
  const feitas = await aplicadas(c);
  for (const m of migracoes) {
    const f = feitas.get(m.nome);
    const marca = !f ? "pendente " : f === m.checksum ? "aplicada " : "DIVERGE  ";
    console.log(`  ${marca} ${m.nome}`);
  }
  const pendentes = migracoes.filter((m) => !feitas.has(m.nome)).length;
  console.log(`[migrate] ${migracoes.length} migrações, ${pendentes} pendente(s)`);
}

// ──────────────────────────────────────────────────────────── main

async function main(): Promise<void> {
  lerEnvLocal();

  const argv = process.argv.slice(2);
  const comando = (argv.find((a) => !a.startsWith("--")) ?? "up") as Comando;
  const seConfigurado = argv.includes("--if-configured");
  const dry = argv.includes("--dry");
  const passos = Number(argv.find((a) => a.startsWith("--steps="))?.split("=")[1] ?? "999");

  const url = process.env.DATABASE_URL;
  if (!url) {
    if (seConfigurado) {
      console.log("[migrate] DATABASE_URL ausente — nada a fazer (--if-configured).");
      return;
    }
    throw new Error("DATABASE_URL não configurada.");
  }

  const vercelEnv = process.env.VERCEL_ENV;
  const somenteLeitura = Boolean(vercelEnv) && vercelEnv !== "production";
  if (somenteLeitura && comando !== "status") {
    console.log(
      `[migrate] VERCEL_ENV=${vercelEnv} — preview não escreve esquema. Só listando.`,
    );
  }

  const migracoes = carregarMigracoes();
  // Mesma regra de `lib/db.ts`: a URL manda, host local nunca leva TLS forçado
  // (Postgres em container/binário local não fala TLS e a conexão morreria com
  // "the server does not support SSL connections"), host remoto sem `sslmode`
  // leva.
  const pool = new pg.Pool({ connectionString: url, ...sslDe(url), max: 1 });
  const c = await pool.connect();

  try {
    await c.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await garantirTabela(c);

    if (comando === "status" || somenteLeitura) {
      await status(c, migracoes);
    } else if (comando === "up") {
      const n = await up(c, migracoes, dry);
      console.log(`[migrate] ${n} migração(ões) ${dry ? "pendente(s)" : "aplicada(s)"}.`);
    } else if (comando === "down") {
      const n = await down(c, migracoes, passos);
      console.log(`[migrate] ${n} migração(ões) desfeita(s).`);
    } else if (comando === "roundtrip") {
      // O que a ADR §4.3 manda o CI rodar: pega `DROP` esquecido e dependência
      // na ordem errada, que é o defeito real de migração sem ORM.
      console.log("[migrate] roundtrip — up");
      await up(c, migracoes, false);
      console.log("[migrate] roundtrip — down (tudo)");
      await down(c, migracoes, 999);
      const sobrou = await aplicadas(c);
      if (sobrou.size > 0) {
        throw new Error(`roundtrip: sobraram ${sobrou.size} migrações registradas após o down`);
      }
      console.log("[migrate] roundtrip — up de novo");
      await up(c, migracoes, false);
      console.log("[migrate] roundtrip OK.");
    } else {
      throw new Error(`comando desconhecido: ${comando}`);
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[migrate] ${(err as Error).message}`);
  process.exit(1);
});
