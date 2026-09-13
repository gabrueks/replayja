import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CalendarPlus, MapPin, MessageCircle, Search, Share2 } from "lucide-react";
import {
  Button,
  Card,
  ClipGrid,
  CtaFixo,
  EmptyState,
  LoginGate,
  PartnerHeader,
  Secao,
  StatusDot,
} from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { JANELA_MAX_MS } from "@/lib/limites";
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

const DIAS_CURTOS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

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

  const destinoDaBusca = `/app/buscar?arena=${parceiro.slug}`;
  const destinoDoGrupoNovo = `/${parceiro.slug}/grupos/novo`;
  const hrefDeLogin = `/entrar?redirectTo=${encodeURIComponent(destinoDaBusca)}&arena=${parceiro.slug}`;

  return (
    <main className={`${css.pagina} ${sessao ? "" : "com-cta"}`} id="conteudo">
      <PartnerHeader
        nome={parceiro.display_name}
        iniciais={iniciaisDe(parceiro.display_name)}
        subtitulo={
          parceiro.tagline ??
          [
            quadras.length > 0 ? `${quadras.length} quadras` : null,
            local || null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
        logoUrl={logo}
        capaUrl={capa}
        semente={parceiro.slug}
        href={`/${parceiro.slug}`}
        estado={
          quadrasComCamera.length > 0 ? (
            <StatusDot
              status="online"
              rotulo={`${quadrasComCamera.length} ${quadrasComCamera.length === 1 ? "quadra gravando" : "quadras gravando"}`}
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
              {lancesHoje === 1 ? "lance gravado hoje" : "lances gravados hoje"}
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
                        Bora achar seu lance
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
                  Bora achar seu lance
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
              <CtaFixo apoio="Leva 20 segundos. Sem senha, sem cadastro.">
                <Button href={hrefDeLogin} tamanho={56} largura="total">
                  Entrar pra ver meus lances
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
                titulo="Joga toda semana aqui?"
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
                    Criar o grupo da minha pelada
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
                        <p className="apoio tempo">
                          {g.weekdays.map((d) => DIAS_CURTOS[d]).filter(Boolean).join(", ")} ·{" "}
                          {g.start_time.slice(0, 5)}–{g.end_time.slice(0, 5)} · {g.member_count}{" "}
                          {g.member_count === 1 ? "membro" : "membros"}
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
                  Criar um grupo
                </Button>
              </>
            )}
          </Secao>
        </section>
      ) : null}

      {abaAtiva === "sobre" ? (
        <section className={css.bloco}>
          <Secao titulo={<span className="rotulo">Onde fica</span>}>
            <Card>
              <p className={css.linhaInfo}>
                <MapPin size={18} aria-hidden="true" />
                <span>
                  {local || "Endereço não informado"}
                  {parceiro.tagline ? <span className="apoio-3"> · {parceiro.tagline}</span> : null}
                </span>
              </p>
            </Card>
          </Secao>

          {contatos.length > 0 ? (
            <Secao titulo={<span className="rotulo">Contato</span>}>
              <ul className={css.listaSimples}>
                {contatos.map((c) => (
                  <li key={`${c.kind}:${c.value}`} className={css.linhaInfo}>
                    <MessageCircle size={18} aria-hidden="true" />
                    <span>
                      <strong>{c.value}</strong>
                      <span className="apoio-3"> · {c.label ?? c.kind}</span>
                    </span>
                  </li>
                ))}
              </ul>
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
  );
}
