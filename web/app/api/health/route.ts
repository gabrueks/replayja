import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { bancoResponde } from "@/db/queries/saude";

// `/api/health` — o alvo do monitor externo (Better Stack free, ADR §7).
//
// Checa o BANCO, não só se o processo subiu: um app que responde 200 com o Neon
// inacessível é exatamente o incidente que o monitor deveria pegar e não pegaria.
//
// Sem cache: `force-dynamic` porque um health check servido do cache do ISR
// responderia "ok" de dentro de um incidente.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const inicio = Date.now();

  if (!dbConfigured()) {
    // Ambiente sem banco (preview inicial, máquina nova). Não é 503: o app está
    // de pé e a ausência é de configuração, não de saúde. `degraded` é o que o
    // monitor deve enxergar como "alguém precisa terminar de configurar".
    return NextResponse.json(
      { status: "degraded", db: "nao-configurado", uptimeMs: Date.now() - inicio },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const r = await bancoResponde();
  if (!r.ok) {
    return NextResponse.json(
      { status: "down", db: "inacessivel" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      db: "ok",
      serverTime: r.agora.toISOString(),
      latencyMs: Date.now() - inicio,
      // `VERCEL_GIT_COMMIT_SHA` liga o health ao deploy exato — sem Sentry, é o
      // que diz "qual versão está no ar" quando o log já rolou.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? "local",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
