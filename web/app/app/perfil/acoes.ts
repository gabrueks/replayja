"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { definirAvisoSemanal } from "@/db/queries/grupo";

/**
 * Liga ou desliga o resumo semanal de UM grupo.
 *
 * ─── A PREFERÊNCIA É POR GRUPO, E NÃO POR CONTA ────────────────────────────
 *
 * `notify_weekly` mora em `play_group_member`, não em `app_user`. A pergunta
 * real de quem joga em três peladas é "quero receber o resumo DESTA?", e um
 * interruptor único por conta transformaria "não quero o da terça" em "não quero
 * nenhum" — quem não consegue calar só um acaba calando tudo, e aí o produto
 * perde o canal inteiro por causa de um grupo.
 *
 * Quem valida se a pessoa é membro é `definirAvisoSemanal`, em `db/queries` —
 * um id de grupo alheio não liga nem desliga nada.
 */
export async function alternarAvisoDoGrupo(
  playGroupId: string,
  ligado: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  const sessao = await getSession();
  if (!sessao) return { ok: false, erro: "Entre para mudar seus avisos." };

  await definirAvisoSemanal(sessao, playGroupId, ligado);
  revalidatePath("/app/perfil");
  return { ok: true };
}
