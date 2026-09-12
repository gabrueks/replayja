// Limitador de taxa compartilhado (tabela `rate_limit` no Postgres).
//
// Portado de `lib/rate-limit.ts` do Sentinela (ADR §4.4). Os contadores ficam no
// BANCO porque a Vercel roda N instâncias: um `Map` em memória só limitaria a
// instância que atendeu a requisição. Quando o banco não está configurado (ou
// cai), o fallback em memória entra no lugar — vale menos, mas é muito melhor
// que liberar tudo.
//
// Tetos do produto em `docs/api/README.md` §6; as constantes estão em
// `lib/limites.ts` para não ficarem espalhadas pelas rotas.
import { dbConfigured, query } from "./db";

export type RateVerdict = {
  allowed: boolean;
  /** Segundos até a janela abrir de novo (0 quando `allowed`). */
  retryAfterS: number;
};

const OK: RateVerdict = { allowed: true, retryAfterS: 0 };

/**
 * IP de quem chamou. Na Vercel o cliente real é o primeiro item do
 * `x-forwarded-for`; sem proxy (dev) não há IP e todo mundo cai no mesmo balde
 * "local" — que é o comportamento certo numa máquina só.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "local";
}

// ───────────────────────────────────────────────────────── fallback

const globalForRate = globalThis as unknown as {
  replayjaRateFallback?: Map<string, number[]>;
};

function memory(): Map<string, number[]> {
  globalForRate.replayjaRateFallback ??= new Map();
  return globalForRate.replayjaRateFallback;
}

function memoryHits(id: string, windowS: number): number[] {
  const cutoff = Date.now() - windowS * 1000;
  const kept = (memory().get(id) ?? []).filter((t) => t > cutoff);
  // Sem acertos na janela a chave some: o Map não pode crescer sem fim numa
  // instância de vida longa.
  if (kept.length) memory().set(id, kept);
  else memory().delete(id);
  return kept;
}

function memoryVerdict(
  id: string,
  limit: number,
  windowS: number,
  consume: boolean,
): RateVerdict {
  const hits = memoryHits(id, windowS);
  if (hits.length >= limit) {
    const retry = Math.ceil((hits[0]! + windowS * 1000 - Date.now()) / 1000);
    return { allowed: false, retryAfterS: Math.max(1, retry) };
  }
  if (consume) memory().set(id, [...hits, Date.now()]);
  return OK;
}

// ─────────────────────────────────────────────────────────── banco

type Row = { used: number; retry_after: number };

/**
 * Conta os acertos da janela e, se `consume`, grava mais um — tudo numa ida só
 * ao Postgres. O DELETE é a faxina: sem ele a tabela cresceria para sempre. As
 * CTEs enxergam o mesmo snapshot, então `recent` repete o filtro de janela em
 * vez de confiar no que o `purge` apagou.
 *
 * O prazo de espera sai calculado do BANCO, não do Node: `at` é gravado com o
 * relógio do Postgres e o servidor do app tem o seu próprio (no Sentinela foram
 * medidos 3 s de diferença contra o Neon). Subtrair um do outro devolveria um
 * `Retry-After` torto, ou negativo.
 */
async function dbVerdict(
  bucket: string,
  key: string,
  limit: number,
  windowS: number,
  consume: boolean,
): Promise<RateVerdict> {
  const rows = await query<Row>(
    `WITH purge AS (
       DELETE FROM rate_limit
        WHERE bucket = $1 AND subject = $2
          AND at < now() - make_interval(secs => $3::float8)
     ),
     recent AS (
       SELECT at FROM rate_limit
        WHERE bucket = $1 AND subject = $2
          AND at >= now() - make_interval(secs => $3::float8)
     ),
     ins AS (
       INSERT INTO rate_limit (bucket, subject)
       SELECT $1, $2
        WHERE $4::boolean AND (SELECT count(*) FROM recent) < $5::int
       RETURNING at
     )
     SELECT (SELECT count(*) FROM recent)::int AS used,
            COALESCE(
              CEIL(EXTRACT(EPOCH FROM (
                (SELECT min(at) FROM recent)
                  + make_interval(secs => $3::float8) - now()
              )))::int,
              0
            ) AS retry_after`,
    [bucket, key, windowS, consume, limit],
  );

  const used = rows[0]?.used ?? 0;
  if (used < limit) return OK;
  return { allowed: false, retryAfterS: Math.max(1, rows[0]?.retry_after ?? 1) };
}

async function verdict(
  bucket: string,
  key: string,
  limit: number,
  windowS: number,
  consume: boolean,
): Promise<RateVerdict> {
  const id = `${bucket}:${key}`;
  if (!dbConfigured()) return memoryVerdict(id, limit, windowS, consume);
  try {
    return await dbVerdict(bucket, key, limit, windowS, consume);
  } catch (err) {
    // Banco fora não pode abrir a porteira: cai no contador da instância.
    console.error("[rate-limit] banco indisponível, usando memória:", err);
    return memoryVerdict(id, limit, windowS, consume);
  }
}

// ───────────────────────────────────────────────────────────── API

/**
 * Gasta uma ficha e diz se a chamada pode seguir. Quando NEGA, não gasta ficha —
 * a janela anda sozinha e o atacante não consegue estendê-la martelando.
 */
export function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowS: number,
): Promise<RateVerdict> {
  return verdict(bucket, key, limit, windowS, true);
}

/** Só consulta, sem gastar ficha. Para "já errou demais?" antes de conferir. */
export function rateLimitPeek(
  bucket: string,
  key: string,
  limit: number,
  windowS: number,
): Promise<RateVerdict> {
  return verdict(bucket, key, limit, windowS, false);
}

/** Gasta uma ficha sem perguntar nada. Para contabilizar um erro já ocorrido. */
export async function rateLimitHit(bucket: string, key: string): Promise<void> {
  // Teto alto (mas dentro do int4 do Postgres) = o INSERT sempre acontece; a
  // janela de 24 h é só o prazo da faxina — quem lê usa a janela que quiser.
  await verdict(bucket, key, 1_000_000, 86_400, true);
}
