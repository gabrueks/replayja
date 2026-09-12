import { query } from "@/lib/db";
import { naoAutenticado, naoEncontrado, semPermissao } from "@/lib/problem";
import type { Sessao } from "@/lib/session";

// OS TRÊS VERIFICADORES — `docs/modelo-de-dados.md` §7.2.
//
// ─── POR QUE ESTE ARQUIVO É CÓDIGO DE SEGURANÇA ────────────────────────────
//
// Não há RLS. A revisão 3 da ADR trocou o Supabase pelo Neon com `pg` puro, e
// com isso a SEGUNDA camada de autorização — a que barrava um bug da API, dentro
// do banco — deixou de existir. Um `WHERE` esquecido numa rota nova não volta
// vazio: volta tudo.
//
// As quatro regras que compensam isso (e que o CI confere):
//
//  1. Nenhuma rota escreve SQL. Tudo passa por `db/queries/`.
//  2. Toda função de consulta recebe a SESSÃO como primeiro argumento, e o tipo
//     obriga. Não existe leitura de clipe que aceite só um `partnerId`.
//  3. O escopo entra na cláusula WHERE, nunca num filtro em memória depois da
//     consulta — que é como escopo vaza em paginação.
//  4. Toda rota autenticada tem O TESTE DO USUÁRIO ERRADO (403), não apenas o do
//     caminho feliz.
//
// Mais duas regras de projeção, porque sem RLS não há privilégio de coluna:
// `SELECT *` é PROIBIDO aqui, e `camera.rtmp_key`, `camera.rtsp_url`,
// `button.token_hash` e `relay_node.key_hash` só aparecem na consulta que serve
// `GET /api/relay/cameras`.

export type PapelArena = "viewer" | "manager" | "owner";
export type PapelGrupo = "member" | "owner";

const ORDEM_ARENA: Record<PapelArena, number> = { viewer: 0, manager: 1, owner: 2 };

/** Exige sessão. Devolve a sessão estreitada para não-nula. */
export function exigirLogin(s: Sessao | null): Sessao {
  if (!s?.uid) throw naoAutenticado();
  return s;
}

/**
 * Exige que o usuário seja admin ATIVO da arena, com papel mínimo.
 *
 * Uma consulta indexada por requisição de painel (`partner_admin_lookup_idx`).
 * NUNCA guardado no cookie: "o cookie diz que sou admin de uma arena que já me
 * removeu" é uma classe inteira de bug que some ao consultar na hora.
 */
export async function exigirAdminDaArena(
  s: Sessao | null,
  partnerId: string,
  min: PapelArena = "viewer",
): Promise<PapelArena> {
  const sessao = exigirLogin(s);
  const linhas = await query<{ role: PapelArena }>(
    `SELECT pa.role
       FROM partner_admin pa
       JOIN partner p ON p.id = pa.partner_id
      WHERE pa.user_id = $1
        AND pa.partner_id = $2
        AND pa.status = 'active'
        AND p.deleted_at IS NULL
      LIMIT 1`,
    [sessao.uid, partnerId],
  );
  const papel = linhas[0]?.role;
  if (!papel) throw semPermissao();
  if (ORDEM_ARENA[papel] < ORDEM_ARENA[min]) throw semPermissao();
  return papel;
}

/** Versão que devolve `null` em vez de lançar — para decidir o que RENDERIZAR. */
export async function papelNaArena(
  s: Sessao | null,
  partnerId: string,
): Promise<PapelArena | null> {
  if (!s?.uid) return null;
  const linhas = await query<{ role: PapelArena }>(
    `SELECT role FROM partner_admin
      WHERE user_id = $1 AND partner_id = $2 AND status = 'active' LIMIT 1`,
    [s.uid, partnerId],
  );
  return linhas[0]?.role ?? null;
}

/**
 * Exige participação ativa no grupo.
 *
 * ATENÇÃO AO QUE ISTO **NÃO** É: o grupo não é uma ACL (`api/README.md` §3). Ele
 * esconde a PÁGINA, as sessões organizadas e a lista de membros — nunca os
 * clipes. Qualquer usuário logado que saiba a arena e o horário encontra os
 * mesmos vídeos por `GET /clips`. Usar este verificador para "proteger" clipe
 * seria construir uma promessa que a busca desmente.
 */
export async function exigirMembroDoGrupo(
  s: Sessao | null,
  playGroupId: string,
): Promise<PapelGrupo> {
  const sessao = exigirLogin(s);
  const linhas = await query<{ role: PapelGrupo }>(
    `SELECT m.role
       FROM play_group_member m
       JOIN play_group g ON g.id = m.play_group_id
      WHERE m.user_id = $1
        AND m.play_group_id = $2
        AND m.status = 'active'
        AND g.deleted_at IS NULL
      LIMIT 1`,
    [sessao.uid, playGroupId],
  );
  const papel = linhas[0]?.role;
  // 404 e não 403: grupo `private` invisível não deve revelar que existe
  // (`api/README.md` §6 — nunca distinguir inexistente de invisível).
  if (!papel) throw naoEncontrado();
  return papel;
}

export async function exigirDonoDoGrupo(
  s: Sessao | null,
  playGroupId: string,
): Promise<void> {
  const papel = await exigirMembroDoGrupo(s, playGroupId);
  if (papel !== "owner") throw semPermissao();
}

/** Versão não-lançante, para decidir o que renderizar. */
export async function papelNoGrupo(
  s: Sessao | null,
  playGroupId: string,
): Promise<PapelGrupo | null> {
  if (!s?.uid) return null;
  const linhas = await query<{ role: PapelGrupo }>(
    `SELECT role FROM play_group_member
      WHERE user_id = $1 AND play_group_id = $2 AND status = 'active' LIMIT 1`,
    [s.uid, playGroupId],
  );
  return linhas[0]?.role ?? null;
}

/**
 * Mascara um e-mail: `gabriel@gmail.com` → `g***@gmail.com`.
 *
 * A lista de membros serve para saber quem está no grupo, não para extrair base
 * de contatos. Só o `owner` vê o endereço completo (`modelo-de-dados.md` §7.3).
 */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split("@");
  if (!local || !dominio) return "***";
  return `${local.slice(0, 1)}***@${dominio}`;
}
