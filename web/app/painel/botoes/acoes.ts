"use server";

import { revalidatePath } from "next/cache";
import {
  criarBotao,
  definirBotaoAtivo,
  regenerarTokenDoBotao,
  renomearBotao,
} from "@/db/queries/gatilho";
import { hashDoSegredo, novoTokenDeWebhook, urlDoWebhook } from "@/db/queries/painel-regras";
import { quadrasDoPainel } from "@/db/queries/painel-quadras";
import { exigirArena } from "../_lib/arena";

// As ações da tela de botões.
//
// ─── O TOKEN NASCE AQUI, APARECE UMA VEZ E NUNCA MAIS ──────────────────────
//
// O banco guarda só o SHA-256 (`modelo-de-dados.md` §3.10). Não existe "ver de
// novo" e não deve existir: a coluna que sobra é `token_last4`, suficiente para
// o operador conferir qual botão é qual sem revelar nada.
//
// Quem perdeu a URL regenera — e regenerar invalida a que está dentro do
// dispositivo, o que significa reconfigurar o botão. A tela diz isso antes.

export type ResultadoDoBotao =
  | { ok: true; mensagem: string; webhook?: { url: string; last4: string } }
  | { ok: false; campo: "rotulo" | "quadra" | "geral"; erro: string };

function baseDoSite(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br").replace(/\/$/, "");
}

export async function criarBotaoDaArena(
  arenaSlug: string,
  dados: FormData,
): Promise<ResultadoDoBotao> {
  const { parceiro } = await exigirArena(arenaSlug);

  const courtId = String(dados.get("quadra") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(courtId)) {
    return { ok: false, campo: "quadra", erro: "Escolha a quadra deste botão." };
  }

  const rotulo = String(dados.get("rotulo") ?? "").trim();
  if (rotulo.length < 2 || rotulo.length > 60) {
    return { ok: false, campo: "rotulo", erro: "Dê um nome ao botão (2 a 60 caracteres)." };
  }

  const tipo = String(dados.get("tipo") ?? "wifi_webhook");
  if (tipo !== "wifi_webhook" && tipo !== "zigbee_hub" && tipo !== "virtual") {
    return { ok: false, campo: "geral", erro: "Tipo de botão desconhecido." };
  }

  const modelo = String(dados.get("modelo") ?? "").trim().slice(0, 80) || null;

  // A quadra é resolvida contra a LISTA DA ARENA; o `EXISTS` do INSERT confere
  // de novo no banco, porque sem RLS a escrita não pode confiar na tela.
  const quadras = await quadrasDoPainel(parceiro.id);
  if (!quadras.some((q) => q.id === courtId)) {
    return { ok: false, campo: "quadra", erro: "Essa quadra não é desta arena." };
  }

  const token = novoTokenDeWebhook();
  const criado = await criarBotao(parceiro.id, {
    courtId,
    label: rotulo,
    kind: tipo,
    model: modelo,
    token,
    hashDoToken: hashDoSegredo(token),
    // 1500 ms é o padrão da 0006: o tempo entre o dedo e a chegada do POST num
    // botão que dorme. É MEDIDO na instalação; o valor aqui é o ponto de
    // partida, e errar para mais só alarga a janela do corte.
    wakeLatencyMs: 1500,
  });
  if (!criado) return { ok: false, campo: "quadra", erro: "Essa quadra não é desta arena." };

  revalidatePath("/painel/botoes");
  return {
    ok: true,
    mensagem:
      "Botão criado. Configure esta URL no dispositivo agora — ela não é mostrada de novo.",
    webhook: { url: urlDoWebhook(baseDoSite(), criado.token), last4: criado.last4 },
  };
}

export async function regenerarToken(
  arenaSlug: string,
  buttonId: string,
): Promise<ResultadoDoBotao> {
  const { parceiro } = await exigirArena(arenaSlug);
  const token = novoTokenDeWebhook();
  const r = await regenerarTokenDoBotao(parceiro.id, buttonId, token, hashDoSegredo(token));
  if (!r) return { ok: false, campo: "geral", erro: "Botão não encontrado nesta arena." };

  revalidatePath("/painel/botoes");
  return {
    ok: true,
    mensagem:
      "Token novo gerado. A URL antiga passou a responder 404 — reconfigure o dispositivo.",
    webhook: { url: urlDoWebhook(baseDoSite(), r.token), last4: r.last4 },
  };
}

export async function alternarBotao(
  arenaSlug: string,
  buttonId: string,
  ativo: boolean,
): Promise<ResultadoDoBotao> {
  const { parceiro } = await exigirArena(arenaSlug);
  const ok = await definirBotaoAtivo(parceiro.id, buttonId, ativo);
  if (!ok) return { ok: false, campo: "geral", erro: "Botão não encontrado nesta arena." };
  revalidatePath("/painel/botoes");
  return {
    ok: true,
    mensagem: ativo
      ? "Botão reativado."
      : "Botão revogado: os toques continuam chegando (é assim que se descobre um botão " +
        "esquecido na parede), mas nenhum lance é salvo.",
  };
}

export async function renomearBotaoDaArena(
  arenaSlug: string,
  buttonId: string,
  rotulo: string,
): Promise<ResultadoDoBotao> {
  const { parceiro } = await exigirArena(arenaSlug);
  const limpo = rotulo.trim();
  if (limpo.length < 2 || limpo.length > 60) {
    return { ok: false, campo: "rotulo", erro: "Dê um nome ao botão (2 a 60 caracteres)." };
  }
  const ok = await renomearBotao(parceiro.id, buttonId, limpo);
  if (!ok) return { ok: false, campo: "geral", erro: "Botão não encontrado nesta arena." };
  revalidatePath("/painel/botoes");
  return { ok: true, mensagem: "Nome atualizado." };
}
