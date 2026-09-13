import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Clock, Share2 } from "lucide-react";
import { Button, ClipGrid, EmptyState } from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import {
  ACHAR_LANCE_TITULO,
  MANDAR_PRO_GRUPO,
  TITULOS,
  TROCAR_ARENA,
  VIRAR_GRUPO,
  VIRAR_GRUPO_CHAMADA,
} from "@/lib/copy";
import { faixaDeHorario } from "@/lib/datas";
import { dbConfigured } from "@/lib/db";
import { agoraNaArena, instanteNaArena } from "@/lib/fuso";
import { JANELA_MAX_MS } from "@/lib/limites";
import { palavra } from "@/lib/plural";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, formatSessionSlug } from "@/lib/slug";
import { clipesDaArena } from "@/db/queries/clipe";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import FormularioDeBusca from "./FormularioDeBusca";
import css from "./buscar.module.css";

/*
  O `<title>` FALAVA A v1 (achado P1-17). "Buscar lances" na aba, "Bora achar seu
  lance" na tela: duas frases para a mesma ação, e quem tem oito abas abertas no
  celular lê só o `<title>`. Ele é a primeira microcópia do produto.
*/
export const metadata = { title: TITULOS.buscar, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/buscar` — a busca por horário DENTRO de uma arena.
 *
 * ─── A ARENA É OBRIGATÓRIA, E ISSO É A CORREÇÃO DO FLUXO ───────────────────
 *
 * Sem `?arena=`, esta página redireciona para `/app`. Antes ela abria "sem
 * arena" (e a home adivinhava uma por trás), o que produzia a pior falha
 * possível do produto: uma busca legítima voltando vazia porque estava olhando
 * para o lugar errado — indistinguível, para o atleta, de "não gravou".
 *
 * O PRD é o fluxo: "Arena/parceiro → horário → vídeos". Escolher a arena é o
 * passo 1, e ele agora tem tela própria.
 *
 * ─── A BUSCA É SERVIDOR, E ISSO É DECISÃO ──────────────────────────────────
 *
 * O formulário navega (`?arena=&quadra=&data=&de=&ate=`) em vez de chamar uma
 * API e montar a lista no cliente. Três ganhos concretos:
 *
 *  1. A CONVERSÃO DE FUSO ACONTECE ONDE ESTÁ A VERDADE. "20:00" é hora da
 *     ARENA; o celular do atleta pode estar em qualquer fuso, e a função da
 *     Vercel roda em UTC. Converter aqui, com `partner.timezone`, é a única
 *     forma de "das 20 às 21" significar a mesma coisa para todo mundo.
 *  2. O RESULTADO É UM LINK. O atleta manda `…/buscar?arena=…&de=20:00` no
 *     grupo e a pessoa do outro lado vê a mesma busca — o que é metade do
 *     produto.
 *  3. UM CAMINHO SÓ DE AUTORIZAÇÃO. A consulta exige sessão
 *     (`clipesDaArena` → `exigirLogin`) e ela é a mesma aqui e no player.
 *
 * ─── O ATALHO "AGORA" TAMBÉM É DO SERVIDOR ─────────────────────────────────
 *
 * `agora` desce como um relógio de PAREDE da arena (`2026-09-12T20:47:00`, sem
 * sufixo de fuso). O cliente lê com `new Date(...)`, que interpreta como hora
 * local, e `calcularAtalho` devolve "20:17–20:47" — a hora da arena, mesmo que
 * o celular esteja em Lisboa.
 */
export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<{
    arena?: string;
    quadra?: string;
    data?: string;
    de?: string;
    ate?: string;
  }>;
}) {
  const sessao = await getSession();
  const { arena, quadra, data, de, ate } = await searchParams;

  // Sem arena (ou com um slug que não existe) a busca não tem o que fazer:
  // devolve para a escolha em vez de renderizar um formulário que só pode
  // decepcionar.
  if (!arena || !ehSlugDeArena(arena)) redirect("/app");
  if (!dbConfigured()) redirect("/app");

  const parceiro = await parceiroPublicoPorSlug(arena);
  if (!parceiro) redirect("/app");

  const quadras = await quadrasDoParceiro(parceiro.id);
  const fuso = parceiro.timezone;
  const relogio = agoraNaArena(fuso);

  // A quadra chega por SLUG e é resolvida contra a lista da arena. O id nunca
  // vem da URL: um uuid arbitrário na query string não pode escolher a quadra,
  // porque a lista já está escopada ao parceiro.
  const quadraEscolhida = quadra ? quadras.find((q) => q.slug === quadra) : undefined;

  const pediuBusca = Boolean(data && de && ate);
  const janela =
    pediuBusca && data && de && ate
      ? { de: instanteNaArena(data, de, fuso), ate: instanteNaArena(data, ate, fuso) }
      : null;

  const janelaValida =
    janela !== null &&
    janela.ate.getTime() > janela.de.getTime() &&
    janela.ate.getTime() - janela.de.getTime() <= JANELA_MAX_MS;

  const linhas =
    janela && janelaValida
      ? await clipesDaArena(sessao, {
          partnerId: parceiro.id,
          courtId: quadraEscolhida?.id ?? null,
          de: janela.de,
          ate: janela.ate,
          // O lance recém-salvo tem de APARECER, ainda que como "processando":
          // quem acabou de apertar o botão está olhando para esta tela.
          incluirProcessando: true,
        })
      : [];

  const clipes = linhas.map((l) =>
    clipeDeVisao(l, {
      timezone: fuso,
      arenaSlug: parceiro.slug,
      marca: parceiro.display_name.toUpperCase(),
    }),
  );

  const nomeDaQuadra = quadraEscolhida?.name ?? "todas as quadras";

  /*
    "A CÂMERA DA TODAS AS QUADRAS ESTAVA LÁ" (achado P1-6).

    O artigo estava colado no nome do filtro: `A câmera da ${nomeDaQuadra}` com
    `nomeDaQuadra = "todas as quadras"`. É o tipo de frase que denuncia geração
    automática mais do que qualquer escolha de cor — e o conserto não é mudar o
    nome do filtro, é ter DUAS frases, porque a frase de uma quadra e a de todas
    são frases diferentes.
  */
  const cameraEstavaLa = quadraEscolhida
    ? `A câmera da ${quadraEscolhida.name} estava lá`
    : "A câmera estava lá";

  // ─── "COMPARTILHAR ESTA BUSCA" É UM LINK DE SESSÃO ───────────────────────
  //
  // A URL da busca (`/app/buscar?…`) é uma tela do ATLETA LOGADO: quem a
  // recebesse sem sessão cairia no login e depois numa tela que não é a dele.
  // O endereço compartilhável dessa mesma janela é `/[arena]/s/[slug]`, que
  // tem preview de Open Graph, gate próprio e o CTA de virar grupo.
  /*
    AS PONTES SÓ EXISTEM QUANDO HÁ O QUE COMPARTILHAR (achado P1-7).

    Elas dependiam só de `pediuBusca && janelaValida`, nunca de `clipes.length`.
    Resultado: numa busca que não achou nada, o atleta recebia TRÊS ações
    empilhadas — "Trocar de arena", "Manda pro grupo" e "Joga toda semana? Vira
    grupo" —, e nenhuma delas é a que ele quer (mudar o horário). Compartilhar
    uma busca vazia é oferecer um link para uma tela que diz "nada aqui".

    É o mesmo padrão dos "dois CTAs iguais em Seus lances" que o fundador
    reportou, numa tela diferente.
  */
  const pontes =
    pediuBusca && data && de && ate && janelaValida && clipes.length > 0
      ? {
          sessao: `/${parceiro.slug}/s/${formatSessionSlug({
            localDate: data,
            startTime: de,
            endTime: ate,
            courtSlug: quadraEscolhida?.slug ?? null,
          })}`,
          grupo: `/${parceiro.slug}/grupos/novo?${new URLSearchParams({
            data,
            de,
            ate,
            ...(quadraEscolhida ? { quadra: quadraEscolhida.slug } : {}),
          }).toString()}`,
        }
      : null;

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        {/*
          A arena escolhida fica visível o tempo todo, com a saída ao lado. Um
          filtro invisível é a origem do "busquei e não achou": o atleta precisa
          ver EM QUE arena ele está buscando antes de concluir qualquer coisa
          sobre o resultado.
        */}
        <div className={css.arenaLinha}>
          <span className={css.arenaNome}>{parceiro.display_name}</span>
          {/*
            "Trocar arena" aqui e "Trocar de arena" no estado vazio, 300px
            abaixo, na MESMA tela (achado P1-16). Agora as duas saem da mesma
            constante.
          */}
          <Link className={css.trocar} href="/app">
            {TROCAR_ARENA}
          </Link>
        </div>

        <h1 className={css.titulo}>{ACHAR_LANCE_TITULO}.</h1>
        <p className="apoio">Escolhe a quadra e o horário que você jogou. No máximo 6 horas.</p>
      </header>

      <FormularioDeBusca
        arenaSlug={parceiro.slug}
        quadras={quadras.map((q) => ({ id: q.slug, nome: q.name, esporte: q.sport }))}
        quadraSelecionada={quadraEscolhida?.slug ?? "todas"}
        intervaloInicial={
          data && de && ate
            ? { data, inicio: de, fim: ate }
            : { data: relogio.data, inicio: "", fim: "" }
        }
        agora={relogio.iso}
      />

      {pediuBusca ? (
        <section className={css.resultado}>
          <div className={css.resultadoTopo}>
            <h2 className={css.resultadoTitulo}>
              <span className={`${css.resultadoNumero} tempo`}>{clipes.length}</span>
              <span className={css.resultadoPalavra}>{palavra(clipes.length, "lance", "lances")}</span>
            </h2>
            <span className={`${css.resultadoApoio} tempo`}>
              {nomeDaQuadra} · {faixaDeHorario(de ?? "", ate ?? "")}
            </span>
          </div>

          {!janelaValida ? (
            <EmptyState
              ilustracao="apito"
              titulo="Esse intervalo não fecha."
              descricao="O fim precisa vir depois do início, e a busca cobre no máximo 6 horas de uma vez."
            />
          ) : (
            <>
              <ClipGrid
                clipes={clipes}
                rotulo="Lances encontrados"
                vazio={
                  <EmptyState
                    ilustracao="botao"
                    titulo={`Nada entre ${de} e ${ate}.`}
                    descricao={`${cameraEstavaLa}, mas ninguém apertou o botão nessa janela. Às vezes é a bateria do botão da quadra.`}
                    nota={`Achou que devia ter lance aqui? Confere se a arena é essa mesma — você está buscando na ${parceiro.display_name} — e fala com a quadra.`}
                    /*
                      A AÇÃO É MUDAR O HORÁRIO, e não trocar de arena (achado
                      P1-7). "Trocar de arena" era a única saída oferecida, e ela
                      quase nunca é o que resolve: quem buscou 20:00–21:00 e não
                      achou nada quase sempre errou meia hora, não a arena.

                      O primeiro botão volta ao formulário desta MESMA arena (o
                      endereço sem os parâmetros de janela), com os campos
                      limpos e o dedo já no lugar certo.
                    */
                    acoes={
                      <>
                        <Button
                          href={`/app/buscar?arena=${parceiro.slug}${
                            quadraEscolhida ? `&quadra=${quadraEscolhida.slug}` : ""
                          }`}
                          variante="preto"
                          largura="total"
                          icone={<Clock size={18} />}
                        >
                          Mudar o horário
                        </Button>
                        <Button href="/app" variante="secundario" largura="total">
                          {TROCAR_ARENA}
                        </Button>
                      </>
                    }
                  />
                }
              />

              {pontes ? (
                <div className={css.pontes}>
                  {/*
                    Decisão 6 do design: "salvar este horário como grupo" aparece
                    no fim do resultado da busca E como CTA da sessão. É a ponte
                    do caso de uso pontual para o recorrente, e é o diferencial
                    que o PRD compra.
                  */}
                  <Button
                    href={pontes.sessao}
                    variante="secundario"
                    largura="total"
                    icone={<Share2 size={18} />}
                  >
                    {MANDAR_PRO_GRUPO}
                  </Button>
                  <Button
                    href={pontes.grupo}
                    variante="preto"
                    largura="total"
                    icone={<CalendarPlus size={18} />}
                  >
                    {`${VIRAR_GRUPO_CHAMADA} ${VIRAR_GRUPO}`}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
