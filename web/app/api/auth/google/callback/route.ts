import { NextResponse, type NextRequest } from "next/server";
import { logError, withRoute } from "@/lib/app-error";
import {
  GOOGLE_CHALLENGE_COOKIE,
  decodeDesafio,
  trocarCodigo,
  verificarIdToken,
} from "@/lib/google-oidc";
import { encodeSession, sessionCookie } from "@/lib/session";
import { parceiroPublicoPorSlug } from "@/db/queries/parceiro";
import { upsertUsuarioPorEmail } from "@/db/queries/usuario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `GET /api/auth/google/callback` — troca o código e abre a sessão.
//
// ─── ERRO AQUI NÃO É JSON ──────────────────────────────────────────────────
//
// Quem chega nesta rota é um NAVEGADOR voltando do Google, não um cliente de API.
// Devolver `application/problem+json` deixaria o atleta olhando um blob de JSON.
// Então toda falha vira um redirect para `/entrar?erro=...`, e a tela de login
// mostra uma frase em pt-BR. O `traceId` continua sendo gravado em `app_error`.

function falhar(origem: string, motivo: string): NextResponse {
  const u = new URL("/entrar", origem);
  u.searchParams.set("erro", motivo);
  const res = NextResponse.redirect(u, 302);
  res.cookies.delete(GOOGLE_CHALLENGE_COOKIE);
  return res;
}

export const GET = withRoute("/api/auth/google/callback", async (req: NextRequest) => {
  const url = new URL(req.url);
  const origem = `${url.protocol}//${url.host}`;

  // O usuário clicou em "cancelar" na tela do Google, ou o Google recusou.
  const erroDoGoogle = url.searchParams.get("error");
  if (erroDoGoogle) return falhar(origem, "google-cancelado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return falhar(origem, "google-invalido");

  const desafio = decodeDesafio(req.cookies.get(GOOGLE_CHALLENGE_COOKIE)?.value);
  if (!desafio) return falhar(origem, "google-expirado");

  // CHECAGEM 1 de 3 (as outras duas estão em `verificarIdToken`): o `state`
  // amarra este callback ao redirect que NÓS emitimos. Sem ele, qualquer pessoa
  // consegue fazer o navegador da vítima completar um login na conta do atacante.
  if (state !== desafio.state) return falhar(origem, "google-state");

  let identidade;
  try {
    const idToken = await trocarCodigo(code, desafio.verifier, origem);
    // Aqui dentro: assinatura pelo JWKS, `iss`, `aud === GOOGLE_CLIENT_ID`,
    // `nonce` contra o desafio e `email_verified === true`. Errar qualquer uma
    // delas é tomada de conta alheia.
    identidade = await verificarIdToken(idToken, desafio.nonce);
  } catch (err) {
    await logError(err, { route: "/api/auth/google/callback", method: "GET" });
    return falhar(origem, "google-falhou");
  }

  let firstPartnerId: string | null = null;
  if (desafio.partnerSlug) {
    const p = await parceiroPublicoPorSlug(desafio.partnerSlug);
    firstPartnerId = p?.id ?? null;
  }

  // A VINCULAÇÃO: `ON CONFLICT (email)`. Quem entrou por OTP na segunda e por
  // Google na quarta cai na mesma `app_user`, com os mesmos grupos.
  const usuario = await upsertUsuarioPorEmail(identidade.email, {
    provider: "google",
    displayName: identidade.name,
    avatarUrl: identidade.picture,
    firstPartnerId,
  });

  const destino = new URL(desafio.redirectTo ?? "/app", origem);
  const res = NextResponse.redirect(destino, 302);
  res.cookies.set(sessionCookie(encodeSession({ uid: usuario.id, email: usuario.email })));
  res.cookies.delete(GOOGLE_CHALLENGE_COOKIE);
  return res;
});
