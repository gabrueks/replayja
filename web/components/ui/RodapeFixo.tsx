"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import css from "./RodapeFixo.module.css";

/**
 * O CHASSI FIXO DO RODAPÉ — e a reserva de espaço que vem junto com ele.
 *
 * ─── O BUG QUE ELE FECHA (P0-1) ────────────────────────────────────────────
 *
 * Na página da arena e na da sessão, em 390 × 844, o CTA fixo de 115px cobria o
 * fim da página **e a página não rolava o suficiente para escapar**: a barra
 * "Manda pro grupo" inteira e a frase "Quem abrir o link vê que a pelada
 * existe" ficavam permanentemente debaixo do botão, com o scroll no fim. Ou
 * seja: o COMPARTILHAR — o motor de crescimento do produto — era inalcançável
 * no celular, na página que a arena divulga.
 *
 * A causa era uma reserva que morava longe de quem a precisava: `.com-cta` e
 * `.com-barra`, duas classes globais aplicadas à mão em seis telas. O módulo de
 * CSS de cada página escreve `padding` no ATALHO, e o atalho zera o
 * `padding-bottom` da global. As duas têm a mesma especificidade (0,1,0), então
 * quem ganhava era quem o Next escrevesse por último — e isso mudava por rota,
 * conforme a ordem dos chunks. A rodada anterior comprou tempo repetindo a
 * classe (`.com-cta.com-cta`, especificidade 0,2,0); isto aqui tira o problema
 * da mesa.
 *
 * ─── A RESERVA É UM IRMÃO NO FLUXO, E NÃO UM `padding` EM OUTRO ARQUIVO ────
 *
 * `RodapeFixo` desenha DUAS coisas: a barra (fixa, fora do fluxo) e, logo antes
 * dela, um bloco `aria-hidden` da MESMA altura, este sim dentro do fluxo. O
 * documento fica exatamente mais alto que a barra, então o fim do conteúdo
 * sempre consegue rolar acima dela.
 *
 * Três propriedades que a classe global não tinha:
 *
 *  1. **Nenhum arquivo de página participa.** Não há `padding` para um módulo
 *     derrubar, nem classe para alguém esquecer de pôr. Quem usa a barra ganha
 *     a reserva por construção.
 *  2. **A altura é a REAL, medida.** O CTA tem 116px com uma ação e uma linha
 *     de apoio, e mais que isso com duas ações (o `/entrar` empilha "Continuar
 *     com o Google"). O número fixo errava nos dois sentidos.
 *  3. **A área segura entra de graça.** `getBoundingClientRect()` já inclui o
 *     `padding-bottom: env(safe-area-inset-bottom)` da barra, então não há um
 *     segundo `env()` na conta para somar duas vezes ou nenhuma.
 *
 * ─── E SE O JAVASCRIPT NÃO RODAR ───────────────────────────────────────────
 *
 * A reserva nasce no HTML com a altura NOMINAL (`reservaInicial` + a área
 * segura, em CSS puro) e só depois é corrigida pela medida. No 4G da quadra,
 * entre o HTML e a hidratação, a página já está certa — e se o bundle nunca
 * chegar, ela continua certa, com alguns pixels de folga. O `ResizeObserver`
 * existe para o que muda DEPOIS: uma segunda ação que aparece, um rótulo que
 * quebra em duas linhas, o teclado do Android.
 */

export type RodapeFixoProps = {
  /** O conteúdo da barra. */
  children: ReactNode;
  /**
   * Altura nominal, em px, usada no HTML do servidor e enquanto a medida não
   * chega. É um piso decente, não um chute: 116 é o CTA de uma ação com apoio, e
   * `--toque-barra` (76) é a barra de abas.
   */
  reservaInicial?: number;
  /** A classe de quem desenha a barra — fundo, sombra, altura, z-index. */
  className?: string;
  /** Some com a reserva. Só para o catálogo `/dev/ui`, que empilha exemplos. */
  semReserva?: boolean;
};

export function RodapeFixo({
  children,
  reservaInicial = 116,
  className,
  semReserva,
}: RodapeFixoProps) {
  const barra = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number | null>(null);

  useEffect(() => {
    const el = barra.current;
    if (!el) return;

    const medir = () => {
      // `getBoundingClientRect` e não `offsetHeight`: o segundo arredonda para
      // inteiro, e meio pixel a menos por rota é meia linha de texto cortada no
      // aparelho com `devicePixelRatio` fracionário.
      const h = el.getBoundingClientRect().height;
      // Ignora a medida zerada de um `display: none` momentâneo (uma transição
      // de rota, por exemplo): reservar 0 é reabrir o bug.
      if (h > 0) setAltura(h);
    };

    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <>
      {semReserva ? null : (
        <div
          className={css.reserva}
          aria-hidden="true"
          data-reserva-do-rodape=""
          style={
            altura === null
              ? ({ "--rodape-reserva": `${reservaInicial}px` } as CSSProperties)
              : // A medida já traz a área segura dentro dela, então aqui o
                // `height` inline substitui o `calc()` em vez de somar a ele.
                { height: `${altura}px` }
          }
        />
      )}
      <div ref={barra} className={[css.barra, className].filter(Boolean).join(" ")}>
        {children}
      </div>
    </>
  );
}

export default RodapeFixo;
