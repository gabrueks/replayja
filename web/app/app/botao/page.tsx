import type { Viewport } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button, ClipGrid, EmptyState, StatusDot } from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import { COOLDOWN_QUADRA_MS } from "@/lib/limites";
import { dbConfigured } from "@/lib/db";
import { lerSaudeDaCamera } from "@/lib/saude-visao";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { clipesDaArena } from "@/db/queries/clipe";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import { saudeDasCameras } from "@/db/queries/saude";
import BotaoDaQuadra from "./BotaoDaQuadra";
import css from "./botao.module.css";

export const metadata = { title: "Marcou?", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * O botão virtual é a SEGUNDA tela escura do produto, e a barra do sistema vai
 * junto — senão o Android desenha `#F6F3EF` por cima de `#0F1419` e a emenda
 * denuncia "isto é um site dentro de um navegador".
 */
export const viewport: Viewport = { themeColor: "#0F1419" };

/** A janela de "esta pelada": as últimas duas horas na quadra escolhida. */
const PELADA_MS = 2 * 60 * 60 * 1000;

/**
 * `/app/botao?arena=…&quadra=…` — O BOTÃO VIRTUAL, tratado como tela-herói.
 *
 * ─── POR QUE UMA TELA INTEIRA ──────────────────────────────────────────────
 *
 * Ele era um círculo dentro de um card, entre um selo de status e um parágrafo —
 * o mesmo peso de tudo o mais na página. Mas é o único momento em que o produto
 * pede uma ação FÍSICA com urgência real: o gol acabou de sair, a janela são
 * segundos, e quem está com o celular na mão não vai ler. Escuro, brilho da
 * marca e 206px no centro: o alvo é achado sem olhar.
 *
 * O escuro não é estética. A tela é usada na beira da quadra, à noite — uma tela
 * branca de 6 polegadas na mão é um farol que cega quem acabou de olhar o jogo.
 * A barra inferior de abas some aqui (`BottomNav esconderEm` no layout): é tela
 * de uma ação só.
 *
 * ─── ELE É COMPLEMENTO DO BOTÃO FÍSICO, NÃO SUBSTITUTO ─────────────────────
 *
 * O botão da quadra continua sendo o principal (decisão 10 do design). Este aqui
 * é para quem está DE FORA: no banco, na mureta, filmando.
 *
 * ─── A QUADRA VEM POR SLUG, NUNCA POR ID ───────────────────────────────────
 *
 * O `courtId` que vai para `POST /api/triggers` é resolvido AQUI, a partir da
 * lista de quadras da arena. Um uuid na query string não escolhe quadra
 * nenhuma — e o gatilho ainda confere a quadra contra o parceiro por conta
 * própria, porque sem RLS a rota não pode confiar na tela.
 *
 * ─── O ESTADO DA CÂMERA APARECE ANTES DO TOQUE ─────────────────────────────
 *
 * `criarGatilho` recusa o lance quando a câmera está há mais de 60 s sem
 * segmento. Dizer isso ANTES vale mais que devolver um erro depois: a ação do
 * atleta ("avise a arena") é a mesma, e ele não perde o lance tentando.
 */
export default async function PaginaDoBotao({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string; quadra?: string }>;
}) {
  const sessao = await getSession();
  const { arena, quadra } = await searchParams;

  const parceiro =
    dbConfigured() && arena && ehSlugDeArena(arena) ? await parceiroPublicoPorSlug(arena) : null;

  if (!parceiro) {
    return (
      <main className={`${css.pagina} noite`} id="conteudo">
        <h1 className={css.titulo}>Qual quadra?</h1>
        <EmptyState
          ilustracao="camera"
          titulo="O botão é sempre de uma quadra."
          descricao="Abre a página da sua arena e volta por lá — a gente precisa saber qual câmera guardar."
          acoes={
            <Button href="/app" tamanho={56} largura="total">
              Escolher a arena
            </Button>
          }
        />
      </main>
    );
  }

  const [quadras, cameras] = await Promise.all([
    quadrasDoParceiro(parceiro.id),
    saudeDasCameras(parceiro.id).catch(() => []),
  ]);

  const escolhida =
    (quadra ? quadras.find((q) => q.slug === quadra) : undefined) ?? quadras[0] ?? null;

  // A MESMA leitura do painel, e não uma checagem à parte. A primeira versão
  // desta tela olhava `camera.status` direto e dizia "câmera gravando" junto com
  // "nenhum segmento recebido ainda" — duas frases que se desmentiam na mesma
  // caixa, porque o relay marca `degraded` assim que o gravador sobe, antes de
  // qualquer vídeo chegar. Duas leituras do mesmo estado sempre divergem; esta
  // mora em `lib/saude-visao.ts`, com teste.
  const camera = escolhida ? cameras.find((c) => c.court_slug === escolhida.slug) : undefined;
  const saude = camera ? lerSaudeDaCamera(camera) : null;
  const gravando = saude?.estado === "gravando" || saude?.estado === "instavel";

  // "Salvos nesta pelada": as últimas duas horas NA QUADRA escolhida. É a prova
  // de que os toques anteriores pegaram — sem ela, quem aperta três vezes numa
  // pelada não tem nenhum retorno acumulado, só três confirmações que somem.
  const agora = new Date();
  const linhas =
    escolhida && sessao
      ? await clipesDaArena(sessao, {
          partnerId: parceiro.id,
          courtId: escolhida.id,
          de: new Date(agora.getTime() - PELADA_MS),
          ate: agora,
          incluirProcessando: true,
        }).catch(() => [])
      : [];

  const salvos = linhas.map((l) =>
    clipeDeVisao(l, {
      timezone: parceiro.timezone,
      arenaSlug: parceiro.slug,
      marca: parceiro.display_name.toUpperCase(),
      agora,
    }),
  );

  return (
    <main className={`${css.pagina} noite`} id="conteudo">
      <header className={css.topo}>
        <Link
          className={css.redondo}
          href={`/app/buscar?arena=${parceiro.slug}`}
          aria-label="Voltar para a busca"
        >
          <ArrowLeft size={20} strokeWidth={2.4} aria-hidden="true" />
        </Link>
        <span className={css.tituloTopo}>
          <span className={css.arena}>{parceiro.display_name}</span>
          <span className={css.quadra}>
            {escolhida ? `${escolhida.name} · ${escolhida.sport}` : "Sem quadra"}
          </span>
        </span>
        <StatusDot
          status={saude?.ponto ?? "offline"}
          rotulo={gravando ? "AO VIVO" : (saude?.rotulo ?? "sem câmera")}
          pilula
        />
      </header>

      {quadras.length === 0 ? (
        <EmptyState
          ilustracao="camera"
          titulo="Esta arena ainda não tem quadra com câmera."
          descricao="O provisionamento é feito pela equipe do Replay já junto com a instalação."
        />
      ) : (
        <>
          {quadras.length > 1 ? (
            /*
              Links e não `Chip`: trocar de quadra é NAVEGAR (a URL passa a
              apontar para a outra quadra, e é essa URL que a arena cola no
              WhatsApp para cada quadra). O `Chip` do design system é um
              `<button aria-pressed>`, que é o certo para filtro em memória e o
              errado para destino.
            */
            <div className={css.faixaDeQuadras} role="group" aria-label="Quadra">
              {quadras.map((q) => (
                <Link
                  key={q.id}
                  className={[css.quadraLink, escolhida?.slug === q.slug ? css.quadraAtiva : null]
                    .filter(Boolean)
                    .join(" ")}
                  href={`/app/botao?arena=${parceiro.slug}&quadra=${q.slug}`}
                  aria-current={escolhida?.slug === q.slug ? "page" : undefined}
                >
                  {q.name}
                </Link>
              ))}
            </div>
          ) : null}

          {escolhida ? (
            <BotaoDaQuadra
              courtId={escolhida.id}
              quadra={escolhida.name}
              arena={parceiro.slug}
              cooldownSegundos={Math.round(COOLDOWN_QUADRA_MS / 1000)}
              disabled={!gravando}
              motivo={
                gravando
                  ? undefined
                  : saude?.estado === "aguardando"
                    ? "Esta câmera ainda não enviou nenhum segmento — ela foi cadastrada e nunca conectou. Enquanto não houver gravação o toque é recusado, e isso é de propósito: melhor dizer agora do que entregar um vídeo vazio em 30 segundos."
                    : `A câmera desta quadra está fora do ar. Avisa a arena — enquanto não houver gravação o toque é recusado.${
                        saude && !saude.relayOnline
                          ? " O relay também está sem sinal há mais de três minutos."
                          : ""
                      }`
              }
            />
          ) : null}

          {salvos.length > 0 ? (
            <section className={css.salvos}>
              <div className={css.salvosTopo}>
                <span className="rotulo">Salvos nesta pelada</span>
                <span className={`${css.salvosContagem} tempo`}>{salvos.length}</span>
              </div>
              <ClipGrid clipes={salvos.slice(0, 6)} rotulo="Salvos nesta pelada" denso />
            </section>
          ) : null}

          <p className={css.rodape}>
            O botão físico da quadra continua funcionando sempre, inclusive com o app fechado.{" "}
            <Link href={`/${parceiro.slug}`}>Ver a arena</Link>
          </p>
        </>
      )}
    </main>
  );
}
