import Link from "next/link";
import { Camera, Search } from "lucide-react";
import { Button, Card, EmptyState, Secao, StatusDot } from "@/components/ui";
import { COOLDOWN_QUADRA_MS } from "@/lib/limites";
import { dbConfigured } from "@/lib/db";
import { lerSaudeDaCamera } from "@/lib/saude-visao";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import { saudeDasCameras } from "@/db/queries/saude";
import BotaoDaQuadra from "./BotaoDaQuadra";
import css from "./botao.module.css";

export const metadata = { title: "Botão da quadra", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/botao?arena=…&quadra=…` — O BOTÃO VIRTUAL, de verdade.
 *
 * ─── ELE É COMPLEMENTO DO BOTÃO FÍSICO, NÃO SUBSTITUTO ─────────────────────
 *
 * O botão da quadra continua sendo o principal (decisão 10 do design). Este aqui
 * é para quem está DE FORA: no banco, na mureta, filmando. No piloto ele é
 * também a forma de testar o pipeline inteiro sem depender do hardware chegar.
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
      <main className={css.pagina} id="conteudo">
        <h1 className={css.titulo}>Botão da quadra</h1>
        <EmptyState
          icone={<Camera size={24} />}
          titulo="Escolha a arena"
          descricao="O botão virtual é sempre de uma quadra específica. Abra a página da sua arena e volte por lá."
          acoes={
            <Button href="/app" variante="secundario" largura="total">
              Voltar
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

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <h1 className={css.titulo}>Botão da quadra</h1>
        <p className="apoio">
          {parceiro.display_name} · o toque salva os últimos 22 segundos da quadra escolhida.
        </p>
      </header>

      {quadras.length === 0 ? (
        <EmptyState
          icone={<Camera size={24} />}
          titulo="Esta arena ainda não tem quadras cadastradas"
          descricao="O provisionamento é feito pela equipe do Replay já junto com a instalação."
        />
      ) : (
        <>
          <div className={css.grupo}>
            <span className="rotulo">Quadra</span>
            {/*
              Links e não `Chip`: trocar de quadra é NAVEGAR (a URL passa a
              apontar para a outra quadra, e é essa URL que a arena cola no
              WhatsApp para cada quadra). O `Chip` do design system é um
              `<button aria-pressed>`, que é o certo para filtro em memória e o
              errado para destino.
            */}
            <div className={css.faixaDeQuadras} role="group" aria-label="Quadra">
              {quadras.map((q) => (
                <Link
                  key={q.id}
                  className={[
                    css.quadraLink,
                    escolhida?.slug === q.slug ? css.quadraAtiva : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  href={`/app/botao?arena=${parceiro.slug}&quadra=${q.slug}`}
                  aria-current={escolhida?.slug === q.slug ? "page" : undefined}
                >
                  {q.name}
                </Link>
              ))}
            </div>
          </div>

          <Card variante="painel">
            <div className={css.estadoCamera}>
              <StatusDot
                status={saude?.ponto ?? "offline"}
                rotulo={saude?.rotulo ?? "sem câmera nesta quadra"}
                pilula
              />
              <span className="apoio-3 tempo">
                {!saude || saude.ultimoSegmento === "nunca"
                  ? "nenhum segmento recebido ainda"
                  : `último segmento ${saude.ultimoSegmento}`}
              </span>
            </div>

            {escolhida ? (
              <BotaoDaQuadra
                courtId={escolhida.id}
                quadra={escolhida.name}
                arena={parceiro.slug}
                cooldownSegundos={Math.round(COOLDOWN_QUADRA_MS / 1000)}
              />
            ) : null}

            {!gravando ? (
              <p className={css.aviso}>
                {saude?.estado === "aguardando"
                  ? "Esta câmera ainda não enviou nenhum segmento — ela foi cadastrada e nunca conectou. Enquanto não houver gravação, o toque é recusado, e isso é de propósito: melhor dizer agora do que entregar um vídeo vazio em 30 segundos."
                  : "A câmera desta quadra está fora do ar. Avise a arena: o toque vai ser recusado enquanto não houver gravação."}
                {saude && !saude.relayOnline
                  ? " O relay também está sem sinal há mais de três minutos."
                  : ""}
              </p>
            ) : null}
          </Card>

          <Secao titulo="Depois de salvar">
            <p className="apoio">
              O lance aparece na busca em poucos segundos, primeiro como
              &ldquo;processando&rdquo; e depois pronto para assistir.
            </p>
            <Button
              href={`/app/buscar?arena=${parceiro.slug}${escolhida ? `&quadra=${escolhida.slug}` : ""}`}
              variante="secundario"
              largura="total"
              icone={<Search size={18} />}
            >
              Buscar os lances de agora
            </Button>
            <p className="apoio-3">
              Entrou como {sessao?.email}. O botão físico da quadra continua funcionando sempre,
              inclusive com o app fechado. <Link href={`/${parceiro.slug}`}>Ver a arena</Link>
            </p>
          </Secao>
        </>
      )}
    </main>
  );
}
