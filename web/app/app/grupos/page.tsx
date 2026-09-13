import Link from "next/link";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { Button, EmptyState, Secao } from "@/components/ui";
import { CRIAR_GRUPO, TITULOS, VIRAR_GRUPO, VIRAR_GRUPO_CHAMADA } from "@/lib/copy";
import {
  diaRelativoLongo,
  diaRelativoNaArena,
  diasCurtos,
  faixaDeHorario,
  hhmm,
} from "@/lib/datas";
import { dbConfigured } from "@/lib/db";
import { horaNaArena } from "@/lib/fuso";
import { proximaOcorrencia } from "@/lib/ocorrencias";
import { getSession } from "@/lib/session";
import { meusGruposDetalhado } from "@/db/queries/grupo";
import css from "./grupos.module.css";

/*
  "Meus grupos" na aba e "Suas peladas." na tela (achado P1-17). Quem tem oito
  abas abertas no celular lê só o `<title>`.
*/
export const metadata = { title: TITULOS.grupos, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/grupos` — os grupos de que o atleta faz parte.
 *
 * ─── AS DUAS LINHAS QUE FAZEM ALGUÉM VOLTAR ────────────────────────────────
 *
 * "Próximo: sexta, 20:00" e "Último lance: ontem às 21:03". Uma lista de nomes
 * de grupo é um índice; estas duas linhas são a razão de abrir o app sem ter
 * recebido link nenhum. As duas saem do SQL com `AT TIME ZONE` da arena — e o
 * "último lance" é filtrado pela JANELA do grupo, senão seria o último lance da
 * arena inteira e uma pelada de segunda mostraria o gol de quinta de outra
 * turma.
 *
 * ─── A CRIAÇÃO COMEÇA NA ARENA — MAS O BOTÃO FICA AQUI ────────────────────
 *
 * O fluxo natural é "achei meus lances → esse horário se repete → salvar como
 * grupo", e o formulário mora em `/[arena]/grupos/novo` porque o grupo vive
 * dentro de uma arena. Isso continua verdade.
 *
 * O que NÃO se sustentava era a conclusão que a tela tirava disso (achado
 * P1-11): no lugar do botão havia um PARÁGRAFO explicando o caminho — "abre a
 * arena e busca o horário da pelada, o botão *Joga toda semana? Vira grupo* já
 * leva…". A tela do objeto não deixava criar o objeto, que é o mesmo beco do
 * `grupos/novo` sem saída que o fundador reportou, visto do outro lado. E a aba
 * "Grupos" é a do DIFERENCIAL do PRD.
 *
 * Agora existe um `Button` que leva à escolha da arena (o passo 1, que o
 * formulário precisa de qualquer jeito), com a explicação ABAIXO dele — e não
 * no lugar dele.
 */
export default async function Grupos() {
  const sessao = await getSession();
  const linhas = sessao && dbConfigured() ? await meusGruposDetalhado(sessao) : [];
  const agora = new Date();

  // O próximo horário é derivado aqui (`lib/ocorrencias.ts`), no fuso da arena,
  // e é ele que ordena a lista: quem abre esta tela quer saber o que vem
  // primeiro, não o que vem em ordem alfabética.
  const grupos = linhas
    .map((g) => ({
      ...g,
      proxima: proximaOcorrencia(
        {
          weekdays: g.weekdays,
          startTime: g.start_time,
          endTime: g.end_time,
          timezone: g.timezone,
        },
        agora,
      ),
    }))
    .sort((a, b) => (a.proxima?.inicio.getTime() ?? Infinity) - (b.proxima?.inicio.getTime() ?? Infinity));

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <h1 className={css.titulo}>Suas peladas.</h1>
        <p className={css.chamada}>
          O link fixo da turma, com os vídeos separados por rodada.
        </p>
      </header>

      <Secao
        titulo={
          <span className="rotulo">
            {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}
          </span>
        }
      >
        {grupos.length === 0 ? (
          <EmptyState
            ilustracao="apito"
            titulo="Nenhuma pelada salva ainda."
            descricao="Acha os lances de uma pelada e salva aquele horário como grupo: toda semana os vídeos aparecem sozinhos no mesmo link, e quem você convidar entra com um toque."
            acoes={
              <Button href="/app" tamanho={56} largura="total">
                Escolher a arena
              </Button>
            }
          />
        ) : (
          <ul className={css.lista}>
            {grupos.map((g) => {
              const ultimo = g.ultimo_lance_em ? new Date(g.ultimo_lance_em) : null;
              return (
                <li key={g.id}>
                  <Link className={css.grupo} href={`/${g.partner_slug}/${g.slug}`}>
                    <span className={css.topo}>
                      <span className={css.nome}>{g.name}</span>
                      <ChevronRight size={20} className={css.seta} aria-hidden="true" />
                    </span>
                    <span className={`${css.apoio} tempo`}>
                      {g.partner_display_name} · {diasCurtos(g.weekdays)} ·{" "}
                      {faixaDeHorario(g.start_time, g.end_time)}
                    </span>
                    {/*
                      AS DUAS LINHAS QUE FAZEM ALGUÉM VOLTAR. Uma lista de nomes
                      de grupo é um índice; "próxima pelada" e "último lance" são
                      a razão de abrir o app sem ter recebido link nenhum.
                    */}
                    <span className={css.linhas}>
                      <span className={`${css.proximo} tempo`}>
                        {g.proxima
                          ? `Próxima pelada ${diaRelativoLongo(g.proxima.localDate, g.timezone, agora)} às ${hhmm(g.start_time)}`
                          : "Sem próximo horário"}
                      </span>
                      <span className={`${css.ultimo} tempo`}>
                        {ultimo
                          ? `Último lance ${diaRelativoNaArena(ultimo, g.timezone, agora).toLowerCase()} às ${horaNaArena(ultimo, g.timezone)}`
                          : "Nenhum lance ainda"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      {/*
        O BOTÃO QUE NÃO EXISTIA (achado P1-11). Ele leva a `/app` porque criar um
        grupo exige uma arena, e escolher a arena é o passo 1 do fluxo do PRD —
        o mesmo passo que `destinoDeAcharMeuLance` respeita em `/app/lances`.

        A explicação continua, e continua verdadeira: pelo caminho da busca o
        formulário chega com quadra, dia e horário preenchidos, o que é sempre
        melhor. Ela só deixou de ser a ÚNICA coisa nesta parte da tela.
      */}
      <div className={css.criar}>
        <Button href="/app" tamanho={56} largura="total" icone={<CalendarPlus size={20} />}>
          {CRIAR_GRUPO}
        </Button>
        <p className={css.nota}>
          Você escolhe a arena e busca o horário da pelada — o botão &ldquo;{VIRAR_GRUPO_CHAMADA}{" "}
          {VIRAR_GRUPO}&rdquo; já leva quadra, dia e horário preenchidos.
        </p>
      </div>

    </main>
  );
}
