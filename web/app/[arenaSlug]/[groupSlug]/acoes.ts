"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { revogarConviteDoGrupo } from "@/db/queries/compartilhamento";
import {
  atualizarGrupo,
  definirAvisoSemanal,
  grupoPorSlug,
  removerMembroDoGrupo,
  sairDoGrupo,
} from "@/db/queries/grupo";
import { quadrasDoParceiro } from "@/db/queries/parceiro";

// AS AÇÕES DO GRUPO — editar, sair, remover, revogar, calar o e-mail.
//
// ─── SERVER ACTION, PELO MESMO MOTIVO DA CRIAÇÃO (DECISÃO 30) ──────────────
//
// São escritas de FORMULÁRIO, do nosso próprio app, com a sessão em cookie. Uma
// rota de API traria junto o contrato público (versão, RFC 9457, rate limit por
// token) que só faz sentido para o relay e para o app de terceiros — e nenhum
// dos dois edita grupo. Quando `PATCH /groups/{id}` do `openapi.yaml` existir,
// ele chamará as MESMAS funções de `db/queries/grupo.ts`, que é onde a
// autorização mora.
//
// ─── O GRUPO É RESOLVIDO PELO PAR DE SLUGS, NUNCA PELO ID DA TELA ──────────
//
// Toda ação recebe `arenaSlug` + `groupSlug` e busca o id. Poderia receber o id
// direto — `exigirDonoDoGrupo` barraria um id de outro grupo de qualquer jeito —
// mas o par de slugs é o que a URL já tem, e o que a tela manda passa a ser
// exatamente o que a pessoa está olhando. Um id solto no payload é a porta por
// onde um dia entra a ação aplicada no grupo errado.

export type ResultadoDaEdicao =
  | { ok: true }
  | {
      ok: false;
      campo: "nome" | "dias" | "horario" | "quadra" | "visibilidade" | "geral";
      erro: string;
    };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const ESPORTES = [
  "society",
  "beach_tennis",
  "futevolei",
  "padel",
  "volei",
  "tenis",
  "basquete",
  "outro",
] as const;

const VISIBILIDADES = ["public", "unlisted", "private"] as const;

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Resolve o grupo pelo par de slugs, com a sessão de quem pediu. */
async function acharGrupo(arenaSlug: string, groupSlug: string) {
  const sessao = await getSession();
  if (!sessao) return { sessao: null, grupo: null } as const;
  const grupo = await grupoPorSlug(sessao, arenaSlug, groupSlug);
  return { sessao, grupo } as const;
}

/**
 * Salva a edição do grupo. SÓ O DONO — quem garante é `atualizarGrupo`.
 *
 * A validação é REFEITA aqui inteira, mesmo com o formulário já validando: o
 * cliente é sugestão, o servidor é a regra. E os limites conferidos são os
 * mesmos `CHECK` da tabela (janela de 6 h, 1 a 7 dias, descrição de 280), porque
 * conferir aqui é o que transforma um 500 numa frase que a pessoa entende.
 *
 * O SLUG não entra. `EdicaoDeGrupo` nem tem o campo: o link fixo é o produto, e
 * trocá-lo quebraria em silêncio todo link já colado no WhatsApp da pelada.
 */
export async function salvarGrupo(
  arenaSlug: string,
  groupSlug: string,
  dados: FormData,
): Promise<ResultadoDaEdicao> {
  const { sessao, grupo } = await acharGrupo(arenaSlug, groupSlug);
  if (!sessao || !grupo) {
    return { ok: false, campo: "geral", erro: "Não encontramos este grupo." };
  }

  const nome = String(dados.get("nome") ?? "").trim();
  if (nome.length < 3) return { ok: false, campo: "nome", erro: "Dê um nome com pelo menos 3 letras." };
  if (nome.length > 60) return { ok: false, campo: "nome", erro: "O nome ficou longo demais." };

  const descricaoBruta = String(dados.get("descricao") ?? "").trim();
  if (descricaoBruta.length > 280) {
    return { ok: false, campo: "geral", erro: "A descrição passa de 280 caracteres." };
  }

  const esporteBruto = String(dados.get("esporte") ?? "");
  const sport =
    esporteBruto && esporteBruto !== "quadra"
      ? (ESPORTES as readonly string[]).includes(esporteBruto)
        ? esporteBruto
        : null
      : null;

  const dias = dados
    .getAll("dias")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  if (dias.length === 0) {
    return { ok: false, campo: "dias", erro: "Escolha pelo menos um dia da semana." };
  }

  const inicio = String(dados.get("inicio") ?? "");
  const fim = String(dados.get("fim") ?? "");
  if (!HORA.test(inicio) || !HORA.test(fim)) {
    return { ok: false, campo: "horario", erro: "Informe o horário de início e de fim." };
  }
  if (inicio === fim) {
    return { ok: false, campo: "horario", erro: "O fim precisa ser diferente do início." };
  }
  if (fim > inicio && minutos(fim) - minutos(inicio) > 6 * 60) {
    return { ok: false, campo: "horario", erro: "A janela do grupo é de no máximo 6 horas." };
  }

  const quadraSlug = String(dados.get("quadra") ?? "todas");
  let courtId: string | null = null;
  if (quadraSlug && quadraSlug !== "todas") {
    // A quadra é resolvida contra a LISTA DA ARENA: um uuid na requisição nunca
    // escolhe quadra. O gatilho do banco ainda confere de novo, porque sem RLS a
    // escrita não pode confiar na tela.
    const quadras = await quadrasDoParceiro(grupo.partner_id);
    const escolhida = quadras.find((q) => q.slug === quadraSlug);
    if (!escolhida) return { ok: false, campo: "quadra", erro: "Essa quadra não é desta arena." };
    courtId = escolhida.id;
  }

  const visibilidadeBruta = String(dados.get("visibilidade") ?? "unlisted");
  if (!(VISIBILIDADES as readonly string[]).includes(visibilidadeBruta)) {
    return { ok: false, campo: "visibilidade", erro: "Escolha quem pode ver esta página." };
  }
  const visibility = visibilidadeBruta as (typeof VISIBILIDADES)[number];

  await atualizarGrupo(sessao, grupo.id, {
    name: nome,
    description: descricaoBruta || null,
    sport,
    weekdays: dias,
    startTime: inicio,
    endTime: fim,
    courtId,
    visibility,
  });

  // A página do grupo e a de edição mostram os mesmos campos; revalidar só uma
  // faria a outra exibir o horário antigo até a próxima navegação dura.
  revalidatePath(`/${arenaSlug}/${groupSlug}`);
  revalidatePath(`/${arenaSlug}/${groupSlug}/editar`);
  revalidatePath(`/${arenaSlug}`);
  return { ok: true };
}

