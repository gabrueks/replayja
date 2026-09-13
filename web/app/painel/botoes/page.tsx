import { Button } from "@/components/ui";
import { botoesDoPainel } from "@/db/queries/gatilho";
import { quadrasDoPainel } from "@/db/queries/painel-quadras";
import Botoes from "../_components/Botoes";
import EstadoDaArena from "../_components/EstadoDaArena";
import { comArena, resolverArena } from "../_lib/arena";
import css from "../painel.module.css";

export const metadata = { title: "Botões", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** `/painel/botoes` — os gatilhos físicos da arena, por quadra. */
export default async function PaginaDeBotoes({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;
  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Botões" />;

  const { parceiro, papel } = resolucao;
  const [botoes, quadras] = await Promise.all([
    botoesDoPainel(parceiro.id),
    quadrasDoPainel(parceiro.id),
  ]);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Botões</h1>
          <p className={css.subtitulo}>Os gatilhos de cada quadra: último sinal, pilha e contagem.</p>
        </div>
        <Button href={comArena("/painel", parceiro.slug)} variante="secundario" tamanho={44}>
          Visão geral
        </Button>
      </header>

      <Botoes
        arenaSlug={parceiro.slug}
        botoes={botoes}
        quadras={quadras.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
        podeEditar={papel !== "viewer"}
      />
    </main>
  );
}
