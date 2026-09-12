import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Camera, MapPin, MessageCircle, Search, Share2, Users } from "lucide-react";
import {
  Button,
  Card,
  ClipGrid,
  EmptyState,
  LoginGate,
  PartnerHeader,
  Secao,
  StatusDot,
  AvisoDeExemplo,
} from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { urlPublica } from "@/lib/storage";
import { CLIPES_BORRADOS_EXEMPLO, CLIPES_EXEMPLO } from "@/lib/fixtures";
import {
  contatosDoParceiro,
  lancesDeHojeNaArena,
  parceiroPorAlias,
  parceiroPublicoPorSlug,
  quadrasDoParceiro,
  type ParceiroPublicoRow,
} from "@/db/queries/parceiro";
import { gruposPublicosDaArena } from "@/db/queries/grupo";
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
    gruposPublicosDaArena(parceiro.id),
    contatosDoParceiro(parceiro.id),
    lancesDeHojeNaArena(parceiro.id, parceiro.timezone),
  ]);

  const abaAtiva: Aba = aba === "grupos" || aba === "sobre" ? aba : "lances";
  const local = [parceiro.city, parceiro.state].filter(Boolean).join(", ");
  const quadrasComCamera = quadras.filter((q) => q.tem_camera);
  const logo = parceiro.logo_object_key ? urlPublicaSegura(parceiro.logo_object_key) : null;

  const destinoDaBusca = `/app/buscar?arena=${parceiro.slug}`;
  const hrefDeLogin = `/entrar?redirectTo=${encodeURIComponent(destinoDaBusca)}&arena=${parceiro.slug}`;

  return (
    <main className={css.pagina} id="conteudo">
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
          {sessao ? (
            <>
              <div className={css.linhaTitulo}>
                <h2>Lances de hoje</h2>
                <span className="apoio-3 tempo">
                  {lancesHoje} {lancesHoje === 1 ? "lance" : "lances"}
                </span>
              </div>
              <AvisoDeExemplo o_que="As miniaturas abaixo" />
              <ClipGrid
                clipes={CLIPES_EXEMPLO}
                rotulo="Lances de hoje"
                vazio={
                  <EmptyState
                    icone={<Camera size={24} />}
                    titulo="Nenhum lance gravado hoje ainda"
                    descricao="Assim que alguém apertar o botão na quadra, o lance aparece aqui."
                  />
                }
              />
              <Button
                href={destinoDaBusca}
                tamanho={56}
                largura="total"
                icone={<Search size={20} />}
              >
                Buscar por horário
              </Button>
            </>
          ) : (
            <LoginGate
              lancesHoje={lancesHoje}
              amostra={CLIPES_BORRADOS_EXEMPLO}
              rodape={`A página da ${parceiro.display_name} é pública. O login só é pedido pra buscar, baixar e compartilhar vídeo.`}
            >
              <Button href={hrefDeLogin} tamanho={52} largura="total">
                Entrar pra liberar a busca
              </Button>
            </LoginGate>
          )}
        </section>
      ) : null}

      {abaAtiva === "grupos" ? (
        <section className={css.bloco}>
          <Secao titulo="Grupos desta arena">
            {grupos.length === 0 ? (
              <EmptyState
                icone={<Users size={24} />}
                titulo="Nenhum grupo público ainda"
                descricao="Joga sempre no mesmo horário? Depois de achar seus lances, salve o horário como grupo: o link fica fixo e os vídeos aparecem organizados por semana."
                acoes={
                  <Button href={sessao ? destinoDaBusca : hrefDeLogin} variante="secundario" largura="total">
                    Buscar meus lances
                  </Button>
                }
              />
            ) : (
              <ul className={css.listaGrupos}>
                {grupos.map((g) => (
                  <li key={g.id}>
                    <Card href={`/${parceiro.slug}/${g.slug}`} titulo={g.name}>
                      <p className="apoio tempo">
                        {g.start_time.slice(0, 5)}–{g.end_time.slice(0, 5)} · {g.member_count}{" "}
                        {g.member_count === 1 ? "membro" : "membros"}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </section>
      ) : null}

      {abaAtiva === "sobre" ? (
        <section className={css.bloco}>
          <Secao titulo="Onde fica">
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
            <Secao titulo="Contato">
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

          <Secao titulo="Quadras com câmera">
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
