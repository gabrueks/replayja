import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { checarStorage, cloudfrontConfigurado } from "@/lib/storage";
import { bancoResponde, saudeDoRelay } from "@/db/queries/saude";

// `/api/health` — o alvo do monitor externo (Better Stack free, ADR §7) e o
// painel de diagnóstico de quem está subindo o piloto.
//
// ─── CHECA O QUE PODE FALHAR SOZINHO, E NADA ALÉM ──────────────────────────
//
// Três dependências, três respostas:
//
//   db      um `SELECT 1`. Um app que responde 200 com o Neon inacessível é
//           exatamente o incidente que o monitor deveria pegar e não pegaria.
//   storage um `ListObjectsV2` com `MaxKeys: 1`. É O ÚNICO JEITO de saber se a
//           federação OIDC da Vercel funciona NESTE deploy: sem access key, a
//           troca do token do deploy pelas credenciais da role só falha na
//           primeira chamada real à AWS — e a primeira chamada real, sem isto,
//           seria o upload de um lance que o atleta acabou de salvar.
//   relay   `relay_node.last_seen_at`. Não chamamos o relay: ELE nos procura a
//           cada 60 s, e perguntar de volta inverteria a direção da integração
//           (o app não manda no relay — `web/README.md` §6) e transformaria um
//           health check de 20 ms numa chamada de rede pela internet.
//
// O status agregado é o PIOR dos três, com uma regra de peso: banco fora é
// `down` (nada funciona), storage ou relay fora é `degraded` (o site abre, a
// busca responde, e o que não funciona é o vídeo). Um monitor que apita igual
// para as duas coisas ensina o time a ignorar o apito.
//
// Sem cache: `force-dynamic` porque um health check servido do cache do ISR
// responderia "ok" de dentro de um incidente.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Três ciclos de heartbeat perdidos. Um é ruído de rede; três, não. */
const RELAY_OFFLINE_APOS_S = 180;

export async function GET() {
  const inicio = Date.now();

  const semCabecalhoDeCache = { "Cache-Control": "no-store" } as const;

  if (!dbConfigured()) {
    // Ambiente sem banco (preview inicial, máquina nova). Não é 503: o app está
    // de pé e a ausência é de configuração, não de saúde. `degraded` é o que o
    // monitor deve enxergar como "alguém precisa terminar de configurar".
    return NextResponse.json(
      { status: "degraded", db: "nao-configurado", uptimeMs: Date.now() - inicio },
      { status: 200, headers: semCabecalhoDeCache },
    );
  }

  const banco = await bancoResponde();
  if (!banco.ok) {
    return NextResponse.json(
      { status: "down", db: "inacessivel" },
      { status: 503, headers: semCabecalhoDeCache },
    );
  }

  // Os dois em paralelo: o `ListObjectsV2` atravessa a internet até `sa-east-1`
  // e somá-lo em série ao resto faria o health check passar de 1 s.
  const [storage, relay] = await Promise.all([
    checarStorage(),
    saudeDoRelay(process.env.RELAY_NODE_ID?.trim() || null).catch(() => null),
  ]);

  const relayOnline =
    relay?.desde_segundos !== null &&
    relay?.desde_segundos !== undefined &&
    relay.desde_segundos <= RELAY_OFFLINE_APOS_S;

  const degradado = !storage.ok || !relayOnline;

  return NextResponse.json(
    {
      status: degradado ? "degraded" : "ok",
      db: "ok",
      storage: storage.ok
        ? { estado: "ok", bucket: storage.bucket, latenciaMs: storage.latenciaMs }
        : { estado: "erro", bucket: storage.bucket ?? null, erro: storage.erro },
      cdn: cloudfrontConfigurado() ? "ok" : "nao-configurado",
      relay: relay
        ? {
            id: relay.id,
            online: relayOnline,
            estado: relay.status,
            ultimoHeartbeat: relay.ultimo_heartbeat?.toISOString() ?? null,
            haSegundos: relay.desde_segundos,
            versao: relay.agent_version,
            jobsPendentes: relay.jobs_pendentes,
          }
        : { online: false, estado: "nao-cadastrado", ultimoHeartbeat: null },
      serverTime: banco.agora.toISOString(),
      latencyMs: Date.now() - inicio,
      // `VERCEL_GIT_COMMIT_SHA` liga o health ao deploy exato — sem Sentry, é o
      // que diz "qual versão está no ar" quando o log já rolou.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? "local",
    },
    // 200 mesmo degradado, de propósito: o monitor externo alerta por
    // indisponibilidade, e um 503 porque o relay reiniciou acordaria alguém de
    // madrugada por um problema que não derruba o site.
    { status: 200, headers: semCabecalhoDeCache },
  );
}
