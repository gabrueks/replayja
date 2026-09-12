import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { mesmaOrigem } from "@/lib/http-guards";
import { corpoInvalido } from "@/lib/problem";
import { CHALLENGE_COOKIE_NAME } from "@/lib/otp";
import { GOOGLE_CHALLENGE_COOKIE } from "@/lib/google-oidc";
import { clearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/auth/logout` — apaga o cookie de sessão.
//
// Não há tabela de sessão para invalidar: a sessão É o cookie assinado. Sair é
// jogar o cookie fora, e é por isso que o segredo de assinatura nunca pode
// vazar — não há revogação por linha, só rotação de `SESSION_SECRET` (que derruba
// todo mundo de uma vez).
//
// É POST e exige mesma origem: um `<img src="/api/auth/logout">` num fórum
// deslogaria quem passasse por lá. É incômodo, não perigoso — mas custa uma
// linha evitar.

export const POST = withRoute("/api/auth/logout", async (req: NextRequest) => {
  if (!mesmaOrigem(req)) throw corpoInvalido();

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(clearSessionCookie());
  // Desafios pendentes também vão embora: sair no meio de um login não pode
  // deixar um cookie de 10 min flutuando.
  res.cookies.delete(CHALLENGE_COOKIE_NAME);
  res.cookies.delete(GOOGLE_CHALLENGE_COOKIE);
  return res;
});
