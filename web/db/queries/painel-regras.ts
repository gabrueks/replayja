import crypto from "node:crypto";

// As regras do painel que SÓ rodam no servidor.
//
// Tudo o que é puro e serve às duas pontas está em `painel-rotulos.ts`, e é
// reexportado aqui para que o código de servidor continue importando de um
// lugar só. O que fica neste arquivo depende de `node:crypto` — e um `import`
// de valor daqui num componente de cliente quebra o build, de propósito.

export * from "./painel-rotulos";

// ─────────────────────────────────────────────── segredos

/**
 * Chave de transmissão da câmera: 24 caracteres hex.
 *
 * Hex e não base64url porque ela é **digitada à mão** no app da câmera, muitas
 * vezes num teclado virtual de TV: `-`, `_` e a diferença entre `l` e `I` são
 * exatamente onde a digitação erra.
 */
export function novaChaveDeTransmissao(): string {
  return crypto.randomBytes(12).toString("hex");
}

/**
 * Token do webhook do botão: 32 caracteres base62.
 *
 * O formato é contrato com o firmware — `app/api/triggers/b/[buttonToken]`
 * recusa fora de `^[A-Za-z0-9]{24,48}$` antes de ir ao banco. `base64url` traria
 * `-` e `_`, que a rota rejeitaria.
 */
export function novoTokenDeWebhook(): string {
  const alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(32);
  let saida = "";
  for (const b of bytes) saida += alfabeto[b % 62];
  return saida;
}

export function hashDoSegredo(valor: string): string {
  return crypto.createHash("sha256").update(valor).digest("hex");
}

/** O que o instalador digita no campo "servidor" da câmera. */
export function servidorDeTransmissao(rtmpHost: string, porta: number | null): string {
  return `rtmp://${rtmpHost}:${porta ?? 0}/live`;
}

/** A URL completa do webhook — mostrada UMA vez, na criação do botão. */
export function urlDoWebhook(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/api/triggers/b/${token}`;
}

