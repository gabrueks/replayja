import type { ReactNode } from "react";
import type { Clipe } from "./tipos";
import { ClipGrid } from "./ClipGrid";
import css from "./LoginGate.module.css";

/**
 * O gate de login da página do parceiro.
 *
 * ─── O GATE APARECE NA AÇÃO, NÃO NA CHEGADA ────────────────────────────────
 *
 * A página do parceiro carrega inteira sem login: é a landing page que a arena
 * divulga (decisão 1 do design). Este componente não é um muro — é o convite que
 * cobre a PRÉVIA do acervo, com o contador de lances de hoje por cima de uma
 * grade borrada.
 *
 * A grade borrada existe para provar que há conteúdo antes de pedir o e-mail. Ela
 * é decorativa: `ClipGrid borrada` a marca `aria-hidden` e `inert`, então quem
 * usa leitor de tela ouve o convite, não seis lances fantasma.
 *
 * Nenhuma miniatura NÍTIDA aparece aqui — thumbnail é a única superfície com
 * imagem de pessoa, e ela fica atrás do login.
 */

export type LoginGateProps = {
  titulo?: string;
  descricao?: string;
  /** Quantos lances a arena gravou hoje. `null` esconde o contador. */
  lancesHoje?: number | null;
  /** Amostra para a grade borrada. 4 a 6 itens bastam. */
  amostra?: Clipe[];
  /** Botões: "Continuar com Google", "Entrar com e-mail". */
  children: ReactNode;
  /** A linha que explica POR QUE o login está sendo pedido. */
  rodape?: ReactNode;
};

export function LoginGate({
  titulo = "Entre pra ver seus lances",
  descricao = "Leva 20 segundos, sem senha.",
  lancesHoje,
  amostra = [],
  children,
  rodape,
}: LoginGateProps) {
  return (
    <div className={css.raiz}>
      <div className={css.moldura}>
        <div className={css.fundo}>
          <ClipGrid clipes={amostra} borrada denso />
        </div>

        <div className={css.convite}>
          {typeof lancesHoje === "number" ? (
            <span className={css.contador}>
              {lancesHoje}
              <span className={css.contadorRotulo}>
                {lancesHoje === 1 ? "lance gravado hoje" : "lances gravados hoje"}
              </span>
            </span>
          ) : null}
          <span className={css.titulo}>{titulo}</span>
          <span className={css.texto}>{descricao}</span>
          <div className={css.acoes}>{children}</div>
        </div>
      </div>

      {rodape ? <p className={css.rodape}>{rodape}</p> : null}
    </div>
  );
}

export default LoginGate;
