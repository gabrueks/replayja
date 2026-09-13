import { NextResponse } from "next/server";
import { withRoute } from "@/lib/app-error";
import { dbConfigured } from "@/lib/db";
import { icsDaPelada } from "@/lib/ics";
import { proximaOcorrencia } from "@/lib/ocorrencias";
import { naoEncontrado } from "@/lib/problem";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, ehSlugDeGrupo } from "@/lib/slug";
import { grupoPorSlug } from "@/db/queries/grupo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `GET /[arena]/[grupo]/agenda.ics` — "Adicionar ao calendário".
//
// ─── POR QUE UM ARQUIVO E NÃO UM LINK DO GOOGLE AGENDA ─────────────────────
//
// O link `calendar.google.com/render?...` é mais fácil de gerar e serve a UMA
// agenda. Metade do público do produto está no iPhone com o calendário da Apple,
// e boa parte do resto usa o app do fabricante do Android. O `.ics` é o formato
// que TODOS abrem — é o que o convite de reunião usa desde sempre — e ele chega
// como um arquivo que o sistema operacional reconhece, sem passar por um site de
// terceiro pedindo login.
//
// ─── A ROTA VIVE SOB O GRUPO, E RESPEITA A VISIBILIDADE DELE ───────────────
//
// `grupoPorSlug` recebe a sessão e devolve `null` para grupo `private` de quem
// não é membro — a mesma regra da página. Sem isso, esta rota seria um oráculo:
// um 404 e um 200 diriam se um grupo fechado existe naquele endereço.
//
// O nome do arquivo termina em `.ics` de propósito: o Android decide o que abrir
// pela EXTENSÃO com mais frequência do que pelo `Content-Type`, e um arquivo
// `agenda` sem extensão vira download anônimo na pasta de downloads.

export const GET = withRoute<{ params: Promise<{ arenaSlug: string; groupSlug: string }> }>(
  "/[arenaSlug]/[groupSlug]/agenda.ics",
  async (_req, ctx) => {
    const { arenaSlug, groupSlug } = await ctx.params;
    if (!dbConfigured() || !ehSlugDeArena(arenaSlug) || !ehSlugDeGrupo(groupSlug)) {
      throw naoEncontrado();
    }

    const sessao = await getSession();
    const grupo = await grupoPorSlug(sessao, arenaSlug, groupSlug);
    if (!grupo) throw naoEncontrado();

    const proxima = proximaOcorrencia({
      weekdays: grupo.weekdays,
      startTime: grupo.start_time,
      endTime: grupo.end_time,
      timezone: grupo.timezone,
    });
    // Um grupo sem `weekdays` válido não tem próxima pelada, e um `.ics` sem
    // `DTSTART` é um arquivo que o calendário recusa com uma mensagem que não
    // ajuda ninguém.
    if (!proxima) throw naoEncontrado();

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
    const url = `${base}/${arenaSlug}/${groupSlug}`;

    const ics = icsDaPelada({
      // O `UID` é derivado do GRUPO e não da ocorrência: baixar o arquivo duas
      // vezes atualiza o mesmo evento no calendário em vez de criar um segundo.
      uid: `grupo-${grupo.id}@replayja.com.br`,
      titulo: grupo.name,
      descricao: `Os lances desta pelada ficam em ${url}`,
      local: grupo.all_courts
        ? grupo.partner_display_name
        : `${grupo.partner_display_name} — uma quadra`,
      url,
      inicio: proxima.inicio,
      fim: proxima.fim,
      weekdays: grupo.weekdays,
    });

    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // `attachment` e não `inline`: no iOS o `inline` faz o Safari mostrar o
        // texto cru do arquivo em vez de oferecer o calendário.
        "Content-Disposition": `attachment; filename="${groupSlug}.ics"`,
        // O arquivo muda quando o grupo muda de horário. Cachear por engano
        // deixaria a pelada com o horário velho na agenda de todo mundo.
        "Cache-Control": "no-store",
      },
    });
  },
);
