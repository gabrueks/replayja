import Link from "next/link";
import type { ReactNode } from "react";
import css from "./EmptyState.module.css";

/**
 * Estado vazio PROPOSITIVO — decisão 5 do design.
 *
 * "Nenhum lance nesse horário" sozinho é um beco sem saída. O componente obriga
 * quem usa a oferecer saída: ações (ampliar para o dia todo, buscar em todas as
 * quadras), horários VIZINHOS que têm lance, e a causa provável com caminho para
 * falar com a arena — o botão da quadra costuma ficar sem bateria, e o atleta não
 * tem como adivinhar isso.
 */

export type SugestaoDeHorario = {
  id: string;
  /** "Ontem · 20:00 – 21:00" */
  titulo: string;
  /** "Quadra 3 · 14 lances" */
  apoio: string;
  href?: string;
  onSelecionar?: () => void;
};

export type EmptyStateProps = {
  titulo: string;
  descricao?: ReactNode;
  icone?: ReactNode;
  /** Botões (use `Button variante="secundario"`). */
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
  icone,
  acoes,
  sugestoes,
  sugestoesRotulo = "Horários com lances por perto",
  nota,
}: EmptyStateProps) {
  return (
    <div className={css.raiz}>
      {icone ? (
        <span className={css.icone} aria-hidden="true">
          {icone}
        </span>
      ) : null}

      <p className={css.titulo}>{titulo}</p>
      {descricao ? <p className={css.texto}>{descricao}</p> : null}

      {acoes ? <div className={css.acoes}>{acoes}</div> : null}

      {sugestoes && sugestoes.length > 0 ? (
        <>
          <p className="rotulo" style={{ marginTop: "var(--e-12)" }}>
            {sugestoesRotulo}
          </p>
          <ul className={css.sugestoes} aria-label={sugestoesRotulo}>
            {sugestoes.map((s) => {
              const interno = (
                <>
                  <span className={css.sugestaoTitulo}>{s.titulo}</span>
                  <span className={css.sugestaoApoio}>{s.apoio}</span>
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

      {nota ? <p className={css.nota}>{nota}</p> : null}
    </div>
  );
}

export default EmptyState;
