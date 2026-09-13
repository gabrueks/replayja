import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { thumbnailPublica } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { urlDeDescadastro, urlDeDescadastroUmClique } from "@/lib/descadastro";
import {
  cabecalhosDeDescadastro,
  emailConfigurado,
  emailResumoDaRodada,
  sendEmail,
  type LanceDoResumo,
} from "@/lib/email";
import { horaNaArena } from "@/lib/fuso";
import { semPermissao } from "@/lib/problem";
import {
  destinatariosDoResumo,
  lancesDoResumo,
  reservarResumo,
  rodadasParaResumo,
} from "@/db/queries/grupo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O teto da Vercel é o que decide quantos e-mails cabem numa passada. 60 s com
// ~200 ms por chamada ao Resend dá folga larga para o piloto inteiro.
export const maxDuration = 60;

// `GET /api/cron/resumo-semanal` — "Rodada de sexta: 7 lances".
//
// ─── O QUE ESTE JOB EXISTE PARA CUMPRIR ────────────────────────────────────
//
// `play_group_member.notify_weekly` tem coluna desde a migração 0005 e a página
// do grupo promete "a galera recebe sozinha" desde o primeiro dia. Era a única
// promessa do produto sem nada do outro lado. Este arquivo é o outro lado.
//
// ─── UMA PASSADA POR DIA, DE MANHÃ ─────────────────────────────────────────
//
// `vercel.json` agenda `0 11 * * *` — 8h no horário de Brasília. É a manhã
// SEGUINTE a qualquer pelada da noite anterior, inclusive as que cruzam a
// meia-noite. Mandar logo depois do jogo seria pior de duas formas: o relay
// ainda está cortando os últimos lances (o e-mail sairia com metade), e ninguém
// abre e-mail às 22h30 saindo da quadra.
//
// A janela consultada é de 30 horas de `window_end`, não "ontem". "Ontem" é
// ambíguo num produto com fuso por arena; `window_end` é um instante absoluto. A
// folga de 6 horas além do intervalo do cron é o que cobre uma execução que
// falhou — sem mandar duas vezes, porque quem garante isso é o banco.
//
// ─── A IDEMPOTÊNCIA É UMA LINHA, E ELA VEM ANTES DO ENVIO ──────────────────
//
// `reservarResumo` faz `INSERT ... ON CONFLICT DO NOTHING` em
// `play_group_digest` e devolve se ESTA execução ganhou a chave. Quem perde
// desiste em silêncio. A reserva acontece ANTES de falar com o Resend: uma falha
// no meio da lista deixa a rodada sem resumo, e o contrário — reservar depois —
// faria a passada seguinte remandar tudo para quem já recebeu. Preferimos perder
// um resumo a mandar dois; o segundo é o que faz alguém apertar "isto é spam", e
// o domínio queimado é o mesmo que manda o código de login.
//
// ─── AUTENTICAÇÃO ──────────────────────────────────────────────────────────
//
// A Vercel manda `Authorization: Bearer $CRON_SECRET` nas invocações de cron.
// Sem o segredo configurado a rota RECUSA em produção — uma rota de envio de
// e-mail aberta na internet é um canhão de spam com o nosso domínio no
// remetente. Em desenvolvimento ela roda solta, para dar para testar.

/** Teto de e-mails por passada. Ver a nota de `maxDuration`. */
const TETO_DE_ENVIOS = 200;

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** `2026-09-12` → `sexta`. Data local, nunca o relógio da máquina. */
function diaDaSemana(localDate: string): string {
  const [ano, mes, dia] = localDate.split("-").map(Number);
  // Meio-dia UTC: qualquer fuso do Brasil cai no mesmo dia, e o clássico "um dia
  // a menos" de `new Date('2026-09-08')` não acontece.
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 12));
  const js = d.getUTCDay();
  return DIAS[js === 0 ? 7 : js] ?? "";
}

/** `2026-09-12` → `12 set`. */
function dataCurta(localDate: string): string {
  const [, mes, dia] = localDate.split("-").map(Number);
  return `${dia} ${MESES[(mes ?? 1) - 1] ?? ""}`;
}

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV === "development";
  return req.headers.get("authorization") === `Bearer ${segredo}`;
}

export const GET = withRoute("/api/cron/resumo-semanal", async (req: NextRequest) => {
  if (!autorizado(req)) throw semPermissao();

  if (!dbConfigured()) {
    return NextResponse.json(
      { rodadas: 0, enviados: 0, motivo: "sem-banco" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  const temProvedor = emailConfigurado();

  const rodadas = await rodadasParaResumo();

  let enviados = 0;
  let falhas = 0;
  let reservadas = 0;

  for (const r of rodadas) {
    if (enviados >= TETO_DE_ENVIOS) break;

    const destinatarios = await destinatariosDoResumo(r.play_group_id);
    if (destinatarios.length === 0) continue;

    // A reserva é a trava. Se outra execução já pegou esta rodada, sai fora.
    const meu = await reservarResumo(
      r.play_group_id,
      r.local_date,
      r.clip_count,
      destinatarios.length,
    );
    if (!meu) continue;
    reservadas += 1;

    // Sem provedor de e-mail a rodada fica RESERVADA mesmo assim, de propósito:
    // ligar o Resend amanhã não pode disparar uma avalanche de resumos de
    // peladas de duas semanas atrás. O registro é o que mantém o passado
    // passado.
    if (!temProvedor) continue;

    const lances = await lancesDoResumo({
      playGroupId: r.play_group_id,
      partnerId: r.partner_id,
      allCourts: r.all_courts,
      de: new Date(r.window_start),
      ate: new Date(r.window_end),
    });

    const thumbs: LanceDoResumo[] = lances.map((l) => ({
      horario: horaNaArena(new Date(l.triggered_at), r.timezone),
      href: `${base}/${r.partner_slug}/c/${l.id}`,
      thumbnailUrl: thumbnailPublica(l.thumbnail_object_key),
    }));

    const urlDaRodada = `${base}/${r.partner_slug}/${r.slug}`;

    for (const pessoa of destinatarios) {
      if (enviados >= TETO_DE_ENVIOS) break;
      const alvo = { userId: pessoa.user_id, playGroupId: r.play_group_id };
      // Duas URLs para a mesma saída: a do rodapé abre a página que explica; a
      // do cabeçalho é a que o Gmail chama sozinho (ver `lib/descadastro.ts`).
      const saida = urlDeDescadastro(base, alvo);
      const saidaUmClique = urlDeDescadastroUmClique(base, alvo);
      try {
        await sendEmail(
          pessoa.email,
          emailResumoDaRodada({
            grupo: r.name,
            arena: r.partner_display_name,
            dia: diaDaSemana(r.local_date),
            data: dataCurta(r.local_date),
            lances: r.clip_count,
            thumbs,
            url: urlDaRodada,
            urlDeDescadastro: saida,
          }),
          cabecalhosDeDescadastro(saidaUmClique),
        );
        enviados += 1;
      } catch (err) {
        // Teto diário do plano (compartilhado com o Sentinela), endereço morto,
        // Resend fora do ar. Uma falha de envio não pode derrubar a passada
        // inteira: o próximo grupo da fila não tem culpa.
        falhas += 1;
        console.error("[resumo] e-mail não saiu:", err);
      }
    }
  }

  return NextResponse.json(
    {
      rodadas: rodadas.length,
      reservadas,
      enviados,
      falhas,
      provedor: temProvedor ? "resend" : "ausente",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
