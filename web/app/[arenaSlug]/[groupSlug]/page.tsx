import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Flame, Users } from "lucide-react";
import {
  AcaoConfirmada,
  BottomNav,
  Button,
  Card,
  CtaFixo,
  EmptyState,
  LoginGate,
  MemberAvatars,
  Secao,
  Voltar,
  WeekSection,
  type Clipe,
} from "@/components/ui";
import { iniciais } from "@/components/ui/MemberAvatars";
import { clipeDeVisao, thumbnailPublica } from "@/lib/clipe-visao";
import {
  ADMINISTRA_A_ARENA,
  DONO_DA_PELADA,
  ENTRAR,
  ENTRAR_APOIO,
  NA_PELADA,
  naPelada,
} from "@/lib/copy";
import { dataMedia, diasComPreposicao, diasCurtos, faixaDeHorario, hhmm } from "@/lib/datas";
import { dbConfigured } from "@/lib/db";
import { CLIPES_BORRADOS_EXEMPLO } from "@/lib/fixtures";
import { duracaoFormatada, horaNaArena } from "@/lib/fuso";
import { proximaOcorrencia } from "@/lib/ocorrencias";
import { palavra, plural } from "@/lib/plural";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, ehSlugDeGrupo, formatSessionSlug } from "@/lib/slug";
import { papelNaArena, papelNoGrupo } from "@/db/queries/autorizacao";
import { CONVITE_VALIDADE_DIAS } from "@/db/queries/compartilhamento";
import { clipesDoGrupoPorSessao, sessoesSemanaisDoGrupo } from "@/db/queries/clipe";
import { grupoPorSlug, melhorDaRodada, membrosDoGrupo } from "@/db/queries/grupo";
import { lancesDeHojeNaArena } from "@/db/queries/parceiro";
import { AcoesDoGrupo } from "./AcoesDoGrupo";
import { sairDoGrupoDaArena } from "./acoes";
import css from "./grupo.module.css";

// `/[arenaSlug]/[groupSlug]` — A PÁGINA DO GRUPO.
//
// ─── O GRUPO NÃO É UM COFRE ────────────────────────────────────────────────
//
// Um grupo `private` esconde ESTA PÁGINA, as sessões organizadas e a lista de
// membros. Ele NÃO esconde os clipes: qualquer usuário logado que saiba a arena e
// o horário encontra os mesmos vídeos pela busca (`api/README.md` §3).
//
// O grupo é CONVENIÊNCIA e ORGANIZAÇÃO — "os vídeos já organizados por semana,
// atualizados sozinhos" — mais captura de e-mail para o parceiro. A UI precisa
// dizer "quem pode ver esta página", nunca "quem pode ver estes vídeos": prometer
// o segundo criaria uma expectativa que a busca desmente no primeiro teste.
//
// A página abre em MODO LEITURA para convidados; entrar vira membro e liga o
// aviso semanal por e-mail. É assim que o grupo captura e-mail sem bloquear quem
// só quer ver (`design/README.md`, decisão 8).
//
// ─── AS SEMANAS SÃO DERIVADAS, NÃO ARMAZENADAS ─────────────────────────────
//
// Não existe tabela de sessão. As ocorrências saem de `weekdays` +
// `start_time`/`end_time` + `timezone` com `AT TIME ZONE` em SQL
// (`db/queries/clipe.ts`), e os clipes de cada uma vêm da mesma derivação. É por
// isso que o grupo "se atualiza sozinho": não há nada para atualizar.
//
// ─── E POR ISSO O SELETOR DE RODADA É UM `OFFSET`, NÃO UM CURSOR ───────────
//
// A lista de ocorrências é estável e ordenada (ela é gerada, não paginada de uma
// tabela que cresce), então "a rodada 12 é a décima segunda da lista" continua
// verdade entre duas requisições. O keyset assinado que a busca de clipes exige
// não faz sentido aqui — e um cursor opaco tiraria do link a única coisa que ele
// precisa carregar: QUAL rodada.

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ arenaSlug: string; groupSlug: string }>;
  searchParams: Promise<{ r?: string }>;
};


/** Quantas ocorrências cabem numa tela. Oito rodadas é ~2 meses de pelada. */
const OCORRENCIAS = 8;