export type ResultadoDaSaida =
  | { ok: true; mensagem: string }
  | { ok: false; erro: string };

/**
 * Sair do grupo.
 *
 * A mensagem de volta diz QUEM ASSUMIU quando quem saiu era o dono — o gatilho
 * `play_group_member_promove_dono` escolhe o membro ativo mais antigo, e uma
 * saída silenciosa deixaria o grupo com um dono novo que ninguém avisou.
 */
export async function sairDoGrupoDaArena(
  arenaSlug: string,
  groupSlug: string,
): Promise<ResultadoDaSaida> {
  const { sessao, grupo } = await acharGrupo(arenaSlug, groupSlug);
  if (!sessao || !grupo) return { ok: false, erro: "Não encontramos este grupo." };

  const saida = await sairDoGrupo(sessao, grupo.id);

  revalidatePath(`/${arenaSlug}/${groupSlug}`);
  revalidatePath("/app/grupos");

  if (saida.novoDono) {
    const quem = saida.novoDono.nome ?? saida.novoDono.email;
    return { ok: true, mensagem: `Você saiu do ${grupo.name}. ${quem} assumiu o grupo.` };
  }
  if (saida.vazio) {
    return {
      ok: true,
      mensagem: `Você saiu do ${grupo.name}. O grupo ficou vazio — o link continua vivo e quem abrir pode entrar.`,
    };
  }
  return { ok: true, mensagem: `Você saiu do ${grupo.name}.` };
}

/** O dono remove alguém. Nunca a si mesmo — para isso existe "Sair do grupo". */
export async function removerMembro(
  arenaSlug: string,
  groupSlug: string,
  membershipId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const { sessao, grupo } = await acharGrupo(arenaSlug, groupSlug);
  if (!sessao || !grupo) return { ok: false, erro: "Não encontramos este grupo." };

  const r = await removerMembroDoGrupo(sessao, grupo.id, membershipId);
  revalidatePath(`/${arenaSlug}/${groupSlug}/editar`);
  revalidatePath(`/${arenaSlug}/${groupSlug}`);

  if (r === "voce-mesmo") {
    return { ok: false, erro: 'Pra sair do grupo, use "Sair do grupo" — assim alguém assume.' };
  }
  if (r === "nao-encontrado") return { ok: false, erro: "Essa pessoa já não está no grupo." };
  return { ok: true };
}

/** Revoga um convite: o token para de valer na hora, e a métrica dele fica. */
export async function revogarConvite(
  arenaSlug: string,
  groupSlug: string,
  shareLinkId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const { sessao, grupo } = await acharGrupo(arenaSlug, groupSlug);
  if (!sessao || !grupo) return { ok: false, erro: "Não encontramos este grupo." };

  const ok = await revogarConviteDoGrupo(sessao, grupo.id, shareLinkId);
  revalidatePath(`/${arenaSlug}/${groupSlug}/editar`);
  return ok ? { ok: true } : { ok: false, erro: "Esse convite já não estava valendo." };
}

/** Liga ou desliga o resumo semanal deste membro neste grupo. */
export async function alternarAvisoSemanal(
  arenaSlug: string,
  groupSlug: string,
  ligado: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  const { sessao, grupo } = await acharGrupo(arenaSlug, groupSlug);
  if (!sessao || !grupo) return { ok: false, erro: "Não encontramos este grupo." };

  await definirAvisoSemanal(sessao, grupo.id, ligado);
  revalidatePath(`/${arenaSlug}/${groupSlug}/editar`);
  revalidatePath("/app/perfil");
  return { ok: true };
}
