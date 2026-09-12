import type { ComponentPropsWithoutRef, ReactNode } from "react";
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
  /** Mostra um ponto antes do rótulo (o "Agora" do canvas). */
  ponto?: boolean;
  className?: string;
};

export function Chip({ children, selecionado, suave, ponto, className, ...resto }: ChipProps) {
  return (
    <button
      type="button"
      {...resto}
      className={[css.chip, suave ? css.suave : null, className].filter(Boolean).join(" ")}
      aria-pressed={selecionado ?? false}
    >
      {ponto ? <span className={css.ponto} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** A faixa horizontal rolável que embala os chips. */
export function ChipFaixa({
  children,
  rotulo,
}: {
  children: ReactNode;
  /** Rótulo do grupo — vira `aria-label` do container. */
  rotulo: string;
}) {
  return (
    <div className={css.faixa} role="group" aria-label={rotulo}>
      {children}
    </div>
  );
}

export default Chip;
