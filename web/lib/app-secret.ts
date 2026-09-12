import crypto from "node:crypto";

// O SEGREDO DO APP, num lugar só.
//
// Portado de `lib/app-secret.ts` do Sentinela (ADR §4.4 — "o que se copia sem
// discussão"). Três coisas são assinadas com ele: o cookie de sessão
// (`lib/session.ts`), o desafio do código de login (`lib/otp.ts`) e o desafio do
// fluxo OIDC do Google (`lib/google-oidc.ts`). O cursor de paginação da API usa
// o mesmo segredo por um derivado (`CURSOR_SECRET` quando existir).
//
// O ponto do arquivo é NÃO ter fallback silencioso em produção. Um deployment
// sem `SESSION_SECRET` continuaria funcionando "lindamente" e passaria a assinar
// tudo com uma string que está no código-fonte: qualquer pessoa forjaria cookie
// de sessão de qualquer e-mail e forjaria o desafio do OTP. Falha silenciosa,
// consequência total.
//
// O `next dev` mantém o fallback porque lá ele não protege nada — e exigir a
// variável faria `pnpm install && pnpm dev` não subir numa máquina nova.

const DEV_FALLBACK = "dev-secret-change-me";

/**
 * O segredo de assinatura. Lança fora do desenvolvimento quando `SESSION_SECRET`
 * não está configurado — de propósito, e no momento do USO (não no import), para
 * não derrubar o build de páginas que nunca assinam nada.
 */
export function appSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "development") return DEV_FALLBACK;
  throw new Error(
    "SESSION_SECRET não configurado — sessão, código de login e desafio do " +
      "Google não podem ser assinados. Configure a variável e refaça o deploy " +
      "(variável nova só vale para deployments criados depois dela).",
  );
}

/** HMAC-SHA256 do payload com o segredo do app, em base64url. */
export function signWithAppSecret(payload: string): string {
  return crypto.createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

/**
 * Compara duas strings base64url em tempo constante.
 *
 * O tamanho precisa ser conferido nos BUFFERS, não nas strings: uma assinatura
 * com o mesmo número de caracteres mas com um multibyte (ex.: "é") passa pela
 * checagem de string e faz `timingSafeEqual` lançar `RangeError` — que, solto,
 * vira 500 em toda requisição enquanto o cookie existir. O try/catch é a rede de
 * segurança para qualquer outro erro de decodificação, já que base64url aceita
 * lixo caladamente.
 */
export function safeEqualB64(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "base64url");
    const bufB = Buffer.from(b, "base64url");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * SHA-256 em hex. Usado para guardar segredo de dispositivo no banco
 * (`relay_node.key_hash`, `button.token_hash`, `*_invite_token_hash`): o valor
 * cru só existe uma vez, na tela de provisionamento ou no e-mail.
 */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * HMAC-SHA256 em hex, com chave própria. Usado para pseudonimizar IP e e-mail
 * em tabelas de auditoria (`share_event.ip_hash`, `app_error.user_email_hash`) —
 * LGPD: o dado serve para deduplicar e correlacionar, não para identificar.
 */
export function hmacHex(value: string, key = appSecret()): string {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}
