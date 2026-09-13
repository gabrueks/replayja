import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CalendarPlus, Clock3, MapPin, Search, Share2 } from "lucide-react";
import {
  BottomNav,
  Button,
  Card,
  ClipGrid,
  CtaFixo,
  EmptyState,
  LoginGate,
  PartnerHeader,
  Secao,
  StatusDot,
  Voltar,
} from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import {
  ACHAR_LANCE,
  CRIAR_GRUPO,
  ENTRAR,
  ENTRAR_APOIO,
  VIRAR_GRUPO_CHAMADA,
  naPelada,
} from "@/lib/copy";
import { diasCurtos, faixaDeHorario } from "@/lib/datas";
import { dbConfigured } from "@/lib/db";
import { JANELA_MAX_MS } from "@/lib/limites";
import { palavra, plural } from "@/lib/plural";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { urlPublica } from "@/lib/storage";
import { CLIPES_BORRADOS_EXEMPLO } from "@/lib/fixtures";
import { clipesDaArena } from "@/db/queries/clipe";
import {
  contatosDoParceiro,
  lancesDeHojeNaArena,
  parceiroPorAlias,
  parceiroPublicoPorSlug,
  quadrasDoParceiro,
  type ParceiroPublicoRow,
} from "@/db/queries/parceiro";
import { gruposDaArenaParaUsuario } from "@/db/queries/grupo";
import { contatosParaLista, enderecoDaArena, linkDeMapa } from "./contatos";
import css from "./parceiro.module.css";

// `/[arenaSlug]` — A PÁGINA DO PARCEIRO.
//
// ─── É UMA LANDING PAGE, NÃO UM MURO ───────────────────────────────────────
//
// Ela carrega INTEIRA sem login, e isso é decisão de produto (`design/README.md`,
// decisão 1): é a página que a arena divulga, que entra no Instagram dela e que
// o atleta recebe no WhatsApp. O gate de login aparece na AÇÃO — buscar, baixar,
// compartilhar, criar grupo —, não na chegada. Um formulário de login na porta
// mataria a função de divulgação, que é metade do argumento de venda.
//
// O que o anônimo vê do acervo é uma GRADE BORRADA com contador ("132 lances
// gravados hoje"): mostra que existe conteúdo antes de pedir o e-mail, em vez de
// um formulário seco (decisão 2). Thumbnail nítido é a única superfície com
// imagem de pessoa sem login, e por isso fica atrás do gate.
//
// ─── AS ABAS SÃO `?aba=`, NÃO ESTADO DE CLIENTE ────────────────────────────
//
// Assim a arena manda "olha a aba Sobre" no WhatsApp, o botão voltar funciona e
// a página inteira continua sendo renderizada no servidor. Rota nenhuma muda: é
// a mesma `/[arenaSlug]`.
//
// ─── O CATCH-ALL OCUPA A RAIZ ──────────────────────────────────────────────
//
// Qualquer rota futura do sistema colide com um slug de arena (ADR §8). A
// validação abaixo e a lista de `lib/reserved-slugs.ts` são o que impede isso.

export const revalidate = 300;

type Aba = "lances" | "grupos" | "sobre";

type Props = {
  params: Promise<{ arenaSlug: string }>;
  searchParams: Promise<{ aba?: string }>;
};

