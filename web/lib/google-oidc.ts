import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { safeEqualB64, signWithAppSecret as sign } from "./app-secret";

// Google por OIDC MANUAL — ADR §4.4.
//
// ─── POR QUE NÃO AUTH.JS ───────────────────────────────────────────────────
//
// O argumento decisivo não é tamanho, é POSSE DA SESSÃO. Adotar o Auth.js só
// para o Google criaria dois donos de sessão num app cuja autenticação, fora
// isso, não tem dependência nenhuma — e a alternativa (Auth.js para tudo)
// jogaria fora um fluxo de OTP que já está em produção no Sentinela e já
// sobreviveu a auditoria. Para UM provedor, sem necessidade de refresh token
// (nunca chamamos API do Google de novo), o OIDC é um redirect, um POST de troca
// e uma verificação de assinatura.
//
// ─── AS TRÊS CHECAGENS QUE NÃO PODEM FALTAR ────────────────────────────────
//
// Errar qualquer uma delas é tomada de conta alheia:
//
//  1. `email_verified === true`. Sem isso, alguém cria uma conta Google com o
//     e-mail de outra pessoa e entra como ela.
//  2. `aud === GOOGLE_CLIENT_ID` e `iss ∈ {accounts.google.com,
//     https://accounts.google.com}`. Um `id_token` LEGÍTIMO emitido para OUTRO
//     aplicativo também é assinado pelo Google e passa na verificação de
//     assinatura.
//  3. `nonce` conferido contra o cookie do desafio, contra replay.
//
// A vinculação de contas é o `upsert ON CONFLICT (email)`: quem entrou por OTP
// na segunda e por Google na quarta cai na mesma `app_user`, porque os dois
// caminhos só chegam lá com o e-mail COMPROVADO.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export const GOOGLE_CHALLENGE_COOKIE = "google_challenge";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID não configurado");
  return v;
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET não configurado");
  return v;
}

/** A URL de callback registrada no console do Google. */
export function redirectUri(origem: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${origem}/api/auth/google/callback`;
}

// ───────────────────────────────────── desafio (mesmo padrão do OTP)

export type DesafioGoogle = {
  state: string;
  nonce: string;
  /** `code_verifier` do PKCE. */
  verifier: string;
  exp: number;
  redirectTo?: string;
  partnerSlug?: string;
};

export function novoDesafio(extra: { redirectTo?: string; partnerSlug?: string } = {}): DesafioGoogle {
  return {
    state: crypto.randomBytes(16).toString("base64url"),
    nonce: crypto.randomBytes(16).toString("base64url"),
    // 32 bytes → 43 chars base64url, dentro do 43–128 que a RFC 7636 exige.
    verifier: crypto.randomBytes(32).toString("base64url"),
    exp: Date.now() + CHALLENGE_TTL_MS,
    ...(extra.redirectTo ? { redirectTo: extra.redirectTo } : {}),
    ...(extra.partnerSlug ? { partnerSlug: extra.partnerSlug } : {}),
  };
}

/** Serializa o desafio num cookie HMAC — o mesmo `encodeChallenge` do OTP. */
export function encodeDesafio(d: DesafioGoogle): string {
  const payload = Buffer.from(JSON.stringify(d)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeDesafio(value: string | undefined): DesafioGoogle | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  if (!safeEqualB64(sig, sign(payload))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<DesafioGoogle>;
    if (typeof d.state !== "string" || typeof d.nonce !== "string") return null;
    if (typeof d.verifier !== "string") return null;
    if (typeof d.exp !== "number" || d.exp < Date.now()) return null;
    return {
      state: d.state,
      nonce: d.nonce,
      verifier: d.verifier,
      exp: d.exp,
      ...(typeof d.redirectTo === "string" ? { redirectTo: d.redirectTo } : {}),
      ...(typeof d.partnerSlug === "string" ? { partnerSlug: d.partnerSlug } : {}),
    };
  } catch {
    return null;
  }
}

export function desafioCookie(value: string) {
  return {
    name: GOOGLE_CHALLENGE_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // `lax` e não `strict`: o cookie precisa sobreviver ao retorno de navegação
    // vindo do Google. Com `strict` o callback chegaria sem o desafio e todo
    // login pelo Google falharia.
    sameSite: "lax" as const,
    path: "/",
    maxAge: CHALLENGE_TTL_MS / 1000,
  };
}

export function s256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** A URL para onde redirecionar o navegador. */
export function urlDeAutorizacao(d: DesafioGoogle, origem: string): string {
  const u = new URL(AUTH_ENDPOINT);
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", redirectUri(origem));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", d.state);
  u.searchParams.set("nonce", d.nonce);
  u.searchParams.set("code_challenge", s256(d.verifier));
  u.searchParams.set("code_challenge_method", "S256");
  // `select_account` em vez de `none`: o atleta pode ter várias contas e a
  // escolha errada vira um grupo no lugar errado, que não dá para desfazer.
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

// ───────────────────────────────────────────── troca e verificação

export type IdentidadeGoogle = {
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  sub: string;
};

type RespostaToken = { id_token?: string; error?: string; error_description?: string };

/** Troca o `code` pelo `id_token`. */
export async function trocarCodigo(
  code: string,
  verifier: string,
  origem: string,
): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(origem),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const json = (await res.json()) as RespostaToken;
  if (!res.ok || !json.id_token) {
    throw new Error(
      `Falha na troca do código com o Google: ${res.status} ${json.error ?? ""} ${json.error_description ?? ""}`,
    );
  }
  return json.id_token;
}

// O JWKS é cacheado pelo `jose` (respeita `Cache-Control`), então isto não faz
// uma ida à rede por login. Fica no módulo de propósito.
const jwks = createRemoteJWKSet(JWKS_URL);

/**
 * Verifica a assinatura e as três checagens obrigatórias.
 *
 * `jwtVerify` já confere assinatura, `exp`, `iss` e `aud` — as duas últimas
 * porque nós as passamos. O `nonce` e o `email_verified` ficam por nossa conta:
 * a biblioteca não tem como saber qual nonce nós emitimos.
 */
export async function verificarIdToken(
  idToken: string,
  nonceEsperado: string,
): Promise<IdentidadeGoogle> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ISSUERS,
    audience: clientId(),
  });

  if (payload.nonce !== nonceEsperado) {
    throw new Error("nonce do id_token não confere com o desafio (replay?)");
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const emailVerified = payload.email_verified === true;
  if (!email) throw new Error("id_token do Google sem e-mail");
  if (!emailVerified) {
    // A checagem que, faltando, deixa qualquer um criar uma conta Google com o
    // e-mail de outra pessoa e entrar como ela.
    throw new Error("e-mail do Google não verificado — login recusado");
  }

  return {
    email,
    emailVerified,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
    sub: String(payload.sub),
  };
}
