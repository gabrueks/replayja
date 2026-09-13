/**
 * Para onde leva "Achar meu lance" — o único CTA de `/app/lances`.
 *
 * ─── POR QUE ISTO É UM ARQUIVO E NÃO UMA LINHA NA PÁGINA ───────────────────
 *
 * Porque é a regra que o bug 5 do teste em produção deixou: a tela tinha DOIS
 * botões para o mesmo destino, com rótulos diferentes ("Buscar por horário" e
 * "Bora achar seu lance"). Unificar em um só só resolve de verdade se o destino
 * desse um for uma decisão escrita e testada — senão o segundo volta na próxima
 * tela que precisar de um atalho.
 *
 * Uma página do App Router não pode exportar nomes soltos sem confundir o
 * validador de rotas do Next, e a regra precisa de teste. Daí o módulo.
 */

/**
 * Com UMA arena só não há nada a escolher: o CTA pula direto para a busca dela.
 * Com mais de uma (ou nenhuma), a escolha da arena é o passo 1 do fluxo do PRD
 * — e pular esse passo com um palpite foi exatamente o que produziu o "busquei
 * e não achou" que a v2 consertou.
 */
export function destinoDeAcharMeuLance(arenas: ReadonlyArray<{ slug: string }>): string {
  const unica = arenas.length === 1 ? arenas[0] : undefined;
  return unica ? `/app/buscar?arena=${unica.slug}` : "/app";
}

/**
 * O RÓTULO MUDOU DE CASA.
 *
 * Ele era `ACHAR_MEU_LANCE`, declarado aqui, e virou `ACHAR_LANCE` em
 * `lib/copy.ts` na leva de UX de 13/09 — porque o achado P1-16 mostrou que a
 * mesma ação tinha CINCO frases no produto ("Entrar pra ver meus lances", "Bora
 * achar meu lance", "Bora achar seu lance", "Buscar por horário", "Buscar
 * lances"), e uma constante que mora numa rota só não tem como ser usada pelas
 * outras quatro telas.
 *
 * O que continua aqui é a REGRA DE DESTINO, que é de `/app/lances`.
 */
export { ACHAR_LANCE } from "@/lib/copy";
