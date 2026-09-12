"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import css from "./Input.module.css";

/**
 * Campo de texto com rótulo, dica e erro amarrados por `aria-describedby`.
 *
 * O rótulo é OBRIGATÓRIO no tipo. Placeholder não é rótulo: ele some quando a
 * pessoa começa a digitar, e é exatamente aí que ela precisa lembrar o que o
 * campo pedia. O `id` é gerado com `useId` para que nenhuma tela precise
 * inventar um — é o erro que mais produz `<label>` órfão.
 */

export type InputProps = Omit<ComponentPropsWithoutRef<"input">, "id" | "className"> & {
  rotulo: string;
  dica?: string;
  erro?: string;
  /** Ícone à esquerda, dentro da caixa (lupa da busca, por exemplo). */
  icone?: ReactNode;
  /** Conteúdo à direita (um botão "Copiar", um sufixo). */
  fim?: ReactNode;
  className?: string;
};

export function Input({ rotulo, dica, erro, icone, fim, className, ...resto }: InputProps) {
  const id = useId();
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;

  const descrito = [dica ? idDica : null, erro ? idErro : null].filter(Boolean).join(" ");

  return (
    <div className={[css.campo, className].filter(Boolean).join(" ")}>
      <label className={css.rotulo} htmlFor={id}>
        {rotulo}
      </label>

      <div className={[css.caixa, erro ? css.invalida : null].filter(Boolean).join(" ")}>
        {icone ? (
          <span className={css.adorno} aria-hidden="true">
            {icone}
          </span>
        ) : null}
        <input
          id={id}
          className={css.entrada}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descrito || undefined}
          {...resto}
        />
        {fim}
      </div>

      {dica ? (
        <p id={idDica} className={css.dica}>
          {dica}
        </p>
      ) : null}
      {/*
        `role="alert"` e não `aria-live="polite"`: o erro de formulário aparece
        depois de uma ação da pessoa e precisa interromper, senão ela toca
        "Entrar" de novo sem saber o que houve.
      */}
      {erro ? (
        <p id={idErro} className={css.mensagemErro} role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export default Input;
