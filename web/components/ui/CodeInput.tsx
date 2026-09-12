"use client";

import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import css from "./Input.module.css";

/**
 * O código de 6 dígitos do login.
 *
 * ─── POR QUE SEIS CAIXAS E NÃO UM CAMPO SÓ ─────────────────────────────────
 *
 * Um `<input maxlength=6>` com `letter-spacing` parece a mesma coisa e não é: as
 * seis caixas mostram QUANTO FALTA sem o atleta contar dígito, e o avanço
 * automático economiza o toque de posicionar o cursor. O canvas (`LoginCodigo`)
 * desenha as seis.
 *
 * ─── O QUE COSTUMA QUEBRAR ────────────────────────────────────────────────
 *
 * 1. COLAR. É como 90% das pessoas entram: copiam do e-mail e colam. Colar em
 *    QUALQUER caixa preenche as seis — não só a primeira.
 * 2. AUTOPREENCHER DO iOS. A barra do teclado entrega os 6 dígitos de uma vez
 *    num `onChange` só; por isso o `onChange` trata `value.length > 1` como
 *    colagem e não só o `onPaste`.
 * 3. APAGAR. Backspace numa caixa vazia volta para a anterior E apaga — sem
 *    isso a pessoa fica presa apertando backspace sem efeito visível.
 * 4. TECLADO. Setas andam entre as caixas; é navegação esperada em campo
 *    segmentado.
 *
 * Acessibilidade: as seis caixas são UM campo só para quem usa leitor de tela —
 * um `<fieldset>` com legenda e cada caixa rotulada "dígito N de 6".
 */

const TAMANHO = 6;

export type CodeInputProps = {
  /** O valor completo, de 0 a 6 dígitos. Componente controlado. */
  valor: string;
  onChange: (valor: string) => void;
  /** Chamado quando o sexto dígito entra — permite enviar sem tocar no botão. */
  onCompleto?: (valor: string) => void;
  rotulo?: string;
  erro?: string;
  autoFocus?: boolean;
  disabled?: boolean;
};

export function CodeInput({
  valor,
  onChange,
  onCompleto,
  rotulo = "Código de 6 dígitos",
  erro,
  autoFocus,
  disabled,
}: CodeInputProps) {
  const id = useId();
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focar(indice: number) {
    const alvo = refs.current[Math.max(0, Math.min(TAMANHO - 1, indice))];
    alvo?.focus();
    alvo?.select();
  }

  function aplicar(novo: string, focoEm: number) {
    const limpo = novo.replace(/\D/g, "").slice(0, TAMANHO);
    onChange(limpo);
    focar(focoEm);
    if (limpo.length === TAMANHO) onCompleto?.(limpo);
  }

  function digitar(indice: number, bruto: string) {
    const digitos = bruto.replace(/\D/g, "");
    if (digitos.length === 0) {
      // Apagou o conteúdo da caixa: some só com aquele dígito.
      const arr = valor.split("");
      arr[indice] = "";
      aplicar(arr.join("").slice(0, TAMANHO), indice);
      return;
    }
    if (digitos.length > 1) {
      // Autopreencher do iOS ou colagem via teclado: espalha a partir daqui.
      const antes = valor.slice(0, indice);
      aplicar((antes + digitos).slice(0, TAMANHO), Math.min(indice + digitos.length, TAMANHO - 1));
      return;
    }
    const arr = valor.padEnd(TAMANHO, " ").split("");
    arr[indice] = digitos;
    aplicar(arr.join("").replace(/ /g, ""), indice + 1);
  }

  function tecla(indice: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if ((valor[indice] ?? "") === "" && indice > 0) {
        e.preventDefault();
        const arr = valor.split("");
        arr[indice - 1] = "";
        aplicar(arr.join(""), indice - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focar(indice - 1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focar(indice + 1);
    }
  }

  function colar(e: ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData("text");
    if (!texto) return;
    e.preventDefault();
    const digitos = texto.replace(/\D/g, "").slice(0, TAMANHO);
    aplicar(digitos, Math.min(digitos.length, TAMANHO - 1));
  }

  return (
    <fieldset
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      aria-describedby={erro ? `${id}-erro` : undefined}
    >
      <legend className="apenas-leitor">{rotulo}</legend>
      <div className={[css.codigo, erro ? css.invalido : null].filter(Boolean).join(" ")}>
        {Array.from({ length: TAMANHO }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={[css.digito, valor[i] ? css.preenchido : null].filter(Boolean).join(" ")}
            value={valor[i] ?? ""}
            onChange={(e) => digitar(i, e.target.value)}
            onKeyDown={(e) => tecla(i, e)}
            onPaste={colar}
            onFocus={(e) => e.currentTarget.select()}
            // `numeric` e não `tel`: abre o teclado de números sem os símbolos
            // de discagem, que não servem para nada aqui.
            inputMode="numeric"
            // Só a PRIMEIRA caixa anuncia `one-time-code`: com as seis
            // anunciando, o iOS ofereceu o código repetido em cada uma.
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Dígito ${i + 1} de ${TAMANHO}`}
            aria-invalid={erro ? true : undefined}
            maxLength={1}
            autoFocus={autoFocus && i === 0}
            disabled={disabled}
            type="text"
            pattern="[0-9]*"
          />
        ))}
      </div>
      {erro ? (
        <p id={`${id}-erro`} className={css.mensagemErro} role="alert" style={{ marginTop: "var(--e-8)" }}>
          {erro}
        </p>
      ) : null}
    </fieldset>
  );
}

export default CodeInput;
