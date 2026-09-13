"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { registrarCompartilhamento } from "@/db/queries/compartilhamento";
import { entrarNoGrupo, grupoPorTokenDeConvite } from "@/db/queries/grupo";

// O ACEITE DO CONVITE — agora um ATO, e não um efeito colateral de abrir o link.
//
// ─── POR QUE ISTO DEIXOU DE ACONTECER NA RENDERIZAÇÃO ──────────────────────
//
// A primeira versão adicionava a pessoa ao grupo dentro do Server Component da
// página: abrir o link já era entrar. Era menos um toque, e custava três coisas.
//
//  1. Ninguém via NO QUE estava entrando. "Você entrou no Fut de Sexta" chegava
//     depois do fato, e quem abriu por engano um link encaminhado já estava na
//     lista de membros — e na lista de e-mails do parceiro.
//  2. Um `GET` mudava estado. Qualquer pré-busca de link (o próprio Next, o
//     preview do WhatsApp, um antivírus de e-mail corporativo que abre todas as
//     URLs) adicionava a pessoa sem que ela tocasse em nada.
//  3. O aceite ficava fora do alcance de qualquer confirmação futura.
//
// O toque a mais compra consentimento visível, que é exatamente o que a LGPD
// pede num fluxo cujo dado de entrada foi digitado por um terceiro.
//
// A idempotência continua em `entrarNoGrupo` (`ON CONFLICT` pelo par grupo +
// e-mail): dois toques no botão não duplicam ninguém.

export async function aceitarConvite(token: string): Promise<void> {
  const sessao = await getSession();
  const grupo = await grupoPorTokenDeConvite(token);
  // Token que morreu entre a renderização e o toque: a página de convite
  // inválido responde a mesma coisa, e mandar para lá é mais honesto que um
  // erro genérico.
  if (!grupo) redirect(`/convite/${token}`);
  if (!sessao) {
    redirect(
      `/entrar?redirectTo=${encodeURIComponent(`/convite/${token}`)}&arena=${grupo.partner_slug}`,
    );
  }

  const resultado = await entrarNoGrupo(sessao, grupo.id, grupo.created_by);

  await registrarCompartilhamento(sessao, {
    partnerId: grupo.partner_id,
    // `signup_from_link` é a conversão que o painel do parceiro mostra: o link
    // que virou MEMBRO, não só o link que foi aberto.
    action: resultado === "entrou" ? "signup_from_link" : "opened",
    channel: "unknown",
    shareLinkId: grupo.share_link_id,
  });

  redirect(`/${grupo.partner_slug}/${grupo.slug}`);
}
