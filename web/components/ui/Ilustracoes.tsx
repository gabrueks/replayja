/**
 * As quatro ilustrações do sistema: câmera · botão · quadra · apito.
 *
 * ─── QUATRO PEÇAS, E SÓ ELAS ───────────────────────────────────────────────
 *
 * Traço grosso, formas cheias, dois neutros mais a cor de ação. Vivem em estado
 * vazio e no onboarding, e em nenhum outro lugar — um set que cresce sem regra
 * vira clip-art, e clip-art é metade do "cheiro de protótipo".
 *
 * ─── POR QUE NÃO EMOJI ─────────────────────────────────────────────────────
 *
 * Emoji de esporte foi considerado e descartado: ⚽ renderiza diferente em cada
 * aparelho (Apple, Google, Samsung e Microsoft desenham bolas distintas), não
 * aceita a paleta do produto, e nenhuma das referências brasileiras usa emoji
 * como iconografia de produto. O que o emoji entrega de graça — cor e
 * simpatia — estas peças entregam com a marca junto.
 *
 * ─── AS CORES SAEM DOS TOKENS, NÃO DE HEX ──────────────────────────────────
 *
 * `currentColor` e `var(--cor-…)` dentro do SVG: a mesma peça funciona sobre o
 * fundo claro do estado vazio e sobre o preto do onboarding, sem uma segunda
 * cópia do desenho.
 */

export type NomeDaIlustracao = "camera" | "botao" | "quadra" | "apito";

export type IlustracaoProps = {
  nome: NomeDaIlustracao;
  /** Lado em pixels. 70 no ladrilho do sistema, 90 no estado vazio, 250 no onboarding. */
  tamanho?: number;
  /**
   * `vazia` apaga a cor da peça e acrescenta o "X" da cor de ação: é a versão de
   * estado vazio ("nada aqui"), e não um desenho diferente.
   */
  variante?: "padrao" | "vazia";
  className?: string;
};

export function Ilustracao({ nome, tamanho = 90, variante = "padrao", className }: IlustracaoProps) {
  const vazia = variante === "vazia";

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 70 70"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {nome === "camera" ? <Camera vazia={vazia} /> : null}
      {nome === "botao" ? <Botao vazia={vazia} /> : null}
      {nome === "quadra" ? <Quadra vazia={vazia} /> : null}
      {nome === "apito" ? <Apito vazia={vazia} /> : null}
      {vazia ? (
        <path
          d="M48 9.5l7 7M55 9.5l-7 7"
          stroke="var(--cor-acao)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

/** O neutro da peça: escuro no app claro, e o próprio fundo quando apagada. */
const CORPO = "var(--ilustracao-corpo)";
const APOIO = "var(--ilustracao-apoio)";
const MIOLO = "var(--ilustracao-miolo)";

function Camera({ vazia }: { vazia: boolean }) {
  return (
    <>
      <rect x="14" y="22" width="34" height="20" rx="6" fill={vazia ? APOIO : CORPO} />
      <circle cx="26" cy="32" r="6" fill={MIOLO} />
      <circle cx="26" cy="32" r="2.6" fill={vazia ? APOIO : "var(--cor-acao)"} />
      <rect x="50" y="27" width="10" height="10" rx="3" fill={APOIO} />
      <rect x="29" y="42" width="4" height="14" rx="2" fill={APOIO} />
      <ellipse cx="31" cy="57" rx="16" ry="4.5" fill={APOIO} />
    </>
  );
}

function Botao({ vazia }: { vazia: boolean }) {
  return (
    <>
      <rect x="16" y="20" width="38" height="32" rx="11" fill={vazia ? APOIO : CORPO} />
      <rect x="16" y="17" width="38" height="30" rx="11" fill={MIOLO} />
      <circle cx="35" cy="32" r="12" fill={vazia ? APOIO : "var(--cor-acao)"} />
      {/* A seta de "repetir" — o mesmo glifo da marca, para o botão do desenho
          ler como O botão do produto e não como um botão genérico. */}
      <path
        d="M31.4 27a6 6 0 1 1 1.9 4.4"
        stroke={MIOLO}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M31 23.4v4h4"
        stroke={MIOLO}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

function Quadra({ vazia }: { vazia: boolean }) {
  const grama = vazia ? APOIO : "var(--ilustracao-grama)";
  const linha = vazia ? "var(--ilustracao-risco)" : "var(--ilustracao-linha)";
  return (
    <>
      <ellipse cx="35" cy="38" rx="27" ry="17" fill={grama} />
      <ellipse cx="35" cy="38" rx="27" ry="17" fill="none" stroke={linha} strokeWidth="1.8" />
      <ellipse cx="35" cy="38" rx="10" ry="6" fill="none" stroke={linha} strokeWidth="1.8" />
      <path d="M35 21v34" stroke={linha} strokeWidth="1.8" />
      {vazia ? null : <circle cx="50" cy="22" r="6" fill="var(--cor-pro)" />}
    </>
  );
}

function Apito({ vazia }: { vazia: boolean }) {
  return (
    <>
      <path d="M18 28h20l14-6v22l-14-6H18a6 6 0 0 1 0-10z" fill={vazia ? APOIO : CORPO} />
      <circle cx="24" cy="33" r="4" fill={MIOLO} />
      <path
        d="M56 26a10 10 0 0 1 0 14"
        stroke={vazia ? APOIO : "var(--cor-acao)"}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M22 43l-3 10" stroke={APOIO} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

export default Ilustracao;
