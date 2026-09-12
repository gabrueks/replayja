import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { LIMITES, PIN_EXTENSAO_DIAS, URL_DOWNLOAD_SEGUNDOS } from "@/lib/limites";
import { ProblemError, naoAutenticado, naoEncontrado, excedeuLimite } from "@/lib/problem";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { cloudfrontConfigurado, urlDeEntrega } from "@/lib/storage";
import { clipePorId, registrarDownloadDoClipe } from "@/db/queries/clipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `GET /api/clips/{clipId}/download` — o botão "Baixar em alta".
//
// ─── POR QUE ESTA ROTA EXISTE, SE O ARQUIVO ESTÁ NO CLOUDFRONT ─────────────
//
// `<a download>` só funciona em MESMA ORIGEM. Apontando direto para o
// CloudFront, o atributo é ignorado e o navegador NAVEGA para o vídeo: o atleta
// sai da página, vê o MP4 em tela cheia e não tem o arquivo. Era a pendência
// registrada em `web/docs/design-system.md` §11.
//
// A rota é um REDIRECT, não um proxy: nenhum byte de vídeo passa pela Vercel
// (que é o que mantém o Fast Data Transfer do time em ruído — ADR §4.1). O que
// ela faz é assinar uma URL de 15 minutos com
// `response-content-disposition=attachment`, que o S3 devolve como cabeçalho e
// o navegador entende como "salvar arquivo".
//
// ─── 15 MINUTOS, E NÃO AS 6 HORAS DA REPRODUÇÃO ────────────────────────────
//
// A URL de download é a que vaza: ela é copiada, colada e reencaminhada. Quinze
// minutos cobrem com folga um download de 12 MB no 4G da quadra e não sobrevivem
// a um print compartilhado (`api/README.md` §3).

export const GET = withRoute<{ params: Promise<{ clipId: string }> }>(
  "/api/clips/[clipId]/download",
  async (req: NextRequest, ctx) => {
    const sessao = await getSession();
    if (!sessao) throw naoAutenticado();

    const { clipId } = await ctx.params;

    // 30 downloads por usuário por hora. É anti-varredura, não antiuso: quem
    // baixa os próprios lances de uma pelada baixa cinco, não trinta.
    const [lim, janela] = LIMITES.downloadClipe;
    const v = await rateLimit("download", `${sessao.uid}:${clientIp(req.headers)}`, lim, janela);
    if (!v.allowed) {
      throw excedeuLimite("Muitos downloads seguidos. Tente de novo em alguns minutos.", v.retryAfterS);
    }

    const clipe = await clipePorId(sessao, clipId);
    if (!clipe) throw naoEncontrado();

    if (!clipe.watermarked_object_key || !cloudfrontConfigurado()) {
      throw new ProblemError({
        type: "clip-not-ready",
        title: "Lance ainda não está pronto",
        status: 409,
        detail: "O arquivo deste lance ainda não está disponível. Tente de novo em instantes.",
      });
    }

    // O nome do arquivo é montado aqui e não vem do cliente: `filename` entra
    // num cabeçalho HTTP, e texto de terceiro num cabeçalho é injeção.
    const nome = `${clipe.partner_slug}-${clipe.court_slug}-${clipe.id.slice(0, 8)}.mp4`;

    const url = urlDeEntrega(clipe.watermarked_object_key, URL_DOWNLOAD_SEGUNDOS, {
      "response-content-disposition": `attachment; filename="${nome}"`,
      "response-content-type": "video/mp4",
    });

    // Baixar FIXA a retenção: o arquivo virou link no grupo de WhatsApp, e um
    // link que expira em um mês é a promessa que o produto não pode quebrar.
    await registrarDownloadDoClipe(sessao, clipId, PIN_EXTENSAO_DIAS);

    // 302 e `no-store`: a URL assinada morre em 15 min, e um 301 cacheado faria
    // o próximo download apontar para uma assinatura vencida.
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  },
);
