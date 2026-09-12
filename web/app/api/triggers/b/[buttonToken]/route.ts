import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { hmacHex, sha256Hex } from "@/lib/app-secret";
import { LIMITES } from "@/lib/limites";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { acordarRelay } from "@/lib/acordar-relay";
import { baseUrlDoRelay, botaoPorTokenHash, criarGatilho, registrarSinalDoBotao } from "@/db/queries/gatilho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/triggers/b/{buttonToken}` — o BOTÃO FÍSICO.
//
// ─── O CONTRATO É DELIBERADAMENTE POBRE ────────────────────────────────────
//
// O firmware é de terceiro e não podemos mudá-lo. Então:
//
//  · O segredo está NO CAMINHO. Um botão de bateria não faz HMAC nem manda
//    cabeçalho custom. É um segredo fraco, exatamente como a chave RTMP e pelo
//    mesmo motivo — e a defesa é o dano baixo (alguém dispara um clipe numa
//    quadra pública), o cooldown de 8 s, o rate limit e a revogação em um clique.
//  · CORPO VAZIO É VÁLIDO. Vários modelos não enviam corpo.
//  · `Content-Type` é IGNORADO. Esta é a exceção explícita a `ehJson`.
//  · A resposta é SEMPRE `202`, mesmo em recusa: o botão não tem como tratar
//    erro, e não queremos que ele repita.
//  · `404` só para token inexistente — o único caso em que vale sinalizar, para
//    não manter token morto vivo para sempre.
//  · `?evt=` (contador do próprio botão) vira chave de idempotência: um botão que
//    reenvia por timeout não gera dois clipes.
//
// E a URL de webhook de um botão instalado numa quadra NUNCA muda de formato:
// trocá-la exigiria ir à arena reconfigurar cada botão.

/** `202` com o corpo que só quem depura com curl vai ler. */
function aceito(corpo: Record<string, unknown>): NextResponse {
  return NextResponse.json(corpo, { status: 202 });
}

function inteiroDaQuery(v: string | null, min: number, max: number): number | null {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

export const POST = withRoute<{ params: Promise<{ buttonToken: string }> }>(
  "/api/triggers/b/[buttonToken]",
  async (req: NextRequest, ctx) => {
    const { buttonToken } = await ctx.params;

    // O formato do token é conferido antes da ida ao banco: 32 chars base62 por
    // contrato, e recusar lixo aqui poupa uma consulta por scanner de porta.
    if (!/^[A-Za-z0-9]{24,48}$/.test(buttonToken)) {
      return new NextResponse(null, { status: 404 });
    }

    const botao = await botaoPorTokenHash(sha256Hex(buttonToken));
    // Token inexistente: 404. É o único desvio do 202.
    if (!botao) return new NextResponse(null, { status: 404 });

    const url = new URL(req.url);
    const bateria = inteiroDaQuery(url.searchParams.get("bat"), 0, 100);
    const evt = inteiroDaQuery(url.searchParams.get("evt"), 0, Number.MAX_SAFE_INTEGER);

    // Sinal registrado ANTES de qualquer recusa: é o que permite diagnosticar "o
    // botão está vivo, mas nada aparece" — sem isso, um botão em cooldown e um
    // botão com pilha morta seriam indistinguíveis no painel.
    await registrarSinalDoBotao(botao.id, { batteryPercent: bateria, eventCounter: evt });

    if (!botao.active) {
      return aceito({ accepted: false, outcome: "rejected_button_revoked" });
    }

    // 120/hora. O cooldown de 8 s é checagem de coluna, não contador — aqui o que
    // se limita é o botão em loop de firmware.
    const [lim, janela] = LIMITES.triggerFisico;
    const v = await rateLimit("trigger-fisico", botao.id, lim, janela);
    if (!v.allowed) {
      return aceito({ accepted: false, outcome: "rejected_cooldown" });
    }

    const r = await criarGatilho({
      courtId: botao.court_id,
      source: "physical_button",
      buttonId: botao.id,
      // `<button_id>:<evt>` — a chave de idempotência de quem tem contador.
      idempotencyKey: evt === null ? null : `${botao.id}:${evt}`,
      // A MAIOR e mais variável das duas latências: o botão sai do sono profundo,
      // associa no Wi-Fi, resolve DNS, faz TLS. Medida na instalação.
      buttonWakeLatencyMs: botao.wake_latency_ms,
      userAgent: req.headers.get("user-agent"),
      sourceIpHash: hmacHex(clientIp(req.headers)),
    });

    if (!r.aceito) {
      if (r.duplicado) {
        return aceito({
          accepted: true,
          outcome: "accepted",
          triggerEventId: r.duplicado.triggerEventId,
          clipId: r.duplicado.clipId,
        });
      }
      return aceito({ accepted: false, outcome: r.motivo, triggerEventId: r.triggerEventId });
    }

    const baseUrl = await baseUrlDoRelay(r.relayNodeId);
    if (baseUrl) void acordarRelay(baseUrl, { jobId: r.clipJobId });

    return aceito({
      accepted: true,
      outcome: "accepted",
      triggerEventId: r.triggerEventId,
      clipId: r.clipId,
      arrivalAt: new Date().toISOString(),
      pressEstimatedAt: r.pressEstimatedAt.toISOString(),
      appliedLatencies: {
        buttonWakeLatencyMs: r.buttonWakeLatencyMs,
        cameraOriginLagMs: r.cameraOriginLagMs,
      },
      window: {
        deliverFrom: r.deliverFrom.toISOString(),
        deliverTo: r.deliverTo.toISOString(),
      },
    });
  },
);

/**
 * GET responde igual ao POST.
 *
 * Não é preguiça: vários modelos de botão de prateleira só sabem fazer `GET` numa
 * URL de template, e o contrato diz que o dispositivo do outro lado não sabe
 * fazer melhor. A proteção contra pré-busca acidental (um crawler abrindo a URL)
 * é a mesma do POST — o segredo de 32 chars no caminho, que não vaza porque a
 * página do botão nunca é renderizada.
 */
export const GET = POST;
