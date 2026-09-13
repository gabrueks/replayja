"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import css from "./Interruptor.module.css";

/**
 * O interruptor de uma preferência que salva sozinha.
 *
 * ─── É UM `<input type="checkbox">` DE VERDADE ─────────────────────────────
 *
 * A chave desenhada é CSS em cima de uma caixa de seleção nativa, e não uma
 * `<div role="switch">` com `onKeyDown`. O que se ganha: tab, espaço, o gesto do
 * VoiceOver, o "ativado/desativado" anunciado sem `aria-checked` escrito à mão,
 * e o rótulo clicável por `<label>`. O que se perde: nada — a aparência é a
 * mesma.
 *
 * ─── SEM BOTÃO "SALVAR" ────────────────────────────────────────────────────
 *
 * Uma tela de preferências com botão de salvar é uma tela onde metade das
 * pessoas muda o interruptor, sai, e volta para descobrir que nada mudou. A
 * escrita acontece no toque, e `useOptimistic` move a chave na hora: no 4G da
 * quadra a ida ao servidor demora o suficiente para a chave parecer travada.
 *
 * Quando a ação falha, o estado otimista é DESCARTADO pelo React e a chave volta
 * sozinha para onde estava — que é a única coisa honesta a fazer, porque o
 * servidor é quem sabe.
 */

export type InterruptorProps = {
  id: string;
  /** O texto ao lado da chave. */
  children: ReactNode;
  /** A linha de apoio, quando a preferência precisa de contexto. */
  apoio?: ReactNode;
  ligado: boolean;
  /** Server action já ligada aos argumentos dela. */
  aoMudar: (ligado: boolean) => Promise<{ ok: boolean; erro?: string }>;
  desabilitado?: boolean;
};

export function Interruptor({
  id,
  children,
  apoio,
  ligado,
  aoMudar,
  desabilitado,
}: InterruptorProps) {
  const [otimista, definirOtimista] = useOptimistic(ligado);
  const [salvando, comSalvamento] = useTransition();

  return (
    <label className={css.raiz} htmlFor={id}>
      <span className={css.textos}>
        <span className={css.rotulo}>{children}</span>
        {apoio ? <span className={css.apoio}>{apoio}</span> : null}
      </span>

      <input
        id={id}
        type="checkbox"
        className={css.caixa}
        checked={otimista}
        disabled={desabilitado || salvando}
        onChange={(e) => {
          const novo = e.currentTarget.checked;
          comSalvamento(async () => {
            definirOtimista(novo);
            await aoMudar(novo);
          });
        }}
      />
      <span className={css.chave} aria-hidden="true">
        <span className={css.bolinha} />
      </span>
    </label>
  );
}

export default Interruptor;