/**
 * O horizonte da NUMERAÇÃO das rodadas: um ano.
 *
 * A numeração precisa ser absoluta ("Rodada 12" é sempre a mesma noite), e para
 * isso a página tem de saber quantas ocorrências existem ao todo. A consulta de
 * contagem é uma linha por ocorrência — 53 semanas de um grupo de um dia são 53
 * linhas, e mesmo um grupo de três dias fica em 159. É barato.
 *
 * Um grupo com mais de um ano de vida passa a numerar a partir do horizonte, e
 * não do primeiro jogo. É o preço de não guardar a rodada em tabela — e ele só
 * será cobrado depois de o produto ter um grupo que sobreviveu um ano, que é um
 * problema bom de ter.
 */
const SEMANAS_DE_HISTORICO = 53;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { arenaSlug, groupSlug } = await params;
  if (!dbConfigured() || !ehSlugDeArena(arenaSlug) || !ehSlugDeGrupo(groupSlug)) {
    return { title: "Grupo" };
  }
  // Metadados são gerados SEM sessão: o crawler do WhatsApp não tem cookie. Por
  // isso um grupo `private` não devolve nada aqui.
  const g = await grupoPorSlug(null, arenaSlug, groupSlug);
  if (!g) return { title: "Grupo", robots: { index: false, follow: false } };

  return {
    title: `${g.name} · ${g.partner_display_name}`,
    description:
      g.description ??
      `Os lances do ${g.name} na ${g.partner_display_name}, organizados por semana.`,
    alternates: { canonical: `/${arenaSlug}/${groupSlug}` },
    // Só grupo PÚBLICO entra no índice. `unlisted` existe justamente para viver
    // só no link compartilhado.
    robots:
      g.visibility === "public"
        ? { index: true, follow: true }
        : { index: false, follow: false },
    openGraph: {
      type: "website",
      title: g.name,
      description: g.description ?? `Lances do ${g.name}, semana a semana.`,
      locale: "pt_BR",
    },
  };
}

