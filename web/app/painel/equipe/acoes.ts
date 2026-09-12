"use server";

import { revalidatePath } from "next/cache";
import {
  alterarPapelDoAdmin,
  convidarAdmin,
  removerAdmin,
} from "@/db/queries/painel-equipe";
import { exigirArena } from "../_lib/arena";

// As ações da tela de equipe.
//
// ─── TODAS EXIGEM `owner`, E NÃO `manager` ─────────────────────────────────
//
// Conceder acesso é a única operação do painel que se REPRODUZ: um `manager` que
// pudesse convidar convidaria outro `manager`, que convidaria outro. O papel que
// controla quem entra é o do dono, e só ele.
//
// A regra do último dono é conferida em dois lugares e isso é deliberado: aqui,
// para dar uma frase em pt-BR antes de tentar, e no gatilho
// `partner_admin_exige_owner` (migração 0003), que é a garantia de verdade —
// vale para `psql`, para script e para qualquer rota futura.

export type ResultadoDaEquipe =
  | { ok: true; mensagem: string }
  | { ok: false; erro: string };

const MENSAGEM = {
  "ultimo-owner":
    "Esta é a única conta dona da arena. Convide outro dono antes de remover ou rebaixar esta.",
  "nao-encontrado": "Essa pessoa não está na equipe desta arena.",
  email: "Confira o e-mail: ele precisa ter o formato nome@dominio.com.",
  "ja-existe": "Essa pessoa já está na equipe.",
} as const;

export async function convidarParaArena(
  arenaSlug: string,
  dados: FormData,
): Promise<ResultadoDaEquipe> {
  const { parceiro, sessao } = await exigirArena(arenaSlug, "owner");

  const email = String(dados.get("email") ?? "");
  const papel = String(dados.get("papel") ?? "manager");
  if (papel !== "owner" && papel !== "manager" && papel !== "viewer") {
    return { ok: false, erro: "Papel desconhecido." };
  }

  const r = await convidarAdmin(parceiro.id, email, papel, sessao.uid ?? null);
  if (!r.ok) return { ok: false, erro: MENSAGEM[r.motivo] };

  revalidatePath("/painel/equipe");
  return {
    ok: true,
    mensagem: r.jaTinhaConta
      ? `${email.trim()} já tinha conta no Replay já e agora administra esta arena.`
      : `${email.trim()} foi adicionado. Ele entra com o código que chega nesse e-mail — não há senha.`,
  };
}

export async function removerDaArena(
  arenaSlug: string,
  adminId: string,
): Promise<ResultadoDaEquipe> {
  const { parceiro } = await exigirArena(arenaSlug, "owner");
  const r = await removerAdmin(parceiro.id, adminId);
  if (!r.ok) return { ok: false, erro: MENSAGEM[r.motivo] };
  revalidatePath("/painel/equipe");
  return { ok: true, mensagem: "Acesso removido." };
}

export async function trocarPapel(
  arenaSlug: string,
  adminId: string,
  papel: "owner" | "manager" | "viewer",
): Promise<ResultadoDaEquipe> {
  const { parceiro } = await exigirArena(arenaSlug, "owner");
  const r = await alterarPapelDoAdmin(parceiro.id, adminId, papel);
  if (!r.ok) return { ok: false, erro: MENSAGEM[r.motivo] };
  revalidatePath("/painel/equipe");
  return { ok: true, mensagem: "Papel atualizado." };
}
