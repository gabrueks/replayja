import type { ReactNode } from "react";
import css from "./CtaFixo.module.css";

/**
 * A barra de ação fixa no rodapé.
 *
 * ─── A AÇÃO PRINCIPAL NÃO PODE ROLAR JUNTO ─────────────────────────────────
 *
 * Sinal nº 6 do diagnóstico da v2: na página da arena deslogada, "Entrar pra
 * liberar a busca" ficava no meio do scroll e sumia assim que o atleta descia
 * para ver os horários — ou seja, sumia exatamente no momento em que ele estava
 * convencido. A barra fixa é o padrão de todo app de consumo brasileiro pelo
 * mesmo motivo.
 *
 * ─── A LINHA DE APOIO É PARTE DO COMPONENTE ────────────────────────────────
 *
 * "Leva 20 segundos. Sem senha, sem cadastro." não é decoração: é a objeção que
 * o atleta tem no dedo antes de tocar. Deixá-la como responsabilidade de cada
 * tela é como ela desaparece em metade delas.
 *
 * ─── SAFE AREA ─────────────────────────────────────────────────────────────
 *
 * `env(safe-area-inset-bottom)` no `padding`, não no `bottom`: no iPhone com
 * indicador de gesto, um botão colado em `bottom: 0` fica a 8px do traço branco
 * e o toque vira "voltar à tela inicial".
 *
 * Quem usa `CtaFixo` precisa reservar o espaço no conteúdo — a classe global
 * `.com-cta` faz isso.
 */

export type CtaFixoProps = {
  /** O botão (ou os dois). Use `Button tamanho={56} largura="total"`. */
  children: ReactNode;
  /** A linha curta abaixo do botão. */
  apoio?: ReactNode;
  /** Some a sombra quando a barra já nasce sobre uma superfície branca. */
  semSombra?: boolean;
  className?: string;
};

export function CtaFixo({ children, apoio, semSombra, className }: CtaFixoProps) {
  return (
    <div
      className={[css.barra, semSombra ? css.plana : null, className].filter(Boolean).join(" ")}
    >
      <div className={css.dentro}>
        {children}
        {apoio ? <p className={css.apoio}>{apoio}</p> : null}
      </div>
    </div>
  );
}

export default CtaFixo;
