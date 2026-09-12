import type { ReactNode } from "react";
import type { Clipe } from "./tipos";
import { ClipGrid } from "./ClipGrid";
import css from "./WeekSection.module.css";

/**
 * Uma semana da página do grupo: "Segunda, 8 set · 18 lances" + a grade.
 *
 * A página do grupo é o diferencial do produto — "os vídeos já organizados por
 * semana, atualizados sozinhos" — e é também a tela mais longa. A data gruda no
 * topo enquanto a semana rola justamente porque todas as semanas se parecem.
 *
 * Semana SEM lance continua aparecendo, com a explicação. Sumir com a semana
 * faria o atleta achar que o produto perdeu o jogo dele; dizer "nenhum lance
 * nesta janela" mostra que o sistema olhou e não achou.
 */

export type Semana = {
  id: string;
  /** "Segunda, 8 set" */
  titulo: string;
  clipes: Clipe[];
  /** Quando conhecido, a contagem real — pode ser maior que `clipes.length`. */
  total?: number;
  /** Link "ver todos" quando a semana está truncada. */
  hrefCompleto?: string;
};

export function WeekSection({
  semana,
  rodape,
}: {
  semana: Semana;
  /** Ação no fim da semana ("Ver os 18 lances"). */
  rodape?: ReactNode;
}) {
  const total = semana.total ?? semana.clipes.length;

  return (
    <section className={css.semana} aria-label={semana.titulo}>
      <header className={css.cabecalho}>
        <h3 className={css.data}>{semana.titulo}</h3>
        <span className={css.contagem}>
          {total} {total === 1 ? "lance" : "lances"}
        </span>
      </header>

      {semana.clipes.length === 0 ? (
        <p className={css.vazia}>Nenhum lance nesta janela — o botão da quadra não foi acionado.</p>
      ) : (
        <ClipGrid clipes={semana.clipes} rotulo={`Lances de ${semana.titulo}`} />
      )}

      {rodape}
    </section>
  );
}

export default WeekSection;
