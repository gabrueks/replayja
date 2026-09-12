"use server";

import { getSession } from "@/lib/session";
import { MENSAGEM_SLUG, normalizarSlug, validarSlugDeGrupo } from "@/lib/slug";
import { criarGrupo, slugDeGrupoEmUso } from "@/db/queries/grupo";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";

// As duas ações do formulário de grupo: conferir o endereço e criar.
//
// ─── POR QUE SERVER ACTION E NÃO UMA ROTA DE API ───────────────────────────
//
// Criar grupo é uma escrita de FORMULÁRIO, de dentro do nosso próprio app, com
// a sessão em cookie — exatamente o caso para o qual a server action existe. Uma
// rota de API traria consigo o contrato público (versão, RFC 9457, rate limit
// por token) que só faz sentido para o relay e para o app de terceiros, e nenhum
// dos dois cria grupo. Quando `POST /groups` do `openapi.yaml` existir, ele
// chamará as MESMAS funções de `db/queries/grupo.ts` — que é onde a autorização
// mora (`modelo-de-dados.md` §7.1).
//
// A validação é REFEITA aqui inteira, mesmo com o formulário já validando: o
// cliente é sugestão, o servidor é a regra.

export type ResultadoDeCriacao =
  | { ok: true; href: string }
  | { ok: false; campo: "nome" | "slug" | "dias" | "horario" | "quadra" | "geral"; erro: string };

export type EstadoDoSlug =
  | { estado: "vazio" }
  | { estado: "invalido"; erro: string }
  | { estado: "em-uso" }
  | { estado: "livre"; slug: string };

/** Confere o endereço enquanto a pessoa digita o nome. */
export async function conferirSlug(arenaSlug: string, bruto: string): Promise<EstadoDoSlug> {
  const sessao = await getSession();
  if (!sessao) return { estado: "vazio" };

  const normalizado = normalizarSlug(bruto);
  if (!normalizado) return { estado: "vazio" };

  const valido = validarSlugDeGrupo(normalizado);
  if (!valido.ok) return { estado: "invalido", erro: MENSAGEM_SLUG[valido.motivo] };

  const parceiro = await parceiroPublicoPorSlug(arenaSlug);
  if (!parceiro) return { estado: "invalido", erro: "Arena não encontrada." };

  return (await slugDeGrupoEmUso(parceiro.id, valido.slug))
    ? { estado: "em-uso" }
    : { estado: "livre", slug: valido.slug };
}

export async function criarGrupoDaArena(
  arenaSlug: string,
  dados: FormData,
): Promise<ResultadoDeCriacao> {
  const sessao = await getSession();
  if (!sessao) return { ok: false, campo: "geral", erro: "Entre para criar um grupo." };

  const parceiro = await parceiroPublicoPorSlug(arenaSlug);
  if (!parceiro) return { ok: false, campo: "geral", erro: "Arena não encontrada." };

  const nome = String(dados.get("nome") ?? "").trim();
  if (nome.length < 3) {
    return { ok: false, campo: "nome", erro: "Dê um nome com pelo menos 3 letras." };
  }
  if (nome.length > 60) {
    return { ok: false, campo: "nome", erro: "O nome ficou longo demais." };
  }

  // O endereço sai do campo próprio quando a pessoa o editou; senão, do nome.
  const slugBruto = String(dados.get("slug") ?? "").trim() || nome;
  const valido = validarSlugDeGrupo(normalizarSlug(slugBruto));
  if (!valido.ok) return { ok: false, campo: "slug", erro: MENSAGEM_SLUG[valido.motivo] };

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
  const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!HORA.test(inicio) || !HORA.test(fim)) {
    return { ok: false, campo: "horario", erro: "Informe o horário de início e de fim." };
  }
  if (inicio === fim) {
    return { ok: false, campo: "horario", erro: "O fim precisa ser diferente do início." };
  }
  // O `CHECK` da tabela recusa janela maior que 6 h que não cruze a meia-noite.
  // Conferir aqui é o que transforma um 500 numa frase que a pessoa entende.
  if (fim > inicio && minutos(fim) - minutos(inicio) > 6 * 60) {
    return { ok: false, campo: "horario", erro: "A janela do grupo é de no máximo 6 horas." };
  }

  const quadraSlug = String(dados.get("quadra") ?? "");
  let courtId: string | null = null;
  if (quadraSlug && quadraSlug !== "todas") {
    // A quadra é resolvida contra a LISTA DA ARENA: um uuid na requisição nunca
    // escolhe quadra. O gatilho do banco ainda confere de novo, porque sem RLS
    // a escrita não pode confiar na tela.
    const quadras = await quadrasDoParceiro(parceiro.id);
    const escolhida = quadras.find((q) => q.slug === quadraSlug);
    if (!escolhida) {
      return { ok: false, campo: "quadra", erro: "Essa quadra não é desta arena." };
    }
    courtId = escolhida.id;
  }

  if (await slugDeGrupoEmUso(parceiro.id, valido.slug)) {
    return { ok: false, campo: "slug", erro: "Já existe um grupo com esse endereço nesta arena." };
  }

  try {
    const grupo = await criarGrupo(sessao, {
      partnerId: parceiro.id,
      slug: valido.slug,
      name: nome,
      weekdays: dias,
      startTime: inicio,
      endTime: fim,
      // O fuso é COPIADO da arena na criação (`modelo-de-dados.md` §3.17): a
      // consulta de sessões precisa ser autocontida, e um grupo não pode mudar
      // de fuso porque a arena mudou.
      timezone: parceiro.timezone,
      courtId,
    });
    return { ok: true, href: `/${parceiro.slug}/${grupo.slug}` };
  } catch (err) {
    // A corrida real: duas abas criando o mesmo endereço ao mesmo tempo. O
    // índice único parcial é quem decide, e a mensagem tem de ser do campo.
    if (err instanceof Error && /play_group_partner_slug_key|duplicate key/i.test(err.message)) {
      return { ok: false, campo: "slug", erro: "Esse endereço acabou de ser usado. Escolha outro." };
    }
    throw err;
  }
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
