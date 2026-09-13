import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Faixa } from "./Faixa";
import css from "./Chip.module.css";

/**
 * Chip selecionável — quadra na busca, atalho de horário, esporte no criar grupo.
 *
 * É um `<button aria-pressed>` e não um checkbox estilizado: o chip do produto é
 * um botão de alternância que muda o resultado na hora, e `aria-pressed` é
 * exatamente isso. Um `role="radio"` seria mais correto para "só uma quadra por
 * vez", mas exigiria gerência de foco em roving tabindex — complexidade que não
 * se paga numa faixa de 5 itens onde cada um já é alcançável por Tab.
 */

export type ChipProps = Omit<ComponentPropsWithoutRef<"button">, "className"> & {
  children: ReactNode;
  selecionado?: boolean;
  /** Variante de ênfase menor (laranja translúcido) — usada nos atalhos de tempo. */
  suave?: boolean;
  /** Mostra um ponto antes do rótulo (o "Acabei de jogar" do canvas). */
  ponto?: boolean;
  /**
   * Desenha o "×" quando selecionado.
   *
   * O chip ativo precisa dizer COMO SAIR dele: sem o "×", a pessoa tem de
   * descobrir sozinha que tocar de novo desmarca, e a maioria não descobre —
   * fica com um filtro aceso que ela não pediu e conclui que a busca não achou
   * nada. Não é um segundo botão: o toque no chip inteiro continua alternando, e
   * um alvo de 15px dentro de outro alvo seria pior que nenhum.
   */
  removivel?: boolean;
  className?: string;
};

export function Chip({
  children,
  selecionado,
  suave,
  ponto,
  removivel,
  className,
  ...resto
}: ChipProps) {
  return (
    <button
      type="button"
      {...resto}
      className={[css.chip, suave ? css.suave : null, className].filter(Boolean).join(" ")}
      aria-pressed={selecionado ?? false}
    >
      {ponto ? <span className={css.ponto} aria-hidden="true" /> : null}
      {children}
      {removivel && selecionado ? (
        <span className={css.remover} aria-hidden="true">
          <X size={15} strokeWidth={2.6} />
        </span>
      ) : null}
    </button>
  );
}

/** A faixa horizontal rolável que embala os chips. */
/**
 * A fileira de chips.
 *
 * Ela é uma `Faixa` com um nome próprio: a MECÂNICA da rolagem (sangria, respiro
 * da sombra, `scroll-padding`) saiu daqui para `Faixa.module.css` na leva de
 * UX-6, porque o mesmo bloco de CSS estava copiado em três arquivos — e foi por
 * isso que o bug da faixa que sangra demais apareceu em três telas de uma vez.
 *
 * O que continua sendo do chip é o CONTEÚDO: um `aria-pressed`, que é o certo
 * para filtro em memória e o errado para destino. Quem navega usa `Faixa` com
 * `papel="navegacao"` e `<Link>` dentro.
 */
export function ChipFaixa({
  children,
  rotulo,
}: {
  children: ReactNode;
  /** Rótulo do grupo — vira `aria-label` do container. */
  rotulo: string;
}) {
  return <Faixa rotulo={rotulo}>{children}</Faixa>;
}

export default Chip;
