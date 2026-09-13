import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { clipeExpirado, naoAutenticado, naoEncontrado } from "@/lib/problem";
import { getSession } from "@/lib/session";
import { dataBrNaArena, horaNaArena } from "@/lib/fuso";
import { clipeSumido, estadoDoClipe } from "@/db/queries/clipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `GET /api/clips/{clipId}` — o alvo do POLLING depois do botão virtual.
//
// ─── POR QUE POLLING, E NÃO WEBSOCKET OU SSE ───────────────────────────────
//
// A espera dura de 15 a 40 segundos e acontece uma vez por lance. Um canal
// persistente por atleta na Vercel custaria uma função viva o tempo todo, e o
// ganho seria de poucos segundos numa espera que já tem um contador na tela. O
// cliente pergunta a cada 2 s e desiste em 2 min — `VirtualButton` faz isso.
//
// A resposta é DELIBERADAMENTE MAGRA: estado, horário e o link. Nenhuma chave de
// objeto e nenhuma URL assinada — quem ainda está esperando não pode assistir, e
// o player (que exige login e resolve a assinatura) é o único lugar onde o vídeo
// aparece.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `clip_status` → o que a tela mostra. Os quatro estados intermediários do
 *  pipeline são a mesma coisa para quem espera: ainda não dá para assistir. */
function paraATela(status: string): "processando" | "pronto" | "parcial" | "falhou" | "expirado" {
  if (status === "ready") return "pronto";
  if (status === "partial") return "parcial";
  if (status === "failed") return "falhou";
  if (status === "expired") return "expirado";
  return "processando";
}

export const GET = withRoute<{ params: Promise<{ clipId: string }> }>(
  "/api/clips/[clipId]",
  async (_req: NextRequest, ctx) => {
    const sessao = await getSession();
    if (!sessao) throw naoAutenticado();

    const { clipId } = await ctx.params;
    if (!UUID.test(clipId)) throw naoEncontrado();

    const clipe = await estadoDoClipe(sessao, clipId);
    // O clipe não veio. Antes de dizer "não existe", pergunte se EXISTIU: um
    // lance fora da retenção responde `410 clip-expired`, com a data da
    // gravação, e não o `404` que se lê como "o Replay já perdeu o meu gol".
    // A consulta extra só acontece no caminho de erro (`api/README.md` §6).
    if (!clipe) {
      const sumido = await clipeSumido(sessao, clipId);
      if (sumido) {
        throw clipeExpirado(
          dataBrNaArena(new Date(sumido.triggered_at), sumido.partner_timezone),
        );
      }
      throw naoEncontrado();
    }

    const estado = paraATela(clipe.status);
    const pronto = estado === "pronto" || estado === "parcial";

    return NextResponse.json(
      {
        id: clipe.id,
        estado,
        status: clipe.status,
        quadra: clipe.court_name,
        horario: horaNaArena(new Date(clipe.triggered_at), clipe.partner_timezone),
        coverageRatio: clipe.coverage_ratio === null ? null : Number(clipe.coverage_ratio),
        href: pronto ? `/${clipe.partner_slug}/c/${clipe.id}` : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
