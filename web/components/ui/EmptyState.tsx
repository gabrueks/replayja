import Link from "next/link";
import type { ReactNode } from "react";
import { Ilustracao, type NomeDaIlustracao } from "./Ilustracoes";
import css from "./EmptyState.module.css";

/**
 * Estado vazio PROPOSITIVO — e, na v2, ilustrado.
 *
 * ─── ESTADO VAZIO É UMA TELA, NÃO UMA FRASE ────────────────────────────────
 *
 * Sinal nº 11 do diagnóstico: "Nenhum lance nesse horário" numa caixa com um
 * ícone cinza de 24px é um beco sem saída com cara de erro de sistema. A v2
 * obriga três coisas: a ILUSTRAÇÃO (que diz "isto é uma tela do produto, não um
 * erro"), a CAUSA PROVÁVEL ("a câmera estava gravando, mas ninguém apertou o
 * botão — às vezes é a bateria") e a SAÍDA (os horários vizinhos que TÊM lance,
 * e o caminho para falar com a arena).
 *
 * ─── OS HORÁRIOS VIZINHOS VIRARAM CHIPS ────────────────────────────────────
 *
 * Eram linhas de lista de 52px cada; agora são pílulas de 44 com a contagem em
 * laranja ao lado. Três saídas cabem numa linha, o que faz o atleta ver que HÁ
 * lance em outro horário antes de concluir que o produto não gravou — que é a
 * conclusão errada que este componente existe para impedir.
 */

export type SugestaoDeHorario = {
  id: string;
  /** "19:30–20:30" — curto, porque vira pílula. */
  titulo: string;
  /** "12" — a contagem, em destaque ao lado. */
  apoio: string;
  href?: string;
  onSelecionar?: () => void;
};

export type EmptyStateProps = {
  titulo: string;
  descricao?: ReactNode;
  /**
   * Qual das quatro peças do sistema desenhar. `quadra` é o padrão porque o
   * vazio mais comum do produto é "nada nesse horário".
   */
  ilustracao?: NomeDaIlustracao;
  /** Ícone à moda antiga. Só para quem ainda não migrou — prefira `ilustracao`. */
  icone?: ReactNode;
  /** Botões (use `Button variante="secundario"` ou `"preto"`). */
  acoes?: ReactNode;
  sugestoes?: SugestaoDeHorario[];
  /** Rótulo acima das sugestões. */
  sugestoesRotulo?: string;
  /** A linha de causa provável no rodapé. */
  nota?: ReactNode;
};

export function EmptyState({
  titulo,
  descricao,
  ilustracao = "quadra",
  icone,
  acoes,
  sugestoes,
  sugestoesRotulo = "Tem lance por perto",
  nota,
}: EmptyStateProps) {
  return (
    <div className={css.raiz}>
      {icone ? (
        <span className={css.icone} aria-hidden="true">
          {icone}
        </span>
      ) : (
        <Ilustracao nome={ilustracao} tamanho={90} variante="vazia" />
      )}

      <div className={css.textos}>
        <p className={css.titulo}>{titulo}</p>
        {descricao ? <p className={css.texto}>{descricao}</p> : null}
      </div>

      {sugestoes && sugestoes.length > 0 ? (
        <>
          <p className="apenas-leitor">{sugestoesRotulo}</p>
          <ul className={css.sugestoes} aria-label={sugestoesRotulo}>
            {sugestoes.map((s) => {
              const interno = (
                <>
                  <span className={`${css.sugestaoTitulo} tempo`}>{s.titulo}</span>
                  <span className={`${css.sugestaoApoio} tempo`}>{s.apoio}</span>
                </>
              );
              return (
                <li key={s.id}>
                  {s.href ? (
                    <Link className={css.sugestao} href={s.href}>
                      {interno}
                    </Link>
                  ) : (
                    <button type="button" className={css.sugestao} onClick={s.onSelecionar}>
                      {interno}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {acoes ? <div className={css.acoes}>{acoes}</div> : null}

      {nota ? <p className={css.nota}>{nota}</p> : null}
    </div>
  );
}

export default EmptyState;
