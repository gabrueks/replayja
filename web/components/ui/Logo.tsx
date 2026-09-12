import css from "./Logo.module.css";

/**
 * A marca do Replay já: um quadrado laranja com a seta de "repetir" e um play
 * dentro, mais a palavra em Archivo 800.
 *
 * Desenhada em SVG inline de propósito — nenhum bitmap no repositório, a marca
 * escala sem borrar e herda `--cor-acento`, então trocar o acento troca a marca
 * junto (é o que o chip de acento do canvas fazia).
 */

export function Logo({
  tamanho = 30,
  palavra = true,
}: {
  tamanho?: number;
  /** `false` mostra só o símbolo (favicon, avatar, cabeçalho apertado). */
  palavra?: boolean;
}) {
  return (
    <span className={css.raiz}>
      <span className={css.marca} style={{ width: tamanho, height: tamanho }} aria-hidden="true">
        <svg
          width={Math.round(tamanho * 0.53)}
          height={Math.round(tamanho * 0.53)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--cor-acento-texto)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 10a8 8 0 0 1 13.7-5.6L20 6" />
          <path d="M20 3v4h-4" />
          <path d="M8.5 10.2v4.6l4-2.3z" fill="var(--cor-acento-texto)" />
        </svg>
      </span>
      {palavra ? <span className={css.palavra}>replay já</span> : null}
      {palavra ? null : <span className="apenas-leitor">Replay já</span>}
    </span>
  );
}

export default Logo;
