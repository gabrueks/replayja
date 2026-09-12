import { MAX_AGE_S, validarPayload, type Sessao } from "./session-cookie";

// A MESMA sessão, assinada com Web Crypto em vez de `node:crypto`.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ───────────────────────────────────────────
//
// O middleware roda no Edge Runtime, onde `node:crypto` NÃO existe — só a Web
// Crypto API, que é assíncrona. `lib/session.ts` usa `node:crypto` porque é o que
// as rotas (runtime Node) precisam, e porque é o código portado do Sentinela.
//
// A alternativa seria o middleware não conferir a assinatura e só olhar se o
// cookie existe. Recusada: um gate que aceita cookie forjado ensina o time a
// pensar que "passou pelo middleware" significa alguma coisa — e a partir daí é
// questão de tempo até alguém confiar nisso para uma decisão que importa.
//
// O FORMATO É IDÊNTICO (`base64url(JSON).base64url(HMAC)`), então os dois lados
// leem o cookie um do outro. O que não pode acontecer é os dois DIVERGIREM: se o
// formato mudar em `session.ts`, muda aqui. O teste `tests/sessao.test.ts` confere
// que um cookie emitido por um é aceito pelo outro.

const enc = new TextEncoder();
const chaves = new Map<string, CryptoKey>();

function segredo(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "development") return "dev-secret-change-me";
  throw new Error("SESSION_SECRET não configurado");
}

async function chaveHmac(): Promise<CryptoKey> {
  const s = segredo();
  const cache = chaves.get(s);
  if (cache) return cache;
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(s),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  chaves.set(s, k);
  return k;
}

function paraBase64Url(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(norm.padEnd(Math.ceil(norm.length / 4) * 4, "="));
}

export async function assinarEdge(payload: string): Promise<string> {
  return paraBase64Url(await crypto.subtle.sign("HMAC", await chaveHmac(), enc.encode(payload)));
}

/**
 * Comparação em tempo constante entre duas strings base64url.
 *
 * Não dá para usar `timingSafeEqual` aqui (é do `node:crypto`), então é XOR
 * acumulado byte a byte — o custo de percorrer a string inteira sempre, que é
 * exatamente o ponto.
 */
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function decodeSessionEdge(value: string | undefined): Promise<Sessao | null> {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  try {
    if (!igualConstante(sig, await assinarEdge(payload))) return null;
    return validarPayload(JSON.parse(deBase64Url(payload)));
  } catch {
    return null;
  }
}

export async function encodeSessionEdge(s: Omit<Sessao, "exp">): Promise<string> {
  const full: Sessao = { ...s, exp: Date.now() + MAX_AGE_S * 1000 };
  const payload = paraBase64Url(enc.encode(JSON.stringify(full)).buffer as ArrayBuffer);
  return `${payload}.${await assinarEdge(payload)}`;
}
