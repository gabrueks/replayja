"use server";

import { revalidatePath } from "next/cache";
import {
  MARCA_TAMANHO_MAX_BYTES,
  MENSAGEM_MARCA,
  normalizarCor,
  normalizarParametrosDaMarca,
} from "@/db/queries/painel-regras";
import {
  definirPaginaPublica,
  registrarArquivoDaMarca,
  salvarBranding,
  salvarContatos,
  type ContatoDoPainel,
} from "@/db/queries/painel-marca";
import { exigirArena } from "../_lib/arena";
import {
  chaveDaImagem,
  conferirImagemEnviada,
  pedirUploadDeImagem,
  type PapelDaImagem,
} from "../_lib/upload";

// As ações da tela "Marca e página".
//
// ─── O UPLOAD É EM DUAS ETAPAS, E A SEGUNDA É QUE VALE ─────────────────────
//
//   1. `pedirUpload` devolve uma URL `PUT` pré-assinada de 5 min; o NAVEGADOR
//      manda os bytes direto para o S3. Nenhum byte passa pela Vercel, e o teto
//      de 1 MB de corpo de server action deixa de importar.
//   2. `confirmarUpload` lê os 33 primeiros bytes do objeto e valida o IHDR.
//
// A etapa 2 não é formalidade: entre a validação da tela e o objeto no bucket
// não passa código nosso, então tudo o que o cliente afirmou é sugestão. Um JPEG
// renomeado para `.png` faria o relay queimar um retângulo preto no vídeo do
// cliente, e a arena descobriria pelo atleta.

export type ResultadoDaMarca =
  | { ok: true; mensagem: string; versao?: number }
  | { ok: false; erro: string };

export type PedidoDeUploadDaMarca =
  | { ok: true; url: string; headers: Record<string, string> }
  | { ok: false; erro: string };

export async function pedirUpload(
  arenaSlug: string,
  papel: PapelDaImagem,
  tamanhoBytes: number,
): Promise<PedidoDeUploadDaMarca> {
  const { parceiro } = await exigirArena(arenaSlug);

  if (!Number.isFinite(tamanhoBytes) || tamanhoBytes <= 0) {
    return { ok: false, erro: "Escolha um arquivo." };
  }
  // O teto é checado ANTES de assinar: a URL assinada carrega o
  // `Content-Length`, e assinar 50 MB seria assinar um upload de 50 MB.
  if (tamanhoBytes > MARCA_TAMANHO_MAX_BYTES) {
    return { ok: false, erro: MENSAGEM_MARCA.tamanho };
  }

  try {
    const pedido = await pedirUploadDeImagem(papel, parceiro.id, tamanhoBytes);
    return { ok: true, url: pedido.url, headers: pedido.headers };
  } catch {
    return {
      ok: false,
      erro: "O armazenamento não está configurado neste ambiente. Fale com o Replay já.",
    };
  }
}

/**
 * Confere o objeto que chegou e o registra em `partner_branding`.
 *
 * A versão SÓ incrementa aqui, e no banco (`watermark_version + 1`): é ela que
 * faz o relay invalidar o PNG em cache. Uma arena que troca o logo e não vê a
 * mudança no vídeo é este contador parado.
 */
export async function confirmarUpload(
  arenaSlug: string,
  papel: PapelDaImagem,
): Promise<ResultadoDaMarca> {
  const { parceiro } = await exigirArena(arenaSlug);

  const veredito = await conferirImagemEnviada(papel, parceiro.id);
  if (!veredito.ok) {
    return {
      ok: false,
      erro:
        veredito.motivo === "ausente"
          ? "O arquivo não chegou ao armazenamento. Tente enviar de novo."
          : MENSAGEM_MARCA[veredito.motivo],
    };
  }

  const versao = await registrarArquivoDaMarca(
    parceiro.id,
    papel,
    chaveDaImagem(papel, parceiro.id),
  );

  revalidatePath("/painel/pagina");
  revalidatePath(`/${parceiro.slug}`);
  return {
    ok: true,
    versao,
    mensagem:
      papel === "marca"
        ? `Marca d'água atualizada (versão ${versao}). Os próximos lances já saem com ela; os antigos não são reprocessados.`
        : "Logo atualizado.",
  };
}

export async function salvarMarca(
  arenaSlug: string,
  dados: FormData,
): Promise<ResultadoDaMarca> {
  const { parceiro } = await exigirArena(arenaSlug);

  const parametros = normalizarParametrosDaMarca({
    posicao: String(dados.get("posicao") ?? ""),
    opacidade: dados.get("opacidade"),
    larguraPct: dados.get("larguraPct"),
  });

  const texto = (chave: string, max: number) =>
    String(dados.get(chave) ?? "").trim().slice(0, max) || null;

  const corPrimaria = normalizarCor(String(dados.get("corPrimaria") ?? ""));
  const corDestaque = normalizarCor(String(dados.get("corDestaque") ?? ""));
  if (String(dados.get("corPrimaria") ?? "").trim() && !corPrimaria) {
    return { ok: false, erro: "A cor principal precisa estar no formato #RRGGBB." };
  }
  if (String(dados.get("corDestaque") ?? "").trim() && !corDestaque) {
    return { ok: false, erro: "A cor de destaque precisa estar no formato #RRGGBB." };
  }

  const telefone = texto("telefone", 20);
  const whatsapp = texto("whatsapp", 20);
  // O `CHECK partner_contact_e164_chk` recusa telefone fora de E.164, e um 500
  // de constraint aqui viraria "Application error" na tela. Conferir antes é o
  // que transforma isso numa frase que a pessoa entende.
  const E164 = /^\+[1-9]\d{7,14}$/;
  if (telefone && !E164.test(telefone)) {
    return { ok: false, erro: "O telefone precisa vir com país e DDD: +5511988887777." };
  }
  if (whatsapp && !E164.test(whatsapp)) {
    return { ok: false, erro: "O WhatsApp precisa vir com país e DDD: +5511988887777." };
  }

  const instagram = texto("instagram", 60);
  const email = texto("email", 120);
  const endereco = texto("endereco", 200);
  const candidatos: Array<ContatoDoPainel | null> = [
    whatsapp ? { kind: "whatsapp", value: whatsapp, label: "WhatsApp" } : null,
    telefone ? { kind: "phone", value: telefone, label: "Telefone" } : null,
    email ? { kind: "email", value: email, label: "E-mail" } : null,
    // O arroba é como a pessoa escreve e não é parte do identificador.
    instagram ? { kind: "instagram", value: instagram.replace(/^@/, ""), label: "Instagram" } : null,
    endereco ? { kind: "address", value: endereco, label: "Endereço" } : null,
  ];
  const contatos = candidatos.filter((c): c is ContatoDoPainel => c !== null);

  await salvarBranding(parceiro.id, {
    posicao: parametros.posicao,
    opacidade: parametros.opacidade,
    larguraPct: parametros.larguraPct,
    marcaAtiva: dados.get("marcaAtiva") === "on" || dados.get("marcaAtiva") === "true",
    corPrimaria,
    corDestaque,
    tagline: texto("tagline", 120),
    horarios: texto("horarios", 240),
  });

  await salvarContatos(parceiro.id, contatos);
  await definirPaginaPublica(
    parceiro.id,
    dados.get("paginaPublica") === "on" || dados.get("paginaPublica") === "true",
  );

  revalidatePath("/painel/pagina");
  revalidatePath(`/${parceiro.slug}`);
  return { ok: true, mensagem: "Marca e página atualizadas." };
}
