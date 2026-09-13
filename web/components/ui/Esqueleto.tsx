import css from "./Esqueleto.module.css";

/**
 * O ESQUELETO DE CARREGAMENTO — a peça dos `loading.tsx`.
 *
 * ─── POR QUE ESQUELETO, E NÃO UM RODINHA ───────────────────────────────────
 *
 * Achado P1-5: não existia **nenhum** `loading.tsx` no produto. As rotas mais
 * pesadas são `force-dynamic` com nove `await` de banco (`[arenaSlug]`,
 * `[groupSlug]`), e no 4G da quadra o App Router simplesmente **congela a tela
 * anterior** até o servidor responder. Para quem tocou, o app travou.
 *
 * Um `<Spinner>` resolveria a metade fácil ("está vivo") e perderia a difícil: o
 * esqueleto diz QUE FORMA a resposta vai ter, então a página não "pula" quando o
 * conteúdo chega — e no celular, onde a rolagem já começou, pular é perder o
 * lugar. É por isso que ele imita o card de lance, e não um retângulo genérico.
 *
 * ─── ELE NÃO É ANUNCIADO ───────────────────────────────────────────────────
 *
 * `aria-hidden` na forma e uma frase curta em `.apenas-leitor` fora dela: quem
 * ouve precisa de "Carregando", não de doze retângulos. O `role="status"` fica
 * no contêiner de quem chama (`Carregando`), com `aria-live="polite"`, para não
 * interromper o que estiver sendo lido.
 *
 * ─── SEM ANIMAÇÃO PARA QUEM PEDIU SEM ANIMAÇÃO ────────────────────────────
 *
 * `prefers-reduced-motion` desliga o brilho — um pulso infinito na tela inteira
 * é exatamente o padrão que a preferência existe para desligar.
 */

export type EsqueletoProps = {
  /** Altura em px, ou uma medida CSS ("100%"). */
  altura?: number | string;
  /** Largura. Padrão: a coluna inteira. */
  largura?: number | string;
  /** Raio: `card` (18), `texto` (pílula) ou `ladrilho` (14). */
  forma?: "card" | "texto" | "ladrilho";
  className?: string;
};

export function Esqueleto({ altura = 16, largura, forma = "texto", className }: EsqueletoProps) {
  return (
    <span
      aria-hidden="true"
      className={[css.peca, css[forma], className].filter(Boolean).join(" ")}
      style={{
        height: typeof altura === "number" ? `${altura}px` : altura,
        ...(largura !== undefined
          ? { width: typeof largura === "number" ? `${largura}px` : largura }
          : {}),
      }}
    />
  );
}

/**
 * A moldura de uma tela inteira carregando.
 *
 * `role="status"` + `aria-live="polite"`: o leitor de tela anuncia "Carregando
 * os lances" quando terminar a frase atual, e não no meio dela.
 */
export function Carregando({
  rotulo = "Carregando",
  children,
}: {
  rotulo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={css.raiz} role="status" aria-live="polite">
      <span className="apenas-leitor">{rotulo}</span>
      {children}
    </div>
  );
}

/** A grade de cards de lance, em esqueleto. É a forma mais repetida do produto. */
export function EsqueletoDeLances({ quantos = 4 }: { quantos?: number }) {
  return (
    <div className={css.grade} aria-hidden="true">
      {Array.from({ length: quantos }, (_, i) => (
        <span key={i} className={css.cartao}>
          <Esqueleto forma="ladrilho" altura={104} largura="100%" />
          <Esqueleto altura={18} largura="52%" />
          <Esqueleto altura={12} largura="70%" />
        </span>
      ))}
    </div>
  );
}

export default Esqueleto;
