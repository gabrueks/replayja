import { Users } from "lucide-react";
import { Button, Card, EmptyState, Secao } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { meusGrupos } from "@/db/queries/grupo";
import css from "../meus-lances.module.css";

export const metadata = { title: "Meus grupos", robots: { index: false, follow: false } };

const DIAS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/**
 * `/app/grupos` — os grupos de que o atleta faz parte.
 *
 * A criação de grupo (task C7) começa na SESSÃO, não aqui: o fluxo natural é
 * "achei meus lances → esse horário se repete → salvar como grupo". Um botão
 * "criar grupo" nesta tela pediria arena, quadra, dias e horário do zero — que é
 * exatamente a fricção que a ponte pela sessão elimina.
 */
export default async function Grupos() {
  const sessao = await getSession();
  const grupos = sessao && dbConfigured() ? await meusGrupos(sessao) : [];

  return (
    <main className={css.pagina} id="conteudo">
      <header>
        <h1 className={css.titulo}>Meus grupos</h1>
        <p className="apoio">O link fixo da pelada, com os vídeos separados por semana.</p>
      </header>

      <Secao titulo={`${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`}>
        {grupos.length === 0 ? (
          <EmptyState
            icone={<Users size={24} />}
            titulo="Nenhum grupo ainda"
            descricao="Ache os lances de uma pelada e salve aquele horário como grupo. Toda semana os vídeos aparecem sozinhos no mesmo link, e quem você convidar recebe um aviso."
            acoes={
              <Button href="/app/buscar" variante="secundario" largura="total">
                Buscar meus lances
              </Button>
            }
          />
        ) : (
          <ul className={css.lista}>
            {grupos.map((g) => (
              <li key={g.id}>
                <Card href={`/${g.partner_slug}/${g.slug}`} titulo={g.name}>
                  <p className="apoio tempo">
                    {g.partner_display_name} ·{" "}
                    {g.weekdays.map((d) => DIAS[d]).filter(Boolean).join(", ")} ·{" "}
                    {g.start_time.slice(0, 5)}–{g.end_time.slice(0, 5)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </main>
  );
}
