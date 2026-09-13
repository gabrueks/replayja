"use client";

import { useEffect, useState } from "react";

/**
 * A palavra que troca no título da home, pra deixar claro que o produto não é
 * só de futebol. Cada esporte tem seu verbo pro que fica salvo — troca a cada
 * 3s, sempre a mesma lista, sempre a mesma ordem.
 */

const PALAVRAS = ["lances", "gols", "pontos", "dribles", "momentos"];

export function PalavraRotativa() {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setIndice((atual) => (atual + 1) % PALAVRAS.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return <span suppressHydrationWarning>{PALAVRAS[indice]}</span>;
}

export default PalavraRotativa;
