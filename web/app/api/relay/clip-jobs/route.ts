import { withRoute } from "@/lib/app-error";
import { reivindicarJobsHandler } from "@/lib/relay-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `GET /api/relay/clip-jobs` — O CAMINHO CANÔNICO do `openapi.yaml`.
//
// O relay chama a cada 2 s dentro do horário de operação da quadra e a cada 60 s
// fora dele (o polling adaptativo da ADR §4.2: perguntar a cada 2 s o dia inteiro
// faria o compute do Neon nunca dormir e a conta ir de ~US$ 10 para ~US$ 19/mês
// com o produto parado de madrugada), e imediatamente quando acordado por
// `POST /jobs`.
//
// A lógica inteira mora em `lib/relay-claim.ts`, compartilhada com o alias
// `POST /api/relay/clip-jobs/claim`.
export const GET = withRoute("/api/relay/clip-jobs", reivindicarJobsHandler);
