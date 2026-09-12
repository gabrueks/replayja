import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { LIMITES } from "@/lib/limites";
import { excedeuLimite } from "@/lib/problem";
import { rateLimit } from "@/lib/rate-limit";
import { exigirRelay } from "@/lib/relay-auth";
import { camerasDoRelay, versaoDasCameras } from "@/db/queries/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `GET /api/relay/cameras` — a lista de câmeras que este relay deve gravar.
//
// Consultada a cada 2 minutos pelo `sync-cams`/`sync-rtmp` do relay. É a única
// fonte da verdade sobre quais gravadores devem estar de pé, em que porta e com
// que chave.
//
// ─── AS REGRAS HERDADAS DO RELAY V2, APRENDIDAS EM PRODUÇÃO ────────────────
//
// Elas moram no RELAY, não aqui — mas o formato desta resposta é o que as torna
// possíveis, e por isso ficam escritas nos dois lados:
//
//  · O relay PREFERE ERRAR PARA MAIS. Se a resposta não vier, vier inválida, vier
//    vazia, ou remover mais da metade dos gravadores de uma vez, ele aborta o
//    ciclo e não desliga nada. Sobra é desperdício de disco; falta é lance
//    perdido — e no Sentinela três câmeras passaram um dia inteiro sem gravar
//    exatamente por uma falha silenciosa deste tipo.
//  · O relay NUNCA apaga o arquivo de configuração de uma câmera que sumiu da
//    lista. Apagar a chave obrigaria a redigitá-la presencialmente no app da
//    câmera, na quadra. Encerrar uma câmera é ação explícita e separada.
//  · Câmera sem quadra atribuída NÃO ENTRA na lista.
//
// ESTA É A ÚNICA ROTA DO APP QUE PODE DEVOLVER `rtmp_key` E `rtsp_url`
// (`modelo-de-dados.md` §7.3). Autenticada por `x-relay-key`, nunca por sessão.

export const GET = withRoute("/api/relay/cameras", async (req: NextRequest) => {
  const relay = await exigirRelay(req);

  const [lim, janela] = LIMITES.relay;
  const v = await rateLimit("relay", relay.relayNodeId, lim, janela);
  if (!v.allowed) throw excedeuLimite("Relay em loop — reduza a frequência.", v.retryAfterS);

  const versao = await versaoDasCameras(relay.relayNodeId);

  // `304` quando nada mudou. A lista é pedida a cada 2 min e quase nunca muda —
  // isso mantém o compute do Neon dormindo, que é a linha inteira da conta
  // (ADR §4.2).
  const since = new URL(req.url).searchParams.get("since");
  if (since && since === versao) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: `"${versao}"`, "Cache-Control": "no-store" },
    });
  }

  const cameras = await camerasDoRelay(relay.relayNodeId);

  return NextResponse.json(
    {
      version: versao,
      serverTime: new Date().toISOString(),
      cameras: cameras.map((c) => ({
        id: c.id,
        partnerId: c.partner_id,
        courtId: c.court_id,
        name: c.name,
        enabled: c.enabled,
        ingestKind: c.ingest_kind,
        rtmp:
          c.ingest_kind === "rtmp_push"
            ? { port: c.rtmp_port, streamKey: c.rtmp_key, appPath: "live" }
            : null,
        rtspUrl: c.ingest_kind === "rtsp_pull" ? c.rtsp_url : null,
        encoding: {
          width: c.width,
          height: c.height,
          fps: c.fps,
          targetBitrateKbps: c.target_bitrate_kbps,
          gopSeconds: Number(c.gop_seconds),
        },
        segmentSeconds: Number(c.segment_seconds),
        originLagMs: c.origin_lag_ms,
        recordingWindow:
          c.recording_window_opens && c.recording_window_closes
            ? {
                timezone: c.timezone,
                // `HH:MM:SS` do Postgres → `HH:MM`, que é o que o contrato diz.
                opensTime: c.recording_window_opens.slice(0, 5),
                closesTime: c.recording_window_closes.slice(0, 5),
                pruneAfterHours: c.prune_after_hours,
              }
            : null,
        retentionDays: c.retention_days,
        minCoverageRatio: Number(c.min_coverage_ratio),
      })),
    },
    { headers: { ETag: `"${versao}"`, "Cache-Control": "no-store" } },
  );
});
