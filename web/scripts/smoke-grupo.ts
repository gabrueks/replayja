/**
 * Smoke do fluxo de grupo contra um ambiente de verdade.
 *
 * Roda as MESMAS funções de `db/queries/*` que as telas rodam — não SQL
 * paralelo. É o que torna o resultado uma prova: se `criarGrupo` aqui funciona,
 * a server action de `/[arena]/grupos/novo` funciona, porque é a mesma chamada.
 *
 * É IDEMPOTENTE: rodar de novo não cria um segundo grupo nem duplica membro.
 *
 * Uso (a URL do banco vem de fora, nunca daqui):
 *
 *   DATABASE_URL=... pnpm tsx scripts/smoke-grupo.ts \
 *     --arena=arena-vasco --quadra=quadra-1 --slug=fut-sexta \
 *     --nome="Fut Sexta" --dia=5 --de=20:00 --ate=21:00 \
 *     --email=teste1@replayja.com.br
 */
import { fecharPool } from "../lib/db";
import { relogioDe } from "../lib/fuso";
import { formatSessionSlug } from "../lib/slug";
import { proximaOcorrencia } from "../lib/ocorrencias";
import { clipesDaArena, clipesDoGrupoPorSessao, sessoesSemanaisDoGrupo } from "../db/queries/clipe";
import { criarGrupo, grupoPorSlug, membrosDoGrupo, slugDeGrupoEmUso } from "../db/queries/grupo";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "../db/queries/parceiro";
import { upsertUsuarioPorEmail } from "../db/queries/usuario";

function arg(nome: string, padrao = ""): string {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : padrao;
}

async function main() {
  const arenaSlug = arg("arena", "arena-vasco");
  const quadraSlug = arg("quadra", "quadra-1");
  const slug = arg("slug", "fut-sexta");
  const nome = arg("nome", "Fut Sexta");
  const dia = Number(arg("dia", "5"));
  const de = arg("de", "20:00");
  const ate = arg("ate", "21:00");
  const email = arg("email", "teste1@replayja.com.br");

  const parceiro = await parceiroPublicoPorSlug(arenaSlug);
  if (!parceiro) throw new Error(`arena ${arenaSlug} não encontrada`);
  const quadras = await quadrasDoParceiro(parceiro.id);
  const quadra = quadras.find((q) => q.slug === quadraSlug);
  if (!quadra) throw new Error(`quadra ${quadraSlug} não encontrada em ${arenaSlug}`);

  const usuario = await upsertUsuarioPorEmail(email, {
    provider: "email_otp",
    firstPartnerId: parceiro.id,
  });
  const sessao = { uid: usuario.id, email: usuario.email, exp: 0 };
  console.log(`[smoke] usuário ${usuario.email} (${usuario.id})`);

  if (await slugDeGrupoEmUso(parceiro.id, slug)) {
    console.log(`[smoke] grupo ${slug} já existe — não recria`);
  } else {
    const criado = await criarGrupo(sessao, {
      partnerId: parceiro.id,
      slug,
      name: nome,
      weekdays: [dia],
      startTime: de,
      endTime: ate,
      timezone: parceiro.timezone,
      courtId: quadra.id,
    });
    console.log(`[smoke] grupo criado: ${criado.id}`);
  }

  const grupo = await grupoPorSlug(sessao, arenaSlug, slug);
  if (!grupo) throw new Error("grupo não encontrado depois de criado");

  const membros = await membrosDoGrupo(sessao, grupo.id);
  const dono = membros.find((m) => m.role === "owner");
  console.log(
    `[smoke] /${arenaSlug}/${slug} · ${grupo.weekdays.join(",")} · ` +
      `${grupo.start_time.slice(0, 5)}–${grupo.end_time.slice(0, 5)} · ` +
      `${grupo.member_count} membro(s) · dono=${dono?.email ?? "—"} · ` +
      `quadras=${grupo.all_courts ? "todas" : "1"}`,
  );

  const proxima = proximaOcorrencia(
    {
      weekdays: grupo.weekdays,
      startTime: grupo.start_time,
      endTime: grupo.end_time,
      timezone: grupo.timezone,
    },
    new Date(),
  );
  console.log(`[smoke] próxima pelada: ${proxima?.localDate ?? "—"}`);

  const semanas = await sessoesSemanaisDoGrupo(grupo.id, 8);
  console.log(
    `[smoke] ocorrências passadas: ${semanas.length}` +
      (semanas.length ? ` (${semanas.map((s) => `${s.local_date}:${s.clip_count}`).join(" ")})` : ""),
  );

  const clipesDoGrupo = await clipesDoGrupoPorSessao(sessao, grupo.id, 8, 6);
  console.log(`[smoke] clipes nas ocorrências do grupo: ${clipesDoGrupo.filter((c) => c.id).length}`);

  // ─── A SESSÃO DE HOJE ────────────────────────────────────────────────────
  //
  // A janela é o dia inteiro? Não: o teto de 6 horas da consulta central vale
  // aqui também. Pegamos as últimas 6 horas do relógio DA ARENA, que é onde os
  // lances do piloto estão.
  const agora = new Date();
  const relogio = relogioDe(agora, parceiro.timezone);
  const seisHorasAtras = relogioDe(new Date(agora.getTime() - 6 * 60 * 60 * 1000), parceiro.timezone);

  const linhas = await clipesDaArena(sessao, {
    partnerId: parceiro.id,
    courtId: null,
    de: new Date(agora.getTime() - 6 * 60 * 60 * 1000),
    ate: agora,
    incluirProcessando: true,
  });

  const slugDeHoje = formatSessionSlug({
    localDate: seisHorasAtras.data,
    startTime: seisHorasAtras.hora,
    endTime: relogio.hora,
  });

  console.log(`[smoke] sessão de hoje: /${arenaSlug}/s/${slugDeHoje} → ${linhas.length} lance(s)`);
  for (const l of linhas.slice(0, 5)) {
    console.log(
      `         ${relogioDe(new Date(l.triggered_at), parceiro.timezone).hora} · ${l.court_name} · ${l.status}`,
    );
  }
}

main()
  .then(() => fecharPool())
  .catch(async (err) => {
    console.error("[smoke] FALHOU:", err);
    await fecharPool();
    process.exitCode = 1;
  });
