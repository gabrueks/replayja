import { withRoute } from "@/lib/app-error";
import { reivindicarJobsHandler } from "@/lib/relay-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/relay/clip-jobs/claim` — ALIAS do `GET /api/relay/clip-jobs`.
//
// Mesma função, mesmo efeito. Existe porque o relay pode apontar para qualquer um
// dos dois (`WORKER_CLAIM_PATH`/`WORKER_CLAIM_METHOD` no `rec.env`) e porque ele
// é atualizado por `git pull` na máquina, não por deploy nosso: tirar um caminho
// do ar exigiria coordenar dois deploys em máquinas diferentes para não perder
// nenhum corte.
//
// O canônico é o `GET` do `openapi.yaml`. Aposentar este alias é uma linha — mas
// só depois que o `rec.env` de todos os relays estiver no caminho novo.
const handler = withRoute("/api/relay/clip-jobs/claim", reivindicarJobsHandler);

export const POST = handler;
// Aceita GET aqui também: um relay configurado com o CAMINHO novo e o MÉTODO
// antigo (ou vice-versa) continua trabalhando em vez de silenciar.
export const GET = handler;
