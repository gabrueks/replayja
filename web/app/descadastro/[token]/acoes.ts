"use server";

import { redirect } from "next/navigation";
import { lerDescadastro } from "@/lib/descadastro";
import { desligarAvisoSemanalPorUsuario } from "@/db/queries/grupo";

/**
 * Desliga o resumo semanal a partir do token assinado.
 *
 * O token é a autenticação — não há sessão nenhuma aqui (ver
 * `app/api/descadastro/[token]/route.ts`). Esta ação existe para o caminho HUMANO:
 * quem clicou no link do rodapé, leu a página e apertou "Não quero mais".
 *
 * Ela não diz se o token era válido. Um token morto e um token de outra pessoa
 * respondem a mesma tela de "pronto": esta URL é aberta por qualquer um que
 * receba o e-mail encaminhado, e uma resposta diferente diria a ele que o
 * endereço existe.
 */
export async function descadastrar(token: string): Promise<void> {
  const alvo = lerDescadastro(token);
  if (alvo) await desligarAvisoSemanalPorUsuario(alvo.userId, alvo.playGroupId);
  redirect(`/descadastro/${token}?feito=1`);
}
