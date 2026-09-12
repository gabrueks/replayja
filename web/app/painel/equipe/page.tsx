import { Button } from "@/components/ui";
import { equipeDaArena } from "@/db/queries/painel-equipe";
import Equipe from "../_components/Equipe";
import EstadoDaArena from "../_components/EstadoDaArena";
import { comArena, resolverArena } from "../_lib/arena";
import css from "../painel.module.css";

export const metadata = { title: "Equipe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** `/painel/equipe` — quem administra a arena. */
export default async function PaginaDaEquipe({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;
  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Equipe" />;

  const { parceiro, papel, sessao } = resolucao;
  const membros = await equipeDaArena(parceiro.id);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Equipe</h1>
          <p className={css.subtitulo}>{parceiro.display_name}</p>
        </div>
        <Button href={comArena("/painel", parceiro.slug)} variante="secundario" tamanho={44}>
          Visão geral
        </Button>
      </header>

      <Equipe
        arenaSlug={parceiro.slug}
        membros={membros}
        euSou={papel}
        meuEmail={sessao.email ?? ""}
      />
    </main>
  );
}
