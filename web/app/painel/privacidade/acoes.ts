"use server";

import { revalidatePath } from "next/cache";
import { MENSAGEM_BLOQUEIO, validarBloqueio } from "@/db/queries/painel-regras";
import {
  criarBloqueio,
  criarPedidoDeRemocao,
  definirBloqueioAtivo,
  removerBloqueio,
} from "@/db/queries/painel-privacidade";
import { quadrasDoPainel } from "@/db/queries/painel-quadras";
import { exigirArena } from "../_lib/arena";
import { executarExpurgo } from "../_lib/expurgo";

// As ações da tela de privacidade.
//
// ─── O EXPURGO NÃO É UM `DELETE`; É UM PROTOCOLO ───────────────────────────
//
// `docs/legal/fluxo-remocao.md` §9 exige registro com protocolo, quem decidiu e
// quando, guardado por CINCO ANOS: é a prova de cumprimento dos arts. 37 e 50 da
// LGPD. Um botão "apagar" que só marcasse `deleted_at` deixaria a arena sem
// nada para mostrar se o titular voltar — ou se a ANPD perguntar.
//
// Por isso TODA remoção pelo painel cria um `takedown_request` antes de apagar,
// mesmo quando quem pede é a própria arena. O protocolo (`RJ-2026-000123`) é o
// que se diz ao telefone.

export type ResultadoDaPrivacidade =
  | { ok: true; mensagem: string; protocolo?: string }
  | { ok: false; erro: string };

// ──────────────────────────────────────── horários bloqueados

export async function criarBloqueioDaArena(
  arenaSlug: string,
  dados: FormData,
): Promise<ResultadoDaPrivacidade> {
  const { parceiro, sessao } = await exigirArena(arenaSlug);

  const weekday = Number(dados.get("dia"));
  const inicio = String(dados.get("inicio") ?? "");
  const fim = String(dados.get("fim") ?? "");
  const valido = validarBloqueio({ weekday, inicio, fim });
  if (!valido.ok) return { ok: false, erro: MENSAGEM_BLOQUEIO[valido.motivo] };

  const bruto = String(dados.get("quadra") ?? "");
  let courtId: string | null = null;
  if (bruto && bruto !== "todas") {
    // A quadra é resolvida contra a LISTA DA ARENA; o `WHERE EXISTS` do INSERT
    // confere de novo, porque sem RLS a escrita não pode confiar na tela.
    const quadras = await quadrasDoPainel(parceiro.id);
    const escolhida = quadras.find((q) => q.id === bruto);
    if (!escolhida) return { ok: false, erro: "Essa quadra não é desta arena." };
    courtId = escolhida.id;
  }

  await criarBloqueio(parceiro.id, {
    courtId,
    weekday,
    inicio,
    fim,
    label: String(dados.get("rotulo") ?? "").trim().slice(0, 80) || null,
    criadoPor: sessao.uid ?? null,
  });

  revalidatePath("/painel/privacidade");
  return {
    ok: true,
    mensagem:
      "Bloqueio criado. Nesse horário o botão para de salvar lances — a gravação contínua segue, " +
      "e ela expira sozinha pela retenção da sessão.",
  };
}

export async function alternarBloqueio(
  arenaSlug: string,
  bloqueioId: string,
  ativo: boolean,
): Promise<ResultadoDaPrivacidade> {
  const { parceiro } = await exigirArena(arenaSlug);
  const ok = await definirBloqueioAtivo(parceiro.id, bloqueioId, ativo);
  if (!ok) return { ok: false, erro: "Bloqueio não encontrado nesta arena." };
  revalidatePath("/painel/privacidade");
  return { ok: true, mensagem: ativo ? "Bloqueio reativado." : "Bloqueio desligado." };
}

export async function excluirBloqueio(
  arenaSlug: string,
  bloqueioId: string,
): Promise<ResultadoDaPrivacidade> {
  const { parceiro } = await exigirArena(arenaSlug);
  const ok = await removerBloqueio(parceiro.id, bloqueioId);
  if (!ok) return { ok: false, erro: "Bloqueio não encontrado nesta arena." };
  revalidatePath("/painel/privacidade");
  return { ok: true, mensagem: "Bloqueio removido." };
}

// ────────────────────────────────────────── remoção de lance

/**
 * Abre o protocolo e executa o expurgo — `fluxo-remocao.md` §7.
 *
 * A ordem aqui é a do takedown e não a do expurgo por retenção: marca-se
 * `deleted_at` PRIMEIRO (efeito imediato e reversível, o vídeo sai do ar para
 * quem abrir a página) e só depois apagam-se os objetos (irreversível). O
 * relógio do SLA corre, e um órfão de objeto por alguns segundos é preço barato.
 *
 * O resultado guarda em `verification` o que cada camada respondeu — inclusive
 * as três que este código ainda NÃO faz (revogação de URL assinada, segmento no
 * disco do relay, `revalidateTag` das páginas em cache). O protocolo só vira
 * `concluido` quando as camadas implementadas passam: um takedown pela metade é
 * pior que nenhum, porque a pessoa foi avisada de que o vídeo saiu.
 */
export async function removerLance(
  arenaSlug: string,
  dados: FormData,
): Promise<ResultadoDaPrivacidade> {
  const { parceiro, sessao } = await exigirArena(arenaSlug);

  const clipId = String(dados.get("clipe") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(clipId)) {
    return { ok: false, erro: "Escolha o lance a remover." };
  }

  const papel = String(dados.get("papel") ?? "titular");
  const papeisValidos = ["titular", "responsavel_menor", "terceiro", "arena", "autoridade"];
  if (!papeisValidos.includes(papel)) return { ok: false, erro: "Quem pediu não foi informado." };

  const gravidade = String(dados.get("gravidade") ?? "comum");
  if (!["comum", "menor", "grave"].includes(gravidade)) {
    return { ok: false, erro: "Gravidade inválida." };
  }

  const pedido = await criarPedidoDeRemocao(parceiro.id, {
    courtId: null,
    clipIds: [clipId],
    // O ÚNICO dado pessoal do solicitante. O fluxo (§3.2) é explícito: não
    // pedimos documento — exigir identificação para apagar a própria imagem é
    // barreira, não segurança.
    contato: String(dados.get("contato") ?? "").trim().slice(0, 160) || null,
    papel: papel as "titular" | "responsavel_menor" | "terceiro" | "arena" | "autoridade",
    gravidade: gravidade as "comum" | "menor" | "grave",
    motivo: String(dados.get("motivo") ?? "").trim().slice(0, 1000) || null,
    canal: "painel",
  });

  const resultado = await executarExpurgo(parceiro.id, [clipId], {
    motivo: `takedown ${pedido.protocol}`,
    pedidoId: pedido.id,
    decididoPor: sessao.uid ?? null,
  });

  revalidatePath("/painel/privacidade");

  if (resultado.clipesMarcados === 0) {
    return { ok: false, erro: "Esse lance não é desta arena ou já foi removido." };
  }

  return {
    ok: true,
    protocolo: pedido.protocol,
    mensagem: resultado.concluido
      ? `Lance removido. Protocolo ${pedido.protocol}. O arquivo saiu do armazenamento e a ` +
        "invalidação na CDN foi pedida — ela leva alguns minutos para alcançar todas as bordas."
      : `Lance retirado do ar (protocolo ${pedido.protocol}), mas nem todas as camadas ` +
        "confirmaram. O protocolo ficou como 'executado' e precisa de conferência manual.",
  };
}
