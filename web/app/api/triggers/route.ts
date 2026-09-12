import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { hmacHex } from "@/lib/app-secret";
import { ehJson, lerJson, mesmaOrigem } from "@/lib/http-guards";
import { LIMITES } from "@/lib/limites";
import { ProblemError, corpoInvalido, excedeuLimite, naoAutenticado } from "@/lib/problem";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { acordarRelay } from "@/lib/acordar-relay";
import { baseUrlDoRelay, criarGatilho } from "@/db/queries/gatilho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/triggers` — o BOTÃO VIRTUAL (usuário logado no site).
//
// Mesmo caminho do botão físico, com sessão em vez de token na URL. Como o relay
// grava 24/7, o botão virtual não depende de nenhuma conexão persistente com a
// arena — é uma linha no banco e uma chamada de aviso. O long-polling e a fila de
// comandos do desenho com computador de borda deixaram de existir.
//
// `wake_latency_ms = 0`: não há dispositivo dormindo. O dedo toca a tela e o
// `fetch` sai na hora; a única latência que sobra é a da rede, que já está dentro
// do `arrival_at`.

export const POST = withRoute("/api/triggers", async (req: NextRequest) => {
  if (!mesmaOrigem(req) || !ehJson(req)) throw corpoInvalido();

  const sessao = await getSession();
  if (!sessao) throw naoAutenticado();

  const body = await lerJson(req);
  if (!body) throw corpoInvalido();

  const courtId = typeof body.courtId === "string" ? body.courtId : "";
  if (!/^[0-9a-f-]{36}$/i.test(courtId)) throw corpoInvalido("Quadra inválida.");

  const preRoll = Number.isFinite(Number(body.preRollSeconds))
    ? Math.min(60, Math.max(5, Number(body.preRollSeconds)))
    : undefined;
  const postRoll = Number.isFinite(Number(body.postRollSeconds))
    ? Math.min(30, Math.max(0, Number(body.postRollSeconds)))
    : undefined;

  // 10 gatilhos por usuário POR QUADRA por hora. O escopo é a quadra e não o
  // usuário porque o atleta pode legitimamente jogar em duas quadras na mesma
  // noite, e um teto global o puniria por isso.
  const [lim, janela] = LIMITES.triggerVirtual;
  const v = await rateLimit("trigger-virtual", `${sessao.uid}:${courtId}`, lim, janela);
  if (!v.allowed) {
    throw excedeuLimite("Aguarde alguns segundos antes de salvar outro lance.", v.retryAfterS);
  }

  const idempotencyKey = req.headers.get("idempotency-key")?.trim();

  const r = await criarGatilho({
    courtId,
    source: "virtual_button",
    requestedByUserId: sessao.uid,
    // Prefixado pelo usuário: sem isso um cliente poderia adivinhar a chave de
    // outro e receber a resposta dele (`api/README.md` §5, camada 2).
    idempotencyKey: idempotencyKey ? `user:${sessao.uid}:${idempotencyKey}` : null,
    buttonWakeLatencyMs: 0,
    preRollSeconds: preRoll,
    postRollSeconds: postRoll,
    userAgent: req.headers.get("user-agent"),
    sourceIpHash: hmacHex(clientIp(req.headers)),
  });

  if (!r.aceito) {
    // Repetição idempotente: devolve o resultado original, sem reexecutar.
    if (r.duplicado) {
      return NextResponse.json(
        {
          accepted: true,
          triggerEventId: r.duplicado.triggerEventId,
          clipId: r.duplicado.clipId,
          outcome: "accepted",
        },
        { status: 202 },
      );
    }
    throw problemaDoGatilho(r.motivo);
  }

  // Fire-and-forget: só ACORDA o relay para buscar a fila agora. Se falhar (relay
  // reiniciando, rede), nada se perde — o ciclo de 2 s pega o job. A chamada
  // existe só para tirar até 2 s da latência percebida.
  const baseUrl = await baseUrlDoRelay(r.relayNodeId);
  if (baseUrl) void acordarRelay(baseUrl, { jobId: r.clipJobId });

  return NextResponse.json(
    {
      accepted: true,
      triggerEventId: r.triggerEventId,
      clipId: r.clipId,
      outcome: "accepted",
      pressEstimatedAt: r.pressEstimatedAt.toISOString(),
      appliedLatencies: {
        buttonWakeLatencyMs: r.buttonWakeLatencyMs,
        cameraOriginLagMs: r.cameraOriginLagMs,
      },
      window: {
        deliverFrom: r.deliverFrom.toISOString(),
        deliverTo: r.deliverTo.toISOString(),
      },
    },
    { status: 202 },
  );
});

/**
 * Cada recusa tem um código HTTP e uma frase própria (`api/README.md` §4).
 *
 * Nenhuma delas cita prazo de retenção nem número configurável: uma mensagem que
 * promete um número vira mentira no dia em que o número muda.
 */
function problemaDoGatilho(motivo: string): ProblemError {
  switch (motivo) {
    case "rejected_cooldown":
      return new ProblemError({
        type: "trigger-cooldown",
        title: "Calma aí",
        status: 429,
        detail: "Aguarde alguns segundos para salvar outro lance.",
        headers: { "Retry-After": "8" },
      });
    case "rejected_no_coverage":
      return new ProblemError({
        type: "camera-down",
        title: "Câmera fora do ar",
        status: 409,
        detail: "A câmera desta quadra está fora do ar. Avise a arena.",
      });
    case "rejected_relay_down":
      return new ProblemError({
        type: "relay-unavailable",
        title: "Problema técnico",
        status: 503,
        detail: "Estamos com um problema técnico, tente em instantes.",
      });
    default:
      return new ProblemError({
        type: "camera-down",
        title: "Quadra sem câmera",
        status: 409,
        detail: "Esta quadra ainda não está gravando.",
      });
  }
}
