import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import {
  Button,
  ClipGrid,
  CtaFixo,
  EmptyState,
  LoginGate,
  Secao,
  ShareBar,
} from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { CLIPES_BORRADOS_EXEMPLO } from "@/lib/fixtures";
import { instanteNaArena } from "@/lib/fuso";
import { JANELA_MAX_MS } from "@/lib/limites";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, parseSessionSlug } from "@/lib/slug";
import { clipesDaArena } from "@/db/queries/clipe";
import {
  lancesDeHojeNaArena,
  parceiroPublicoPorSlug,
  quadrasDoParceiro,
} from "@/db/queries/parceiro";
import css from "./sessao.module.css";

// `/[arenaSlug]/s/[sessionSlug]` — A PÁGINA DA SESSÃO.
//
// ─── A SESSÃO É UMA JANELA, NÃO UMA LINHA ──────────────────────────────────
//
// O slug é `[<quadra>-]AAAA-MM-DD-HHh[MMm]-HHh[MMm]` no fuso DA ARENA: "os
// lances entre 20h e 21h30 do dia 8, na quadra 1". Não existe tabela de sessão
// para isso — é por essa razão que `share_link.target_type = 'session'` não tem
// `target_id` e carrega `range_start`/`range_end`.
//
// Os clipes saem da MESMA consulta da busca (`clipesDaArena`): a sessão é a
// busca com um endereço próprio. Duas consultas para a mesma pergunta
// divergiriam na primeira vez que alguém mexesse no filtro de status.
//
// É a ponte do caso de uso PONTUAL para o RECORRENTE: o CTA principal é "salvar
// este horário como grupo" (`design/README.md`, decisão 6). Por isso ele aparece
// ANTES da lista, e não escondido no fim.
//
// ─── DESLOGADO VÊ QUE EXISTE, NÃO O QUÊ ────────────────────────────────────
//
// Mesma regra da página do parceiro: grade BORRADA com o contador, e o gate na
// ação. A alternativa (mostrar a lista real) contraria a decisão de privacidade
// — thumbnail nítido é imagem de pessoa; e a outra alternativa (404 para
// anônimo) mataria a divulgação orgânica que o parceiro compra.
//
// CUIDADO COM O NOME: `s` é slug reservado de segundo nível. Um grupo chamado "s"
// colidiria com esta rota — `lib/reserved-slugs.ts` bloqueia.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ arenaSlug: string; sessionSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sessionSlug } = await params;
  const janela = parseSessionSlug(sessionSlug);
  return {
    // O título da aba é o mesmo da tela, menos a quadra (que o slug pode não
    // ter): `Sessão de 2026-09-12` era um identificador, não um título — e é o
    // texto que aparece no histórico do navegador e na lista de abas.
    title: janela
      ? `${dataHumana(janela.localDate)} · ${horaHumana(janela.startTime)}–${horaHumana(janela.endTime)}`
      : "Sessão",
    // A sessão leva a vídeos específicos: nunca entra no índice.
    robots: { index: false, follow: false },
  };
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * `2026-09-12` → `Sexta, 12 set`.
 *
 * A forma curta e não "Sexta, 12 de setembro": este texto entra num título que
 * também carrega o horário e a quadra, e a versão longa empurraria a quadra —
 * a informação que distingue duas sessões da mesma noite — para a terceira
 * linha no celular.
 */
function dataHumana(iso: string): string {
  // `T12:00` evita o clássico "um dia a menos": `new Date('2026-09-08')` é lido
  // como UTC e volta para o dia 7 em qualquer fuso negativo.
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = DIAS[d.getDay()] ?? "";
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${d.getDate()} ${MESES_CURTOS[d.getMonth()] ?? ""}`;
}

/**
 * `20:00` → `20h`; `21:30` → `21h30`.
 *
 * É como se fala e como se escreve numa mensagem de WhatsApp ("bora 20h"). O
 * `20:00` do relógio digital é preciso e é a forma que ninguém usa em voz alta —
 * e este título existe para ser lido em voz alta.
 */
function horaHumana(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m && m !== "00" ? `${h}h${m}` : `${h}h`;
}

/**
 * "Arena Vasco" → "AV".
 *
 * Os dois primeiros CARACTERES dariam "AR", que não é a marca de ninguém — é o
 * começo da palavra "Arena", repetido em metade das arenas do cadastro.
 */
function iniciaisDe(nome: string): string {
  const partes = nome.split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "A";
  const b = partes.length > 1 ? (partes[1]?.[0] ?? "") : (partes[0]?.[1] ?? "");
  return (a + b).toUpperCase();
}

function porExtenso(iso: string): string {
  // `T12:00` evita o clássico "um dia a menos": `new Date('2026-09-08')` é lido
  // como UTC e volta para o dia 7 em qualquer fuso negativo.
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = DIAS[d.getDay()] ?? "";
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${d.getDate()} de ${MESES[d.getMonth()] ?? ""}`;
}

