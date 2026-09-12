"use server";

import { revalidatePath } from "next/cache";
import {
  cadastrarCamera,
  definirCameraAtiva,
  relaysDisponiveis,
  renomearCamera,
  rotacionarChaveDaCamera,
} from "@/db/queries/relay";
import {
  idDeCamera,
  idDeCameraValido,
  novaChaveDeTransmissao,
  servidorDeTransmissao,
} from "@/db/queries/painel-regras";
import { quadrasDoPainel } from "@/db/queries/painel-quadras";
import { exigirArena } from "../_lib/arena";

// As ações da tela de câmeras.
//
// ─── ESTAS AÇÕES MEXEM NO EQUIPAMENTO QUE ESTÁ NA QUADRA ───────────────────
//
// Cadastrar aloca uma porta do relay que fica DIGITADA dentro da câmera;
// rotacionar a chave derruba a câmera instalada até alguém subir na escada. Por
// isso as duas exigem papel `manager` (o padrão de `exigirArena`) e por isso a
// resposta carrega o texto exato que a tela precisa mostrar depois — o segredo
// aparece UMA vez, e recarregar a página não o traz de volta.

export type ResultadoDaCamera =
  | {
      ok: true;
      /** Só no cadastro e na rotação: mostrado uma vez, nunca relido do banco. */
      segredo?: { cameraId: string; servidor: string; chave: string; versao: number };
      mensagem: string;
    }
  | { ok: false; campo: "nome" | "quadra" | "relay" | "geral"; erro: string };

export async function cadastrarCameraDaArena(
  arenaSlug: string,
  dados: FormData,
): Promise<ResultadoDaCamera> {
  const { parceiro } = await exigirArena(arenaSlug);

  const courtId = String(dados.get("quadra") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(courtId)) {
    return { ok: false, campo: "quadra", erro: "Escolha a quadra desta câmera." };
  }

  const nome = String(dados.get("nome") ?? "").trim();
  if (nome.length < 2 || nome.length > 60) {
    return { ok: false, campo: "nome", erro: "Dê um nome à câmera (2 a 60 caracteres)." };
  }

  // A quadra é resolvida contra a LISTA DA ARENA: um uuid na requisição nunca
  // escolhe quadra. `cadastrarCamera` confere de novo no banco, porque sem RLS a
  // escrita não pode confiar na tela.
  const quadras = await quadrasDoPainel(parceiro.id);
  const quadra = quadras.find((q) => q.id === courtId);
  if (!quadra) return { ok: false, campo: "quadra", erro: "Essa quadra não é desta arena." };

  const relays = await relaysDisponiveis();
  const relay = relays[0];
  if (!relay) {
    return {
      ok: false,
      campo: "relay",
      erro: "Nenhum relay disponível. Fale com o Replay já antes de instalar a câmera.",
    };
  }

  // O id vira diretório no relay (`/srv/rec/<id>/`), então precisa ser
  // `[a-z0-9]{6,32}`. Deriva de arena + quadra para ficar legível para quem
  // entra na máquina às 2h da manhã; o sufixo numérico resolve a segunda câmera
  // da mesma quadra.
  let cameraId = idDeCamera(parceiro.slug, quadra.slug);
  if (!idDeCameraValido(cameraId)) {
    return { ok: false, campo: "geral", erro: "Não conseguimos derivar um id para esta câmera." };
  }

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const resultado = await cadastrarCamera(parceiro.id, {
      cameraId,
      courtId,
      nome,
      relayNodeId: relay.id,
      chave: novaChaveDeTransmissao(),
      targetBitrateKbps: 3000,
    });

    if (resultado.ok) {
      revalidatePath("/painel/cameras");
      revalidatePath("/painel/quadras");
      return {
        ok: true,
        mensagem:
          "Câmera cadastrada. Digite o servidor e a chave no aplicativo da câmera — a chave " +
          "não é mostrada de novo.",
        segredo: {
          cameraId: resultado.cameraId,
          servidor: servidorDeTransmissao(resultado.rtmpHost, resultado.porta),
          chave: resultado.chave,
          versao: 1,
        },
      };
    }

    if (resultado.motivo === "id-em-uso") {
      // Segunda câmera na mesma quadra: `arenavascoquadra1` → `arenavascoquadra12`.
      cameraId = idDeCamera(parceiro.slug, quadra.slug, String(tentativa + 2));
      continue;
    }
    return {
      ok: false,
      campo: "relay",
      erro: MENSAGEM[resultado.motivo] ?? "Não foi possível cadastrar a câmera.",
    };
  }

  return { ok: false, campo: "geral", erro: "Não conseguimos gerar um id livre para a câmera." };
}

