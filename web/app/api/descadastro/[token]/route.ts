import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { dbConfigured } from "@/lib/db";
import { lerDescadastro } from "@/lib/descadastro";
import { desligarAvisoSemanalPorUsuario } from "@/db/queries/grupo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `/api/descadastro/[token]` — o descadastro de UM CLIQUE (RFC 8058).
//
// ─── É A URL QUE O CLIENTE DE E-MAIL CHAMA, NÃO A QUE A PESSOA LÊ ──────────
//
// O cabeçalho `List-Unsubscribe-Post: List-Unsubscribe=One-Click` faz o Gmail e
// o Outlook mostrarem "Cancelar inscrição" ao lado do remetente e dispararem um
// `POST` aqui quando alguém aperta. A pessoa nunca sai da caixa de entrada.
//
// Existir bem é o que impede o botão AO LADO — "marcar como spam" — de ser
// usado. Um "isto é spam" custa reputação do domínio inteiro, e o nosso domínio
// também manda o código de login: perder a entrega do OTP é perder o produto.
//
// ─── SEM SESSÃO, E É ASSIM QUE TEM DE SER ──────────────────────────────────
//
// A autenticação é a ASSINATURA do token (`lib/descadastro.ts`). Quem aperta o
// botão pode estar em outro navegador, no celular do trabalho, meses depois.
// Pedir login entre a pessoa e o direito de sair da lista é exatamente a
// fricção que a LGPD (art. 18) e a mitigação do T5 de `docs/legal/analise-lgpd.md`
// proíbem.
//
// ─── SEM `mesmaOrigem` E SEM `Content-Type` JSON ───────────────────────────
//
// As duas guardas de `lib/http-guards.ts` existem para barrar CSRF em rotas que
// agem em nome de um cookie. Esta não tem cookie nenhum: ela age em nome do
// token. E o `POST` do RFC 8058 chega do servidor do Gmail, sem `Origin` e com
// `Content-Type: application/x-www-form-urlencoded` — exigir qualquer das duas
// coisas quebraria justamente o caminho que esta rota existe para servir.
//
// O pior caso de um token vazado é alguém DESLIGAR um e-mail. Religar é um toque
// em `/app/perfil`. É uma troca boa.

async function desligar(token: string): Promise<number> {
  if (!dbConfigured()) return 0;
  const alvo = lerDescadastro(token);
  if (!alvo) return -1;
  return desligarAvisoSemanalPorUsuario(alvo.userId, alvo.playGroupId);
}

export const POST = withRoute<{ params: Promise<{ token: string }> }>(
  "/api/descadastro/[token]",
  async (_req: NextRequest, ctx) => {
    const { token } = await ctx.params;
    const desligados = await desligar(token);

    // Um token inválido responde 200 do mesmo jeito. O cliente de e-mail mostra
    // um erro feio para qualquer coisa que não seja 2xx, e "cancelar inscrição
    // falhou" é o que faz a pessoa usar o botão de spam em seguida. O que
    // acontece de fato fica no corpo, para quem for ler.
    return NextResponse.json(
      { ok: desligados >= 0, desligados: Math.max(0, desligados) },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);

/**
 * O mesmo, por `GET` — para os clientes que só ABREM a URL do cabeçalho.
 *
 * Sim, é um `GET` que muda estado, e sim, isso normalmente é proibido. A exceção
 * é deliberada e limitada: a ação é de DESLIGAR (nunca de ligar), é reversível
 * num toque, e o comportamento real dos clientes de e-mail é este — recusar aqui
 * não protegeria ninguém, só deixaria o descadastro quebrado em metade deles.
 *
 * Termina em redirect para a página que EXPLICA o que aconteceu: uma resposta
 * JSON na aba do navegador seria o produto falando em código com o usuário.
 */
export const GET = withRoute<{ params: Promise<{ token: string }> }>(
  "/api/descadastro/[token]",
  async (req: NextRequest, ctx) => {
    const { token } = await ctx.params;
    const desligados = await desligar(token);
    const destino = new URL(
      `/descadastro/${token}${desligados >= 0 ? "?feito=1" : ""}`,
      req.nextUrl.origin,
    );
    return NextResponse.redirect(destino, { status: 303 });
  },
);