async function carregar(arenaSlug: string): Promise<ParceiroPublicoRow | null> {
  if (!ehSlugDeArena(arenaSlug)) return null;
  // Sem banco (preview novo, máquina recém-clonada) a página não quebra: some.
  if (!dbConfigured()) return null;
  return parceiroPublicoPorSlug(arenaSlug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { arenaSlug } = await params;
  const p = await carregar(arenaSlug);
  if (!p) return { title: "Arena não encontrada" };

  const og = p.og_image_object_key ? urlPublicaSegura(p.og_image_object_key) : null;
  const local = [p.city, p.state].filter(Boolean).join(" · ");

  return {
    title: p.display_name,
    description:
      p.tagline ??
      `Veja os lances gravados na ${p.display_name}${local ? ` em ${local}` : ""}. Encontre pelo horário e mande no grupo.`,
    alternates: { canonical: `/${p.slug}` },
    openGraph: {
      type: "website",
      title: p.display_name,
      description: p.tagline ?? `Os lances da ${p.display_name}, gravados e prontos para compartilhar.`,
      url: `/${p.slug}`,
      locale: "pt_BR",
      // A imagem QUE A ARENA ENVIOU vence sempre: ela é produzida na ingestão e
      // não custa transformação em runtime (ADR §4.1 e §8). Quando não existe,
      // `opengraph-image.tsx` desenha a identidade — e o Next injeta sozinho,
      // porque aqui não declaramos `images`.
      ...(og ? { images: [{ url: og, width: 1200, height: 630 }] } : {}),
    },
  };
}

function urlPublicaSegura(objectKey: string): string | null {
  try {
    return urlPublica(objectKey);
  } catch {
    return null;
  }
}

function iniciaisDe(nome: string): string {
  const partes = nome.split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "A";
  const b = partes.length > 1 ? (partes[1]?.[0] ?? "") : (partes[0]?.[1] ?? "");
  return (a + b).toUpperCase();
}

export default async function PaginaDoParceiro({ params, searchParams }: Props) {
  const { arenaSlug } = await params;
  const { aba } = await searchParams;

  const parceiro = await carregar(arenaSlug);

  if (!parceiro) {
    // Slug antigo → 308 permanente para o atual. Um link impresso em banner na
    // quadra não pode quebrar quando a arena muda de nome.
    if (dbConfigured() && ehSlugDeArena(arenaSlug)) {
      const alias = await parceiroPorAlias(arenaSlug);
      if (alias) permanentRedirect(`/${alias.slug}`);
    }
    notFound();
  }

  const sessao = await getSession();
  const [quadras, grupos, contatos, lancesHoje] = await Promise.all([
    quadrasDoParceiro(parceiro.id),
    // Inclui os `unlisted` de QUEM ESTÁ OLHANDO: um grupo criado pelo atleta
    // nasce `unlisted` e some da aba pública — mas quem está nele chegou por
    // aqui e precisa reencontrá-lo por aqui.
    gruposDaArenaParaUsuario(sessao, parceiro.id),
    contatosDoParceiro(parceiro.id),
    lancesDeHojeNaArena(parceiro.id, parceiro.timezone),
  ]);

  // ─── A ABA "LANCES" É A ÚLTIMA JANELA DE 6 HORAS, NÃO "O DIA TODO" ───────
  //
  // Seis horas é o teto da consulta central, e ele é controle de PRIVACIDADE,
  // não limitação técnica (`api/README.md` §3): nunca existe "listar todos os
  // lances da arena". Pedir "hoje" a partir da meia-noite local estouraria o
  // teto às 06:01 e a aba voltaria 422 — então a aba mostra a janela que cabe, e
  // o resto sai pela busca por horário, que é onde o atleta escolhe o intervalo.
  const agora = new Date();
  const linhas =
    sessao
      ? await clipesDaArena(sessao, {
          partnerId: parceiro.id,
          de: new Date(agora.getTime() - JANELA_MAX_MS),
          ate: agora,
          incluirProcessando: true,
        })
      : [];

  const clipes = linhas.map((l) =>
    clipeDeVisao(l, {
      timezone: parceiro.timezone,
      arenaSlug: parceiro.slug,
      marca: parceiro.display_name.toUpperCase(),
      agora,
    }),
  );

  const abaAtiva: Aba = aba === "grupos" || aba === "sobre" ? aba : "lances";
  const local = [parceiro.city, parceiro.state].filter(Boolean).join(", ");
  const quadrasComCamera = quadras.filter((q) => q.tem_camera);
  const logo = parceiro.logo_object_key ? urlPublicaSegura(parceiro.logo_object_key) : null;
  /*
   * A capa da arena ainda não tem campo próprio no cadastro (o upload é a task
   * C9). Até lá a imagem de Open Graph é a única arte que a arena envia, e ela
   * serve: é 1200×630 da própria quadra. Sem nenhuma das duas, `PartnerHeader`
   * desenha a quadra à noite com `ArteQuadra`.
   */
  const capa = parceiro.og_image_object_key
    ? urlPublicaSegura(parceiro.og_image_object_key)
    : null;
  /*
   * BUG CORRIGIDO: a marca d'água da prévia deslogada.
   *
   * A amostra da grade borrada vem de `lib/fixtures.ts`, e a fixture carrega
   * "ARENA CALABOUÇO" queimada dentro dela — então a página da Arena Vasco
   * exibia, borrada mas legível, a marca de OUTRA arena. `LoginGate` agora
   * recebe a marca de QUEM está sendo visto e sobrescreve o que vier na amostra.
   */
  const marcaDaArena = parceiro.display_name.toUpperCase();

  const endereco = enderecoDaArena(contatos);
  const contatosDaLista = contatosParaLista(contatos);
  /*
    `opening_hours` mora em `partner_branding` e a consulta pública ainda não o
    projeta (`db/queries/parceiro.ts` é de outro agente nesta leva). O campo está
    aqui, resolvendo para `null`, para que ligar a seção seja uma linha — e para
    que a pendência fique visível no código, e não só no relatório.
  */
  const horarios: string | null =
    (parceiro as { opening_hours?: string | null }).opening_hours?.trim() || null;

  const destinoDaBusca = `/app/buscar?arena=${parceiro.slug}`;
  const destinoDoGrupoNovo = `/${parceiro.slug}/grupos/novo`;
  const hrefDeLogin = `/entrar?redirectTo=${encodeURIComponent(destinoDaBusca)}&arena=${parceiro.slug}`;

  return (
    <>
    {/*
      O pé da tela é a barra de abas para quem está logado e o CTA de entrar para
      quem não está — nunca os dois. A RESERVA de espaço de cada um vem com ele
      (`RodapeFixo`): esta página não declara mais nada sobre o rodapé, e foi
      justamente a classe que ela declarava que o módulo derrubava (P0-1).
    */}
    <main className={css.pagina} id="conteudo">
      <PartnerHeader
        nome={parceiro.display_name}
        /*
          O `<h1>` DA PÁGINA PÚBLICA MAIS IMPORTANTE DO PRODUTO (achado P1-18).
          Ela não tinha nenhum: o nome da arena era um `<span>` e todo o conteúdo
          começava em `<h2>` — na página que a arena divulga no Instagram dela.
        */
        comoTitulo
        iniciais={iniciaisDe(parceiro.display_name)}
        /*
          O SUBTÍTULO DIZ O QUE A ARENA É, e não quantas quadras ela tem (achado
          P2-40): "2 quadras" aparecia no selo de estado, no subtítulo E na aba
          Sobre — a mesma informação três vezes na mesma tela. Aqui fica o
          tagline, que é o que a arena escreveu sobre si mesma, e a cidade.
        */
        subtitulo={[parceiro.tagline, local || null].filter(Boolean).join(" · ") || undefined}
        logoUrl={logo}
        capaUrl={capa}
        semente={parceiro.slug}
        href={`/${parceiro.slug}`}
        /*
          A SAÍDA — e ela existe mesmo DESLOGADO (UX-1 do README §13).

          Esta era a única tela do produto sem barra e sem voltar: quem chegava
          pelo Instagram da arena e não queria entrar não tinha para onde ir. A
          barra de quatro abas continua fora do caso deslogado de propósito (as
          quatro levariam ao login, o que é pior que não tê-las), mas o `Voltar`
          serve aos dois: quando há tela nossa atrás ele volta, e quando a pessoa
          caiu direto do WhatsApp ele leva a `/app` (logada) ou a `/`, a home
          pública, que é onde o produto se explica.
        */
        voltar={
          <Voltar
            para={sessao ? "/app" : "/"}
            rotulo={sessao ? "Voltar para as arenas" : "Voltar para o Replay já"}
            tom="escuro"
          />
        }
        estado={
          quadrasComCamera.length > 0 ? (
            /*
              O SELO DIZ O ESTADO, e o tagline diz o que a arena É (achado
              P2-40). Antes os dois diziam "2 quadras", e a aba Sobre dizia uma
              terceira vez.
            */
            <StatusDot
              status="online"
              rotulo={`${plural(quadrasComCamera.length, "quadra", "quadras")} gravando`}
              pilula
            />
          ) : null
        }
        acoes={
          <Button
            href={`/${parceiro.slug}`}
            variante="secundario"
            tamanho={44}
            icone={<Share2 size={16} />}
            className={css.acaoDaCapa}
          >
            Compartilhar
          </Button>
        }
        abas={[
          { id: "lances", rotulo: "Lances", href: `/${parceiro.slug}` },
          {
            id: "grupos",
            rotulo: "Grupos",
            href: `/${parceiro.slug}?aba=grupos`,
            contagem: grupos.length,
          },
          { id: "sobre", rotulo: "Sobre", href: `/${parceiro.slug}?aba=sobre` },
        ]}
        abaAtiva={abaAtiva}
      />

      {abaAtiva === "lances" ? (
        <section className={css.bloco}>
          {/*
            O CONTADOR É A PRIMEIRA COISA DA ABA, logado ou não: "4 lances
            gravados hoje" em 34px na cor de ação responde, antes de qualquer
            miniatura, a pergunta que trouxe a pessoa aqui. Ele conta o clipe que
            ainda está sendo cortado — ver `lancesDeHojeNaArena`.
          */}
          <p className={css.contador}>
            <span className={`${css.contadorNumero} tempo`}>{lancesHoje}</span>
            <span className={css.contadorRotulo}>
              {palavra(lancesHoje, "lance gravado hoje", "lances gravados hoje")}
            </span>
          </p>

          {sessao ? (
            <>
              <ClipGrid
                clipes={clipes}
                rotulo="Últimos lances"
                vazio={
                  <EmptyState
                    ilustracao="botao"
                    titulo="Nada nas últimas horas."
                    descricao="A câmera está lá, mas ninguém apertou o botão nessa janela. Pra horários mais antigos, é pela busca."
                    acoes={
                      <Button
                        href={destinoDaBusca}
                        variante="preto"
                        largura="total"
                        icone={<Search size={18} />}
                      >
                        {ACHAR_LANCE}
                      </Button>
                    }
                  />
                }
              />
              {clipes.length > 0 ? (
                <Button
                  href={destinoDaBusca}
                  tamanho={56}
                  largura="total"
                  icone={<Search size={20} />}
                >
                  {ACHAR_LANCE}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {/*
                Os HORÁRIOS com lance não aparecem aqui, e o artboard mostrava.
                Não é esquecimento: o contador é uma contagem agregada, mas uma
                lista de horários ("20:47, 20:51, 21:03") diz a qualquer um que
                passou alguém naquela quadra naquele minuto — e a regra do
                produto é que nada que aponte para um vídeo específico existe sem
                login (`api/README.md` §3). Ficou registrado como pendência em
                `web/docs/design-system.md`.
              */}
              <LoginGate amostra={CLIPES_BORRADOS_EXEMPLO} marca={marcaDaArena}>
                <p className={css.rodapeDoGate}>
                  A página da {parceiro.display_name} é pública. O login só é pedido pra ver,
                  baixar e compartilhar vídeo.
                </p>
              </LoginGate>

              {/*
                A AÇÃO SAIU DO SCROLL. Ela ficava dentro do card de prévia e
                sumia assim que a pessoa descia para ver os horários — ou seja,
                sumia exatamente quando ela estava convencida.
              */}
              <CtaFixo apoio={ENTRAR_APOIO}>
                <Button href={hrefDeLogin} tamanho={56} largura="total">
                  {ENTRAR}
                </Button>
              </CtaFixo>
            </>
          )}
        </section>
      ) : null}

      {abaAtiva === "grupos" ? (
        <section className={css.bloco}>
          <Secao
            titulo={<span className="rotulo">Grupos desta arena</span>}
            acao={
              sessao ? (
                <Button href={destinoDoGrupoNovo} variante="fantasma" tamanho={44}>
                  Criar grupo
                </Button>
              ) : null
            }
          >
            {grupos.length === 0 ? (
              <EmptyState
                ilustracao="apito"
                titulo={VIRAR_GRUPO_CHAMADA}
                descricao="Vira grupo e os lances chegam sozinhos: link fixo, vídeos separados por rodada e a galera entra por um convite."
                acoes={
                  <Button
                    href={
                      sessao
                        ? destinoDoGrupoNovo
                        : `/entrar?redirectTo=${encodeURIComponent(destinoDoGrupoNovo)}&arena=${parceiro.slug}`
                    }
                    variante="preto"
                    largura="total"
                    icone={<CalendarPlus size={18} />}
                  >
                    {CRIAR_GRUPO}
                  </Button>
                }
                nota={
                  <>
                    Ainda não sabe o horário exato?{" "}
                    <Link href={sessao ? destinoDaBusca : hrefDeLogin}>Acha seus lances</Link> e
                    salva dali — quadra, dia e horário já vão preenchidos.
                  </>
                }
              />
            ) : (
              <>
                <ul className={css.listaGrupos}>
                  {grupos.map((g) => (
                    <li key={g.id}>
                      <Card href={`/${parceiro.slug}/${g.slug}`} titulo={g.name}>
                        {/*
                          UMA PALAVRA POR CONTAGEM (achado P1-13): esta linha
                          dizia "1 membro" enquanto a página do grupo dizia "1 na
                          pelada" para o mesmo número.
                        */}
                        <p className="apoio tempo">
                          {diasCurtos(g.weekdays)} ·{" "}
                          {faixaDeHorario(g.start_time, g.end_time)} · {naPelada(g.member_count)}
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
                <Button
                  href={
                    sessao
                      ? destinoDoGrupoNovo
                      : `/entrar?redirectTo=${encodeURIComponent(destinoDoGrupoNovo)}&arena=${parceiro.slug}`
                  }
                  variante="secundario"
                  largura="total"
                  icone={<CalendarPlus size={18} />}
                >
                  {CRIAR_GRUPO}
                </Button>
              </>
            )}
          </Secao>
        </section>
      ) : null}

      {abaAtiva === "sobre" ? (
        <section className={css.bloco}>
          {/*
            ONDE FICA DIZ ONDE FICA (achado P2-40). Esta seção mostrava a cidade
            ("São Paulo, SP", sem rua) e repetia o tagline ao lado — ou seja, a
            seção do endereço não dava o endereço, e dava pela terceira vez uma
            informação que o selo e o subtítulo já tinham dado.

            O endereço existe no banco como `contact_kind = 'address'`; o que
            faltava era ir buscá-lo e transformá-lo em link para o mapa.
          */}
          <Secao titulo={<span className="rotulo">Onde fica</span>}>
            <Card>
              {endereco ? (
                <a
                  className={css.linhaInfo}
                  href={linkDeMapa(endereco.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin size={18} aria-hidden="true" />
                  <span>
                    <strong>{endereco.value}</strong>
                    {local ? <span className="apoio-3"> · {local}</span> : null}
                  </span>
                </a>
              ) : (
                <p className={css.linhaInfo}>
                  <MapPin size={18} aria-hidden="true" />
                  <span>
                    {local || "Endereço não informado"}
                    {local ? (
                      <span className="apoio-3"> · a arena ainda não cadastrou a rua</span>
                    ) : null}
                  </span>
                </p>
              )}
            </Card>
          </Secao>

          {/*
            O CONTATO É DA ARENA, E É CLICÁVEL (achado P1-19).

            Antes esta lista mostrava `contato@replayja.com.br` — o nosso e-mail,
            rotulado "Contato do piloto" — e renderizava telefone, WhatsApp e
            Instagram como TEXTO MORTO dentro de um `<li>`. Os três já estavam no
            banco. É o que a arena compra quando compra a página.
          */}
          {contatosDaLista.length > 0 ? (
            <Secao titulo={<span className="rotulo">Falar com a arena</span>}>
              <ul className={css.listaSimples}>
                {contatosDaLista.map((c) => {
                  const conteudo = (
                    <>
                      <c.Icone size={18} aria-hidden="true" />
                      <span>
                        <strong>{c.texto}</strong>
                        <span className="apoio-3"> · {c.rotulo}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={c.chave}>
                      {c.href ? (
                        <a
                          className={css.linhaInfo}
                          href={c.href}
                          {...(c.externo
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                        >
                          {conteudo}
                        </a>
                      ) : (
                        <span className={css.linhaInfo}>{conteudo}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Secao>
          ) : null}

          {/*
            OS HORÁRIOS. `partner_branding.opening_hours` é texto livre escrito
            pela arena no painel (migração 0011) — só que `parceiroPublicoPorSlug`
            não o seleciona, e a consulta é de outro dono nesta leva. Quando a
            coluna chegar à página, esta seção liga sozinha.
          */}
          {horarios ? (
            <Secao titulo={<span className="rotulo">Horários</span>}>
              <Card>
                <p className={css.linhaInfo}>
                  <Clock3 size={18} aria-hidden="true" />
                  <span className={css.horarios}>{horarios}</span>
                </p>
              </Card>
            </Secao>
          ) : null}

          <Secao titulo={<span className="rotulo">Quadras com câmera</span>}>
            {quadras.length === 0 ? (
              <p className="apoio">Nenhuma quadra cadastrada nesta arena ainda.</p>
            ) : (
              <ul className={css.listaSimples}>
                {quadras.map((q) => (
                  <li key={q.id} className={css.quadra}>
                    <span>
                      <strong>{q.name}</strong>
                      <span className="apoio-3"> · {q.sport}</span>
                    </span>
                    {q.tem_camera ? (
                      <StatusDot status="online" rotulo="com câmera" />
                    ) : (
                      <StatusDot status="offline" rotulo="sem câmera" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          <p className={css.aviso}>
            Esta quadra é filmada. Os vídeos saem com a marca da {parceiro.display_name}. Saiba
            como tratamos as imagens na <Link href="/privacidade">Política de Privacidade</Link>.
          </p>
        </section>
      ) : null}
    </main>
    {/*
      A BARRA DE ABAS NA PÁGINA DA ARENA — e ela é a metade estrutural do bug 6.
      Esta página é o destino para onde três telas mandavam quem apertava
      "voltar" (o player, o grupo, o criar grupo), e ela não tinha chassi nenhum:
      chegar aqui era chegar a um beco. Agora quem está logado sempre tem as
      quatro abas no pé.

      Deslogado continua sem barra: o pé da tela é o `CtaFixo` de entrar, e as
      quatro abas levariam todas ao login — o que é pior que não tê-las.
    */}
    {sessao ? <BottomNav /> : null}
    </>
  );
}
