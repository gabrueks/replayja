import { query } from "@/lib/db";

// As páginas PÚBLICAS do produto — a fonte do `app/sitemap.ts`.
//
// ─── POR QUE UMA CONSULTA PRÓPRIA, E NÃO `arenasPublicas` ──────────────────
//
// `arenasPublicas` serve a tela "achar minha arena": traz marca, cidade, saúde
// da gravação, e tem `LIMIT 30` — porque é uma lista que alguém lê. O sitemap
// quer o contrário: só slug e data, TODAS as arenas, sem junção nenhuma.
//
// Reusar aquela consulta aqui traria três `LEFT JOIN` por linha para jogar fora
// tudo menos o slug, e — pior — o `LIMIT 30` faria o sitemap parar de listar a
// arena 31 em silêncio, no dia em que o produto desse certo.
//
// ─── A PROJEÇÃO É O CONTROLE DE ACESSO (modelo-de-dados §7.3) ──────────────
//
// Sem RLS, a lista de colunas é a barreira. Aqui ela é mínima de propósito: um
// sitemap é lido por qualquer um, então nada que não caiba num endereço público
// pode passar por esta função — nem nome de quadra, nem contagem de lances, nem
// e-mail de quem criou o grupo.

export type PaginaPublicaDaArena = {
  slug: string;
  atualizada_em: Date | null;
};

export type PaginaPublicaDoGrupo = {
  partner_slug: string;
  slug: string;
  atualizada_em: Date | null;
};

/**
 * Arenas com página pública e grupos públicos — numa ida só ao banco.
 *
 * `lastModified` vem do `updated_at` da própria linha, e não de "o último lance
 * que entrou": o rastreador usa a data para decidir se vale revisitar, e uma
 * data que muda a cada clipe faria o Google voltar de hora em hora numa página
 * cujo texto não mudou.
 *
 * `status IN ('active','pending')` espelha `parceiroPublicoPorSlug`: uma arena
 * `pending` já tem página no ar (é como o piloto começa), e listar um endereço
 * que responde 200 é exatamente o trabalho deste arquivo. `suspended` e
 * `cancelled` ficam fora — a página deles não responde.
 */
export async function paginasPublicas(): Promise<{
  arenas: PaginaPublicaDaArena[];
  grupos: PaginaPublicaDoGrupo[];
}> {
  const [arenas, grupos] = await Promise.all([
    query<PaginaPublicaDaArena>(
      `SELECT p.slug::text AS slug, p.updated_at AS atualizada_em
         FROM partner p
        WHERE p.deleted_at IS NULL
          AND p.public_page_enabled
          AND p.status IN ('active','pending')
        ORDER BY p.slug`,
    ),
    query<PaginaPublicaDoGrupo>(
      // A arena entra no `JOIN` com as MESMAS condições: um grupo público
      // dentro de uma arena com a página desligada não tem endereço público —
      // a rota `/[arenaSlug]/[groupSlug]` passa pela arena primeiro.
      `SELECT p.slug::text AS partner_slug, g.slug::text AS slug,
              g.updated_at AS atualizada_em
         FROM play_group g
         JOIN partner p ON p.id = g.partner_id
        WHERE g.deleted_at IS NULL
          AND g.visibility = 'public'
          AND p.deleted_at IS NULL
          AND p.public_page_enabled
          AND p.status IN ('active','pending')
        ORDER BY p.slug, g.slug`,
    ),
  ]);
  return { arenas, grupos };
}
