import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { ehJson, lerJson, mesmaOrigem } from "@/lib/http-guards";
import { corpoInvalido, naoAutenticado } from "@/lib/problem";
import { getSession } from "@/lib/session";
import {
  registrarCompartilhamento,
  type AlvoDeCompartilhamento,
  type CanalDeCompartilhamento,
} from "@/db/queries/compartilhamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/shares` — a métrica de compartilhamento do parceiro.
//
// ─── O QUE ESTA ROTA DELIBERADAMENTE NÃO FAZ ───────────────────────────────
//
// Ela NÃO cria `share_link`. O produto compartilha o endereço CANÔNICO
// (`/<arena>/c/<id>`, `/<arena>/s/<janela>`, `/<arena>/<grupo>`), que já tem
// preview de Open Graph e gate próprio; um encurtador no meio só acrescentaria
// um redirect e um domínio a mais para o WhatsApp desconfiar. `share_link`
// existe para o CONVITE de grupo, onde o token precisa ser opaco e revogável.
//
// Então aqui só entra `share_event`: qual arena, qual canal, quem, e o quê.
//
// ─── POR QUE ELA RESPONDE 204 E NUNCA FALHA DE VERDADE ─────────────────────
//
// Quem chama já mandou o usuário para o WhatsApp. A escrita é `tryQuery` lá
// dentro, e um alvo malformado responde 400 sem barulho — perder uma linha de
// analytics nunca pode custar um compartilhamento.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANAIS: readonly CanalDeCompartilhamento[] = [
  "whatsapp",
  "instagram",
  "instagram_stories",
  "tiktok",
  "copy_link",
  "native_share",
  "direct",
  "unknown",
];

const ALVOS: readonly AlvoDeCompartilhamento[] = ["clip", "session", "group", "partner"];

/** Só a FAMÍLIA do agente, nunca a string inteira — `modelo-de-dados.md` §3.20. */
function familiaDoAgente(ua: string | null): string | null {
  if (!ua) return null;
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome|CriOS/i.test(ua)) return "Chrome";
  if (/Firefox|FxiOS/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return "Outro";
}

function hostDoReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return null;
  }
}

export const POST = withRoute("/api/shares", async (req: NextRequest) => {
  // As duas guardas de `lib/http-guards.ts`, pelo mesmo motivo de `/api/triggers`:
  // `SameSite=Lax` é same-SITE, e `cdn.`, `media.` e `relay-1.` são o mesmo site
  // que `replayja.com.br`. A escrita aqui é pequena (uma linha de `share_event`),
  // mas é a métrica que o parceiro LÊ no painel — e uma métrica que qualquer
  // página de terceiro consegue inflar não é métrica.
  if (!mesmaOrigem(req) || !ehJson(req)) throw corpoInvalido();

  const sessao = await getSession();
  // Compartilhar exige login (decisão 7 do design): a barra deslogada já vira
  // um link de login, então um POST sem sessão é script, não usuário.
  if (!sessao) throw naoAutenticado();

  const corpo = await lerJson(req);
  if (!corpo) throw corpoInvalido();

  const partnerId = typeof corpo.partnerId === "string" ? corpo.partnerId : "";
  if (!UUID.test(partnerId)) throw corpoInvalido("Arena inválida.");

  const alvo = corpo.alvo as AlvoDeCompartilhamento;
  if (!ALVOS.includes(alvo)) throw corpoInvalido("Alvo de compartilhamento inválido.");

  const canalBruto = corpo.canal as CanalDeCompartilhamento;
  const canal: CanalDeCompartilhamento = CANAIS.includes(canalBruto) ? canalBruto : "unknown";

  const clipId = typeof corpo.clipId === "string" && UUID.test(corpo.clipId) ? corpo.clipId : null;

  await registrarCompartilhamento(sessao, {
    partnerId,
    action: "created",
    channel: canal,
    clipId,
    referrerHost: hostDoReferer(req.headers.get("referer")),
    userAgentFamily: familiaDoAgente(req.headers.get("user-agent")),
  });

  return new NextResponse(null, { status: 204 });
});
