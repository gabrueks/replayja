import css from "./ArteQuadra.module.css";

/**
 * A quadra à noite, desenhada — o lugar da foto enquanto a foto não existe.
 *
 * ─── POR QUE UM DESENHO E NÃO UM CINZA ─────────────────────────────────────
 *
 * O maior defeito visual da v1 era não ter imagem nenhuma: um produto de vídeo
 * sem uma única foto. A capa fotográfica da arena é o herói da direção nova, mas
 * ela depende do upload no painel (task C9) — e até lá a alternativa honesta não
 * é um retângulo cinza, é uma arte que já ocupa o lugar certo com a proporção
 * certa.
 *
 * O desenho é céu noturno + dois refletores com bloom + grama com listras de
 * corte + as linhas da quadra em perspectiva. Nada de bitmap: são gradientes e
 * um `<svg>` de quatro traços, então o card não paga requisição nem CLS.
 *
 * ─── A VARIAÇÃO VEM DO `semente`, NÃO DO ACASO ─────────────────────────────
 *
 * Duas arenas lado a lado com a MESMA arte leem como erro de carregamento. O
 * `semente` (o slug da arena) gira o ângulo da grama e a posição dos refletores
 * de forma determinística — o servidor e o cliente desenham igual, e a mesma
 * arena tem sempre a mesma cara.
 */

export type ArteQuadraProps = {
  /** Altura em pixels. 230 na capa da arena, 152 no card, 116 na miniatura. */
  altura?: number;
  /** Texto estável (o slug da arena) que escolhe a variação. */
  semente?: string;
  /** Desliga as linhas da quadra — em alturas pequenas elas viram sujeira. */
  simples?: boolean;
  className?: string;
};

function numeroDe(semente: string): number {
  let n = 0;
  for (let i = 0; i < semente.length; i += 1) n = (n * 31 + semente.charCodeAt(i)) % 997;
  return n;
}

export function ArteQuadra({ altura = 152, semente = "replay", simples, className }: ArteQuadraProps) {
  const n = numeroDe(semente);
  const anguloGrama = 88 + (n % 9); // 88deg a 96deg
  const refletor = 54 + (n % 5) * 6; // a distância dos dois refletores até a borda

  return (
    <div
      className={[css.arte, className].filter(Boolean).join(" ")}
      style={
        {
          height: altura,
          ["--angulo-grama" as string]: `${anguloGrama}deg`,
          ["--refletor-x" as string]: `${refletor}px`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <span className={css.ceu} />
      <span className={css.malha} />
      <span className={css.brilho} />
      <span className={`${css.lampada} ${css.lampadaEsq}`} />
      <span className={`${css.lampada} ${css.lampadaDir}`} />
      <span className={css.gramado} />
      <span className={css.corte} />

      {simples ? null : (
        <svg className={css.linhas} viewBox="0 0 390 152" preserveAspectRatio="none" fill="none">
          <path d="M22 152 L136 58 L254 58 L368 152" />
          <path d="M78 106 L312 106" />
          <ellipse cx="195" cy="106" rx="48" ry="16" />
          <path d="M160 58 L160 74 L230 74 L230 58" />
        </svg>
      )}

      <span className={css.veu} />
    </div>
  );
}

export default ArteQuadra;
