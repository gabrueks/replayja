/**
 * O destino pós-login precisa ser um caminho RELATIVO do próprio domínio.
 *
 * ─── POR QUE ISTO É CÓDIGO DE SEGURANÇA ────────────────────────────────────
 *
 * Sem esta função, `?redirectTo=https://evil.com` transforma a tela de login num
 * REDIRECT ABERTO — e um redirect aberto numa tela de login é phishing com a
 * nossa marca: o link começa em `replayja.com.br`, o usuário confere o domínio,
 * clica, e termina numa cópia da nossa tela pedindo o código dele.
 *
 * Também recusa `//host`, que o navegador trata como protocolo-relativo e que
 * passa por qualquer checagem ingênua de "começa com `/`".
 */
export function destinoSeguro(bruto: unknown): string | undefined {
  if (typeof bruto !== "string" || !bruto.startsWith("/")) return undefined;
  if (bruto.startsWith("//")) return undefined;
  if (bruto.length > 512) return undefined;
  return bruto;
}
