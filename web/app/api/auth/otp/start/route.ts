import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { emailCodigo, emailConfigurado, sendEmail } from "@/lib/email";
import { ehJson, lerJson, mesmaOrigem } from "@/lib/http-guards";
import { LIMITES } from "@/lib/limites";
import { CODE_TTL_MS, challengeCookie, encodeChallenge, generateCode, testCodeFor } from "@/lib/otp";
import { ProblemError, corpoInvalido, excedeuLimite } from "@/lib/problem";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ehSlugDeArena } from "@/lib/slug";
import { destinoSeguro } from "@/lib/destino";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/auth/otp/start` — manda o código de 6 dígitos.
//
// ─── DUAS COISAS QUE PARECEM DETALHE E NÃO SÃO ─────────────────────────────
//
// 1. TODOS OS TETOS VÊM ANTES DE QUALQUER TRABALHO CARO. É a lição do
//    `login/route.ts` do Sentinela: enquanto os baldes do passo 2 moravam depois
//    do `resolveAccess`, bastava mandar um `code` qualquer no corpo para pular os
//    baldes do passo 1. Aqui não há `resolveAccess`, mas há um e-mail a enviar —
//    que custa dinheiro e queima a quota diária compartilhada com o Sentinela.
//
// 2. A RESPOSTA É SEMPRE `202`, mesmo para e-mail inválido, inexistente ou
//    bloqueado. Qualquer diferença de resposta vira enumeração de contas. O
//    mesmo endpoint serve cadastro e login — o usuário nunca vê a distinção,
//    porque a conta é criada na VERIFICAÇÃO.

const RESEND_APOS_S = 60;

/** O `Retry-After` fala em segundos; quem lê o aviso pensa em minutos. */
function emMinutos(retryAfterS: number): string {
  const m = Math.max(1, Math.ceil(retryAfterS / 60));
  return m === 1 ? "1 minuto" : `${m} minutos`;
}

export const POST = withRoute("/api/auth/otp/start", async (req: NextRequest) => {
  if (!mesmaOrigem(req) || !ehJson(req)) throw corpoInvalido();

  const body = await lerJson(req);
  if (!body) throw corpoInvalido();

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  // Validação mínima de propósito: o que decide se o e-mail existe é a caixa
  // postal, não um regex. O único trabalho aqui é não mandar lixo ao Resend.
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw corpoInvalido("Informe um e-mail válido.");
  }

  const partnerSlug =
    typeof body.partnerSlug === "string" && ehSlugDeArena(body.partnerSlug)
      ? body.partnerSlug
      : undefined;
  const redirectTo = destinoSeguro(body.redirectTo);
  const ip = clientIp(req.headers);

  // Balde do E-MAIL primeiro: é o que protege a caixa postal da vítima de virar
  // alvo de email bombing e a quota diária do Resend (100/dia COMPARTILHADOS com
  // o Sentinela) de ser queimada.
  const [limEmail, janelaEmail] = LIMITES.otpStartEmail;
  const porEmail = await rateLimit("otp-start", email, limEmail, janelaEmail);
  if (!porEmail.allowed) {
    throw excedeuLimite(
      `Muitos pedidos de código. Tente de novo em ${emMinutos(porEmail.retryAfterS)}.`,
      porEmail.retryAfterS,
    );
  }

  // O balde de IP é mais folgado: uma arena inteira pode sair pelo mesmo NAT.
  const [limIp, janelaIp] = LIMITES.otpStartIp;
  const porIp = await rateLimit("otp-start-ip", ip, limIp, janelaIp);
  if (!porIp.allowed) {
    throw excedeuLimite(
      `Muitos pedidos de código. Tente de novo em ${emMinutos(porIp.retryAfterS)}.`,
      porIp.retryAfterS,
    );
  }

  const codigoDeTeste = testCodeFor(email);
  const codigo = codigoDeTeste ?? generateCode();

  if (!codigoDeTeste) {
    if (!emailConfigurado() && process.env.NODE_ENV === "production") {
      // Em produção, e-mail não configurado é falha nossa e precisa aparecer —
      // devolver 202 aqui deixaria o usuário esperando um código que nunca vem.
      throw new ProblemError({
        type: "internal",
        title: "Não foi possível enviar o código",
        status: 502,
        detail: "Não conseguimos enviar o e-mail agora. Tente de novo em instantes.",
      });
    }
    try {
      await sendEmail(email, emailCodigo(codigo));
    } catch (err) {
      console.error("[otp] falha no envio:", err);
      throw new ProblemError({
        type: "internal",
        title: "Não foi possível enviar o código",
        status: 502,
        detail: "Não conseguimos enviar o e-mail agora. Tente de novo em instantes.",
      });
    }
    if (!emailConfigurado()) {
      // Dev: o código sai no log do servidor. Nunca na resposta.
      console.log(`[otp] código de ${email}: ${codigo}`);
    }
  }

  const res = NextResponse.json(
    { expiresInSeconds: CODE_TTL_MS / 1000, resendAfterSeconds: RESEND_APOS_S },
    { status: 202 },
  );
  res.cookies.set(challengeCookie(encodeChallenge(email, codigo, { redirectTo, partnerSlug })));
  return res;
});
