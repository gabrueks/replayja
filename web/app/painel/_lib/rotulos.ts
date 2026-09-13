/**
 * Rótulos que o topo e as telas de escolha compartilham.
 *
 * Ficam aqui, e não dentro de `_components/BarraDaArena.tsx`, porque aquele
 * arquivo é `"use client"`: importar uma função dele num componente de servidor
 * arrastaria o módulo inteiro para o bundle do cliente. Um arquivo neutro entre
 * os dois é mais barato que a alternativa.
 */

/** "Arena Vasco" → "AV"; "Calabouço" → "CA". O brasão enquanto não há logo. */
export function iniciaisDaArena(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "??";
  if (palavras.length === 1) return palavras[0]!.slice(0, 2).toUpperCase();
  return (palavras[0]![0]! + palavras[1]![0]!).toUpperCase();
}

/**
 * Os três papéis de `partner_admin`, na palavra que a arena usa.
 *
 * "Acompanha" e não "Visualizador": o papel existe para o dono que delegou a
 * operação, e é assim que ele se descreve.
 */
export function rotuloDoPapel(papel: string): string {
  const mapa: Record<string, string> = {
    owner: "Dono",
    manager: "Gerente",
    viewer: "Acompanha",
  };
  return mapa[papel] ?? papel;
}
