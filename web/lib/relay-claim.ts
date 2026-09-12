import { NextResponse, type NextRequest } from "next/server";
import { CLAIM_MAX, CLAIM_PADRAO, ENCODE_BITRATE_KBPS, ENCODE_MAXRATE_KBPS, LEASE_SEGUNDOS, LIMITES } from "@/lib/limites";
import { MARCA_URL_SEGUNDOS, marcaDoJob } from "@/lib/marca-dagua";
import { excedeuLimite } from "@/lib/problem";
import { rateLimit } from "@/lib/rate-limit";
import { exigirRelay } from "@/lib/relay-auth";
import { storageConfig, storageConfigurado, urlDeLeituraPrivada } from "@/lib/storage";
import { jobsPendentes, reivindicarJobs, type JobReivindicadoRow } from "@/db/queries/relay";

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

  // Uma assinatura por job. Parece caro e não é: assinar é HMAC local, sem
  // chamada à AWS, e o claim traz no máximo 5 jobs.
  const marcas = await Promise.all(jobs.map((j) => marcaDoClaim(j)));

  return NextResponse.json(
    {
      serverTime: new Date().toISOString(),
      leaseSeconds: LEASE_SEGUNDOS,
      pendingJobs: pendentes,
      jobs: jobs.map((j, i) => ({
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
        // NUNCA NULO a partir de 2026-09-12. Antes, "sem PNG do parceiro"
        // viajava como `watermark: null` e o relay, que também não tinha PNG
        // nosso instalado, entregava o clipe CRU — era exatamente por isso que
        // todo clipe de produção saía com `watermark_applied = false`.
        //
        // Agora o campo sempre diz qual marca aplicar: `partner` com URL
        // assinada do PNG da arena, ou `default`, cujo PNG é o arquivo local
        // `watermark-replayja.png` do próprio relay — sem rede, sem S3, sem mais
        // um jeito de falhar. Ver `lib/marca-dagua.ts`.
        watermark: marcas[i],
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

/**
 * A marca de UM job, já com a URL assinada quando há PNG de parceiro.
 *
 * Falhar em assinar NÃO derruba o job: cai para `default` e o relay aplica a
 * marca do Replay já do disco dele. O clipe sai com a marca errada — a nossa em
 * vez da da arena — e isso aparece no `watermark_kind` do `confirm`, que é
 * consultável. O contrário (derrubar o job) custaria o lance do atleta por causa
 * de uma credencial de bucket.
 */
async function marcaDoClaim(j: JobReivindicadoRow) {
  if (!(j.watermark_enabled && j.watermark_object_key) || !storageConfigurado()) {
    return marcaDoJob(j, null);
  }
  try {
    const url = await urlDeLeituraPrivada(
      storageConfig().bucket,
      j.watermark_object_key,
      MARCA_URL_SEGUNDOS,
    );
    return marcaDoJob(j, url);
  } catch (e) {
    console.error("[claim] não assinei a marca do parceiro", j.partner_id, e);
    return marcaDoJob(j, null);
  }
}
