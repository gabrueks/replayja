import type { ReactNode } from "react";
import { RodapeFixo } from "./RodapeFixo";
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
 * ─── A RESERVA DE ESPAÇO VEM JUNTO ────────────────────────────────────────
 *
 * Ela NÃO é mais responsabilidade de quem usa. A classe global `.com-cta`, que
 * cada tela aplicava à mão, era derrubada em silêncio pelo `padding` no atalho
 * do módulo de página — e foi assim que esta barra passou a cobrir o fim da
 * página da arena em produção (achado P0-1). Agora `RodapeFixo` desenha a
 * reserva como um irmão no fluxo, com a altura medida da própria barra.
 */

export type CtaFixoProps = {
  /** O botão (ou os dois). Use `Button tamanho={56} largura="total"`. */
  children: ReactNode;
  /** A linha curta abaixo do botão. */
  apoio?: ReactNode;
  /** Some a sombra quando a barra já nasce sobre uma superfície branca. */
  semSombra?: boolean;
  /** Some com a reserva de espaço. Só para o catálogo `/dev/ui`. */
  semReserva?: boolean;
  className?: string;
};

export function CtaFixo({ children, apoio, semSombra, semReserva, className }: CtaFixoProps) {
  return (
    <RodapeFixo
      reservaInicial={116}
      semReserva={semReserva}
      className={[css.barra, semSombra ? css.plana : null, className].filter(Boolean).join(" ")}
    >
      <div className={css.dentro}>
        {children}
        {apoio ? <p className={css.apoio}>{apoio}</p> : null}
      </div>
    </RodapeFixo>
  );
}

export default CtaFixo;
