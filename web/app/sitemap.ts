import type { MetadataRoute } from "next";
import { dbConfigured } from "@/lib/db";
import { paginasPublicas } from "@/db/queries/sitemap";

export const runtime = "nodejs";
// Uma consulta por requisição, sem cache do Next: o `robots.txt` aponta para
// aqui e o Google bate raramente. Um sitemap estático congelaria a arena que
// entrou ontem — e é justamente ela que precisa ser encontrada.
export const dynamic = "force-dynamic";

// `sitemap.xml`.
//
// ─── O ACHADO A-11: O `robots.txt` ANUNCIAVA UM 404 ────────────────────────
//
// `app/robots.ts` escreve `Sitemap: https://replayja.com.br/sitemap.xml` desde
// sempre, e `app/sitemap.ts` não existia. O Google pedia, levava 404, e o
// arquivo que deveria acelerar a indexação virava um erro recorrente no Search
// Console.
//
// Havia duas saídas de uma linha: apagar a linha do `robots.txt`, ou escrever o
// sitemap. Esta é a segunda, porque o sitemap não é higiene — é AQUISIÇÃO PARA
// O PARCEIRO. A página da arena é o que o dono da quadra divulga; achá-la no
// Google é parte do que ele compra.
//
// ─── O QUE ENTRA, E POR QUE SÓ ISSO ────────────────────────────────────────
//
// Exatamente as duas superfícies que `docs/api/README.md` §3 descreve como
// públicas, e nenhuma a mais:
//
//   /                      a home
//   /[arenaSlug]           arena com `public_page_enabled`
//   /[arenaSlug]/[grupo]   grupo com `visibility = 'public'`
//
// Fora ficam, sem exceção, todas as rotas que levam a um VÍDEO: `/c/<uuid>`,
// `/s/<sessão>`, link curto, área logada e painel. É a mesma lista de
// `disallow` do `robots.ts`, e pela mesma razão — o produto grava imagem de
// pessoa em espaço semipúblico, então o padrão é fechado e a exceção é
// explícita. Um sitemap é um CONVITE ao rastreador: pôr ali uma rota que o
// `robots.txt` proíbe seria mandar dois recados opostos, e o segundo recado é o
// que vaza.
//
// Grupo `unlisted` também fica fora — é o modo do piloto inteiro, e "não
// listado" quer dizer exatamente isto.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br").replace(/\/$/, "");

  const home: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
  ];

  // Sem banco o sitemap responde só a home, e responde 200. Um 500 aqui faria o
  // Search Console marcar o sitemap como quebrado — que é pior que um sitemap
  // magro, porque leva dias para ele voltar a tentar.
  if (!dbConfigured()) return home;

  try {
    const { arenas, grupos } = await paginasPublicas();
    return [
      ...home,
      ...arenas.map((a) => ({
        url: `${base}/${a.slug}`,
        lastModified: a.atualizada_em ?? undefined,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
      ...grupos.map((g) => ({
        url: `${base}/${g.partner_slug}/${g.slug}`,
        lastModified: g.atualizada_em ?? undefined,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch (err) {
    console.error("[sitemap] o banco não respondeu:", err);
    return home;
  }
}
