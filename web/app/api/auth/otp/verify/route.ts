import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { ehJson, lerJson, mesmaOrigem } from "@/lib/http-guards";
import { LIMITES } from "@/lib/limites";
import { CHALLENGE_COOKIE_NAME, decodeChallenge, verifyChallenge } from "@/lib/otp";
import { ProblemError, corpoInvalido, excedeuLimite } from "@/lib/problem";
import { clientIp, rateLimit, rateLimitHit, rateLimitPeek } from "@/lib/rate-limit";
import { encodeSession, sessionCookie } from "@/lib/session";
import { parceiroPublicoPorSlug } from "@/db/queries/parceiro";
import { upsertUsuarioPorEmail } from "@/db/queries/usuario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/auth/otp/verify` — confere o código e abre a sessão.
//
// ─── A ASSIMETRIA DOS DOIS BALDES, QUE NÃO É DESCUIDO ──────────────────────
//
// O balde do E-MAIL usa `peek` (não consome) e só o ERRO gasta ficha: quem digita
// certo de primeira não pode ficar mais perto do bloqueio por ter feito login.
//
// O balde do IP consome SEMPRE, acerto ou erro — ele não guarda a conta de
// ninguém, guarda o CUSTO da rota. É ele o teto do que um atacante consegue
// gastar daqui.
//
// Os dois existem porque um código de 6 dígitos é 10^6 combinações: sem ninguém
// contando as tentativas, quem tem o cookie de desafio chuta à vontade dentro dos
// 10 minutos e acaba entrando.

function emMinutos(retryAfterS: number): string {
  const m = Math.max(1, Math.ceil(retryAfterS / 60));
  return m === 1 ? "1 minuto" : `${m} minutos`;
}

export const POST = withRoute("/api/auth/otp/verify", async (req: NextRequest) => {
  if (!mesmaOrigem(req) || !ehJson(req)) throw corpoInvalido();

  const body = await lerJson(req);
  if (!body) throw corpoInvalido();

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) {
    throw corpoInvalido("Informe o e-mail e o código de 6 dígitos.");
  }

  const ip = clientIp(req.headers);

  const [limEmail, janelaEmail] = LIMITES.otpVerifyEmail;
  const porEmail = await rateLimitPeek("otp-verify", email, limEmail, janelaEmail);
  if (!porEmail.allowed) {
    throw excedeuLimite(
      `Muitas tentativas. Peça um código novo em ${emMinutos(porEmail.retryAfterS)}.`,
      porEmail.retryAfterS,
    );
  }

  const [limIp, janelaIp] = LIMITES.otpVerifyIp;
  const porIp = await rateLimit("otp-verify-ip", ip, limIp, janelaIp);
  if (!porIp.allowed) {
    throw excedeuLimite(
      `Muitas tentativas. Tente de novo em ${emMinutos(porIp.retryAfterS)}.`,
      porIp.retryAfterS,
    );
  }

  const cookieDesafio = req.cookies.get(CHALLENGE_COOKIE_NAME)?.value;
  if (!verifyChallenge(cookieDesafio, email, code)) {
    // Só o balde do e-mail conta o erro: o do IP já gastou a ficha acima, e
    // cobrar duas vezes cortaria o teto pela metade sem ninguém perceber.
    await rateLimitHit("otp-verify", email);
    throw new ProblemError({
      type: "login-required",
      title: "Código inválido",
      status: 401,
      detail: "O código não confere ou já expirou. Peça um novo.",
    });
  }

  const desafio = decodeChallenge(cookieDesafio);

  // A arena de atribuição, quando o login nasceu da página de um parceiro.
  // Resolvida AQUI e não no `start` porque só agora existe uma linha para gravar.
  let firstPartnerId: string | null = null;
  if (desafio?.partnerSlug) {
    const p = await parceiroPublicoPorSlug(desafio.partnerSlug);
    firstPartnerId = p?.id ?? null;
  }

  const usuario = await upsertUsuarioPorEmail(email, {
    provider: "email_otp",
    firstPartnerId,
  });

  const res = NextResponse.json({
    user: {
      id: usuario.id,
      email: usuario.email,
      displayName: usuario.display_name,
      avatarUrl: usuario.avatar_url,
    },
    redirectTo: desafio?.redirectTo ?? "/app",
  });
  res.cookies.set(sessionCookie(encodeSession({ uid: usuario.id, email: usuario.email })));
  // Desafio QUEIMADO depois do acerto: o cookie não pode servir de segunda vida.
  res.cookies.delete(CHALLENGE_COOKIE_NAME);
  return res;
});
