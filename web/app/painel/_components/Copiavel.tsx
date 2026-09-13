"use client";

import { useState } from "react";
import css from "../painel.module.css";

/**
 * Um valor com botão "Copiar" — chave de transmissão, URL de webhook, link.
 *
 * ─── COPIAR TEM DE FUNCIONAR SEM `navigator.clipboard` ─────────────────────
 *
 * A API de área de transferência exige contexto seguro, e o painel é aberto de
 * `localhost` no notebook de quem instala e, às vezes, por IP na rede da arena.
 * Quando ela não existe, o caminho antigo (`<textarea>` + `execCommand`) ainda
 * funciona — e falhar em silêncio aqui significa o instalador digitar 24
 * caracteres hexadecimais à mão no teclado virtual de uma câmera.
 *
 * O estado "Copiado!" volta sozinho em 2 s. Um selo permanente mentiria depois
 * que a pessoa copiasse outra coisa.
 *
 * ─── O TAMANHO AQUI É REQUISITO, NÃO ESTILO ────────────────────────────────
 *
 * Esta é a tela que alguém lê NO POSTE, ao sol, de pé, com a escada na mão. O
 * valor sai em mono de 17px com `--cor-texto` cheio (17:1) em vez de 13px
 * acinzentado, e o botão tem 48px de altura — acima do mínimo de 44 do WCAG,
 * porque o alvo de quem está de pé não é o de quem está sentado. O valor também
 * ganha `user-select: all`: um clique seleciona tudo, que é o caminho que sobra
 * quando não há área de transferência.
 */
export function Copiavel({
  valor,
  rotulo,
  monoespacado = true,
}: {
  valor: string;
  /** Fica no `aria-label` do botão: "Copiar a chave da Quadra 1". */
  rotulo: string;
  monoespacado?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(valor);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      const caixa = document.createElement("textarea");
      caixa.value = valor;
      // Fora da tela, mas NÃO `display:none`: um elemento escondido não pode ser
      // selecionado, e a seleção é o que `execCommand('copy')` copia.
      caixa.style.position = "fixed";
      caixa.style.opacity = "0";
      document.body.appendChild(caixa);
      caixa.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      caixa.remove();
    }
    if (ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  return (
    <div className={css.segredo}>
      <span className={[css.segredoValor, monoespacado ? null : css.segredoTexto].filter(Boolean).join(" ")}>
        {valor}
      </span>
      <button
        type="button"
        className={[css.copiar, copiado ? css.copiado : null].filter(Boolean).join(" ")}
        onClick={copiar}
        aria-label={`Copiar ${rotulo}`}
      >
        {copiado ? "Copiado!" : "Copiar"}
      </button>
      {/* O anúncio para leitor de tela: o texto do botão muda, mas quem não vê
          o botão precisa de uma região viva para saber que deu certo. */}
      <span className="apenas-leitor" role="status">
        {copiado ? `${rotulo} copiado.` : ""}
      </span>
    </div>
  );
}

export default Copiavel;