export default async function PaginaDoGrupo({ params, searchParams }: Props) {
  const { arenaSlug, groupSlug } = await params;
  if (!dbConfigured() || !ehSlugDeArena(arenaSlug) || !ehSlugDeGrupo(groupSlug)) notFound();

  const sessao = await getSession();
  const grupo = await grupoPorSlug(sessao, arenaSlug, groupSlug);
  // 404 e nunca 403: distinguir "não existe" de "você não pode ver" é um oráculo
  // de enumeração.
  if (!grupo) notFound();

  const [todasAsRodadas, membros, papel, papelArena, lancesHoje] = await Promise.all([
    sessoesSemanaisDoGrupo(grupo.id, SEMANAS_DE_HISTORICO),
    membrosDoGrupo(sessao, grupo.id),
    papelNoGrupo(sessao, grupo.id),
    // ─── "DONO DA PELADA" NÃO É "ADMIN DA ARENA" ───────────────────────────
    //
    // A auditoria de QA de 13/09 abriu com o susto do fundador — "um usuário
    // normal virou admin da Arena Vasco?" — e a resposta foi não: ele é dono do
    // GRUPO `fut-de-segunda`. Dono de grupo edita a pelada, convida, remove
    // membro e corta convite; dono de arena mexe em câmera, chave RTMP, botão e
    // remoção de vídeo. São dois conjuntos, a distinção está certa no banco e em
    // `db/queries/autorizacao.ts` — e não existia em NENHUMA tela.
    //
    // Esta consulta é o que permite dizer as duas coisas em voz alta.
    papelNaArena(sessao, grupo.partner_id),
    lancesDeHojeNaArena(grupo.partner_id, grupo.timezone),
  ]);

  // A página mostra um BLOCO de rodadas por vez. `?r=0` é o bloco mais recente.
  const paginas = Math.max(1, Math.ceil(todasAsRodadas.length / OCORRENCIAS));
  const { r } = await searchParams;
  const pedida = Number.parseInt(r ?? "0", 10);
  // Um `?r=` fabricado à mão não pode virar erro nem página vazia: ele se
  // acomoda no bloco mais próximo que existe.
  const pagina = Number.isFinite(pedida) ? Math.min(Math.max(pedida, 0), paginas - 1) : 0;
  const pular = pagina * OCORRENCIAS;
  const ocorrencias = todasAsRodadas.slice(pular, pular + OCORRENCIAS);

  // Os clipes exigem login — mesma regra da arena. Deslogado vê a estrutura
  // (as semanas e as contagens) e a grade borrada, nunca miniatura de verdade.
  const clipesPorSessao = sessao
    ? await clipesDoGrupoPorSessao(sessao, grupo.id, OCORRENCIAS, 6, pular)
    : [];

  // Agrupa os clipes por data local. O `Map` preserva a ordem da consulta
  // (`window_start DESC`), que é a ordem em que as semanas aparecem.
  const porData = new Map<string, Clipe[]>();
  for (const linha of clipesPorSessao) {
    if (!linha.id) continue; // ocorrência sem lance: a lateral devolveu nulos
    const lista = porData.get(linha.local_date) ?? [];
    lista.push(
      clipeDeVisao(linha, {
        timezone: grupo.timezone,
        arenaSlug,
        marca: grupo.partner_display_name.toUpperCase(),
      }),
    );
    porData.set(linha.local_date, lista);
  }

  // "Melhor da rodada" é da rodada MAIS RECENTE DO BLOCO que teve lance — e não
  // da primeira da lista. Quem abre o grupo na manhã seguinte à pelada encontra
  // o destaque daquela noite; quem volta na quarta encontra o mesmo destaque, em
  // vez de uma seção vazia porque a rodada de hoje ainda não começou.
  const rodadaDoDestaque = ocorrencias.find((o) => o.clip_count > 0);
  const melhor =
    sessao && rodadaDoDestaque
      ? await melhorDaRodada(sessao, {
          playGroupId: grupo.id,
          partnerId: grupo.partner_id,
          allCourts: grupo.all_courts,
          de: new Date(rodadaDoDestaque.window_start),
          ate: new Date(rodadaDoDestaque.window_end),
        })
      : null;

  const caminho = `/${arenaSlug}/${groupSlug}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  const hrefDeLogin = sessao
    ? null
    : `/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`;

  const quadraDoGrupo = grupo.all_courts ? "todas as quadras" : "uma quadra";

  // "Próxima pelada: sexta, 19 set às 20:00" — a linha que diz que o grupo está
  // VIVO. Sem ela, um grupo recém-criado (sem nenhuma sessão passada) parece
  // quebrado: a página abre com o vazio e nada explica quando ele vai encher.
  const proxima = proximaOcorrencia(
    {
      weekdays: grupo.weekdays,
      startTime: grupo.start_time,
      endTime: grupo.end_time,
      timezone: grupo.timezone,
    },
    new Date(),
  );

  const numeroDaRodada = (indiceNoBloco: number) =>
    todasAsRodadas.length - (pular + indiceNoBloco);

  return (
    <>
    {/*
      Quem está logado tem a barra de abas no pé; quem não está tem o convite de
      entrar. Nunca os dois — e a reserva de espaço de cada um vem junto com ele
      (`RodapeFixo`), sem nenhuma classe nesta página.
    */}
    <main className={css.pagina} id="conteudo">
      {/*
        O CABEÇALHO DO GRUPO É PRETO, e é a única superfície escura do app fora
        do player e do botão virtual. A razão é de produto: o grupo é o endereço
        PERMANENTE da pelada — o link que fica fixado no tópico do WhatsApp por
        meses. Um cabeçalho que se destaca é o que faz a página ser reconhecida
        de relance, entre trinta mensagens.
      */}
      <header className={`${css.cabecalho} tinta`}>
        <span className={css.brilho} aria-hidden="true" />

        <div className={css.linhaTopo}>
          {/*
            A seta mandava para `/${arenaSlug}` — e a página da arena não tinha
            barra inferior: quem voltava do grupo ficava preso lá (bug 6). Agora
            ela volta no HISTÓRICO quando existe tela nossa atrás, e cai na lista
            de grupos do atleta quando a pessoa abriu o link direto do WhatsApp.
            A arena continua a um toque, pela linha logo abaixo do título.
          */}
          <Voltar para="/app/grupos" rotulo="Voltar" tom="escuro" />
        </div>

        <h1 className={css.titulo}>{grupo.name}</h1>
        <p className={css.linha}>
          {grupo.partner_display_name} · {quadraDoGrupo}
        </p>
        {grupo.description ? <p className={css.descricao}>{grupo.description}</p> : null}

        <p className={css.quando}>
          <Clock size={14} strokeWidth={2.4} aria-hidden="true" />
          <span className="tempo">
            {diasCurtos(grupo.weekdays)} · {faixaDeHorario(grupo.start_time, grupo.end_time)}
          </span>
        </p>

        {proxima ? (
          <div className={css.proximaLinha}>
            <p className={`${css.proxima} tempo`}>
              Próxima pelada: {dataMedia(proxima.localDate)} às {hhmm(grupo.start_time)}
            </p>
            {/*
              `<a>` cru e não `<Link>`: o destino é um ARQUIVO (`text/calendar`),
              e o `<Link>` do Next tentaria buscá-lo como rota e navegar. Com
              `download`, o Android salva com a extensão certa em vez de abrir um
              texto sem nome.
            */}
            <a className={css.calendario} href={`${caminho}/agenda.ics`} download>
              <CalendarPlus size={15} strokeWidth={2.4} aria-hidden="true" />
              Adicionar ao calendário
            </a>
          </div>
        ) : null}

        <div className={css.membros}>
          {/*
            `m.nome` e nunca `display_name ?? email`: a consulta já resolve o
            nome (o `display_name` quando existe, senão o primeiro nome tirado do
            endereço), e era exatamente aquele `??` que despejava o e-mail
            completo de quem entrou sem nome (achado P1-14).
          */}
          <MemberAvatars
            membros={membros.map((m) => ({ id: m.id, nome: m.nome }))}
            total={grupo.member_count}
          />
          <AcoesDoGrupo
            playGroupId={grupo.id}
            partnerId={grupo.partner_id}
            url={`${base}${caminho}`}
            nomeDoGrupo={grupo.name}
            arena={grupo.partner_display_name}
            hrefDeLogin={hrefDeLogin}
            podeConvidar={papel !== null}
            hrefDeEdicao={papel === "owner" ? `${caminho}/editar` : null}
            validadeDoConvite={CONVITE_VALIDADE_DIAS}
          />
        </div>
      </header>

      {melhor && rodadaDoDestaque ? (
        <section className={css.destaque}>
          <p className={css.destaqueRotulo}>
            <Flame size={14} strokeWidth={2.6} aria-hidden="true" />
            Melhor da rodada
          </p>
          <Link className={css.destaqueCartao} href={`/${arenaSlug}/c/${melhor.id}`}>
            {thumbnailPublica(melhor.thumbnail_object_key) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={css.destaqueFoto}
                src={thumbnailPublica(melhor.thumbnail_object_key) ?? ""}
                alt=""
                loading="lazy"
              />
            ) : (
              <span className={css.destaqueFoto} aria-hidden="true" />
            )}
            <span className={css.destaqueTextos}>
              <span className={`${css.destaqueHorario} tempo`}>
                {horaNaArena(new Date(melhor.triggered_at), grupo.timezone)}
              </span>
              <span className={css.destaqueApoio}>
                {dataMedia(rodadaDoDestaque.local_date)} · {melhor.court_name} ·{" "}
                {duracaoFormatada(melhor.duration_seconds)}
              </span>
              <span className={`${css.destaqueNumeros} tempo`}>
                {melhor.share_count > 0
                  ? plural(melhor.share_count, "compartilhamento", "compartilhamentos")
                  : plural(melhor.view_count, "visualização", "visualizações")}
              </span>
            </span>
          </Link>
        </section>
      ) : null}

      <div className={css.rodadas}>
        {!sessao ? (
          <>
            <p className={css.contador}>
              <span className={`${css.contadorNumero} tempo`}>{lancesHoje}</span>
              <span className={css.contadorRotulo}>
                {palavra(lancesHoje, "lance gravado hoje", "lances gravados hoje")}
              </span>
            </p>

            <LoginGate
              amostra={CLIPES_BORRADOS_EXEMPLO}
              marca={grupo.partner_display_name.toUpperCase()}
              titulo="Os lances da pelada estão aqui."
            >
              <p className={css.rodapeDoGate}>
                A página do {grupo.name} é pública. O login só é pedido pra ver, baixar e
                compartilhar vídeo.
              </p>
            </LoginGate>

            <CtaFixo apoio={ENTRAR_APOIO}>
              <Button href={hrefDeLogin ?? "/entrar"} tamanho={56} largura="total">
                {ENTRAR}
              </Button>
            </CtaFixo>
          </>
        ) : ocorrencias.length === 0 ? (
          <EmptyState
            ilustracao="quadra"
            titulo="A primeira rodada ainda não rolou."
            // "…apertar o botão segunda entre 20:00 e 22:00" era a frase em
            // produção, sem preposição nenhuma (achado P2-39). A preposição muda
            // com o gênero do dia, e só o dia sabe qual é.
            descricao={`Assim que alguém apertar o botão ${diasComPreposicao(grupo.weekdays)} entre ${hhmm(grupo.start_time)} e ${hhmm(grupo.end_time)}, os lances aparecem aqui sozinhos.`}
          />
        ) : (
          <>
            {ocorrencias.map((s, i) => (
              <WeekSection
                key={s.local_date}
                semana={{
                  id: s.local_date,
                  titulo: dataMedia(s.local_date),
                  dataIso: s.local_date,
                  // A rodada é contada de trás para a frente a partir de TODAS as
                  // ocorrências conhecidas — não das oito desta tela. É o que faz
                  // "Rodada 12" continuar sendo a rodada 12 na página seguinte.
                  rodada: numeroDaRodada(i),
                  total: s.clip_count,
                  clipes: porData.get(s.local_date) ?? [],
                }}
                rodape={
                  // A sessão daquela noite tem endereço próprio — é o link que se
                  // manda no grupo, e é onde estão os lances que não couberam aqui.
                  s.clip_count > 0 ? (
                    <Link
                      className={css.verSessao}
                      href={`/${arenaSlug}/s/${formatSessionSlug({
                        localDate: s.local_date,
                        startTime: hhmm(grupo.start_time),
                        endTime: hhmm(grupo.end_time),
                      })}`}
                    >
                      Ver {s.clip_count === 1 ? "o lance" : `os ${plural(s.clip_count, "lance", "lances")}`}{" "}
                      desta rodada
                    </Link>
                  ) : null
                }
              />
            ))}

            {paginas > 1 ? (
              // O seletor é um par de LINKS, não botões: cada bloco de rodadas
              // vira um endereço (`?r=1`), o botão voltar do navegador funciona,
              // e a rodada de três meses atrás pode ser mandada no WhatsApp.
              <nav className={css.paginacao} aria-label="Rodadas">
                {pagina + 1 < paginas ? (
                  <Link className={css.passo} href={`${caminho}?r=${pagina + 1}`}>
                    <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
                    Rodadas anteriores
                  </Link>
                ) : (
                  <span className={css.passoVazio} />
                )}

                <span className={`${css.paginaAtual} tempo`}>
                  {ocorrencias.length === 1
                    ? `Rodada ${numeroDaRodada(0)}`
                    : `Rodadas ${numeroDaRodada(ocorrencias.length - 1)}–${numeroDaRodada(0)}`}
                </span>

                {pagina > 0 ? (
                  <Link className={css.passo} href={`${caminho}?r=${pagina - 1}`}>
                    Rodadas mais novas
                    <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className={css.passoVazio} />
                )}
              </nav>
            ) : null}
          </>
        )}
      </div>

      <Secao
        titulo={<span className="rotulo">Membros</span>}
        /*
          UMA CONTAGEM, UMA PALAVRA (achado P1-13). A mesma contagem aparecia
          duas vezes na mesma tela com palavras diferentes — "3 na pelada" ao
          lado dos avatares e "3 pessoas" aqui — e virava "1 membro" na página da
          arena. A folha de voz da v2 manda "na pelada", e agora ela sai de
          `naPelada()`, que é o único lugar que conta gente de um grupo.
        */
        acao={<span className="apoio-3 tempo">{naPelada(grupo.member_count)}</span>}
      >
        {membros.length === 0 ? (
          <Card>
            <p className="apoio">
              <Users size={16} aria-hidden="true" /> Entra no grupo pra ver quem está aqui.
            </p>
          </Card>
        ) : (
          <ul className={css.listaMembros}>
            {membros.map((m) => (
              <li key={m.id} className={css.membro}>
                <span className={css.membroPessoa}>
                  {/*
                    A INICIAL AO LADO DO NOME. Dois "Lucas" numa pelada de vinte
                    são duas linhas idênticas; a inicial é o que o dono usa para
                    saber qual deles está prestes a remover.
                  */}
                  <span className={css.membroInicial} aria-hidden="true">
                    {iniciais(m.nome)}
                  </span>
                  <span className={css.membroTextos}>
                    <span className={css.membroNome}>{m.nome}</span>
                    {/*
                      O ENDEREÇO COMPLETO SÓ PARA O DONO (achado P1-14). A lista
                      mostrava o e-mail de todo mundo para qualquer membro —
                      `lucasfaraht@gmail.com`, `bolzi.gabriel@gmail.com` — e o
                      produto promete em `/app/perfil` que guarda o endereço
                      "para saber a quem mostrar os lances", o que é outra coisa.
                      A consulta devolve `email` nulo para quem não é dono, então
                      esta linha não tem como vazar por engano: ela mostra o que
                      recebeu, e o que ela recebe já é a máscara.
                    */}
                    <span className={css.membroEmail}>{m.email ?? m.emailMascarado}</span>
                  </span>
                </span>
                {/*
                  "DONO DA PELADA", E NUNCA "ADMIN". O selo dizia `dono`, em
                  caixa alta e sem objeto — e "dono" de quê é exatamente a
                  pergunta que abriu a auditoria de 13/09. Quem administra a
                  ARENA ganha um selo próprio, porque são poderes diferentes:
                  câmera, chave RTMP e remoção de vídeo não têm nada a ver com
                  editar o horário da pelada.
                */}
                <span className={css.papeis}>
                  {m.role === "owner" ? (
                    <span className={css.papelDono}>{DONO_DA_PELADA}</span>
                  ) : (
                    <span className={css.papelMembro}>{NA_PELADA}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/*
          A LINHA QUE CUSTOU UMA AUDITORIA (D-1 do relatório de QA).

          O fundador viu a própria conta editando a pelada, convidando, removendo
          membro e vendo e-mail, e concluiu que um usuário comum tinha virado
          admin da Arena Vasco. Não tinha: dono de GRUPO e admin de ARENA são
          dois conjuntos de poderes, e o banco sempre soube a diferença. A tela é
          que não dizia nada. Agora diz — e diz as duas, quando as duas valem.
        */}
        {papel || papelArena ? (
          <p className={css.papelDoLeitor}>
            {papel === "owner" ? (
              <strong>{DONO_DA_PELADA}.</strong>
            ) : papel ? (
              <strong>{NA_PELADA}.</strong>
            ) : null}{" "}
            {papel === "owner"
              ? `Você organiza esta pelada: muda o horário, chama a galera e tira quem saiu. Isso vale só aqui dentro — a ${grupo.partner_display_name} continua sendo da arena.`
              : papel
                ? "Você joga nesta pelada. Quem a organiza muda o horário e chama a galera."
                : null}
            {papelArena ? (
              <>
                {" "}
                <strong>{ADMINISTRA_A_ARENA}.</strong> Câmera, botão e vídeos da{" "}
                {grupo.partner_display_name} ficam no{" "}
                <Link href={`/painel?arena=${arenaSlug}`}>painel</Link>.
              </>
            ) : null}
          </p>
        ) : null}
      </Secao>

      {/*
        SAIR fica aqui embaixo, depois dos membros, e nunca no cabeçalho. O
        cabeçalho é onde moram as ações que o produto QUER que aconteçam
        (convidar, compartilhar); a saída existe, é fácil de achar quem procura,
        e não disputa espaço com elas.

        O dono vê a saída dentro de "Arrumar o grupo", junto da explicação de
        quem assume depois — aqui ela apareceria sem esse contexto.
      */}
      {papel === "member" ? (
        <div className={css.saida}>
          <AcaoConfirmada
            pergunta={`Sair do ${grupo.name}? Você para de receber o resumo da rodada.`}
            confirmar="Sair"
            aoConfirmar={sairDoGrupoDaArena.bind(null, arenaSlug, groupSlug)}
            destino="/app/grupos"
          >
            Sair do grupo
          </AcaoConfirmada>
        </div>
      ) : null}

      <p className={css.aviso}>
        Este grupo organiza os lances por semana. Ele não restringe quem pode ver os vídeos —
        qualquer pessoa logada que saiba a arena e o horário encontra os mesmos lances.
      </p>
    </main>
    {/*
      A BARRA DE ABAS TAMBÉM AQUI. A página do grupo vive fora de `/app`, então
      ela não herdava o chassi do layout do atleta — e era exatamente por isso
      que ela virava beco. Quem não está logado não a recebe: para ele o pé da
      tela é o `CtaFixo` de entrar, e as abas levariam todas ao login.
    */}
    {sessao ? <BottomNav /> : null}
    </>
  );
}