const MENSAGEM: Record<string, string> = {
  quadra: "Essa quadra não é desta arena.",
  "faixa-esgotada":
    "O relay não tem mais portas livres. Fale com o Replay já: é preciso subir outro relay.",
  "relay-cheio": "O relay atingiu o limite de câmeras. Fale com o Replay já.",
  "id-em-uso": "Já existe uma câmera com esse identificador.",
};

/**
 * Gera uma chave de transmissão nova.
 *
 * A câmera PARA de gravar até alguém digitar a nova chave nela. É o
 * comportamento certo de uma rotação, e a tela avisa antes — aqui o que importa
 * é que a chave devolvida só existe nesta resposta.
 */
export async function rotacionarChave(
  arenaSlug: string,
  cameraId: string,
): Promise<ResultadoDaCamera> {
  const { parceiro } = await exigirArena(arenaSlug);
  const relays = await relaysDisponiveis();

  const r = await rotacionarChaveDaCamera(parceiro.id, cameraId, novaChaveDeTransmissao());
  if (!r) return { ok: false, campo: "geral", erro: "Câmera não encontrada nesta arena." };

  revalidatePath(`/painel/cameras/${cameraId}`);
  revalidatePath("/painel/cameras");

  const host = relays[0]?.rtmp_host ?? "stream.replayja.com.br";
  return {
    ok: true,
    mensagem:
      "Chave nova gerada. A câmera fica sem gravar até que ela seja digitada no equipamento.",
    segredo: {
      cameraId,
      // A porta não muda numa rotação; a tela recarrega e mostra a atual. Aqui
      // vale o host, que é o que o instalador confere junto com a chave.
      servidor: `rtmp://${host}`,
      chave: r.chave,
      versao: r.versao,
    },
  };
}

export async function renomearCameraDaArena(
  arenaSlug: string,
  cameraId: string,
  nome: string,
): Promise<ResultadoDaCamera> {
  const { parceiro } = await exigirArena(arenaSlug);
  const limpo = nome.trim();
  if (limpo.length < 2 || limpo.length > 60) {
    return { ok: false, campo: "nome", erro: "Dê um nome à câmera (2 a 60 caracteres)." };
  }
  const ok = await renomearCamera(parceiro.id, cameraId, limpo);
  if (!ok) return { ok: false, campo: "geral", erro: "Câmera não encontrada nesta arena." };
  revalidatePath(`/painel/cameras/${cameraId}`);
  return { ok: true, mensagem: "Nome atualizado." };
}

export async function alternarCamera(
  arenaSlug: string,
  cameraId: string,
  ativa: boolean,
): Promise<ResultadoDaCamera> {
  const { parceiro } = await exigirArena(arenaSlug);
  const ok = await definirCameraAtiva(parceiro.id, cameraId, ativa);
  if (!ok) return { ok: false, campo: "geral", erro: "Câmera não encontrada nesta arena." };
  revalidatePath(`/painel/cameras/${cameraId}`);
  revalidatePath("/painel/cameras");
  return {
    ok: true,
    mensagem: ativa
      ? "Câmera reativada. O relay volta a gravá-la no próximo ciclo."
      : "Câmera desligada: o relay para de gravar esta quadra.",
  };
}
