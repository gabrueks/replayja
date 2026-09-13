/**
 * Smoke dos grupos v2 contra um ambiente de verdade — LEITURA apenas.
 *
 * Irmão de `smoke-grupo.ts`, e com a mesma regra: roda as MESMAS funções de
 * `db/queries/*` que as telas rodam, nunca SQL paralelo. Se `rodadasParaResumo`
 * responde aqui, o cron responde — é a mesma chamada.
 *
 * ─── POR QUE ELE NÃO ESCREVE NADA ──────────────────────────────────────────
 *
 * Este script existe para ser rodado contra PRODUÇÃO. `reservarResumo` grava em
 * `play_group_digest` e, uma vez gravada, a linha SILENCIA o resumo daquela
 * rodada para sempre — um smoke que a chamasse cancelaria o e-mail de uma pelada
 * de verdade para provar que sabe mandá-lo. O mesmo vale para `entrarNoGrupo` e
 * `atualizarGrupo`: quem prova essas é a suíte de integração, num banco
 * descartável.
 *
 * A única escrita tolerada é o `upsert` do usuário da sessão — a mesma do
 * `smoke-grupo.ts`, idempotente, num e-mail de teste.
 *
 * Uso (a URL do banco vem de fora, nunca daqui):
 *
 *   DATABASE_URL=... pnpm tsx scripts/smoke-grupo-v2.ts \
 *     --arena=arena-vasco --slug=fut-sexta --email=teste1@replayja.com.br
 */
import { fecharPool } from "../lib/db";
import { assinarDescadastro, lerDescadastro } from "../lib/descadastro";
import { relogioDe } from "../lib/fuso";
import { icsDaPelada } from "../lib/ics";
import { proximaOcorrencia } from "../lib/ocorrencias";
import { sessoesSemanaisDoGrupo } from "../db/queries/clipe";
import { convitesDoGrupo } from "../db/queries/compartilhamento";
import {
  avisosDoUsuario,
  destinatariosDoResumo,
  grupoPorSlug,
  melhorDaRodada,
  membrosDoGrupo,
  rodadasParaResumo,
} from "../db/queries/grupo";
import { upsertUsuarioPorEmail } from "../db/queries/usuario";

function arg(nome: string, padrao = ""): string {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : padrao;
}

async function main() {
  const arenaSlug = arg("arena", "arena-vasco");
  const slug = arg("slug", "fut-sexta");
  const email = arg("email", "teste1@replayja.com.br");

  const usuario = await upsertUsuarioPorEmail(email, { provider: "email_otp" });
  const sessao = { uid: usuario.id, email: usuario.email, exp: 0 };
  console.log(`[smoke-v2] sessão de ${usuario.email}`);

  const grupo = await grupoPorSlug(sessao, arenaSlug, slug);
  if (!grupo) throw new Error(`grupo ${arenaSlug}/${slug} não encontrado`);
  console.log(
    `[smoke-v2] ${grupo.name} · ${grupo.partner_display_name} · ` +
      `${grupo.visibility} · ${grupo.member_count} membro(s)`,
  );

  const membros = await membrosDoGrupo(sessao, grupo.id);
  const dono = membros.find((m) => m.role === "owner");
  console.log(`[smoke-v2] dono: ${dono?.display_name ?? dono?.email ?? "(nenhum)"}`);

  // A tela de gestão do dono: convites vivos, com validade e métrica.
  const convites = await convitesDoGrupo(sessao, grupo.id);
  console.log(
    `[smoke-v2] convites vivos: ${convites.length}` +
      convites
        .map(
          (c) =>
            `\n            /convite/${c.token} — vale até ` +
            `${c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "sempre"}, ` +
            `${c.view_count} abertura(s), ${c.entradas} entrada(s)`,
        )
        .join(""),
  );

  // O seletor de rodada e o destaque saem das ocorrências derivadas.
  const rodadas = await sessoesSemanaisDoGrupo(grupo.id, 53);
  console.log(`[smoke-v2] rodadas conhecidas: ${rodadas.length}`);
  const comLance = rodadas.find((r) => r.clip_count > 0);
  if (!comLance) {
    console.log("[smoke-v2] nenhuma rodada com lance — destaque e resumo ficariam vazios");
  } else {
    const melhor = await melhorDaRodada(sessao, {
      playGroupId: grupo.id,
      partnerId: grupo.partner_id,
      allCourts: grupo.all_courts,
      de: new Date(comLance.window_start),
      ate: new Date(comLance.window_end),
    });
    console.log(
      `[smoke-v2] melhor da rodada ${comLance.local_date}: ` +
        (melhor
          ? `${melhor.id} (${melhor.share_count} compart., ${melhor.view_count} views)`
          : "(sem sinal — a seção não aparece)"),
    );
  }

  // O `.ics` é gerado em memória: nenhuma escrita, e o formato é conferido aqui
  // porque um arquivo malformado só aparece no calendário de quem baixou.
  const proxima = proximaOcorrencia({
    weekdays: grupo.weekdays,
    startTime: grupo.start_time,
    endTime: grupo.end_time,
    timezone: grupo.timezone,
  });
  if (!proxima) {
    console.log("[smoke-v2] sem próxima ocorrência — /agenda.ics responderia 404");
  } else {
    const ics = icsDaPelada({
      uid: `grupo-${grupo.id}@replayja.com.br`,
      titulo: grupo.name,
      descricao: "smoke",
      local: grupo.partner_display_name,
      url: `https://replayja.com.br/${arenaSlug}/${slug}`,
      inicio: proxima.inicio,
      fim: proxima.fim,
      weekdays: grupo.weekdays,
    });
    const ok = ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("RRULE:");
    console.log(
      `[smoke-v2] .ics ${ok ? "OK" : "MALFORMADO"} — próxima pelada ` +
        `${proxima.localDate} ${relogioDe(proxima.inicio, grupo.timezone).hora}`,
    );
  }

  // O resumo semanal, sem reservar nada.
  const destinatarios = await destinatariosDoResumo(grupo.id);
  console.log(`[smoke-v2] optaram pelo resumo neste grupo: ${destinatarios.length}`);

  const fila = await rodadasParaResumo();
  console.log(`[smoke-v2] rodadas na fila do cron agora: ${fila.length}`);
  for (const r of fila) {
    console.log(`            ${r.partner_slug}/${r.slug} — ${r.local_date}, ${r.clip_count} lance(s)`);
  }

  const avisos = await avisosDoUsuario(sessao);
  console.log(
    `[smoke-v2] avisos de ${usuario.email}: ` +
      (avisos.map((a) => `${a.slug}=${a.notify_weekly ? "on" : "off"}`).join(", ") || "(nenhum)"),
  );

  // O token de descadastro NÃO é gravado em lugar nenhum: assinar e reler prova
  // que `SESSION_SECRET` está configurado neste ambiente — que é a única forma
  // de o link do rodapé do e-mail falhar em produção sem ninguém notar.
  const token = assinarDescadastro({ userId: usuario.id, playGroupId: grupo.id });
  const alvo = lerDescadastro(token);
  console.log(
    `[smoke-v2] token de descadastro ${alvo?.userId === usuario.id ? "OK" : "FALHOU"}`,
  );

  console.log("[smoke-v2] fim — nada foi escrito além do upsert do usuário.");
}

main()
  .catch((e) => {
    console.error("[smoke-v2] FALHOU:", e);
    process.exitCode = 1;
  })
  .finally(() => fecharPool());
