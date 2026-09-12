import { NextResponse, type NextRequest } from "next/server";
import { decodeSessionEdge, encodeSessionEdge } from "@/lib/session-edge";
import { needsRenewal, sessionCookie } from "@/lib/session-cookie";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";
import { SLUG_RE } from "@/lib/slug";

// Middleware — três trabalhos, e nenhum deles é autorização.
//
//  1. RENOVAÇÃO DESLIZANTE da sessão. O cookie vale 400 dias (o teto que os
//     navegadores aceitam) e é reemitido quando passa de 7 dias de idade, então a
//     sessão nunca expira enquanto estiver em uso.
//  2. GATE DE NAVEGAÇÃO das áreas logadas (`/app`, `/painel`), devolvendo o
//     usuário exatamente para onde ele queria ir.
//  3. `noindex` nas superfícies que não podem ser indexadas.
//
// ─── O QUE ELE NÃO FAZ, DE PROPÓSITO ───────────────────────────────────────
//
// Ele NÃO decide permissão. Papel de admin de arena e participação em grupo são
// consultados no BANCO, na rota (`db/queries/autorizacao.ts`): o middleware roda
// no Edge, não fala com o Postgres, e um gate aqui só saberia o que está no
// cookie — que, por decisão da ADR §4.4, não carrega autorização nenhuma.
//
// Então este gate é CONVENIÊNCIA (não mostrar uma tela vazia a quem não está
// logado), e a rota continua obrigada a verificar por conta própria. A assinatura
// do cookie É conferida (`lib/session-edge.ts`) porque um gate que aceita cookie
// forjado ensina o time a confiar nele.

export const config = {
  // Exclui estáticos e a própria API: as rotas de API respondem 401 em JSON, não
  // redirecionam para tela de login — um `fetch` não segue redirect de HTML e o
  // erro apareceria ao usuário como "JSON inválido".
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

const reservados = new Set<string>(RESERVED_SLUGS);

/** Áreas que exigem login para RENDERIZAR. */
function exigeLogin(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/painel" ||
    pathname.startsWith("/painel/")
  );
}

/**
 * Superfícies que nunca podem ser indexadas.
 *
 * O produto grava imagem de pessoa em espaço semipúblico. Só a página da arena e
 * a do grupo público entram no `sitemap.xml`; tudo que leva a um vídeo específico
 * sai do índice.
 */
function naoIndexavel(pathname: string): boolean {
  return (
    pathname.startsWith("/s/") ||
    pathname.startsWith("/app") ||
    pathname.startsWith("/painel") ||
    pathname.startsWith("/entrar") ||
    // `/[arena]/s/[sessao]` — a página de uma janela de jogo.
    /^\/[^/]+\/s\/[^/]+$/.test(pathname)
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const sessao = await decodeSessionEdge(req.cookies.get("session")?.value);

  if (exigeLogin(pathname) && !sessao) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    // Devolve a pessoa EXATAMENTE para a tela de origem depois do login
    // (`design/README.md`, decisão 1): o gate aparece na ação, não na chegada, e
    // uma volta para a home apagaria o que ela estava tentando fazer.
    url.searchParams.set("redirectTo", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Um caminho de primeiro nível que não é rota do sistema e nem slug válido não
  // é arena nenhuma: responder 404 aqui evita uma ida ao banco por scanner.
  const primeiro = pathname.split("/")[1] ?? "";
  if (primeiro && !reservados.has(primeiro) && !primeiro.includes(".") && !SLUG_RE.test(primeiro)) {
    return new NextResponse(null, { status: 404 });
  }

  const res = NextResponse.next();

  if (sessao && needsRenewal(sessao)) {
    res.cookies.set(
      sessionCookie(await encodeSessionEdge({ uid: sessao.uid, email: sessao.email })),
    );
  }

  if (naoIndexavel(pathname)) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return res;
}
