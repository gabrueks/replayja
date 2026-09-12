import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hmacHex } from "./app-secret";
import { tryQuery } from "./db";
import { ProblemError, problem } from "./problem";

// Observabilidade SEM Sentry — ADR §7.
//
// O substituto concreto é esta função: `logError` grava em `app_error` com
// `fingerprint`, `message`, `stack`, `route`, `count`, `first_seen_at`,
// `last_seen_at` e `ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1`.
// É um Sentry pobre — sem agregação por release, sem breadcrumbs, sem dedupe
// esperto — mas é CONSULTÁVEL COM SQL e não expira, que é exatamente o que os
// Runtime Logs da Vercel não oferecem (retenção curta: um erro de sexta à noite
// pode não estar lá na segunda).
//
// O `traceId` vai no corpo do erro (RFC 9457) e é o MESMO valor gravado na
// tabela. É o fio entre a reclamação do usuário e a linha.
//
// LGPD: o e-mail nunca é gravado em claro. Vai como HMAC (`user_email_hash`),
// que serve para correlacionar "é sempre o mesmo usuário?" sem guardar quem.

export type ContextoErro = {
  /** Rota lógica: `/api/auth/otp/verify`, `/[arenaSlug]`. */
  route?: string;
  method?: string;
  userId?: string | null;
  userEmail?: string | null;
  /** Qualquer coisa pequena que ajude o diagnóstico. Nunca segredo, nunca PII. */
  extra?: Record<string, unknown>;
};

/** 12 hex — curto o suficiente para o usuário ditar por telefone. */
export function novoTraceId(): string {
  return crypto.randomBytes(6).toString("hex");
}

/**
 * A impressão digital que agrupa ocorrências do MESMO defeito.
 *
 * Usa rota + nome do erro + a primeira linha de stack que seja código nosso.
 * Deliberadamente não inclui a mensagem inteira: mensagens costumam carregar id
 * e timestamp, e isso faria cada ocorrência virar um grupo novo — que é
 * exatamente o problema que agrupar existe para resolver.
 */
export function fingerprintDe(err: unknown, route: string | undefined): string {
  const nome = err instanceof Error ? err.name : typeof err;
  const stack = err instanceof Error ? (err.stack ?? "") : "";
  const linha =
    stack
      .split("\n")
      .slice(1)
      .find((l) => !l.includes("node_modules") && /\.(ts|tsx|js|mjs)/.test(l))
      ?.trim()
      .replace(/:\d+:\d+\)?$/, "") ?? "";
  return crypto
    .createHash("sha256")
    .update(`${route ?? "-"}|${nome}|${linha}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Grava o erro em `app_error` e devolve o `traceId`.
 *
 * Nunca lança: usa `tryQuery`, então banco fora não transforma um 500 em dois.
 * O log no console continua — é o que os Runtime Logs da Vercel mostram
 * enquanto o incidente está acontecendo.
 */
export async function logError(err: unknown, ctx: ContextoErro = {}): Promise<string> {
  const traceId = novoTraceId();
  const fingerprint = fingerprintDe(err, ctx.route);
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? null) : null;

  console.error(`[app-error] ${traceId} ${ctx.route ?? "-"} ${message}`, err);

  await tryQuery(
    `INSERT INTO app_error (
       fingerprint, message, stack, route, method, user_id, user_email_hash,
       extra, trace_id, count, first_seen_at, last_seen_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,now(),now())
     ON CONFLICT (fingerprint) DO UPDATE SET
       count        = app_error.count + 1,
       last_seen_at = now(),
       message      = EXCLUDED.message,
       stack        = EXCLUDED.stack,
       trace_id     = EXCLUDED.trace_id,
       extra        = EXCLUDED.extra`,
    [
      fingerprint,
      message.slice(0, 2000),
      stack?.slice(0, 8000) ?? null,
      ctx.route ?? null,
      ctx.method ?? null,
      ctx.userId ?? null,
      ctx.userEmail ? hmacHex(ctx.userEmail.toLowerCase()) : null,
      ctx.extra ? JSON.stringify(ctx.extra).slice(0, 4000) : null,
      traceId,
    ],
  );

  return traceId;
}

/**
 * Embrulha um Route Handler: converte `ProblemError` na resposta certa e
 * qualquer outra exceção num 500 com `traceId` gravado.
 *
 * Sem isso, cada rota repetiria o mesmo try/catch — e uma que esquecesse
 * devolveria o stack trace do Next ao usuário.
 */
export function withRoute<Ctx>(
  route: string,
  handler: (req: NextRequest, ctx: Ctx) => Promise<NextResponse>,
): (req: NextRequest, ctx: Ctx) => Promise<NextResponse> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ProblemError) {
        // Erro de negócio esperado: não polui `app_error`. O 5xx é a exceção —
        // um `relay-unavailable` é uma condição do mundo, não um defeito nosso,
        // mas vale a linha porque some no log curto da Vercel.
        const traceId =
          err.init.status >= 500 ? await logError(err, { route, method: req.method }) : undefined;
        return problem({ ...err.init, instance: new URL(req.url).pathname, traceId });
      }
      const traceId = await logError(err, { route, method: req.method });
      return problem({
        type: "internal",
        title: "Erro inesperado",
        status: 500,
        detail:
          "Algo deu errado do nosso lado. Tente de novo em instantes — se persistir, " +
          `informe o código ${traceId}.`,
        instance: new URL(req.url).pathname,
        traceId,
      });
    }
  };
}
