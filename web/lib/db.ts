// Acesso ao Postgres (Neon). Só roda no servidor, no runtime Node.
//
// Portado de `lib/db.ts` do Sentinela, com os quatro detalhes que a ADR §4.3
// manda copiar:
//   1. pool preguiçoso no `globalThis` (o hot-reload vaza conexões sem ele);
//   2. `max: 3` (serverless abre um pool por instância);
//   3. handler de `'error'` no pool (o Neon derruba conexão ociosa e, sem
//      handler, isso DERRUBA o processo);
//   4. o par `query`/`tryQuery` — leitura essencial lança, escrita de auditoria
//      engole.
//
// REGRA ESTRUTURAL (modelo-de-dados §7.1): nenhuma rota escreve SQL. Tudo passa
// por `db/queries/*.ts`, e o CI falha se encontrar `query(` fora dali. Sem RLS,
// essa disciplina é a única camada de autorização que existe.
import { Pool } from "pg";
import type { QueryResultRow } from "pg";

// O hot-reload do dev recarrega o módulo a cada edição: sem o singleton no
// globalThis, cada recarga abriria um pool novo e vazaria conexões.
const globalForDb = globalThis as unknown as { replayjaPool?: Pool };

/** True quando o banco foi provisionado (`DATABASE_URL` presente). */
export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Decide o TLS a partir da própria URL.
 *
 * ─── AS TRÊS SITUAÇÕES, E POR QUE PRECISAM SER DISTINGUIDAS ────────────────
 *
 * 1. A URL já diz (`?sslmode=...`) — é o caso do Neon, que sempre vem com
 *    `sslmode=require`. Deixa o `pg` resolver por ela.
 * 2. Host LOCAL (`localhost`, `127.0.0.1`, `::1`) — Postgres em container ou
 *    binário local não fala TLS, e forçá-lo faz toda conexão morrer com "the
 *    server does not support SSL connections". Foi exatamente assim que o teste
 *    de integração falhou na primeira execução.
 * 3. Host REMOTO sem `sslmode` — liga o TLS na mão, sem validar a cadeia, para
 *    não depender do CA store do ambiente. Mandar credencial de banco em claro
 *    pela internet porque a URL estava mal escrita é o erro caro aqui.
 */
export function sslDe(connectionString: string): { ssl?: { rejectUnauthorized: boolean } } {
  if (/[?&]sslmode=/i.test(connectionString)) return {};
  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    // URL que o `pg` entende mas o `URL` não: trata como remota, que é o lado
    // seguro.
    return { ssl: { rejectUnauthorized: false } };
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  return local ? {} : { ssl: { rejectUnauthorized: false } };
}

/** Pool preguiçoso: só abre na primeira query, nunca no import. */
function getPool(): Pool {
  if (globalForDb.replayjaPool) return globalForDb.replayjaPool;

  const connectionString = process.env.DATABASE_URL!;

  const pool = new Pool({
    connectionString,
    ...sslDe(connectionString),
    max: 3,
    idleTimeoutMillis: 10_000,
  });

  pool.on("error", (err) => {
    console.error("[db] erro em conexão ociosa:", err);
  });

  globalForDb.replayjaPool = pool;
  return pool;
}

/** Roda a query e devolve as linhas. Lança se o banco não está configurado. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  if (!dbConfigured()) throw new Error("DATABASE_URL não configurada");
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** A mesma assinatura de `query`, mas presa à conexão de uma transação. */
export type Consulta = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

/**
 * Várias escritas numa conexão só, com `BEGIN`/`COMMIT`/`ROLLBACK`.
 *
 * Usar com parcimônia: `query` sozinho já é atômico por instrução e o pool tem
 * `max: 3`. O que só a transação resolve é a decisão que precisa enxergar o que
 * outra requisição acabou de gravar — no Replay já, o par "criar `clip` +
 * enfileirar `clip_job`", que precisa ser atômico (ADR §7).
 *
 * A conexão é sempre devolvida ao pool, inclusive quando o corpo lança.
 */
export async function transacao<T>(fn: (q: Consulta) => Promise<T>): Promise<T> {
  if (!dbConfigured()) throw new Error("DATABASE_URL não configurada");
  const cliente = await getPool().connect();
  const consulta: Consulta = async (text, params) => {
    const r = await cliente.query(text, params);
    return r.rows;
  };
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(consulta);
    await cliente.query("COMMIT");
    return resultado;
  } catch (err) {
    // Se a conexão já morreu, o ROLLBACK também falha — e o erro que interessa
    // é o original, não o do rollback.
    await cliente.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Igual a `query`, mas nunca lança: sem banco devolve `[]` em silêncio e, se a
 * query falhar, loga e devolve `[]`. Para escrita não-crítica (auditoria,
 * `app_error`, `share_event`), que não pode derrubar a rota que a chamou.
 */
export async function tryQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  if (!dbConfigured()) return [];
  try {
    return await query<T>(text, params);
  } catch (err) {
    console.error("[db] query falhou:", err);
    return [];
  }
}

/** Fecha o pool. Só para scripts e testes — o runtime da Vercel nunca chama. */
export async function fecharPool(): Promise<void> {
  if (globalForDb.replayjaPool) {
    await globalForDb.replayjaPool.end();
    globalForDb.replayjaPool = undefined;
  }
}
