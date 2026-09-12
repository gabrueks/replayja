import { Camera } from "lucide-react";
import { Button, ClipGrid, EmptyState } from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { agoraNaArena, instanteNaArena } from "@/lib/fuso";
import { JANELA_MAX_MS } from "@/lib/limites";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { clipesDaArena } from "@/db/queries/clipe";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import FormularioDeBusca from "./FormularioDeBusca";
import css from "./buscar.module.css";

export const metadata = { title: "Buscar lances", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/buscar` — a busca por horário, agora contra `clip` de verdade.
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
 * o celular esteja em Lisboa. Sem isso, "agora" no aparelho de alguém em outro
 * fuso buscaria um horário em que ninguém jogou.
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

  const parceiro =
    dbConfigured() && arena && ehSlugDeArena(arena) ? await parceiroPublicoPorSlug(arena) : null;

  const quadras = parceiro ? await quadrasDoParceiro(parceiro.id) : [];
  const fuso = parceiro?.timezone ?? "America/Sao_Paulo";
  const relogio = agoraNaArena(fuso);

  // A quadra chega por SLUG e é resolvida contra a lista da arena. O id nunca
  // vem da URL: um uuid arbitrário na query string não pode escolher a quadra,
  // porque a lista já está escopada ao parceiro.
  const quadraEscolhida = quadra ? quadras.find((q) => q.slug === quadra) : undefined;

  const pediuBusca = Boolean(parceiro && data && de && ate);
  const janela =
    pediuBusca && data && de && ate
      ? { de: instanteNaArena(data, de, fuso), ate: instanteNaArena(data, ate, fuso) }
      : null;

  const janelaValida =
    janela !== null &&
    janela.ate.getTime() > janela.de.getTime() &&
    janela.ate.getTime() - janela.de.getTime() <= JANELA_MAX_MS;

  const linhas =
    parceiro && janela && janelaValida
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

  const clipes = parceiro
    ? linhas.map((l) =>
        clipeDeVisao(l, {
          timezone: fuso,
          arenaSlug: parceiro.slug,
          marca: parceiro.display_name.toUpperCase(),
        }),
      )
    : [];

  const nomeDaQuadra = quadraEscolhida?.name ?? "todas as quadras";

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <h1 className={css.titulo}>Buscar lances</h1>
        <p className="apoio">
          {parceiro ? (
            <>
              {parceiro.display_name} · escolha a quadra e o horário. O intervalo máximo é de 6
              horas.
            </>
          ) : (
            <>
              Abra a busca pela página da sua arena para filtrar por quadra. O intervalo máximo é
              de 6 horas.
            </>
          )}
        </p>
      </header>

      {parceiro ? (
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
      ) : (
        <EmptyState
          icone={<Camera size={24} />}
          titulo="Escolha uma arena"
          descricao="A busca é sempre dentro de uma arena. Abra a página da sua arena e toque em “Buscar por horário”."
          acoes={
            <Button href="/app" variante="secundario" largura="total">
              Voltar
            </Button>
          }
        />
      )}

      {pediuBusca && parceiro ? (
        <section className={css.resultado}>
          <div className={css.resultadoTopo}>
            <h2 className={css.resultadoTitulo}>
              {clipes.length} {clipes.length === 1 ? "lance" : "lances"}
            </h2>
            <span className="apoio-3 tempo">
              {nomeDaQuadra} · {de}–{ate}
            </span>
          </div>

          {!janelaValida ? (
            <EmptyState
              icone={<Camera size={24} />}
              titulo="Intervalo inválido"
              descricao="O fim precisa vir depois do início, e a busca cobre no máximo 6 horas de uma vez."
            />
          ) : (
            <ClipGrid
              clipes={clipes}
              rotulo="Lances encontrados"
              vazio={
                <EmptyState
                  icone={<Camera size={24} />}
                  titulo="Nenhum lance nesse horário"
                  descricao={`Nenhum acionamento do botão em ${nomeDaQuadra} entre ${de} e ${ate}.`}
                  nota="Achou que devia ter lance aqui? Fale com a arena: o botão da quadra pode ter ficado sem bateria."
                />
              }
            />
          )}
        </section>
      ) : null}
    </main>
  );
}
