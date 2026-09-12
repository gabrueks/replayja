import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { CORPO_MAX, lerJson } from "@/lib/http-guards";
import { LIMITES } from "@/lib/limites";
import { corpoInvalido, excedeuLimite } from "@/lib/problem";
import { rateLimit } from "@/lib/rate-limit";
import { exigirRelay } from "@/lib/relay-auth";
import { jobsPendentes, registrarSaudeDoRelay, versaoDasCameras } from "@/db/queries/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/relay/health` — estado do relay e cobertura por câmera, a cada 60 s.
//
// ─── O CORPO É O `RelayHealthRequest` DO `openapi.yaml`, AO PÉ DA LETRA ────
//
// Nested (`disk`, `cpu`, `index`, `jobs`, `cameras`), porque é o que o relay
// manda: o `/stats` dele devolve este mesmo objeto, o que faz o `health-report.py`
// ser um cano em vez de um tradutor. O YAML é a fonte da verdade sobre o QUÊ
// (`api/README.md`), e divergir aqui quebraria a integração em silêncio — o relay
// mandaria números e o painel mostraria zeros.
//
// A leitura tolera a forma PLANA também. Não é indulgência com cliente errado: é
// que o relay é atualizado por `git pull` + `systemctl restart` na máquina e pode
// ficar atrás do app por semanas (`api/README.md` §6), então recusar um corpo que
// dá para entender significaria perder a saúde da frota durante uma janela de
// versões.
//
// ─── COMO LER OS DOIS NÚMEROS QUE IMPORTAM ─────────────────────────────────
//
// `coverage24h` é a fração das últimas 24 h com segmento em disco. Referência
// medida na frota do Sentinela: mediana 0,92; saudável 0,95–0,96; ABAIXO DE 0,90
// É PROBLEMA REAL, NÃO RUÍDO. A janela de julgamento é sempre 24 h, nunca 1 h —
// logo após um reinício da frota há queda artificial de 30–90 s por câmera.
//
// `longSegments24h` conta segmentos com `EXTINF > 10 s`, a assinatura direta de
// buraco no uplink da arena. É a métrica que vai para o painel do parceiro como
// "oscilações da internet" — uma reclamação acionável do lado DELE.

// O corpo do health é o maior do app: uma linha por câmera do relay (até 24).
const CORPO_MAX_HEALTH = CORPO_MAX * 4;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export const POST = withRoute("/api/relay/health", async (req: NextRequest) => {
  const relay = await exigirRelay(req);

  const [lim, janela] = LIMITES.relay;
  const v = await rateLimit("relay", relay.relayNodeId, lim, janela);
  if (!v.allowed) throw excedeuLimite("Relay em loop — reduza a frequência.", v.retryAfterS);

  const body = await lerJson(req, CORPO_MAX_HEALTH);
  if (!body) throw corpoInvalido();

  // `cameras` é obrigatório no contrato. Um corpo sem ele é relay mal
  // configurado, não relay sem câmera — o array vazio é a forma de dizer "nenhuma".
  if (!Array.isArray(body.cameras)) {
    throw corpoInvalido("O corpo precisa do array `cameras` (RelayHealthRequest).");
  }

  // `relayId` vem no corpo, mas quem DECIDE de qual relay estamos falando é a
  // chave do cabeçalho. Divergência é sinal de configuração trocada e vale um
  // log — nunca uma escrita no relay errado.
  const relayIdDeclarado = texto(body.relayId);
  if (relayIdDeclarado && relayIdDeclarado !== relay.relayNodeId) {
    console.warn(
      `[relay-health] relayId do corpo (${relayIdDeclarado}) diverge da chave (${relay.relayNodeId}). Usando a chave.`,
    );
  }

  const disk = obj(body.disk);
  const cpu = obj(body.cpu);
  const indice = obj(body.index);
  const jobs = obj(body.jobs);

  const cameras = (body.cameras as unknown[])
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c) => ({
      cameraId: String(c.cameraId ?? ""),
      recorderUp: c.recorderUp !== false,
      lastSegmentAt: texto(c.lastSegmentAt),
      coverage1h: num(c.coverage1h),
      coverage24h: num(c.coverage24h),
      bitrateKbps: num(c.bitrateKbps),
      gbPerDay: num(c.gbPerDay),
      longSegments24h: num(c.longSegments24h) ?? 0,
      longestGapSeconds24h: num(c.longestGapSeconds24h),
      sessionsLast10m: num(c.sessionsLast10m) ?? 0,
      diskBytes: num(c.diskBytes),
      recordedUntil: texto(c.recordedUntil),
    }))
    .filter((c) => c.cameraId.length > 0);

  await registrarSaudeDoRelay(relay.relayNodeId, {
    agentVersion: texto(body.version),
    // Nested primeiro (o contrato), plano como reserva (relay antigo).
    diskTotalBytes: num(disk.totalBytes) ?? num(body.diskTotalBytes),
    diskFreeBytes: num(disk.freeBytes) ?? num(body.diskFreeBytes),
    pruningActive: disk.pruningActive === true || body.pruningActive === true,
    cpuLoad1m: num(cpu.load1m) ?? num(body.cpuLoad1m),
    cpuStealPercent: num(cpu.stealPercent) ?? num(body.cpuStealPercent),
    recorderCpuPercent: num(cpu.recorderPercent) ?? num(body.recorderCpuPercent),
    workerCpuPercent: num(cpu.workerPercent) ?? num(body.workerCpuPercent),
    indexWalBytes: num(indice.walBytes) ?? num(body.indexWalBytes),
    indexDbBytes: num(indice.dbBytes) ?? num(body.indexDbBytes),
    jobsInFlight: num(jobs.inFlight) ?? num(body.jobsInFlight),
    jobSlots: num(jobs.slotsTotal) ?? num(body.jobSlots),
    jobsFailed1h: num(jobs.failedLastHour) ?? num(body.jobsFailed1h),
    p50CutMs: num(jobs.p50CutMs) ?? num(body.p50CutMs),
    p50EncodeMs: num(jobs.p50EncodeMs) ?? num(body.p50EncodeMs),
    cameras,
  });

  const [camerasVersion, pendingJobs] = await Promise.all([
    versaoDasCameras(relay.relayNodeId),
    jobsPendentes(relay.relayNodeId),
  ]);

  return NextResponse.json(
    {
      serverTime: new Date().toISOString(),
      // Se divergir da versão local, o relay busca `/api/relay/cameras`. É o que
      // permite espaçar aquela chamada sem perder reatividade.
      camerasVersion,
      pendingJobs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
