import { NextResponse } from "next/server";

// Erros no formato RFC 9457 (`application/problem+json`) — `api/README.md` §6.
//
// Regra de copy que vale repetir: `detail` é escrito em pt-BR e PRONTO PARA
// EXIBIR ao usuário — e NUNCA cita o prazo de retenção, que é configurável por
// parceiro. Uma mensagem que promete um número vira mentira no dia em que o
// número mudar.
//
// `traceId` é o mesmo valor gravado em `app_error` (ver `lib/app-error.ts`): é o
// que liga a reclamação do usuário à linha do banco. Sem Sentry, é o único fio.

export const PROBLEM_BASE = "https://replayja.com.br/problems";

/** Catálogo inicial de `type` — `api/README.md` §6. */
export type ProblemType =
  | "clip-expired"
  | "clip-not-ready"
  | "range-too-large"
  | "camera-down"
  | "court-blackout"
  | "trigger-cooldown"
  | "slug-taken"
  | "slug-invalid"
  | "invite-expired"
  | "last-owner"
  | "idempotency-key-reuse"
  | "checksum-mismatch"
  | "no-coverage"
  | "relay-unavailable"
  | "not-a-partner-admin"
  | "login-required"
  | "forbidden"
  | "not-found"
  | "bad-request"
  | "rate-limited"
  | "internal";

export type ProblemInit = {
  type: ProblemType;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  traceId?: string;
  /** Cabeçalhos extras — `Retry-After` em 429, por exemplo. */
  headers?: Record<string, string>;
};

/** Erro de aplicação que as rotas lançam e o `withRoute` converte em resposta. */
export class ProblemError extends Error {
  readonly init: Omit<ProblemInit, "traceId" | "instance">;

  constructor(init: Omit<ProblemInit, "traceId" | "instance">) {
    super(`${init.type}: ${init.detail}`);
    this.name = "ProblemError";
    this.init = init;
  }
}

export function problem(init: ProblemInit): NextResponse {
  const { headers, ...corpo } = init;
  return NextResponse.json(
    {
      type: `${PROBLEM_BASE}/${corpo.type}`,
      title: corpo.title,
      status: corpo.status,
      detail: corpo.detail,
      ...(corpo.instance ? { instance: corpo.instance } : {}),
      ...(corpo.traceId ? { traceId: corpo.traceId } : {}),
    },
    {
      status: corpo.status,
      headers: { "Content-Type": "application/problem+json", ...(headers ?? {}) },
    },
  );
}

// ─────────────────────────────────────────── atalhos mais usados

export const naoAutenticado = () =>
  new ProblemError({
    type: "login-required",
    title: "Entre para continuar",
    status: 401,
    detail: "Faça login para ver e compartilhar os lances.",
  });

export const semPermissao = () =>
  new ProblemError({
    type: "forbidden",
    title: "Sem permissão",
    status: 403,
    detail: "Esta conta não tem acesso a este recurso.",
  });

/**
 * 404 também para o que existe mas é invisível — `api/README.md` §6 é explícito:
 * nunca distinguir "não existe" de "você não pode ver", porque a diferença é um
 * oráculo de enumeração.
 */
export const naoEncontrado = () =>
  new ProblemError({
    type: "not-found",
    title: "Não encontrado",
    status: 404,
    detail: "Não encontramos o que você procura.",
  });

/**
 * Horário bloqueado pela arena (escolinha) — `court_blackout`.
 *
 * ─── POR QUE NÃO É "CÂMERA FORA DO AR" ─────────────────────────────────────
 *
 * A câmera está gravando normalmente; o que não pode existir é o CLIPE. Dizer
 * "câmera fora do ar" mandaria o atleta reclamar com a arena e a arena caçar um
 * defeito que não existe — e, pior, esconderia do painel a informação de que o
 * bloqueio está funcionando.
 *
 * `409` e não `403`: não é falta de permissão desta pessoa, é um estado do
 * recurso que muda sozinho quando o horário passa.
 *
 * A mensagem NÃO diz "escolinha" nem o rótulo configurado pela arena: o rótulo
 * é escrito pelo parceiro e pode conter nome de turma ou de criança.
 */
export const quadraBloqueada = () =>
  new ProblemError({
    type: "court-blackout",
    title: "Horário reservado",
    status: 409,
    detail: "A arena bloqueou a gravação de lances neste horário.",
  });

export const corpoInvalido = (detail = "Não foi possível ler a requisição.") =>
  new ProblemError({ type: "bad-request", title: "Requisição inválida", status: 400, detail });

export const janelaGrandeDemais = () =>
  new ProblemError({
    type: "range-too-large",
    title: "Intervalo muito longo",
    status: 422,
    detail: "Escolha um intervalo de até 6 horas.",
  });

export const excedeuLimite = (detail: string, retryAfterS: number) =>
  new ProblemError({
    type: "rate-limited",
    title: "Muitas tentativas",
    status: 429,
    detail,
    // `Retry-After` junto da mensagem é o que faz o navegador parar de martelar
    // sozinho, sem depender de a tela ler o corpo da resposta.
    headers: { "Retry-After": String(Math.max(1, retryAfterS)) },
  });
