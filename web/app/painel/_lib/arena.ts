import { dbConfigured } from "@/lib/db";
import { getSession, type Sessao } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { exigirAdminDaArena, papelNaArena, type PapelArena } from "@/db/queries/autorizacao";
import { arenasDoAdmin, parceiroDoPainelPorSlug, type ParceiroDoPainelRow } from "@/db/queries/parceiro";

// A resolução "qual arena, e você pode?" — feita UMA vez, do mesmo jeito, por
// todas as telas do painel.
//
// ─── O QUE ESTE ARQUIVO IMPEDE ─────────────────────────────────────────────
//
// Sem RLS, a checagem de admin é a única barreira, e ela é feita em CADA página.
// Sete páginas com sete cópias do mesmo bloco é uma promessa de que a oitava vai
// esquecer uma linha — e a linha esquecida não devolve vazio: devolve a operação
// da arena de outra pessoa.
//
// Então o contrato aqui é estreito: quem chama recebe ou um resultado com
// `parceiro` e `papel` JÁ VERIFICADOS, ou um motivo para renderizar. Não existe
// caminho que devolva `parceiro` sem `papel`.
//
// ─── PÁGINA RENDERIZA, AÇÃO LANÇA ──────────────────────────────────────────
//
// `resolverArena` devolve motivo (a tela mostra um estado vazio com saída);
// `exigirArena` LANÇA o problema RFC 9457 e é o que as server actions usam. A
// diferença importa: uma tela que estoura com 403 vira "Application error" no
// navegador, e uma ação que renderiza um aviso bonito e não escreve nada é pior
// ainda, porque parece ter funcionado.

export type ResolucaoDaArena =
  | { ok: true; sessao: Sessao; parceiro: ParceiroDoPainelRow; papel: PapelArena }
  | {
      ok: false;
      motivo: "sem-banco" | "sem-sessao" | "escolher" | "nao-encontrada" | "sem-permissao";
      /** Preenchido em `escolher`: as arenas que esta conta administra. */
      arenas?: Array<{ id: string; slug: string; display_name: string; role: string }>;
    };

/**
 * Resolve a arena do `?arena=` (ou a única que a conta administra).
 *
 * Uma arena só? Abre direto nela: fazer o dono de uma arena escolher entre uma
 * opção é um clique que não decide nada.
 */
export async function resolverArena(arenaSlug?: string | null): Promise<ResolucaoDaArena> {
  if (!dbConfigured()) return { ok: false, motivo: "sem-banco" };

  const sessao = await getSession();
  if (!sessao?.uid) return { ok: false, motivo: "sem-sessao" };

  const arenas = await arenasDoAdmin(sessao);
  const escolhido =
    (arenaSlug && ehSlugDeArena(arenaSlug) ? arenaSlug : null) ??
    (arenas.length === 1 ? (arenas[0]?.slug ?? null) : null);

  if (!escolhido) return { ok: false, motivo: "escolher", arenas };

  const parceiro = await parceiroDoPainelPorSlug(escolhido);
  if (!parceiro) return { ok: false, motivo: "nao-encontrada", arenas };

  // A CHECAGEM QUE IMPORTA. Sem ela, `?arena=` bastaria para ver a operação de
  // qualquer arena — e sem RLS não há nada no banco que barre isso.
  const papel = await papelNaArena(sessao, parceiro.id);
  if (!papel) return { ok: false, motivo: "sem-permissao", arenas };

  return { ok: true, sessao, parceiro, papel };
}

/**
 * O mesmo, para SERVER ACTIONS: lança em vez de devolver motivo.
 *
 * `minimo` é o papel exigido. O padrão é `manager` de propósito — toda ação de
 * escrita do painel muda a operação da arena (porta de relay, token de botão,
 * remoção de vídeo), e `viewer` existe justamente para quem só acompanha.
 */
export async function exigirArena(
  arenaSlug: string,
  minimo: PapelArena = "manager",
): Promise<{ sessao: Sessao; parceiro: ParceiroDoPainelRow; papel: PapelArena }> {
  const sessao = await getSession();
  if (!ehSlugDeArena(arenaSlug)) throw new Error("slug de arena inválido");
  const parceiro = await parceiroDoPainelPorSlug(arenaSlug);
  // `exigirAdminDaArena` lança 403; para arena inexistente o erro é o mesmo de
  // uma arena que existe e você não administra — nunca distinguir as duas é o
  // que impede enumerar arenas pelo painel (`api/README.md` §6).
  if (!parceiro) throw new Error("arena não encontrada");
  const papel = await exigirAdminDaArena(sessao, parceiro.id, minimo);
  return { sessao: sessao!, parceiro, papel };
}

/** `/painel/cameras?arena=arena-vasco` — o link que preserva a arena escolhida. */
export function comArena(href: string, slug: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}arena=${slug}`;
}
