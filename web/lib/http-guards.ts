import type { NextRequest } from "next/server";

// Guardas de requisição — corpo com teto, origem conferida, `Content-Type`.
// Portado de `lib/http-guards.ts` do Sentinela.

/**
 * Teto do CORPO da requisição, em bytes.
 *
 * Route handler do Next 15 não tem teto de corpo: `await req.json()` lê o fluxo
 * inteiro na memória ANTES de qualquer validação de tamanho. Na Vercel o limite
 * de 4,5 MB da plataforma segura a maior parte; um `next start` fora dela não
 * segura nada.
 *
 * 16 KiB cobre com folga todos os corpos deste app (o maior é o
 * `POST /relay/health`, com uma lista de câmeras da máquina).
 */
export const CORPO_MAX = 16 * 1024;

/** O `content-length` já passa do teto? Barato — é só um cabeçalho. */
export function corpoDeclaradoAcimaDoTeto(req: NextRequest, max = CORPO_MAX): boolean {
  const bruto = req.headers.get("content-length");
  if (!bruto) return false;
  const n = Number(bruto);
  return Number.isFinite(n) && n > max;
}

export type CorpoLido = { ok: true; texto: string } | { ok: false; motivo: "grande" };

/**
 * Lê o corpo como texto, parando no teto. Conta os bytes à medida que chegam e
 * CANCELA o fluxo ao ultrapassar — quem manda 40 MB não consegue fazer o
 * servidor guardar 40 MB antes da recusa.
 */
export async function lerCorpoLimitado(
  req: NextRequest,
  max = CORPO_MAX,
): Promise<CorpoLido> {
  if (corpoDeclaradoAcimaDoTeto(req, max)) return { ok: false, motivo: "grande" };
  const fluxo = req.body;
  if (!fluxo) return { ok: true, texto: "" };

  const leitor = fluxo.getReader();
  const pedacos: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > max) {
        await leitor.cancel().catch(() => {});
        return { ok: false, motivo: "grande" };
      }
      pedacos.push(value);
    }
  } catch {
    // Conexão cortada no meio: corpo vazio, e o `JSON.parse` de quem chamou
    // devolve 400. Nunca 500.
    return { ok: true, texto: "" };
  }

  const junto = new Uint8Array(bytes);
  let n = 0;
  for (const p of pedacos) {
    junto.set(p, n);
    n += p.byteLength;
  }
  return { ok: true, texto: new TextDecoder().decode(junto) };
}

/** Lê o corpo como JSON, respeitando o teto. `null` quando inválido ou grande. */
export async function lerJson(
  req: NextRequest,
  max = CORPO_MAX,
): Promise<Record<string, unknown> | null> {
  const corpo = await lerCorpoLimitado(req, max);
  if (!corpo.ok) return null;
  if (!corpo.texto.trim()) return {};
  try {
    const v: unknown = JSON.parse(corpo.texto);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * A requisição veio da PRÓPRIA origem?
 *
 * `SameSite=Lax` barra o ataque clássico, mas é same-**site**, não
 * same-**origin**: `relay-1.replayja.com.br`, `stream.` e `cdn.` são o MESMO
 * site que `replayja.com.br`. Um XSS ou um arquivo servido em qualquer
 * subdomínio faria requisição autenticada com o cookie junto.
 *
 * A conferência é por HOST, e o host de comparação é o da própria requisição
 * (não uma env): o mesmo código serve produção, os previews da Vercel e o
 * `localhost:3000`.
 *
 * `Origin: null` (sandbox, `data:`, redirect entre origens) NÃO passa: é um
 * cabeçalho que não nomeia ninguém. Ausência de `Origin` passa — navegador não
 * manda em navegação e `curl` não manda nunca; recusar aí quebraria clientes
 * legítimos sem impedir ataque nenhum.
 */
export function mesmaOrigem(req: NextRequest): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

/**
 * O `Content-Type` é JSON?
 *
 * Exigir isto devolve a proteção de brinde do *preflight*: um `fetch`
 * cross-site simples só pode mandar `text/plain`,
 * `application/x-www-form-urlencoded` ou `multipart/form-data` sem pedir
 * permissão antes.
 *
 * ATENÇÃO: o webhook do botão físico é a exceção deliberada — o firmware é de
 * terceiro e o `Content-Type` dele é ignorado por contrato (`api/README.md` §4).
 */
export function ehJson(req: NextRequest): boolean {
  const tipo = req.headers.get("content-type");
  if (!tipo) return false;
  return tipo.split(";")[0]!.trim().toLowerCase() === "application/json";
}
