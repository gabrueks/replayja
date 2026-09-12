import { cookies } from "next/headers";
import { safeEqualB64, signWithAppSecret as sign } from "./app-secret";
import {
  MAX_AGE_S,
  SESSION_COOKIE_NAME,
  validarPayload,
  type Sessao,
} from "./session-cookie";

// Sessão em cookie assinado (HMAC), sem tabela de sessão — portado do Sentinela.
//
// ─── A DIFERENÇA PARA O SENTINELA (ADR §4.4) ───────────────────────────────
//
// O cookie do Sentinela carrega `plan`, `rec`, `chk` e `dsig`: uma foto do
// billing do Stripe. Aqui não há billing no caminho do atleta, então o cookie
// carrega `{uid, email, exp}` e NADA DE AUTORIZAÇÃO.
//
// Papel de admin de arena é consultado no banco na requisição de painel
// (`exigirAdminDaArena`), nunca guardado aqui. Isso mata de uma vez a classe de
// bug "o cookie diz que sou admin de uma arena que já me removeu" — e custa uma
// consulta indexada por requisição de painel, que é barato.
//
// `uid` existe porque, ao contrário do Sentinela, este produto TEM tabela de
// usuário: grupos, convites e posse precisam de um id estável (`app_user.id`).
//
// A forma do cookie mora em `session-cookie.ts` (sem `node:crypto`, para o
// middleware poder importar); a versão Edge da assinatura, em `session-edge.ts`.

export type { Sessao };
export {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  needsRenewal,
  sessionCookie,
} from "./session-cookie";

export function encodeSession(s: Omit<Sessao, "exp">): string {
  const full: Sessao = { ...s, exp: Date.now() + MAX_AGE_S * 1000 };
  const payload = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined): Sessao | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  if (!safeEqualB64(sig, sign(payload))) return null;
  try {
    return validarPayload(JSON.parse(Buffer.from(payload, "base64url").toString()));
  } catch {
    return null;
  }
}

/** A sessão da requisição atual (Server Component ou Route Handler). */
export async function getSession(): Promise<Sessao | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE_NAME)?.value);
}
