import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { sha256Hex } from "./app-secret";
import { relayPorKeyHash } from "@/db/queries/relay";
import { ProblemError } from "./problem";
import type { RelayNodeRow } from "@/db/queries/relay";

// Autenticação do RELAY → nuvem: cabeçalho `x-relay-key`.
//
// ─── O DESENHO, E POR QUE ELE É ASSIM ──────────────────────────────────────
//
// O banco guarda apenas o SHA-256 da chave (`relay_node.key_hash`), nunca a
// chave. O relay manda a chave crua por HTTPS e nós comparamos o hash — mesmo
// padrão de `button.token_hash`.
//
// A comparação do hash é em tempo constante. Sim, hash de segredo em HTTPS é
// difícil de atacar por timing, mas a linha custa nada e a alternativa (`===`)
// é o tipo de detalhe que ninguém revisita.
//
// Chave por env em vez de por linha: `RELAY_KEY` existe para o piloto de UM
// relay, quando ainda não há tabela semeada. Quando a tabela tem linha, ela
// ganha — a env é o fallback de bootstrap, não o caminho normal.

const HEADER = "x-relay-key";

export type RelayAutenticado = {
  relayNodeId: string;
  /** `true` quando veio da env de bootstrap, não de uma linha de `relay_node`. */
  bootstrap: boolean;
  node: RelayNodeRow | null;
};

function comparaHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Confere o `x-relay-key` e devolve o relay. Lança 401 quando não bate.
 *
 * Toda rota de `/api/relay/*` começa por aqui. Não existe rota de relay que
 * receba `relayNodeId` do corpo sem passar por esta função — quem manda a chave
 * é quem define de qual relay estamos falando.
 */
export async function exigirRelay(req: NextRequest): Promise<RelayAutenticado> {
  const chave = req.headers.get(HEADER)?.trim();
  if (!chave) throw naoAutorizado();

  const hash = sha256Hex(chave);

  const node = await relayPorKeyHash(hash);
  if (node) return { relayNodeId: node.id, bootstrap: false, node };

  // Bootstrap: antes de a tabela existir/estar semeada, uma env autentica o
  // único relay do piloto. `RELAY_KEY_HASH` é o preferido (o segredo não fica em
  // claro na env); `RELAY_KEY` existe para quem está subindo a bancada.
  const hashEnv = process.env.RELAY_KEY_HASH?.trim();
  const chaveEnv = process.env.RELAY_KEY?.trim();
  const esperado = hashEnv || (chaveEnv ? sha256Hex(chaveEnv) : null);
  if (esperado && comparaHex(hash, esperado)) {
    return {
      relayNodeId: process.env.RELAY_NODE_ID?.trim() || "relay-1",
      bootstrap: true,
      node: null,
    };
  }

  throw naoAutorizado();
}

function naoAutorizado(): ProblemError {
  return new ProblemError({
    type: "login-required",
    title: "Chave de relay inválida",
    status: 401,
    // Esta mensagem NÃO é para usuário final: quem lê é quem está depurando o
    // relay com curl. Por isso é técnica, ao contrário do resto do catálogo.
    detail: "Cabeçalho x-relay-key ausente ou não reconhecido.",
  });
}