export default async function PaginaDaSessao({ params }: Props) {
  const { arenaSlug, sessionSlug } = await params;
  if (!ehSlugDeArena(arenaSlug)) notFound();

  const janela = parseSessionSlug(sessionSlug);
  if (!janela) notFound();

  const parceiro = dbConfigured() ? await parceiroPublicoPorSlug(arenaSlug) : null;
  if (!parceiro) notFound();

  const sessao = await getSession();
  const fuso = parceiro.timezone;

  const quadras = await quadrasDoParceiro(parceiro.id);
  const quadra = janela.courtSlug ? quadras.find((q) => q.slug === janela.courtSlug) : undefined;
  // Uma quadra no slug que não existe nesta arena é link errado, não filtro
  // vazio: some, em vez de mostrar "nenhum lance" e deixar o atleta concluir que
  // o produto não gravou.
  if (janela.courtSlug && !quadra) notFound();

  const de = instanteNaArena(janela.localDate, janela.startTime, fuso);
  const ateBruto = instanteNaArena(janela.localDate, janela.endTime, fuso);
  // `fim <= início` é a sessão que cruza a meia-noite: soma um dia.
  const ate =
    ateBruto.getTime() > de.getTime()
      ? ateBruto
      : new Date(ateBruto.getTime() + 24 * 60 * 60 * 1000);

  // O teto de 6 horas da consulta central vale aqui também: um slug fabricado à
  // mão não pode virar um dump da arena.
  if (ate.getTime() - de.getTime() > JANELA_MAX_MS) notFound();

  const [linhas, lancesHoje] = await Promise.all([
    sessao
      ? clipesDaArena(sessao, {
          partnerId: parceiro.id,
          courtId: quadra?.id ?? null,
          de,
          ate,
          incluirProcessando: true,
        })
      : Promise.resolve([]),
    lancesDeHojeNaArena(parceiro.id, fuso),
  ]);

  const clipes = linhas.map((l) =>
    clipeDeVisao(l, {
      timezone: fuso,
      arenaSlug: parceiro.slug,
      marca: parceiro.display_name.toUpperCase(),
    }),
  );

  const caminho = `/${arenaSlug}/s/${sessionSlug}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  const url = `${base}${caminho}`;
  const hrefDeLogin = `/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`;

  // "Salvar como grupo" leva o formulário JÁ PREENCHIDO: quadra, dia da semana
  // e horário saem daqui. É o que transforma o CTA de uma promessa numa ação de
  // um toque — pedir os cinco campos de novo é a fricção que a ponte existe
  // para eliminar.
  const diaDaSemanaIso = (() => {
    const d = new Date(`${janela.localDate}T12:00:00`);
    const js = d.getDay();
    return js === 0 ? 7 : js;
  })();

  const destinoDoGrupo = `/${arenaSlug}/grupos/novo?${new URLSearchParams({
    data: janela.localDate,
    de: janela.startTime,
    ate: janela.endTime,
    dia: String(diaDaSemanaIso),
    ...(quadra ? { quadra: quadra.slug } : {}),
  }).toString()}`;

  return (
    <main className={`${css.pagina} ${sessao ? "" : "com-cta"}`} id="conteudo">
      <header className={css.cabecalho}>
        <Link className={css.arena} href={`/${arenaSlug}`}>
          <span className={css.brasao}>{iniciaisDe(parceiro.display_name)}</span>
          <span className={css.arenaTextos}>
            <span className={css.arenaNome}>{parceiro.display_name}</span>
            <span className={css.arenaApoio}>Uma pelada</span>
          </span>
        </Link>

        {/*
          O TÍTULO HUMANO. Antes eram duas linhas — "Sexta, 12 de setembro" em
          34px e "20:00–21:00 · todas as quadras" em cinza embaixo — e a segunda
          lia como metadado. Mas a sessão É a junção das três coisas: sem a
          quadra e o horário, "Sexta, 12 de setembro" nomeia o DIA, não a pelada,
          e duas turmas da mesma noite ganhariam títulos idênticos.

          A hierarquia continua existindo: a data em peso cheio, o resto em
          `.tituloApoio` — mas dentro do mesmo `<h1>`, porque é uma coisa só e é
          isso que o leitor de tela deve anunciar de uma vez.
        */}
        <h1 className={css.titulo}>
          {dataHumana(janela.localDate)}
          <span className={`${css.tituloApoio} tempo`}>
            {horaHumana(janela.startTime)}–{horaHumana(janela.endTime)}
            {" · "}
            {quadra ? quadra.name : "todas as quadras"}
          </span>
        </h1>
      </header>

      <Secao
        titulo={<span className="rotulo">Lances desta pelada</span>}
        acao={
          sessao ? (
            <span className="apoio-3 tempo">
              {clipes.length} {clipes.length === 1 ? "lance" : "lances"}
            </span>
          ) : null
        }
      >
        {sessao ? (
          <ClipGrid
            clipes={clipes}
            rotulo="Lances da sessão"
            vazio={
              <EmptyState
                ilustracao="botao"
                titulo={`Nada entre ${janela.startTime} e ${janela.endTime}.`}
                descricao={`A câmera ${quadra ? `da ${quadra.name}` : "da quadra"} estava lá, mas ninguém apertou o botão nessa janela.`}
                nota="Achou que devia ter lance aqui? Fala com a arena: o botão da quadra pode ter ficado sem bateria."
                acoes={
                  <Button
                    href={`/app/buscar?arena=${arenaSlug}`}
                    variante="preto"
                    largura="total"
                  >
                    Buscar outro horário
                  </Button>
                }
              />
            }
          />
        ) : (
          <>
            <p className={css.contador}>
              <span className={`${css.contadorNumero} tempo`}>{lancesHoje}</span>
              <span className={css.contadorRotulo}>
                {lancesHoje === 1 ? "lance gravado hoje" : "lances gravados hoje"}
              </span>
            </p>

            <LoginGate
              amostra={CLIPES_BORRADOS_EXEMPLO}
              marca={parceiro.display_name.toUpperCase()}
            >
              <p className={css.rodapeDoGate}>
                A sessão é um link público da {parceiro.display_name}. O login só é pedido pra
                ver, baixar e compartilhar vídeo.
              </p>
            </LoginGate>
          </>
        )}
      </Secao>

      {/*
        A PONTE PARA O GRUPO É O QUE ESTA PÁGINA VENDE — ela transforma um link de
        uma noite no endereço permanente da pelada. Ela desceu para DEPOIS da
        lista porque, deslogado, o CTA fixo do rodapé já é "entrar"; oferecer
        duas ações principais na mesma tela é não ter nenhuma.
      */}
      <section className={css.chamada}>
        <span className={css.chamadaIcone} aria-hidden="true">
          <CalendarPlus size={22} strokeWidth={2.2} />
        </span>
        <span className={css.chamadaTextos}>
          <span className={css.chamadaTitulo}>Joga toda semana aqui?</span>
          <span className={css.chamadaApoio}>
            Vira grupo e os lances chegam sozinhos, separados por rodada.
          </span>
        </span>
        <Button
          href={sessao ? destinoDoGrupo : hrefDeLogin}
          tamanho={44}
          variante="secundario"
          className={css.chamadaBotao}
        >
          Criar
        </Button>
      </section>

      <Secao titulo={<span className="rotulo">Manda pro grupo</span>}>
        <ShareBar
          url={url}
          titulo={`Lances de ${porExtenso(janela.localDate)} na ${parceiro.display_name}`}
          texto={`Os lances da nossa pelada (${janela.startTime}–${janela.endTime}):`}
          hrefDeLogin={sessao ? null : hrefDeLogin}
          registro={{ partnerId: parceiro.id, alvo: "session" }}
          nota="Quem abrir o link vê que a pelada existe. Os vídeos continuam pedindo login."
        />
      </Secao>

      {sessao ? null : (
        <CtaFixo apoio="Leva 20 segundos. Sem senha, sem cadastro.">
          <Button href={hrefDeLogin} tamanho={56} largura="total">
            Entrar pra ver meus lances
          </Button>
        </CtaFixo>
      )}
    </main>
  );
}
