import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import {
  desafioCookie,
  encodeDesafio,
  googleConfigurado,
  novoDesafio,
  urlDeAutorizacao,
} from "@/lib/google-oidc";
import { ProblemError } from "@/lib/problem";
import { ehSlugDeArena } from "@/lib/slug";
import { destinoSeguro } from "@/lib/destino";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `GET /api/auth/google/start` — começa o fluxo OIDC.
//
// Gera `state`, `nonce` e PKCE, guarda os três num cookie HMAC de 10 min (o mesmo
// `encodeChallenge` do OTP) e redireciona. O callback emite O MESMO cookie
// `session` do OTP: há UM dono de sessão no app, que é a razão inteira de não
// usar Auth.js (ADR §4.4).
//
// É GET e não POST porque o usuário chega aqui por um `<a href>` — é uma
// navegação, não uma mutação do nosso lado. O que protege contra CSRF de login é
// o `state`, conferido no callback.

export const GET = withRoute("/api/auth/google/start", async (req: NextRequest) => {
  if (!googleConfigurado()) {
    // Sem chaves, o botão não deveria nem aparecer — mas alguém pode chegar pela
    // URL. Dizer isso claramente é melhor que um 500 do SDK.
    throw new ProblemError({
      type: "internal",
      title: "Login pelo Google indisponível",
      status: 503,
      detail: "Entre com o seu e-mail — em instantes o acesso pelo Google volta.",
    });
  }

  const url = new URL(req.url);
  const redirectTo = destinoSeguro(url.searchParams.get("redirectTo"));
  const slugBruto = url.searchParams.get("partnerSlug");
  const partnerSlug = slugBruto && ehSlugDeArena(slugBruto) ? slugBruto : undefined;

  const desafio = novoDesafio({ redirectTo, partnerSlug });
  // A origem vem da REQUISIÇÃO e não de uma env: o mesmo código serve produção,
  // os previews da Vercel e o localhost — e todos eles precisam do
  // `redirect_uri` que bate com o que o Google recebeu.
  const origem = `${url.protocol}//${url.host}`;

  const res = NextResponse.redirect(urlDeAutorizacao(desafio, origem), 302);
  res.cookies.set(desafioCookie(encodeDesafio(desafio)));
  return res;
});
