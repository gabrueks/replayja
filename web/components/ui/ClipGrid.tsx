import type { ReactNode } from "react";
import type { Clipe } from "./tipos";
import { ClipCard } from "./ClipCard";
import css from "./ClipCard.module.css";

/**
 * A grade de lances.
 *
 * É uma LISTA de verdade (`<ul>`/`<li>`) e não um punhado de `<div>`: o leitor
 * de tela anuncia "lista com 18 itens", que é justamente a informação que o
 * atleta quer ("achei 18 lances?"). A contagem visível fica com quem chama.
 *
 * `borrada` é o modo do gate da página do parceiro: a grade vira decoração
 * (`aria-hidden`, sem foco) e o conteúdo real é o convite para entrar. Sem
 * `aria-hidden`, quem usa leitor de tela ouviria seis lances que não pode abrir.
 */

export type ClipGridProps = {
  clipes: Clipe[];
  onSelecionar?: (clipe: Clipe) => void;
  /** Cards menores e mais colunas. */
  denso?: boolean;
  /** Grade decorativa do gate: borrada, sem foco e invisível ao leitor de tela. */
  borrada?: boolean;
  /** Rótulo do `<ul>` — "Lances encontrados", "Lances da sessão". */
  rotulo?: string;
  /** O que aparece quando não há nenhum lance (use `EmptyState`). */
  vazio?: ReactNode;
};

export function ClipGrid({
  clipes,
  onSelecionar,
  denso,
  borrada,
  rotulo = "Lances",
  vazio,
}: ClipGridProps) {
  if (clipes.length === 0 && vazio) return <>{vazio}</>;

  return (
    <ul
      className={[css.grade, denso ? css.gradeDensa : null, borrada ? css.borrada : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={borrada ? undefined : rotulo}
      /*
        A GRADE É VIVA quando há lance em corte (achado P2-38). Sem isto, o card
        que vira `<Link>` ao ficar pronto não avisa ninguém — e quem está
        esperando o próprio gol é exatamente quem não pode ficar sem essa
        informação. `polite` porque o corte leva ~30 s: interromper a leitura por
        causa dele seria pior que esperar a frase terminar.

        A região só existe quando há algo em corte; uma grade estática marcada
        como viva faria o leitor de tela reler a lista a cada busca nova.
      */
      aria-live={!borrada && clipes.some((c) => c.estado === "processando") ? "polite" : undefined}
      aria-hidden={borrada ? true : undefined}
      // `inert` tira a grade borrada da ordem de Tab. Sem isso o foco some atrás
      // do desfoque e a pessoa não entende onde está o cursor.
      {...(borrada ? { inert: true } : {})}
    >
      {clipes.map((c) => (
        <li key={c.id}>
          <ClipCard clipe={c} onSelecionar={onSelecionar} denso={denso} />
        </li>
      ))}
    </ul>
  );
}

export default ClipGrid;
