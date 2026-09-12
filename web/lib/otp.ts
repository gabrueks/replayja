import crypto from "node:crypto";
import { safeEqualB64, signWithAppSecret as sign } from "./app-secret";

// Login por código de 6 dígitos enviado por e-mail, SEM banco de dados: o
// desafio (e-mail + hash do código + validade) vive num cookie HMAC de 10 min.
//
// Portado de `lib/otp.ts` do Sentinela. O valor da peça (ADR §4.4) é não haver
// linha para expirar, limpar nem vazar — para um produto cujo diferencial é
// login sem fricção, é o mínimo de infraestrutura possível.

export const CHALLENGE_COOKIE_NAME = "otp_challenge";
export const CODE_TTL_MS = 10 * 60 * 1000;

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

type Challenge = {
  email: string;
  codeHash: string;
  exp: number;
  /** Caminho relativo para onde voltar depois do login. Validado na emissão. */
  redirectTo?: string;
  /** Arena pela qual o usuário entrou — vira `app_user.first_partner_id`. */
  partnerSlug?: string;
};

export function encodeChallenge(
  email: string,
  code: string,
  extra: { redirectTo?: string; partnerSlug?: string } = {},
): string {
  const challenge: Challenge = {
    email,
    codeHash: sign(`${email}:${code}`),
    exp: Date.now() + CODE_TTL_MS,
    ...(extra.redirectTo ? { redirectTo: extra.redirectTo } : {}),
    ...(extra.partnerSlug ? { partnerSlug: extra.partnerSlug } : {}),
  };
  const payload = Buffer.from(JSON.stringify(challenge)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Abre o desafio e confere a assinatura — sem comparar o código ainda. */
export function decodeChallenge(value: string | undefined): Challenge | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  if (!safeEqualB64(sig, sign(payload))) return null;
  try {
    const ch = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<Challenge>;
    if (typeof ch.email !== "string" || typeof ch.codeHash !== "string") return null;
    if (typeof ch.exp !== "number" || ch.exp < Date.now()) return null;
    return {
      email: ch.email,
      codeHash: ch.codeHash,
      exp: ch.exp,
      ...(typeof ch.redirectTo === "string" ? { redirectTo: ch.redirectTo } : {}),
      ...(typeof ch.partnerSlug === "string" ? { partnerSlug: ch.partnerSlug } : {}),
    };
  } catch {
    return null;
  }
}

export function verifyChallenge(
  value: string | undefined,
  email: string,
  code: string,
): boolean {
  const ch = decodeChallenge(value);
  if (!ch || ch.email !== email) return false;
  // `codeHash` também é base64url vindo de `sign()`, mas chega de um cookie:
  // vale a mesma comparação defensiva, senão um hash forjado derruba a request.
  return safeEqualB64(sign(`${email}:${code}`), ch.codeHash);
}

export function challengeCookie(value: string) {
  return {
    name: CHALLENGE_COOKIE_NAME,
    value,
    httpOnly: true,
    // O Next não marca `Secure` sozinho; sem isso o desafio do OTP trafega em
    // HTTP claro. Condicional para não quebrar `next dev` em http://localhost.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: CODE_TTL_MS / 1000,
  };
}

// ───────────────────────────────────────── bypass de login (E2E)

/**
 * Código fixo de login, para as contas listadas em `OTP_BYPASS_EMAILS`.
 *
 * ─── POR QUE ISTO EXISTE, E POR QUE NÃO É MAIS "FECHADO EM PRODUÇÃO" ───────
 *
 * O domínio de envio ainda não está verificado no Resend (pendência G-4/G-1), e
 * sem ele NENHUM código de login chega — o que torna impossível testar o produto
 * em produção com o fundador. O desenho anterior fechava a porta olhando só
 * `NODE_ENV`, e a alternativa que estava sobre a mesa ("liga a variável e reza")
 * seria pior: um `OTP_TEST_CODE` sozinho valeria para QUALQUER e-mail.
 *
 * O desenho atual troca isso por uma porta ESTREITA E AUDITÁVEL:
 *
 *  1. Em produção o código fixo vale SOMENTE para e-mails que estejam
 *     EXATAMENTE na lista de `OTP_BYPASS_EMAILS` (comparação por igualdade, já
 *     normalizada; nunca por sufixo de domínio). Lista vazia = bypass desligado,
 *     que é o estado padrão de um deploy novo.
 *  2. O código precisa ter exatamente 6 dígitos — o mesmo formato do real, senão
 *     o `verify` recusaria antes de comparar e o sintoma seria "o código certo
 *     não funciona".
 *  3. Todo login por esta porta deixa LINHA DE LOG ESTRUTURADA
 *     (`registrarBypass`), que é o que permite auditar depois quem entrou por
 *     aqui e quando.
 *
 * Fora de produção, `@replayja.test` continua valendo sem lista — é o que faz o
 * desenvolvimento local e o preview seguirem sem configuração nenhuma.
 *
 * QUANDO REMOVER: assim que o domínio estiver verificado no Resend, apagar as
 * duas variáveis da Vercel desliga tudo sem tocar em código.
 */

const SUFIXO_DE_TESTE = "@replayja.test";

/** A lista de `OTP_BYPASS_EMAILS`, normalizada e sem vazios. */
export function emailsDeBypass(): string[] {
  return (process.env.OTP_BYPASS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes("@"));
}

/** O código fixo, só quando tem a forma de um código real. */
function codigoFixo(): string | null {
  const code = process.env.OTP_TEST_CODE?.trim();
  return code && /^\d{6}$/.test(code) ? code : null;
}

export function ehEmailDeBypass(email: string): boolean {
  const alvo = email.trim().toLowerCase();
  return emailsDeBypass().includes(alvo);
}

/**
 * O código fixo que vale para este e-mail, ou `null` quando não vale nenhum.
 *
 * Em produção: só para e-mail na lista. Fora dela: lista OU `@replayja.test`.
 */
export function testCodeFor(email: string): string | null {
  const code = codigoFixo();
  if (!code) return null;

  const alvo = email.trim().toLowerCase();
  if (ehEmailDeBypass(alvo)) return code;

  // O sufixo de teste é a conveniência do desenvolvimento, e ele PARA na porta
  // de produção. Sem esta linha, registrar `replayja.test` como domínio de
  // verdade abriria login para qualquer endereço dele.
  if (process.env.NODE_ENV !== "production" && alvo.endsWith(SUFIXO_DE_TESTE)) return code;

  return null;
}

/**
 * A linha de auditoria do bypass. JSON numa linha só para o log da Vercel poder
 * ser filtrado por `"evento":"otp_bypass"` sem parser nenhum.
 */
export function registrarBypass(
  etapa: "codigo-emitido" | "login",
  email: string,
  extra: Record<string, unknown> = {},
): void {
  console.warn(
    JSON.stringify({
      evento: "otp_bypass",
      etapa,
      email: email.trim().toLowerCase(),
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      em: new Date().toISOString(),
      ...extra,
    }),
  );
}
