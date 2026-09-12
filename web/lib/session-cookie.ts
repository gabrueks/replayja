// Forma do cookie de sessão — SEM criptografia, de propósito.
//
// Este módulo é importado pelo middleware (Edge Runtime) e pelas rotas (Node).
// Nada aqui pode tocar `node:crypto`: um único import transitivo dele quebra o
// build do Edge. Por isso o tipo, os prazos e a forma do cookie moram aqui, e a
// assinatura mora em `session.ts` (Node) e `session-edge.ts` (Web Crypto).

export type Sessao = {
  /** `app_user.id` — a chave estável de posse (grupos, convites, gatilhos). */
  uid: string;
  email: string;
  exp: number;
};

export const SESSION_COOKIE_NAME = "session";

/** 400 dias é o TETO que os navegadores aceitam para cookies. */
export const MAX_AGE_S = 60 * 60 * 24 * 400;

/** Renova quando o cookie passa de 7 dias — a renovação deslizante. */
export const RENEW_AFTER_MS = 1000 * 60 * 60 * 24 * 7;

/** True quando o cookie já tem mais de 7 dias — hora de reemitir. */
export function needsRenewal(s: Sessao): boolean {
  return s.exp - Date.now() < MAX_AGE_S * 1000 - RENEW_AFTER_MS;
}

export function sessionCookie(value: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    // O Next NÃO marca `Secure` sozinho; sem isso a sessão trafega em HTTP claro.
    // Condicional porque `next dev` roda em http://localhost e o cookie sumiria.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_S,
  };
}

/** Cookie de logout: mesmo nome, valor vazio, expirado. */
export function clearSessionCookie() {
  return { ...sessionCookie(""), maxAge: 0 };
}

/**
 * Valida o payload já decodificado. A ASSINATURA é conferida por quem chama —
 * esta função só garante que o conteúdo tem a forma certa e não venceu.
 */
export function validarPayload(bruto: unknown): Sessao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const s = bruto as Partial<Sessao>;
  if (typeof s.uid !== "string" || !s.uid) return null;
  if (typeof s.email !== "string" || !s.email) return null;
  if (typeof s.exp !== "number" || s.exp < Date.now()) return null;
  return { uid: s.uid, email: s.email, exp: s.exp };
}
