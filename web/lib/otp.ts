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

/**
 * Código fixo para e-mails de teste, definido em `OTP_TEST_CODE`.
 *
 * Só vale fora de produção: como o caminho depende apenas de uma variável de
 * ambiente, um `vercel env add OTP_TEST_CODE` em produção bastaria para reviver
 * um bypass de login. Por isso o `NODE_ENV === "production"` fecha a porta antes
 * de olhar a variável.
 */
export function testCodeFor(email: string): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const code = process.env.OTP_TEST_CODE;
  if (code && email.endsWith("@replayja.test")) return code;
  return null;
}
