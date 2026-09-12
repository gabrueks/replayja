"use server";

import { revalidatePath } from "next/cache";
import { MENSAGEM_SLUG, normalizarSlug, validarSlugDeGrupo } from "@/lib/slug";
import {
  criarQuadra,
  definirQuadraAtiva,
  editarQuadra,
  ehEsporte,
  slugDeQuadraEmUso,
  vincularBotaoAQuadra,
  vincularCameraAQuadra,
} from "@/db/queries/painel-quadras";
import { exigirArena } from "../_lib/arena";

// As ações da tela de quadras.
//
// ─── SERVER ACTION E NÃO ROTA DE API, PELO MESMO MOTIVO DA CRIAÇÃO DE GRUPO ─
//
// É escrita de formulário, do nosso próprio app, com a sessão em cookie
// (decisão 30 do `web/README.md`). Uma rota traria o contrato público (versão,
// RFC 9457, rate limit por token) que só faz sentido para o relay e para o app
// de terceiros, e nenhum dos dois cadastra quadra.
//
// ─── TODA AÇÃO COMEÇA POR `exigirArena` ────────────────────────────────────
//
// Server action é um endpoint POST com nome ofuscado, não um método privado: o
// `arenaSlug` chega do cliente e vale tanto quanto um parâmetro de URL. Sem
// `exigirArena` (que resolve a arena e chama `exigirAdminDaArena`), qualquer
// pessoa logada escreveria na arena de qualquer outra — e sem RLS não há nada no
// banco que barre isso.

export type Resultado =
  | { ok: true; mensagem?: string }
  | { ok: false; campo: "nome" | "slug" | "esporte" | "horario" | "geral"; erro: string };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function lerHora(bruto: FormDataEntryValue | null): string | null | undefined {
  const t = String(bruto ?? "").trim();
  if (!t) return null;
  return HORA.test(t) ? t : undefined;
}

function lerDados(dados: FormData):
  | { ok: true; nome: string; esporte: string; superficie: string | null; coberta: boolean; abre: string | null; fecha: string | null }
  | { ok: false; campo: "nome" | "esporte" | "horario"; erro: string } {
  const nome = String(dados.get("nome") ?? "").trim();
  if (nome.length < 2) return { ok: false, campo: "nome", erro: "Dê um nome à quadra." };
  if (nome.length > 60) return { ok: false, campo: "nome", erro: "O nome ficou longo demais." };

  const esporte = String(dados.get("esporte") ?? "society");
  if (!ehEsporte(esporte)) {
    return { ok: false, campo: "esporte", erro: "Escolha um esporte da lista." };
  }

  const abre = lerHora(dados.get("abre"));
  const fecha = lerHora(dados.get("fecha"));
  if (abre === undefined || fecha === undefined) {
    return { ok: false, campo: "horario", erro: "Horário inválido. Use HH:MM." };
  }

  const superficie = String(dados.get("superficie") ?? "").trim().slice(0, 60) || null;
  return {
    ok: true,
    nome,
    esporte,
    superficie,
    coberta: dados.get("coberta") === "on" || dados.get("coberta") === "true",
    abre,
    fecha,
  };
}

export async function criarQuadraDaArena(arenaSlug: string, dados: FormData): Promise<Resultado> {
  const { parceiro } = await exigirArena(arenaSlug);

  const campos = lerDados(dados);
  if (!campos.ok) return campos;

  // O endereço sai do campo próprio quando a pessoa o editou; senão, do nome.
  const bruto = String(dados.get("slug") ?? "").trim() || campos.nome;
  // Mesma regra de slug do grupo: 3 a 30, sem reservado. A quadra vira PREFIXO
  // do slug de sessão (`quadra-1-2026-09-12-20h-21h`, decisão 23), então ela
  // precisa das mesmas garantias de forma.
  const valido = validarSlugDeGrupo(normalizarSlug(bruto));
  if (!valido.ok) return { ok: false, campo: "slug", erro: MENSAGEM_SLUG[valido.motivo] };

  if (await slugDeQuadraEmUso(parceiro.id, valido.slug)) {
    return { ok: false, campo: "slug", erro: "Já existe uma quadra com esse endereço." };
  }

  try {
    await criarQuadra(parceiro.id, {
      slug: valido.slug,
      name: campos.nome,
      sport: campos.esporte,
      surface: campos.superficie,
      indoor: campos.coberta,
      opensTime: campos.abre,
      closesTime: campos.fecha,
    });
  } catch (err) {
    // A corrida real: duas abas criando o mesmo endereço ao mesmo tempo. O
    // índice único decide, e a mensagem tem de ser do campo.
    if (err instanceof Error && /court_partner_slug_key|duplicate key/i.test(err.message)) {
      return { ok: false, campo: "slug", erro: "Esse endereço acabou de ser usado." };
    }
    throw err;
  }

  revalidatePath("/painel/quadras");
  return { ok: true, mensagem: `Quadra "${campos.nome}" criada.` };
}

export async function editarQuadraDaArena(
  arenaSlug: string,
  courtId: string,
  dados: FormData,
): Promise<Resultado> {
  const { parceiro } = await exigirArena(arenaSlug);
  const campos = lerDados(dados);
  if (!campos.ok) return campos;

  const ok = await editarQuadra(parceiro.id, courtId, {
    name: campos.nome,
    sport: campos.esporte,
    surface: campos.superficie,
    indoor: campos.coberta,
    opensTime: campos.abre,
    closesTime: campos.fecha,
  });
  if (!ok) return { ok: false, campo: "geral", erro: "Quadra não encontrada nesta arena." };

  revalidatePath("/painel/quadras");
  return { ok: true, mensagem: "Quadra atualizada." };
}

export async function alternarQuadra(
  arenaSlug: string,
  courtId: string,
  ativa: boolean,
): Promise<Resultado> {
  const { parceiro } = await exigirArena(arenaSlug);
  const ok = await definirQuadraAtiva(parceiro.id, courtId, ativa);
  if (!ok) return { ok: false, campo: "geral", erro: "Quadra não encontrada nesta arena." };
  revalidatePath("/painel/quadras");
  return {
    ok: true,
    mensagem: ativa
      ? "Quadra reativada."
      : "Quadra desativada: os botões dela param de salvar lances. A gravação contínua segue.",
  };
}

export async function vincularCamera(
  arenaSlug: string,
  cameraId: string,
  courtId: string | null,
): Promise<Resultado> {
  const { parceiro } = await exigirArena(arenaSlug);
  const ok = await vincularCameraAQuadra(parceiro.id, cameraId, courtId);
  if (!ok) return { ok: false, campo: "geral", erro: "Câmera ou quadra não é desta arena." };
  revalidatePath("/painel/quadras");
  revalidatePath("/painel/cameras");
  return {
    ok: true,
    mensagem: courtId
      ? "Câmera vinculada. O relay pega a mudança no próximo ciclo."
      : "Câmera desvinculada — ela PAROU de ser gravada. Vincule a uma quadra para voltar.",
  };
}

export async function vincularBotao(
  arenaSlug: string,
  buttonId: string,
  courtId: string,
): Promise<Resultado> {
  const { parceiro } = await exigirArena(arenaSlug);
  const ok = await vincularBotaoAQuadra(parceiro.id, buttonId, courtId);
  if (!ok) return { ok: false, campo: "geral", erro: "Botão ou quadra não é desta arena." };
  revalidatePath("/painel/quadras");
  revalidatePath("/painel/botoes");
  return { ok: true, mensagem: "Botão movido de quadra." };
}
