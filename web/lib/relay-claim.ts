import { NextResponse, type NextRequest } from "next/server";
import { CLAIM_MAX, CLAIM_PADRAO, ENCODE_BITRATE_KBPS, ENCODE_MAXRATE_KBPS, LEASE_SEGUNDOS, LIMITES } from "@/lib/limites";
import { excedeuLimite } from "@/lib/problem";
import { rateLimit } from "@/lib/rate-limit";
import { exigirRelay } from "@/lib/relay-auth";
import { urlPublica } from "@/lib/storage";
import { jobsPendentes, reivindicarJobs } from "@/db/queries/relay";

// A REIVINDICAÇÃO DE JOBS, num lugar só.
//
// ─── POR QUE DUAS ROTAS APONTAM PARA CÁ ────────────────────────────────────
//
// O `openapi.yaml` declara `GET /relay/clip-jobs`; o briefing do scaffold pediu
// `POST /relay/clip-jobs/claim`. O relay implementou as duas e escolheu o YAML
// ("o YAML é a fonte da verdade sobre o quê", `api/README.md`), configurável por
// `WORKER_CLAIM_PATH`/`WORKER_CLAIM_METHOD` sem deploy.
//
// O app expõe AS DUAS, apontando para esta função. Não é indecisão: é que o relay
// é atualizado por `git pull` + `systemctl restart` na máquina e pode ficar atrás
// do app por semanas, então tirar um dos caminhos do ar exigiria coordenar dois
// deploys em máquinas diferentes para não perder nenhum corte. `GET` é o
// canônico; `/claim` fica como alias até alguém decidir aposentá-lo.
//
// Ressalva honesta sobre o `GET`: a chamada MUDA ESTADO (marca `claimed`,
// incrementa `attempt`, abre o lease), o que um GET não deveria fazer. Como o
// caminho é autenticado por `x-relay-key` e não passa por navegador nem por
// cache, o risco real (um proxy repetindo a chamada) é nulo — e repetir seria
// inofensivo de qualquer forma, porque `SKIP LOCKED` faz a segunda chamada pegar
// outros jobs, nunca os mesmos.

export async function reivindicarJobsHandler(req: NextRequest): Promise<NextResponse> {
  const relay = await exigirRelay(req);

  const [lim, janela] = LIMITES.relay;
  const v = await rateLimit("relay", relay.relayNodeId, lim, janela);
  if (!v.allowed) throw excedeuLimite("Relay em loop — reduza a frequência.", v.retryAfterS);

  const bruto = Number(new URL(req.url).searchParams.get("max"));
  const max = Number.isFinite(bruto)
    ? Math.min(CLAIM_MAX, Math.max(1, Math.round(bruto)))
    : CLAIM_PADRAO;

  const jobs = await reivindicarJobs(relay.relayNodeId, max);
  const pendentes = await jobsPendentes(relay.relayNodeId);

  return NextResponse.json(
    {
      serverTime: new Date().toISOString(),
      leaseSeconds: LEASE_SEGUNDOS,
      pendingJobs: pendentes,
      jobs: jobs.map((j) => ({
        jobId: j.id,
        clipId: j.clip_id,
        cameraId: j.camera_id,
        triggerEventId: j.trigger_event_id,
        partnerId: j.partner_id,
        courtId: j.court_id,
        cutFrom: j.cut_from.toISOString(),
        cutTo: j.cut_to.toISOString(),
        deliverFrom: j.deliver_from.toISOString(),
        deliverTo: j.deliver_to.toISOString(),
        // Nulo quando o parceiro desligou a marca d'água OU quando ele ainda não
        // enviou PNG. O segundo caso é decisão de produto (PLANO, item 9): sem
        // logo do parceiro aplica-se a marca do Replay já — e o PNG nosso vive no
        // relay (`relay/watermark.png`), então aqui só dizemos que não há o dele.
        watermark:
          j.watermark_enabled && j.watermark_object_key
            ? {
                version: j.watermark_version,
                url: urlPublicaSegura(j.watermark_object_key),
                position: j.watermark_position,
                opacity: Number(j.watermark_opacity),
                scale: Number(j.watermark_scale),
                margin: Number(j.watermark_margin),
              }
            : null,
        // `preview` está fora: o relay não o produz e o formato (GIF ou MP4 mudo,
        // resolução, duração) ainda é decisão de produto. Pedir um arquivo que
        // ninguém sabe gerar faria todo job voltar com erro.
        outputs: ["watermarked", "thumbnail", "og"],
        encodeProfile: {
          bitrateKbps: ENCODE_BITRATE_KBPS,
          maxrateKbps: ENCODE_MAXRATE_KBPS,
          preset: "veryfast",
          pixelFormat: "yuv420p",
        },
        priority: j.priority,
        attempt: j.attempt,
        expiresAt: j.expires_at.toISOString(),
        leaseExpiresAt: j.lease_expires_at.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Sem CDN configurada, devolve nulo em vez de lançar: um job sem marca d'água é
 *  melhor que nenhum job. */
function urlPublicaSegura(objectKey: string): string | null {
  try {
    return urlPublica(objectKey);
  } catch {
    return null;
  }
}
