import { dbConfigured } from "@/lib/db";
import { ehSlugDeArena } from "@/lib/slug";
import { CLIPES_EXEMPLO, QUADRAS_EXEMPLO } from "@/lib/fixtures";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import FormularioDeBusca from "./FormularioDeBusca";
import css from "./buscar.module.css";

export const metadata = { title: "Buscar lances", robots: { index: false, follow: false } };

/**
 * `/app/buscar` — a busca por horário.
 *
 * A LISTA DE QUADRAS já é real: vem de `quadrasDoParceiro` quando a URL traz
 * `?arena=`. O que ainda é exemplo é o RESULTADO — a consulta é a C4
 * (`clipesDaArena`, já escrita e testada).
 *
 * O `agora` sai daqui, do servidor, e desce como prop: se o atalho "agora" lesse
 * o relógio do cliente durante a renderização, servidor e navegador
 * discordariam na hidratação e o React reclamaria — além de o horário da arena
 * ser o que vale, não o do aparelho.
 */
export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;

  const parceiro =
    dbConfigured() && arena && ehSlugDeArena(arena) ? await parceiroPublicoPorSlug(arena) : null;

  const quadras = parceiro ? await quadrasDoParceiro(parceiro.id) : [];

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

      <FormularioDeBusca
        quadras={
          quadras.length > 0
            ? quadras.map((q) => ({ id: q.id, nome: q.name, esporte: q.sport }))
            : QUADRAS_EXEMPLO
        }
        clipesDeExemplo={CLIPES_EXEMPLO}
        agora={new Date().toISOString()}
      />
    </main>
  );
}
