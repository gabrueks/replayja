import { Button } from "@/components/ui";
import {
  bloqueiosDaArena,
  clipesRemoviveisDaArena,
  pedidosDeRemocao,
} from "@/db/queries/painel-privacidade";
import { quadrasDoPainel } from "@/db/queries/painel-quadras";
import EstadoDaArena from "../_components/EstadoDaArena";
import Privacidade from "../_components/Privacidade";
import { comArena, resolverArena } from "../_lib/arena";
import css from "../painel.module.css";

export const metadata = { title: "Privacidade", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/painel/privacidade` — bloqueio de horário e fila de remoção.
 *
 * A lista de lances é limitada aos 40 mais recentes de propósito: esta tela não
 * é a busca. Quem procura um lance de três semanas atrás chega por link, e o
 * seletor vira uma lista de 4.000 itens que ninguém rola.
 */
export default async function PaginaDePrivacidade({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;
  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Privacidade" />;

  const { parceiro, papel } = resolucao;
  const [bloqueios, pedidos, clipes, quadras] = await Promise.all([
    bloqueiosDaArena(parceiro.id),
    pedidosDeRemocao(parceiro.id),
    clipesRemoviveisDaArena(parceiro.id, {}, 40),
    quadrasDoPainel(parceiro.id),
  ]);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Privacidade</h1>
          <p className={css.subtitulo}>Horário bloqueado e fila de pedidos de remoção.</p>
        </div>
        <Button href={comArena("/painel", parceiro.slug)} variante="secundario" tamanho={44}>
          Visão geral
        </Button>
      </header>

      <Privacidade
        arenaSlug={parceiro.slug}
        bloqueios={bloqueios}
        pedidos={pedidos}
        clipes={clipes}
        quadras={quadras.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
        podeEditar={papel !== "viewer"}
      />
    </main>
  );
}
