import { Button } from "@/components/ui";
import { botoesDoPainel } from "@/db/queries/gatilho";
import { quadrasDoPainel } from "@/db/queries/painel-quadras";
import { saudeDasCameras } from "@/db/queries/saude";
import EstadoDaArena from "../_components/EstadoDaArena";
import Quadras from "../_components/Quadras";
import { comArena, resolverArena } from "../_lib/arena";
import css from "../painel.module.css";

export const metadata = { title: "Quadras", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/painel/quadras` — o inventário que a arena mantém sozinha.
 *
 * A lista de câmeras vem de `saudeDasCameras` e não de uma consulta nova: ela já
 * é a projeção sem segredo (não traz chave de transmissão), e o que esta tela
 * precisa é só nome e quadra atual.
 */
export default async function PaginaDeQuadras({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;
  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Quadras" />;

  const { parceiro, papel } = resolucao;
  const [quadras, cameras, botoes] = await Promise.all([
    quadrasDoPainel(parceiro.id),
    saudeDasCameras(parceiro.id),
    botoesDoPainel(parceiro.id),
  ]);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Quadras</h1>
          <p className={css.subtitulo}>Quadra, câmera e botão — o inventário que a arena mantém sozinha.</p>
        </div>
        <Button href={comArena("/painel", parceiro.slug)} variante="secundario" tamanho={44}>
          Visão geral
        </Button>
      </header>

      <Quadras
        arenaSlug={parceiro.slug}
        quadras={quadras}
        cameras={cameras.map((c) => ({ id: c.id, name: c.name, court_id: c.court_id }))}
        botoes={botoes.map((b) => ({ id: b.id, label: b.label, court_id: b.court_id }))}
        // `viewer` vê tudo e não muda nada. É o papel de quem acompanha (o dono
        // que delegou a operação), e esconder os botões é mais honesto que
        // mostrá-los para receber 403 no clique.
        podeEditar={papel !== "viewer"}
      />
    </main>
  );
}
