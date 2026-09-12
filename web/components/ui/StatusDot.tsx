import type { Status } from "./tipos";
import css from "./StatusDot.module.css";

/**
 * O ponto de status: câmera online, câmera offline, sessão gravando.
 *
 * ─── COR NUNCA É O ÚNICO SINAL ─────────────────────────────────────────────
 *
 * Verde e vermelho são o par mais comum de confusão em daltonismo (8% dos
 * homens). Por isso o componente SEMPRE emite texto ao lado do ponto — e quando
 * a tela precisa do ponto sozinho, o texto vai para `aria-label` e a informação
 * continua existindo para quem usa leitor de tela. `rotulo={false}` esconde o
 * texto do olho, nunca da árvore de acessibilidade.
 */

const TEXTO: Record<Status, string> = {
  online: "online",
  offline: "offline",
  gravando: "gravando",
};

export type StatusDotProps = {
  status: Status;
  /** Texto ao lado do ponto. `false` esconde visualmente (fica no `aria-label`). */
  rotulo?: string | false;
  /** Desenha o fundo em pílula (o badge "ao vivo" do canvas). */
  pilula?: boolean;
};

export function StatusDot({ status, rotulo, pilula }: StatusDotProps) {
  const texto = rotulo === false ? TEXTO[status] : (rotulo ?? TEXTO[status]);
  return (
    <span
      className={[css.raiz, css[status], pilula ? css.pilula : null].filter(Boolean).join(" ")}
      aria-label={rotulo === false ? texto : undefined}
      role={rotulo === false ? "img" : undefined}
    >
      <span className={css.ponto} aria-hidden="true" />
      {rotulo === false ? null : <span>{texto}</span>}
    </span>
  );
}

export default StatusDot;
