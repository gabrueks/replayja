import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { emailConfigurado, emailConviteDeGrupo, sendEmail } from "@/lib/email";
import { lerJson } from "@/lib/http-guards";
import { corpoInvalido, naoAutenticado, naoEncontrado } from "@/lib/problem";
import { getSession } from "@/lib/session";
import { exigirMembroDoGrupo } from "@/db/queries/autorizacao";
import {
  CONVITE_VALIDADE_DIAS,
  linkDeConviteDoGrupo,
  registrarCompartilhamento,
  revogarConviteDoGrupo,
} from "@/db/queries/compartilhamento";
import { grupoPorId } from "@/db/queries/grupo";
import { usuarioDaSessao } from "@/db/queries/usuario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `/api/grupos/{groupId}/convite` — o link de convite do grupo.
//
// ─── QUEM PODE CONVIDAR: QUALQUER MEMBRO ───────────────────────────────────
//
// `api/README.md` §3 reserva `POST /groups/{id}/members` ao dono. Este endpoint
// é OUTRA coisa: ele não adiciona ninguém, ele devolve um link. E no piloto o
// grupo é ABERTO por link — qualquer membro que copie a URL da página já
// consegue trazer alguém. Restringir a geração do token ao dono daria a ilusão
// de controle sem nenhum controle, e faria a pelada usar o link "errado" (o da
// página), que não registra quem convidou quem.
//
// A ADIÇÃO de membro continua acontecendo em `/convite/[token]`, com a sessão
// de quem aceita — nunca daqui.
//
// ─── REVOGAR É DO DONO, E POR ISSO NÃO ESTÁ AQUI ───────────────────────────
//
// O `DELETE` abaixo existe para o caso "gerei o link errado, corta" — ele aceita
// qualquer membro porque a tela de gestão (do dono) usa a server action
// `revogarConvite`, que passa pelo mesmo `revogarConviteDoGrupo`. Os dois
// caminhos chamam a MESMA função, que é onde a regra mora.
//
// ─── O E-MAIL É OPCIONAL E NÃO BLOQUEANTE ──────────────────────────────────
//
// O domínio está verificado no Resend desde 2026-09-13 e o convite sai de
// verdade. A decisão de não bloquear continua valendo: falhar o convite inteiro
// porque um provedor de e-mail teve um mau minuto deixaria a pelada sem link
// nenhum, quando o WhatsApp — que é onde ela conversa — funciona sempre. O corpo
// da resposta diz o que aconteceu com o e-mail, e a UI oferece o link e o
// WhatsApp de qualquer jeito.
//
// REENVIAR é a mesma chamada, com o mesmo e-mail: o token é reaproveitado (e
// renovado por mais 14 dias), então o segundo e-mail leva o MESMO link. Um
// token novo a cada reenvio faria o primeiro e-mail — o que a pessoa talvez
// tenha achado no spam — apontar para um convite morto.
//
// LGPD (D6): reenvio é sempre um ato MANUAL de quem convida. Nunca há job de
// lembrete — a mitigação obrigatória do T5 de `docs/legal/analise-lgpd.md` é
// "um e-mail só, sem reenvio automático".

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** "Toda sexta, das 20h às 21h" — a recorrência por extenso, para o e-mail. */
function recorrencia(weekdays: number[], inicio: string, fim: string): string {
  const nomes = weekdays.map((d) => DIAS[d]).filter(Boolean);
  const quando =
    nomes.length === 0
      ? ""
      : nomes.length === 1
        ? `Toda ${nomes[0]}`
        : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `${quando}, das ${inicio.slice(0, 5)} às ${fim.slice(0, 5)}.`;
}

async function grupoDoMembro(req: NextRequest, groupId: string) {
  const sessao = await getSession();
  if (!sessao) throw naoAutenticado();
  if (!UUID.test(groupId)) throw naoEncontrado();

  const grupo = await grupoPorId(groupId);
  if (!grupo) throw naoEncontrado();

  // 404 para quem não é membro, nunca 403: distinguir "não existe" de "você
  // não pode" é um oráculo de enumeração (`api/README.md` §6).
  await exigirMembroDoGrupo(sessao, groupId);
  return { sessao, grupo };
}

export const POST = withRoute<{ params: Promise<{ groupId: string }> }>(
  "/api/grupos/[groupId]/convite",
  async (req: NextRequest, ctx) => {
    const { groupId } = await ctx.params;
    const { sessao, grupo } = await grupoDoMembro(req, groupId);

    const link = await linkDeConviteDoGrupo(sessao, {
      playGroupId: grupo.id,
      partnerId: grupo.partner_id,
    });

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
    const url = `${base}/convite/${link.token}`;

    // O corpo é opcional: sem ele, a rota só devolve o link (é o caso do botão
    // "Convidar", que abre a sheet com WhatsApp e cópia).
    const corpo = (await lerJson(req)) ?? {};
    const paraBruto = typeof corpo.email === "string" ? corpo.email.trim() : "";

    let email: "enviado" | "sem-provedor" | "falhou" | "nao-pedido" = "nao-pedido";

    if (paraBruto) {
      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(paraBruto)) {
        throw corpoInvalido("E-mail inválido.");
      }
      if (!emailConfigurado()) {
        email = "sem-provedor";
      } else {
        const eu = await usuarioDaSessao(sessao);
        try {
          await sendEmail(
            paraBruto,
            emailConviteDeGrupo({
              grupo: grupo.name,
              arena: grupo.partner_display_name,
              // O NOME de quem convida, nunca o e-mail: o endereço de quem
              // convidou não tem por que circular para um terceiro.
              convidadoPor: eu?.display_name ?? null,
              quando: recorrencia(grupo.weekdays, grupo.start_time, grupo.end_time),
              url,
              validadeDias: CONVITE_VALIDADE_DIAS,
            }),
          );
          email = "enviado";
        } catch (err) {
          // Teto diário do plano, endereço inexistente, Resend fora do ar: nada
          // disso pode custar o convite.
          console.error("[convite] e-mail não saiu:", err);
          email = "falhou";
        }
      }
    }

    await registrarCompartilhamento(sessao, {
      partnerId: grupo.partner_id,
      action: "created",
      channel: paraBruto ? "direct" : "copy_link",
      shareLinkId: link.id,
    });

    return NextResponse.json(
      { url, email, expiraEmDias: CONVITE_VALIDADE_DIAS },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);

/** `DELETE` com `{ shareLinkId }` — corta um convite que vazou. */
export const DELETE = withRoute<{ params: Promise<{ groupId: string }> }>(
  "/api/grupos/[groupId]/convite",
  async (req: NextRequest, ctx) => {
    const { groupId } = await ctx.params;
    const { sessao, grupo } = await grupoDoMembro(req, groupId);

    const corpo = await lerJson(req);
    const shareLinkId = typeof corpo?.shareLinkId === "string" ? corpo.shareLinkId : "";
    if (!UUID.test(shareLinkId)) throw corpoInvalido("Convite inválido.");

    const revogado = await revogarConviteDoGrupo(sessao, grupo.id, shareLinkId);
    return NextResponse.json({ revogado }, { headers: { "Cache-Control": "no-store" } });
  },
);
