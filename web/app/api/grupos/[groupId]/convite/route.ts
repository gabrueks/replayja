import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { emailConfigurado, sendEmail } from "@/lib/email";
import { lerJson } from "@/lib/http-guards";
import { corpoInvalido, naoAutenticado, naoEncontrado } from "@/lib/problem";
import { getSession } from "@/lib/session";
import { exigirMembroDoGrupo } from "@/db/queries/autorizacao";
import {
  linkDeConviteDoGrupo,
  registrarCompartilhamento,
} from "@/db/queries/compartilhamento";
import { grupoPorId } from "@/db/queries/grupo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/grupos/{groupId}/convite` — o link de convite do grupo.
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
// ─── O E-MAIL É OPCIONAL E NÃO BLOQUEANTE ──────────────────────────────────
//
// `RESEND_API_KEY` existe, mas o domínio ainda não está verificado (pendência
// G-4): o envio pode falhar. Falhar o convite inteiro por causa disso deixaria
// a pelada sem link nenhum, quando o WhatsApp — que é onde ela conversa —
// funciona sempre. O corpo da resposta diz o que aconteceu com o e-mail.

export const POST = withRoute<{ params: Promise<{ groupId: string }> }>(
  "/api/grupos/[groupId]/convite",
  async (req: NextRequest, ctx) => {
    const sessao = await getSession();
    if (!sessao) throw naoAutenticado();

    const { groupId } = await ctx.params;
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(groupId)) throw naoEncontrado();

    const grupo = await grupoPorId(groupId);
    if (!grupo) throw naoEncontrado();

    // 404 para quem não é membro, nunca 403: distinguir "não existe" de "você
    // não pode" é um oráculo de enumeração (`api/README.md` §6).
    await exigirMembroDoGrupo(sessao, groupId);

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
        try {
          await sendEmail(paraBruto, montarConvite(grupo.name, grupo.partner_display_name, url));
          email = "enviado";
        } catch (err) {
          // Domínio ainda não verificado no Resend é o caso esperado hoje.
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

    return NextResponse.json({ url, email }, { headers: { "Cache-Control": "no-store" } });
  },
);

function montarConvite(grupo: string, arena: string, url: string) {
  const subject = `Entra no ${grupo} no Replay já`;
  const text = [
    `Você foi convidado para o ${grupo}, na ${arena}.`,
    "",
    "Os lances da pelada ficam salvos e organizados por semana neste link:",
    url,
    "",
    "É só entrar com o seu e-mail — não tem senha.",
  ].join("\n");

  // HTML deliberadamente simples: e-mail transacional com layout elaborado
  // aumenta a chance de spam e não melhora a conversão de um link único.
  const html = `<p>Você foi convidado para o <strong>${escapar(grupo)}</strong>, na ${escapar(arena)}.</p>
<p>Os lances da pelada ficam salvos e organizados por semana:</p>
<p><a href="${escapar(url)}">${escapar(url)}</a></p>
<p>É só entrar com o seu e-mail — não tem senha.</p>`;

  return { subject, text, html };
}

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
